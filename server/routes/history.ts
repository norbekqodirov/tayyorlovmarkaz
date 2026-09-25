/**
 * IP-09 — guruh tarifi, guruh ustozi va ustoz foizi tarixi (/api/history).
 * Har o'zgarish sana bilan yangi versiya; o'tgan oylar o'zgarmaydi (QT-21).
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { HistoryError, setGroupTariff, assignGroupTeacher, setTeacherRate } from '../services/groupHistory.js';

const router = express.Router();
const canManageGroups = [requireAuth, requireMinRole('MANAGER'), requireAnyPermission(['groups'])];

function sendError(res: express.Response, err: any) {
    if (err instanceof HistoryError) return res.status(err.status).json({ message: err.message });
    console.error('[history]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}
const actor = (req: any) => ({ id: req.user?.id as string | undefined, name: (req.user?.name || req.user?.phone || 'tizim') as string });

// GET /api/history/groups/:groupId — tarif va ustoz tarixi
router.get('/groups/:groupId', ...canManageGroups, async (req, res) => {
    try {
        const [tariffs, teachers] = await Promise.all([
            prisma.tariffVersion.findMany({ where: { groupId: req.params.groupId }, orderBy: { effectiveFrom: 'desc' } }),
            prisma.groupTeacherAssignment.findMany({ where: { groupId: req.params.groupId }, orderBy: { fromDate: 'desc' } }),
        ]);
        const users = await prisma.user.findMany({ where: { id: { in: [...new Set(teachers.map(t => t.teacherId))] } }, select: { id: true, name: true } });
        const names = new Map(users.map(u => [u.id, u.name]));
        res.json({ tariffs, teachers: teachers.map(t => ({ ...t, teacherName: names.get(t.teacherId) ?? null })) });
    } catch (err) { sendError(res, err); }
});

// POST /api/history/groups/:groupId/tariff — { monthlyPrice, lessonsPerPackage?, effectiveFrom }
router.post('/groups/:groupId/tariff', ...canManageGroups, requirePermission('finance'), async (req, res) => {
    try {
        const { monthlyPrice, lessonsPerPackage, effectiveFrom } = req.body || {};
        const a = actor(req);
        const v = await prisma.$transaction(tx => setGroupTariff(tx, req.params.groupId, { monthlyPrice, lessonsPerPackage, effectiveFrom }, a.id));
        await logAudit({ userId: a.id, userName: a.name, action: 'tariff_set', resource: 'tariffVersion', resourceId: v.id, after: v });
        res.status(201).json(v);
    } catch (err) { sendError(res, err); }
});

// POST /api/history/groups/:groupId/teacher — { teacherId, fromDate }
router.post('/groups/:groupId/teacher', ...canManageGroups, async (req, res) => {
    try {
        const { teacherId, fromDate } = req.body || {};
        const a = actor(req);
        const row = await prisma.$transaction(tx => assignGroupTeacher(tx, req.params.groupId, { teacherId: teacherId || null, fromDate }, a.id));
        await logAudit({ userId: a.id, userName: a.name, action: 'teacher_assign', resource: 'groupTeacherAssignment', resourceId: row?.id ?? req.params.groupId, after: row ?? { teacherId: null, fromDate } });
        res.status(201).json(row);
    } catch (err) { sendError(res, err); }
});

// GET /api/history/teachers/:teacherId/rates
router.get('/teachers/:teacherId/rates', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        res.json(await prisma.teacherRate.findMany({ where: { teacherId: req.params.teacherId }, orderBy: { effectiveFrom: 'desc' } }));
    } catch (err) { sendError(res, err); }
});

// POST /api/history/teachers/:teacherId/rate — { ratePercent | rateBp, effectiveFrom }
router.post('/teachers/:teacherId/rate', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { ratePercent, rateBp, effectiveFrom } = req.body || {};
        const bp = rateBp != null ? Number(rateBp) : Number(ratePercent) * 100;
        const a = actor(req);
        const row = await prisma.$transaction(tx => setTeacherRate(tx, req.params.teacherId, { rateBp: bp, effectiveFrom }, a.id));
        await logAudit({ userId: a.id, userName: a.name, action: 'teacher_rate_set', resource: 'teacherRate', resourceId: row.id, after: row });
        res.status(201).json(row);
    } catch (err) { sendError(res, err); }
});

export default router;
