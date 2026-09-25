/**
 * IP-09 — a'zolik komandalari (/api/enrollments). crud.ts'dagi eski maxsus
 * yo'llar (POST /, GET /group/:id, DELETE /remove) shu yerga ko'chirildi va
 * xizmatga (server/services/enrollment.ts) ulandi — eski frontend chaqiruvlari
 * mos holda ishlayveradi (startDate berilmasa — bugun).
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';
import {
    EnrollmentError, previewEnrollment, enrollStudent, endPeriod, transferPeriod, pausePeriod, stopPause,
    legacyRemove, listPeriods, activePeriodsByStudent, type Actor,
} from '../services/enrollment.js';

const router = express.Router();
const canManage = [requireAuth, requireMinRole('MANAGER'), requireAnyPermission(['students', 'groups'])];

const actorOf = (req: any): Actor => ({ id: req.user?.id, name: req.user?.name || req.user?.phone || null });

function sendError(res: express.Response, err: any) {
    if (err instanceof EnrollmentError) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('[enrollments]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}

async function teacherOwnsGroup(groupId: string, userId: string) {
    const g = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return !!g && g.teacherId === userId;
}

// POST /api/enrollments/preview — yozmaydi: xatolar, ogohlantirishlar, birinchi oy summasi
router.post('/preview', ...canManage, async (req, res) => {
    try {
        const { studentId, groupId, startDate } = req.body || {};
        if (!groupId) return res.status(400).json({ message: 'groupId kiritilishi shart' });
        res.json(await previewEnrollment(prisma, { studentId, groupId, startDate: startDate || todayDateStr() }));
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments — guruhga yozish (davr + joriy a'zolik keshi, sig'im tekshiruvi)
router.post('/', ...canManage, async (req, res) => {
    try {
        const { studentId, groupId, startDate, note } = req.body || {};
        if (!studentId || !groupId) return res.status(400).json({ message: 'studentId va groupId kiritilishi shart' });
        const r = await enrollStudent({ studentId, groupId, startDate: startDate || todayDateStr(), note, source: 'manual' }, actorOf(req));
        // Eski javob shakli (Enrollment maydonlari) saqlanadi + davr
        res.status(r.alreadyEnrolled ? 200 : 201).json({ ...r.enrollment, period: r.period, alreadyEnrolled: r.alreadyEnrolled });
    } catch (err) { sendError(res, err); }
});

// GET /api/enrollments/group/:groupId — guruhning joriy a'zolari (+ faol davr)
// SEC-04: TEACHER faqat o'z guruhini ko'radi; RX-04: moliya maydonlarisiz.
router.get('/group/:groupId', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (requester.role === 'TEACHER' && !(await teacherOwnsGroup(req.params.groupId, requester.id))) {
            return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
        }
        const [enrollments, periods] = await Promise.all([
            prisma.enrollment.findMany({ where: { groupId: req.params.groupId, student: { deletedAt: null } }, include: { student: true } }),
            activePeriodsByStudent(req.params.groupId),
        ]);
        res.json(enrollments.map(e => {
            const student: any = { ...e.student };
            if (requester.role === 'TEACHER') { delete student.balance; delete student.paymentStatus; }
            return { ...e, student, period: periods.get(e.studentId) ?? null };
        }));
    } catch (err) { sendError(res, err); }
});

// DELETE /api/enrollments/remove — eski "guruhdan chiqarish" (bugun bilan yakunlash)
router.delete('/remove', ...canManage, async (req, res) => {
    try {
        const { studentId, groupId } = req.body || {};
        if (!studentId || !groupId) return res.status(400).json({ message: 'studentId va groupId kiritilishi shart' });
        const r = await legacyRemove({ studentId, groupId }, actorOf(req));
        res.json({ success: true, removed: r.removed, period: r.period });
    } catch (err) { sendError(res, err); }
});

// GET /api/enrollments/periods?studentId=|groupId= — a'zolik tarixi
router.get('/periods', ...canManage, async (req, res) => {
    try {
        const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
        const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
        if (!studentId && !groupId) return res.status(400).json({ message: 'studentId yoki groupId kerak' });
        res.json(await listPeriods({ ...(studentId && { studentId }), ...(groupId && { groupId }) }));
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/:id/end — { endDate, reason: left|graduated|admin_fix, note }
router.post('/periods/:id/end', ...canManage, async (req, res) => {
    try {
        const { endDate, reason, note } = req.body || {};
        const r = await endPeriod({ periodId: req.params.id, endDate: endDate || todayDateStr(), reason: reason || 'left', note }, actorOf(req));
        res.json({ success: true, removed: r.removed });
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/:id/transfer — { toGroupId, date } — bitta so'rovda (QT-61)
router.post('/periods/:id/transfer', ...canManage, async (req, res) => {
    try {
        const { toGroupId, date } = req.body || {};
        if (!toGroupId) return res.status(400).json({ message: 'toGroupId kiritilishi shart' });
        const r = await transferPeriod({ periodId: req.params.id, toGroupId, date: date || todayDateStr() }, actorOf(req));
        res.json({ success: true, newPeriod: r.to.period, oldPeriodRemoved: r.from.removed });
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/:id/pause — { fromDate, toDate, reason } (OQ-06)
router.post('/periods/:id/pause', ...canManage, async (req, res) => {
    try {
        const { fromDate, toDate, reason } = req.body || {};
        res.status(201).json(await pausePeriod({ periodId: req.params.id, fromDate, toDate, reason }, actorOf(req)));
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/pauses/:id/stop — pauzani bekor qilish / muddatidan oldin tugatish
router.post('/pauses/:id/stop', ...canManage, async (req, res) => {
    try {
        res.json(await stopPause(req.params.id, actorOf(req)));
    } catch (err) { sendError(res, err); }
});

export default router;
