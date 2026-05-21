import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// GET /api/audit — list with filter, pagination
router.get('/', requireAuth, requireRole, async (req, res) => {
    try {
        const {
            page = '1',
            limit = '50',
            resource,
            resourceId,
            user,
            action,
            from,
            to,
            search,
        } = req.query as Record<string, string>;

        const where: any = {};
        if (resource) where.resource = resource;
        if (resourceId) where.resourceId = resourceId;
        if (user) where.userId = user;
        if (action) where.action = action;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }
        if (search) {
            where.OR = [
                { userName: { contains: search } },
                { resource: { contains: search } },
                { resourceId: { contains: search } },
            ];
        }

        const pageN = parseInt(page) || 1;
        const limitN = Math.min(parseInt(limit) || 50, 200);

        const [total, items] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (pageN - 1) * limitN,
                take: limitN,
                include: { user: { select: { id: true, name: true, avatar: true } } },
            }),
        ]);

        res.json({
            data: items.map(i => ({
                ...i,
                before: i.before ? safeParse(i.before) : null,
                after: i.after ? safeParse(i.after) : null,
                metadata: i.metadata ? safeParse(i.metadata) : null,
            })),
            total,
            page: pageN,
            limit: limitN,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/audit/timeline/:resource/:id — single resource history
router.get('/timeline/:resource/:id', requireAuth, async (req, res) => {
    try {
        const { resource, id } = req.params;
        const items = await prisma.auditLog.findMany({
            where: { resource, resourceId: id },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: { select: { id: true, name: true, avatar: true } } },
        });
        res.json(items.map(i => ({
            ...i,
            before: i.before ? safeParse(i.before) : null,
            after: i.after ? safeParse(i.after) : null,
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/audit/stats — quick stats for dashboard widget
router.get('/stats', requireAuth, requireRole, async (_req, res) => {
    try {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [total, last24hCount, byAction, topUsers] = await Promise.all([
            prisma.auditLog.count(),
            prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
            prisma.auditLog.groupBy({
                by: ['action'],
                _count: { _all: true },
                where: { createdAt: { gte: last24h } },
            }),
            prisma.auditLog.groupBy({
                by: ['userName'],
                _count: { _all: true },
                where: { createdAt: { gte: last24h } },
                orderBy: { _count: { userName: 'desc' } },
                take: 5,
            }),
        ]);
        res.json({
            total,
            last24h: last24hCount,
            byAction: byAction.map((g: any) => ({ action: g.action, count: g._count._all })),
            topUsers: topUsers.map((g: any) => ({ name: g.userName, count: g._count._all })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/audit/:id/restore — restore from before snapshot
router.post('/:id/restore', requireAuth, requireRole, async (req, res) => {
    try {
        const audit = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
        if (!audit || !audit.before) {
            return res.status(404).json({ message: "Yozuv topilmadi yoki tiklash uchun ma'lumot yo'q" });
        }

        const beforeData = safeParse(audit.before);
        if (!beforeData?.id) return res.status(400).json({ message: "Tiklash uchun ID topilmadi" });

        const { id: _id, createdAt, updatedAt, ...restoreData } = beforeData;
        const resource = audit.resource;

        // @ts-ignore
        if (!prisma[resource]) return res.status(400).json({ message: 'Resurs topilmadi' });

        try {
            // @ts-ignore
            const existing = await prisma[resource].findUnique({ where: { id: beforeData.id } });
            let restored: any;
            if (existing) {
                // @ts-ignore
                restored = await prisma[resource].update({
                    where: { id: beforeData.id },
                    data: { ...restoreData, deletedAt: null },
                });
            } else {
                // @ts-ignore
                restored = await prisma[resource].create({ data: { id: beforeData.id, ...restoreData } });
            }

            await logAudit({
                userId: (req as any).user?.id,
                userName: (req as any).user?.name || 'system',
                action: 'restore',
                resource,
                resourceId: beforeData.id,
                after: restored,
                metadata: { fromAuditId: audit.id },
            });

            res.json(restored);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

function safeParse(s: string): any {
    try { return JSON.parse(s); } catch { return null; }
}

export default router;
