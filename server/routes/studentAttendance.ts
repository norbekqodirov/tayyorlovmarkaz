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
import { markAttendance, deleteAttendance, AttendanceError } from '../services/attendance.js';

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
// IP-10: barcha qoidalar yagona xizmatda (server/services/attendance.ts) —
// Telegram yo'li (staffPortal.ts) ham aynan shu funksiyani chaqiradi.
router.post('/', async (req, res) => {
    try {
        const { groupId, date, records, reason } = req.body || {};
        const requester = (req as any).user;
        res.json(await markAttendance({ groupId, date, records, reason }, { id: requester.id, role: requester.role }));
    } catch (err: any) {
        if (err instanceof AttendanceError) return res.status(err.status).json({ message: err.message, code: err.code });
        res.status(500).json({ message: err.message });
    }
});

// ─── DELETE /api/attendance-records/:studentId/:groupId/:date — belgilashni bekor qilish ──
router.delete('/:studentId/:groupId/:date', async (req, res) => {
    try {
        const { studentId, groupId, date } = req.params;
        const requester = (req as any).user;
        const reason = (req.body?.reason ?? req.query.reason ?? null) as string | null;
        res.json(await deleteAttendance({ studentId, groupId, date, reason }, { id: requester.id, role: requester.role }));
    } catch (err: any) {
        if (err instanceof AttendanceError) return res.status(err.status).json({ message: err.message, code: err.code });
        res.status(500).json({ message: err.message });
    }
});

export default router;
