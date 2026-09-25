/**
 * Hisob rejimini (legacy | shadow | live) serverda o'zgartirish — PUT /api/billing/mode bilan
 * bir xil amal: rejim yoziladi, live'ga o'tishda barcha balanslar yangi formula bo'yicha qayta
 * hisoblanadi, audit jurnaliga yoziladi.
 *
 *   npx tsx scripts/set_ledger_mode.ts live            # DRY-RUN: nima o'zgarishini ko'rsatadi
 *   npx tsx scripts/set_ledger_mode.ts live --apply    # qo'llaydi
 *
 * Himoya (J.4): eski tizimda nol bo'lmagan balans yoki eski (legacy) to'lov bo'lsa, live'ga
 * o'tish ularni "yo'qotib" qo'yadi (boshlang'ich qoldiq kiritilmagan) — --apply rad etiladi.
 * Faqat toza boshlash (yangi markaz) yoki boshlang'ich qoldiqlar kiritilgandan keyin.
 */
import 'dotenv/config';
import prisma from '../server/db.js';
import { getLedgerMode, setLedgerMode, LEDGER_MODES } from '../server/services/ledgerMode.js';
import { syncAllBalances } from '../server/services/balanceCache.js';
import { logAudit } from '../server/middleware/audit.js';

const target = process.argv[2];
const APPLY = process.argv.includes('--apply');

async function main() {
    if (!(LEDGER_MODES as readonly string[]).includes(target)) {
        console.error(`Rejim: ${LEDGER_MODES.join(' | ')}`);
        process.exit(2);
    }
    const before = await getLedgerMode();
    console.log(`Hozirgi rejim: ${before} → yangi: ${target}${APPLY ? '' : '  (DRY-RUN — hech narsa yozilmaydi)'}`);

    if (target === 'live' && before !== 'live') {
        const [nonZero, legacyPayments, students] = await Promise.all([
            prisma.student.count({ where: { deletedAt: null, NOT: { balance: 0 } } }),
            prisma.payment.count({ where: { deletedAt: null, status: 'paid', OR: [{ allocationMode: null }, { allocationMode: 'legacy' }] } }),
            prisma.student.count({ where: { deletedAt: null } }),
        ]);
        console.log(`O'quvchilar: ${students}; eski balansi 0 emas: ${nonZero}; eski (legacy) to'lovlar: ${legacyPayments}`);
        if (nonZero || legacyPayments) {
            console.error("RAD: eski qarz/avans yoki eski to'lovlar bor — avval boshlang'ich qoldiqlarni kiriting (IP-25).");
            process.exit(1);
        }
    }
    if (!APPLY) return;

    const mode = await setLedgerMode(target);
    const synced = mode === 'live' && before !== 'live' ? await syncAllBalances() : 0;
    await logAudit({ userName: 'tizim (set_ledger_mode skripti)', action: 'ledger_mode', resource: 'setting', resourceId: 'ledger_mode', before: { mode: before }, after: { mode, synced } });
    console.log(`Tayyor: rejim ${mode}, qayta hisoblangan balanslar: ${synced}`);
}

main().then(() => prisma.$disconnect()).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
