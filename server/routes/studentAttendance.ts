/**
 * O'quvchi davomati — CRM desktop uchun `AttendanceRecord` (haqiqiy ustunli
 * jadval, har bir o'quvchi+guruh+sana uchun bitta qator) asosidagi endpoint.
 *
 * MUHIM TARIX: CRM desktop (Elektron Jurnal -> guruh -> "Davomat" tabi)
 * ILGARI `Attendance` (guruh+sana uchun bitta JSON-blob qator) jadvaliga
 * yozar edi — bu esa Telegram Staff Mini App (`staffPortal.ts`)ning o'zi
 * yozadigan `AttendanceRecord`dan BUTUNLAY ALOHIDA edi. Natijada CRM
 * desktop'dan belgilangan davomat "saqlandi" ko'rinardi, lekin oylik
 * to'lov/chegirma hisobi (`billing.ts`), ota-onaga "kelmadi" xabari
 * (`scheduler.ts`), hisobotlar (`reports.ts`) va o'quvchi progress sahifasi
 * (`progress.ts`) — bularning HECH BIRI buni ko'rmasdi, chunki ular faqat
 * `AttendanceRecord`ni o'qiydi. Bu fayl shu bo'shliqni yopadi: endi ikkala
 * interfeys (CRM desktop + Telegram) BIR XIL jadvalga yozadi.
 *
 * `staffPortal.ts`dagi POST /attendance (portalAuth) bilan BIR XIL
 * so'rov/javob shaklidan foydalaniladi — ataylab, ikki tomon ham izchil
 * bo'lishi uchun (records: [{studentId,status,note?}]).
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();

router.use(requireAuth, requireMinRole('TEACHER'), requirePermission('journal'));

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'excused']);

async function ensureGroupAccess(groupId: string, requester: any): Promise<boolean> {
    if (requester.role !== 'TEACHER') return true; // MANAGER+ cheklovsiz
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return !!group && group.teacherId === requester.id;
}

// ─── GET /api/attendance-records?groupId=X&date=Y — bitta kunlik ro'yxat ────
router.get('/', async (req, res) => {
    try {
        const { groupId, date } = req.query as { groupId?: string; date?: string };
        if (!groupId || !date) return res.status(400).json({ message: 'groupId va date talab qilinadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        const records = await prisma.attendanceRecord.findMany({ where: { groupId, date } });
        res.json(records);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/attendance-records/month?groupId=X&month=YYYY-MM — oylik ko'rinish (faqat o'qish) ──
router.get('/month', async (req, res) => {
    try {
        const { groupId, month } = req.query as { groupId?: string; month?: string };
        if (!groupId || !month) return res.status(400).json({ message: 'groupId va month talab qilinadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        const records = await prisma.attendanceRecord.findMany({
            where: { groupId, date: { startsWith: month } },
        });
        res.json(records);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/attendance-records — bir kunlik ommaviy saqlash (upsert) ────
router.post('/', async (req, res) => {
    try {
        const { groupId, date, records } = req.body as {
            groupId: string; date: string; records: Array<{ studentId: string; status: string; note?: string }>;
        };
        if (!groupId || !date || !records?.length) {
            return res.status(400).json({ message: 'groupId, date va records talab qilinadi' });
        }
        for (const r of records) {
            if (!VALID_STATUSES.has(r.status)) {
                return res.status(400).json({ message: `Noto'g'ri holat: ${r.status}` });
            }
        }
        // IP-03/IP-10: sana formati va kelajak sanasi (Toshkent vaqti bo'yicha)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: "Sana YYYY-MM-DD formatida bo'lishi kerak" });
        }
        if (date > todayDateStr()) {
            return res.status(400).json({ message: "Kelajak sanasiga davomat belgilab bo'lmaydi" });
        }

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        // EDU-01 tuzatish: guruhga ruxsat tekshirilardi, lekin har bir
        // studentId aynan SHU guruhga a'zo (Enrollment) ekani tekshirilmasdi
        // — noto'g'ri/eskirgan studentId yuborilsa, boshqa guruhdagi (yoki
        // umuman guruhsiz) o'quvchi uchun davomat yozuvi yaratilishi mumkin
        // edi, bu keyinchalik billing/hisobotlarni buzardi.
        const enrolledIds = new Set(
            (await prisma.enrollment.findMany({
                where: { groupId, studentId: { in: records.map(r => r.studentId) }, student: { deletedAt: null } },
                select: { studentId: true },
            })).map(e => e.studentId),
        );
        const notEnrolled = records.filter(r => !enrolledIds.has(r.studentId));
        if (notEnrolled.length > 0) {
            return res.status(400).json({ message: "Quyidagi o'quvchi(lar) bu guruhga a'zo emas" });
        }

        const results = await Promise.all(
            records.map(r =>
                prisma.attendanceRecord.upsert({
                    where: { studentId_groupId_date: { studentId: r.studentId, groupId, date } },
                    create: { studentId: r.studentId, groupId, date, status: r.status, note: r.note },
                    update: { status: r.status, note: r.note },
                }),
            ),
        );
        res.json({ saved: results.length, date, groupId });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── DELETE /api/attendance-records/:studentId/:groupId/:date — belgilashni bekor qilish ──
router.delete('/:studentId/:groupId/:date', async (req, res) => {
    try {
        const { studentId, groupId, date } = req.params;
        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }
        await prisma.attendanceRecord.delete({
            where: { studentId_groupId_date: { studentId, groupId, date } },
        }).catch(() => { /* allaqachon yo'q bo'lsa ham jim — idempotent */ });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
