/**
 * IP-04 (TL-13) — o'quvchi holatlarini kanonik qiymatga keltirish.
 *
 * Ilgari tahrir formasi o'zbekcha matnni ("Faol", "Tark etgan", "Muzlatilgan",
 * "Bitiruvchi") o'zgarishsiz saqlardi. Bu skript ularni active / left / frozen /
 * graduated ga o'tkazadi. Boshqa hech narsaga tegmaydi.
 *
 * Ishlatish:
 *   npx tsx scripts/normalize_student_status.ts          # faqat ko'rsatadi (dry-run)
 *   npx tsx scripts/normalize_student_status.ts --apply  # yozadi
 *
 * Eslatma: ilgari yaratishda "Muzlatilgan" xato ravishda 'graduated' bo'lib
 * saqlangan yozuvlarni haqiqiy bitiruvchilardan ajratib bo'lmaydi — ular
 * o'zgartirilmaydi (kerak bo'lsa qo'lda tekshiriladi).
 */
import { PrismaClient } from '@prisma/client';
import { normalizeStudentStatus } from '../server/utils/studentStatus.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
    const groups = await prisma.student.groupBy({ by: ['status'], _count: { _all: true } });
    let toChange = 0;
    console.log('Joriy holatlar:');
    for (const g of groups) {
        const target = normalizeStudentStatus(g.status);
        const changes = target !== g.status;
        if (changes) toChange += g._count._all;
        console.log(`  ${JSON.stringify(g.status).padEnd(16)} ${String(g._count._all).padStart(6)} ta${changes ? `  →  ${target}` : ''}`);
    }
    if (!toChange) { console.log('\nO\'zgartirish kerak emas.'); return; }
    if (!apply) { console.log(`\n${toChange} ta yozuv o'zgaradi. Yozish uchun: --apply`); return; }
    let done = 0;
    for (const g of groups) {
        const target = normalizeStudentStatus(g.status);
        if (target && target !== g.status) {
            done += (await prisma.student.updateMany({ where: { status: g.status }, data: { status: target } })).count;
        }
    }
    console.log(`\n${done} ta yozuv yangilandi.`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
