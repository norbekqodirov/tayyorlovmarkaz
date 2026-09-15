/**
 * server/routes/lessonSessions.ts
 *
 * EDU-06: `AttendanceRecord`ning (studentId,groupId,date) yagona kaliti bir
 * kunda bitta guruh uchun faqat BITTA dars taxmin qiladi — qo'shimcha/qoplash
 * darsi uchun yozuv yozib bo'lmaydi. Bu fayl ataylab ALOHIDA, qo'shimcha
 * jadval (`LessonSession`/`LessonAttendance`) ustida ishlaydi — standart,
 * kundagi yagona dars oqimi (`studentAttendance.ts`, `AttendanceRecord`)
 * butunlay o'zgarishsiz qoladi. Faqat haqiqatan bir kunda ikkinchi darsi
 * bo'lgan (kamdan-kam) holatlar uchun o'qituvchi bu yerdan alohida sessiya
 * yaratib, unga alohida davomat yozadi.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';

const router = express.Router();

router.use(requireAuth, requireMinRole('TEACHER'), requirePermission('journal'));

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'excused']);

async function ensureGroupAccess(groupId: string, requester: any): Promise<boolean> {
    if (requester.role !== 'TEACHER') return true; // MANAGER+ cheklovsiz
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return !!group && group.teacherId === requester.id;
}

// ─── GET /api/lesson-sessions?groupId=X&date=Y — shu kundagi qo'shimcha darslar ──
router.get('/', async (req, res) => {
    try {
        const { groupId, date } = req.query as { groupId?: string; date?: string };
        if (!groupId || !date) return res.status(400).json({ message: 'groupId va date talab qilinadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        const sessions = await prisma.lessonSession.findMany({
            where: { groupId, date },
            orderBy: { createdAt: 'asc' },
            include: { _count: { select: { attendance: true } } },
        });
        res.json(sessions);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/lesson-sessions — shu kun uchun qo'shimcha dars yaratish ────
router.post('/', async (req, res) => {
    try {
        const { groupId, date, startTime, label } = req.body as {
            groupId: string; date: string; startTime?: string; label?: string;
        };
        if (!groupId || !date) return res.status(400).json({ message: 'groupId va date talab qilinadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        const session = await prisma.lessonSession.create({
            data: { groupId, date, startTime: startTime || null, label: label || null },
        });
        res.status(201).json(session);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── DELETE /api/lesson-sessions/:id — qo'shimcha darsni o'chirish ─────────
router.delete('/:id', async (req, res) => {
    try {
        const session = await prisma.lessonSession.findUnique({ where: { id: req.params.id } });
        if (!session) return res.status(404).json({ message: 'Topilmadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(session.groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        await prisma.lessonSession.delete({ where: { id: req.params.id } }); // attendance cascade bilan o'chadi
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/lesson-sessions/:id/attendance — sessiya davomati ────────────
router.get('/:id/attendance', async (req, res) => {
    try {
        const session = await prisma.lessonSession.findUnique({ where: { id: req.params.id } });
        if (!session) return res.status(404).json({ message: 'Topilmadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(session.groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        const records = await prisma.lessonAttendance.findMany({ where: { sessionId: req.params.id } });
        res.json(records);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/lesson-sessions/:id/attendance — ommaviy saqlash (upsert) ───
router.post('/:id/attendance', async (req, res) => {
    try {
        const { records } = req.body as { records: Array<{ studentId: string; status: string; note?: string }> };
        if (!records?.length) return res.status(400).json({ message: 'records talab qilinadi' });
        for (const r of records) {
            if (!VALID_STATUSES.has(r.status)) {
                return res.status(400).json({ message: `Noto'g'ri holat: ${r.status}` });
            }
        }

        const session = await prisma.lessonSession.findUnique({ where: { id: req.params.id } });
        if (!session) return res.status(404).json({ message: 'Topilmadi' });

        const requester = (req as any).user;
        if (!(await ensureGroupAccess(session.groupId, requester))) {
            return res.status(403).json({ message: 'Bu guruhga ruxsatingiz yo\'q' });
        }

        // EDU-01 bilan bir xil naqsh: studentId aynan shu guruhga a'zo ekani tekshiriladi
        const enrolledIds = new Set(
            (await prisma.enrollment.findMany({
                where: { groupId: session.groupId, studentId: { in: records.map(r => r.studentId) } },
                select: { studentId: true },
            })).map(e => e.studentId),
        );
        const notEnrolled = records.filter(r => !enrolledIds.has(r.studentId));
        if (notEnrolled.length > 0) {
            return res.status(400).json({ message: "Quyidagi o'quvchi(lar) bu guruhga a'zo emas" });
        }

        const results = await Promise.all(
            records.map(r =>
                prisma.lessonAttendance.upsert({
                    where: { sessionId_studentId: { sessionId: req.params.id, studentId: r.studentId } },
                    create: { sessionId: req.params.id, studentId: r.studentId, status: r.status, note: r.note },
                    update: { status: r.status, note: r.note },
                }),
            ),
        );
        res.json({ saved: results.length, sessionId: req.params.id });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
