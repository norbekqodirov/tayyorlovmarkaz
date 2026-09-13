/**
 * Bir martalik migratsiya: eski `Attendance` (guruh+sana uchun JSON-blob
 * qator, CRM desktop yozgan) jadvalidagi tarixiy ma'lumotni haqiqiy
 * `AttendanceRecord` (o'quvchi+guruh+sana uchun alohida qator — Telegram
 * Staff Mini App, to'lov hisobi, ota-onaga xabar, hisobotlar shuni o'qiydi)
 * jadvaliga ko'chiradi.
 *
 * Ziddiyat qoidasi: agar aynan shu o'quvchi+guruh+sana uchun AttendanceRecord
 * allaqachon MAVJUD bo'lsa (masalan Telegram orqali allaqachon belgilangan),
 * ustiga YOZILMAYDI — faqat AttendanceRecord'da HALI YO'Q kombinatsiyalar
 * to'ldiriladi. Bu ataylab: ikkala manba ham "haqiqat" da'vo qilishi mumkin,
 * lekin Telegram'dan kelgan (allaqachon to'g'ri joyga yozilgan) ma'lumot
 * ustuvor — biz faqat ILGARI HECH QAYERGA YETMAGAN CRM-desktop
 * ma'lumotlarini TIKLAYMIZ, mavjudni almashtirmaymiz.
 *
 * Idempotent — qayta ishga tushirish xavfsiz (upsert, faqat mavjud
 * bo'lmagan qatorlarga tegadi).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface OldRecord {
    studentId: string;
    status: string;
    time?: string;
}

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'excused']);

async function main() {
    const oldRows = await prisma.attendance.findMany();
    console.log(`Eski Attendance jadvalida ${oldRows.length} ta qator topildi.`);

    let migrated = 0;
    let skippedExisting = 0;
    let skippedInvalid = 0;

    for (const row of oldRows) {
        let records: OldRecord[];
        try {
            records = JSON.parse(row.records || '[]');
        } catch {
            console.warn(`OGOHLANTIRISH: ${row.id} (${row.groupId}, ${row.date}) — records JSON buzuq, o'tkazib yuborildi`);
            continue;
        }
        if (!Array.isArray(records)) continue;

        for (const rec of records) {
            if (!rec.studentId || !VALID_STATUSES.has(rec.status)) {
                skippedInvalid++;
                continue;
            }
            const existing = await prisma.attendanceRecord.findUnique({
                where: { studentId_groupId_date: { studentId: rec.studentId, groupId: row.groupId, date: row.date } },
            });
            if (existing) {
                skippedExisting++;
                continue;
            }
            await prisma.attendanceRecord.create({
                data: { studentId: rec.studentId, groupId: row.groupId, date: row.date, status: rec.status },
            });
            migrated++;
        }
    }

    console.log(`\nKo'chirildi: ${migrated} ta yangi AttendanceRecord`);
    console.log(`O'tkazib yuborildi (AttendanceRecord'da allaqachon bor edi): ${skippedExisting}`);
    console.log(`O'tkazib yuborildi (noto'g'ri studentId/status): ${skippedInvalid}`);
    console.log('\nMigratsiya tugadi. Eski Attendance jadvali TEGILMADI (tarixiy zaxira sifatida qoladi).');

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
