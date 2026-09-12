/**
 * Bir martalik migratsiya: ruxsat kalitlari aniqlashtirilishi bilan bog'liq
 * (2026-09-07/12). Eski birlashtirilgan kalitlar ('marketing', 'bi',
 * 'finance', 'settings') endi bir nechta mustaqil kalitga bo'lindi
 * (masalan 'marketing' -> 'marketing'+'ai_content'+'communication').
 *
 * Bu skript mavjud foydalanuvchilarning DB'dagi permissions massivini
 * yangilaydi — HAR BIR eski kalit HOZIR qanday sahifalarga kira olsa,
 * o'sha real ruxsat saqlanadi (yangi kalitlar qo'shiladi).
 *
 * MUHIM ISTISNO — 'journal': mustasno ravishda KENGAYTIRILMAYDI.
 * 'quiz'/'tests' (Test Tizimi/Imtihonlar) hali tugallanmagan — bu
 * migratsiyaning aynan maqsadi shu ikkalasini avvalgi tasodifiy keng
 * ruxsatdan olib tashlash (endi TEACHER shablonida ham yo'q).
 *
 * Shuningdek: o'lik 'attendance'/'assessments' kalitlari olib tashlanadi
 * (hech qanday route/nav ularni tekshirmaydi) va role=MANAGER
 * foydalanuvchilarga 'certificates' qo'shiladi (bu sahifa ularning o'z
 * andozasida allaqachon mo'ljallangan edi, lekin eski 'settings' kaliti
 * orqali amalda ocha olmasdi — App.tsx'dagi allowedRoles=['ADMIN','MANAGER']
 * bilan mos qilinadi).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPAND: Record<string, string[]> = {
    marketing: ['marketing', 'ai_content', 'communication'],
    bi: ['bi', 'predictions', 'goals', 'reports'],
    finance: ['finance', 'transaction_categories', 'discounts'],
    // journal va settings ATAYLAB yo'q — kengaytirilmaydi (yuqoridagi izohga q.)
};

const DEAD_KEYS = new Set(['attendance', 'assessments']);

function isValidPermissionArray(v: any): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
}

async function run() {
    const users = await prisma.user.findMany({
        where: { NOT: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
    });
    console.log(`Tekshirilmoqda: ${users.length} ta foydalanuvchi (ADMIN/SUPER_ADMIN bundan mustasno — ular barcha ruxsatga ega)`);

    let changed = 0;
    for (const u of users) {
        let parsed: any;
        try { parsed = JSON.parse(u.permissions || '[]'); } catch { parsed = null; }
        if (!isValidPermissionArray(parsed) || parsed.length === 0) continue;

        const next = new Set<string>();
        for (const key of parsed) {
            if (DEAD_KEYS.has(key)) continue;
            const expansion = EXPAND[key];
            if (expansion) expansion.forEach(k => next.add(k));
            else next.add(key);
        }

        if (u.role === 'MANAGER' && next.size > 0) {
            next.add('certificates');
        }

        const nextArr = [...next].sort();
        const before = [...parsed].sort();
        const isSame = before.length === nextArr.length && before.every((v, i) => v === nextArr[i]);
        if (isSame) continue;

        await prisma.user.update({
            where: { id: u.id },
            data: { permissions: JSON.stringify(nextArr) },
        });
        changed++;
        console.log(`Yangilandi: ${u.name} (${u.role}) — ${before.join(',')} -> ${nextArr.join(',')}`);
    }

    console.log(`\nJami yangilandi: ${changed} / ${users.length} ta foydalanuvchi`);
}

run().finally(() => prisma.$disconnect());
