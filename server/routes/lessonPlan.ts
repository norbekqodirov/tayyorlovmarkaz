/**
 * IP-10 — dars rejasi va bayramlar (/api/lesson-plan). Qoidalar:
 * server/services/lessonPlan.ts va docs/ADR_HISOB_QOIDALARI.md (OQ-03).
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { isValidDate } from '../domain/lessonCalendar.js';
import {
    LessonPlanError, generateMonthPlan, generateAllPlans, cancelSession, moveSession, addSession, monthPlan, unmarkedLessons,
} from '../services/lessonPlan.js';

const router = express.Router();
const canPlan = [requireAuth, requireMinRole('MANAGER'), requirePermission('schedule')];
const canView = [requireAuth, requireMinRole('TEACHER'), requireAnyPermission(['journal', 'schedule'])];

const actor = (req: any) => ({ id: req.user?.id as string | undefined, name: (req.user?.name || req.user?.phone || 'tizim') as string });
function sendError(res: express.Response, err: any) {
    if (err instanceof LessonPlanError) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('[lesson-plan]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}
async function teacherOwns(groupId: string, userId: string) {
    const g = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return !!g && g.teacherId === userId;
}

// GET /api/lesson-plan?groupId=&month=YYYY-MM — oy rejasi va xulosa
router.get('/', ...canView, async (req, res) => {
    try {
        const { groupId, month } = req.query as { groupId?: string; month?: string };
        if (!groupId || !month) return res.status(400).json({ message: 'groupId va month kerak' });
        const u = (req as any).user;
        if (u.role === 'TEACHER' && !(await teacherOwns(groupId, u.id))) return res.status(403).json({ message: "Bu guruhga ruxsatingiz yo'q" });
        res.json(await monthPlan(groupId, month));
    } catch (err) { sendError(res, err); }
});

// POST /api/lesson-plan/generate — { month, groupId? } (groupId'siz — barcha faol guruhlar)
router.post('/generate', ...canPlan, async (req, res) => {
    try {
        const { month, groupId } = req.body || {};
        const a = actor(req);
        const result = groupId ? await generateMonthPlan(groupId, month, a.id) : await generateAllPlans(month);
        await logAudit({ userId: a.id, userName: a.name, action: 'lesson_plan_generate', resource: 'lessonSession', resourceId: groupId ?? null, metadata: { month } });
        res.json(result);
    } catch (err) { sendError(res, err); }
});

// POST /api/lesson-plan/sessions — { groupId, date, kind: extra|makeup|trial, price?, label?, replacesSessionId? }
router.post('/sessions', ...canPlan, async (req, res) => {
    try {
        const a = actor(req);
        const s = await addSession(req.body || {}, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'lesson_add', resource: 'lessonSession', resourceId: s.id, after: s });
        res.status(201).json(s);
    } catch (err) { sendError(res, err); }
});

// POST /api/lesson-plan/sessions/:id/cancel — { reason: center|teacher|holiday|other, compensate?, note? }
router.post('/sessions/:id/cancel', ...canPlan, async (req, res) => {
    try {
        const a = actor(req);
        const s = await cancelSession(req.params.id, req.body || {}, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'lesson_cancel', resource: 'lessonSession', resourceId: s.id, after: s });
        res.json(s);
    } catch (err) { sendError(res, err); }
});

// POST /api/lesson-plan/sessions/:id/move — { toDate, startTime? }
router.post('/sessions/:id/move', ...canPlan, async (req, res) => {
    try {
        const a = actor(req);
        const s = await moveSession(req.params.id, req.body || {}, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'lesson_move', resource: 'lessonSession', resourceId: req.params.id, after: s });
        res.status(201).json(s);
    } catch (err) { sendError(res, err); }
});

// GET /api/lesson-plan/unmarked?date= — davomati olinmagan o'tgan darslar (ustoz — o'z guruhlari)
router.get('/unmarked', ...canView, async (req, res) => {
    try {
        const u = (req as any).user;
        const date = typeof req.query.date === 'string' && isValidDate(req.query.date) ? req.query.date : undefined;
        res.json(await unmarkedLessons({ upTo: date, teacherId: u.role === 'TEACHER' ? u.id : null }));
    } catch (err) { sendError(res, err); }
});

// ─── Bayramlar ───────────────────────────────────────────────────────────────

router.get('/holidays', ...canView, async (req, res) => {
    try {
        const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? req.query.year : undefined;
        res.json(await prisma.holiday.findMany({ where: year ? { date: { startsWith: year } } : {}, orderBy: { date: 'asc' } }));
    } catch (err) { sendError(res, err); }
});

router.post('/holidays', ...canPlan, async (req, res) => {
    try {
        const { date, name } = req.body || {};
        if (!isValidDate(date)) return res.status(400).json({ message: "Sana YYYY-MM-DD formatida bo'lishi kerak" });
        if (!name || String(name).trim().length < 2) return res.status(400).json({ message: 'Bayram nomini kiriting' });
        const a = actor(req);
        const h = await prisma.holiday.upsert({ where: { date }, create: { date, name: String(name).trim(), createdById: a.id ?? null }, update: { name: String(name).trim() } });
        await logAudit({ userId: a.id, userName: a.name, action: 'holiday_set', resource: 'holiday', resourceId: h.id, after: h });
        res.status(201).json({ ...h, note: "Mavjud rejadan shu kungi (o'tmagan, davomatsiz) darslar keyingi generatsiyada olib tashlanadi" });
    } catch (err) { sendError(res, err); }
});

router.delete('/holidays/:id', ...canPlan, async (req, res) => {
    try {
        const a = actor(req);
        const h = await prisma.holiday.delete({ where: { id: req.params.id } }).catch(() => null);
        if (!h) return res.status(404).json({ message: 'Topilmadi' });
        await logAudit({ userId: a.id, userName: a.name, action: 'holiday_delete', resource: 'holiday', resourceId: h.id, before: h });
        res.json({ success: true });
    } catch (err) { sendError(res, err); }
});

export default router;
