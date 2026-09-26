/**
 * IP-09 — a'zolik komandalari (/api/enrollments). crud.ts'dagi eski maxsus
 * yo'llar (POST /, GET /group/:id, DELETE /remove) shu yerga ko'chirildi va
 * xizmatga (server/services/enrollment.ts) ulandi — eski frontend chaqiruvlari
 * mos holda ishlayveradi (startDate berilmasa — bugun).
 */
import express from 'express';
import { projectStudentForTeacher } from '../domain/studentProjection.js';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';
import {
    EnrollmentError, previewEnrollment, enrollStudent, endPeriod, transferPeriod, pausePeriod, stopPause,
    legacyRemove, listPeriods, activePeriodsByStudent, changePeriodStarts, type Actor,
} from '../services/enrollment.js';
import { refreshMembershipCharges, monthsBetween } from '../services/chargeEngine.js';

const router = express.Router();
const canManage = [requireAuth, requireMinRole('MANAGER'), requireAnyPermission(['students', 'groups'])];

const actorOf = (req: any): Actor => ({ id: req.user?.id, name: req.user?.name || req.user?.phone || null });

function sendError(res: express.Response, err: any) {
    if (err instanceof EnrollmentError) return res.status(err.status).json({ message: err.message, code: err.code, details: err.details });
    console.error('[enrollments]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}

/**
 * A'zolik o'zgarishidan keyin shu o'quvchi×guruh hisoblari (shadow/live; live'da darhol kuchga
 * kiradi — qo'lda "e'lon qilish" yo'q). Xato a'zolik amalining o'zini bekor qilmaydi.
 */
async function syncCharges(studentId: string, groupId: string, fromDate: string, reason: string, actorId?: string | null) {
    const today = todayDateStr();
    const from = fromDate && fromDate < today ? fromDate : today;
    await refreshMembershipCharges({ studentId, groupId, months: monthsBetween(from, today), reason }, actorId)
        .catch(e => console.error('[enrollments] hisob yangilash', e?.message));
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
        // Sana berilmasa — bugun; guruh hali boshlanmagan bo'lsa — guruh boshlanishi
        let start = startDate as string | undefined;
        if (!start) {
            const g = await prisma.group.findUnique({ where: { id: groupId }, select: { startDate: true } });
            start = g?.startDate && g.startDate > todayDateStr() ? g.startDate : todayDateStr();
        }
        const r = await enrollStudent({ studentId, groupId, startDate: start, note, source: 'manual' }, actorOf(req));
        // Hisob darhol: boshlangan oydan bugungacha (o'tgan sanadan yozilsa — o'sha oylar ham)
        if (!r.alreadyEnrolled && r.period) await syncCharges(studentId, groupId, r.period.startDate, "Guruhga yozildi", actorOf(req).id);
        // Eski javob shakli (Enrollment maydonlari) saqlanadi + davr
        res.status(r.alreadyEnrolled ? 200 : 201).json({ ...r.enrollment, period: r.period, alreadyEnrolled: r.alreadyEnrolled });
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/start-dates — { groupId, items: [{ periodId, startDate }] }
// Adminlar o'quvchi guruhda qachondan o'qiyotganini belgilaydi (bir yoki hammasi).
// Hammasi yoki hech biri; xato qatorlar `details`da. Keyin hisoblar yangilanadi.
router.post('/periods/start-dates', ...canManage, async (req, res) => {
    try {
        const actor = actorOf(req);
        const changed = await changePeriodStarts({ groupId: req.body?.groupId, items: req.body?.items }, actor);
        const billing = [];
        for (const c of changed) {
            billing.push(await refreshMembershipCharges({ studentId: c.studentId, groupId: c.groupId, months: monthsBetween(c.from, c.to), reason: `A'zolik boshlanishi ${c.from} → ${c.to}` }, actor.id));
        }
        res.json({
            changed: changed.length,
            items: changed,
            drafts: billing.reduce((s, b) => s + b.drafts + b.newDrafts, 0),
            adjustments: billing.flatMap(b => b.adjustments),
        });
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
            // IP-26 (OQ-13): o'qituvchiga telefon, manzil, balans va h.k. berilmaydi
            const student: any = requester.role === 'TEACHER' ? projectStudentForTeacher(e.student) : { ...e.student };
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
        await syncCharges(studentId, groupId, todayDateStr(), "Guruhdan chiqarildi", actorOf(req).id);
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
        const end = endDate || todayDateStr();
        const r = await endPeriod({ periodId: req.params.id, endDate: end, reason: reason || 'left', note }, actorOf(req));
        await syncCharges(r.period.studentId, r.period.groupId, r.removed ? r.period.startDate : end, r.removed ? "Xato qo'shilgan a'zolik olib tashlandi" : "A'zolik yakunlandi", actorOf(req).id);
        res.json({ success: true, removed: r.removed });
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/:id/transfer — { toGroupId, date } — bitta so'rovda (QT-61)
router.post('/periods/:id/transfer', ...canManage, async (req, res) => {
    try {
        const { toGroupId, date } = req.body || {};
        if (!toGroupId) return res.status(400).json({ message: 'toGroupId kiritilishi shart' });
        const d = date || todayDateStr();
        const r = await transferPeriod({ periodId: req.params.id, toGroupId, date: d }, actorOf(req));
        await syncCharges(r.from.period.studentId, r.from.period.groupId, r.from.removed ? r.from.period.startDate : d, "Boshqa guruhga o'tkazildi", actorOf(req).id);
        await syncCharges(r.from.period.studentId, toGroupId, d, "Boshqa guruhdan o'tkazildi", actorOf(req).id);
        res.json({ success: true, newPeriod: r.to.period, oldPeriodRemoved: r.from.removed });
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/periods/:id/pause — { fromDate, toDate, reason } (OQ-06)
router.post('/periods/:id/pause', ...canManage, async (req, res) => {
    try {
        const { fromDate, toDate, reason } = req.body || {};
        const pause = await pausePeriod({ periodId: req.params.id, fromDate, toDate, reason }, actorOf(req));
        const p = await prisma.enrollmentPeriod.findUnique({ where: { id: req.params.id }, select: { studentId: true, groupId: true } });
        if (p) await syncCharges(p.studentId, p.groupId, fromDate, 'Pauza', actorOf(req).id);
        res.status(201).json(pause);
    } catch (err) { sendError(res, err); }
});

// POST /api/enrollments/pauses/:id/stop — pauzani bekor qilish / muddatidan oldin tugatish
router.post('/pauses/:id/stop', ...canManage, async (req, res) => {
    try {
        const before = await prisma.enrollmentPause.findUnique({ where: { id: req.params.id }, include: { period: { select: { studentId: true, groupId: true } } } });
        const r = await stopPause(req.params.id, actorOf(req));
        if (before?.period) await syncCharges(before.period.studentId, before.period.groupId, before.fromDate, 'Pauza bekor qilindi', actorOf(req).id);
        res.json(r);
    } catch (err) { sendError(res, err); }
});

export default router;
