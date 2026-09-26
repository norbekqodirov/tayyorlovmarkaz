/**
 * Guruh narxi keyin kiritilgani sababli 0 so'm bilan chiqqan hisoblarni avtomatik tuzatish
 * (2026-09-26 hodisasi: "4-sinf-04 Ingliz tili" narxsiz yaratilib, 8 daqiqadan keyin 450 000
 * kiritilgan — narx "bugundan" yozilgani uchun sentabr hisobi 17 o'quvchida 0 bo'lgan).
 *
 * 0 so'mlik tarif versiyasidan keyin tez orada (3 kun ichida) haqiqiy narx kiritilgan bo'lsa — bu
 * "narx kiritilmagan edi", rejalashtirilgan bepul davr emas: narx 0 versiyaning boshidan (ochiq oy
 * doirasida) qo'llanadi, e'lon qilingan hisoblarga farq tuzatma bo'lib yoziladi. Server ishga
 * tushganda va har kecha ishlaydi; har tuzatish audit jurnaliga yoziladi.
 */
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { firstOfMonth } from '../domain/lessonCalendar.js';
import { setGroupTariff } from './groupHistory.js';
import { refreshGroupCharges } from './chargeEngine.js';
import { getLedgerMode } from './ledgerMode.js';
import { logAudit } from '../middleware/audit.js';

const LATE_PRICE_WINDOW_MS = 3 * 24 * 3600e3;
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

export async function repairZeroTariffs(actor: { id?: string | null; name?: string } = {}) {
    if ((await getLedgerMode()) === 'legacy') return [];
    const monthStart = firstOfMonth(todayDateStr());
    const zeros = await prisma.tariffVersion.findMany({
        where: { monthlyPrice: 0, OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }] },
        orderBy: { effectiveFrom: 'asc' },
    });
    const fixed: Array<{ groupId: string; price: number; from: string; students: number; adjustments: number; delta: number }> = [];
    for (const z of zeros) {
        const next = await prisma.tariffVersion.findFirst({
            where: { groupId: z.groupId, effectiveFrom: { gt: z.effectiveFrom }, monthlyPrice: { gt: 0 } },
            orderBy: { effectiveFrom: 'asc' },
        });
        if (!next) continue; // narx hali kiritilmagan yoki guruh haqiqatan bepul
        if (next.createdAt.getTime() - z.createdAt.getTime() > LATE_PRICE_WINDOW_MS) continue; // rejalashtirilgan o'zgarish
        const from = z.effectiveFrom < monthStart ? monthStart : z.effectiveFrom;
        await prisma.$transaction(tx => setGroupTariff(tx, z.groupId, {
            monthlyPrice: next.monthlyPrice, lessonsPerPackage: next.lessonsPerPackage, effectiveFrom: from, source: 'auto_fix',
        }, actor.id ?? null));
        const r = await refreshGroupCharges(z.groupId, from, `Guruh narxi keyin kiritilgan — ${fmt(next.monthlyPrice)} so'm guruh boshidan qo'llandi`, actor.id ?? null);
        await logAudit({
            userId: actor.id ?? undefined, userName: actor.name || 'tizim', action: 'tariff_auto_fix', resource: 'tariffVersion', resourceId: z.id,
            before: { groupId: z.groupId, monthlyPrice: 0, effectiveFrom: z.effectiveFrom },
            after: { monthlyPrice: next.monthlyPrice, effectiveFrom: from, ...r },
        });
        fixed.push({ groupId: z.groupId, price: next.monthlyPrice, from, ...r });
    }
    return fixed;
}
