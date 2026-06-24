import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/announcements
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const where: any = { deletedAt: null };
        where.AND = [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }];

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(announcements);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/announcements/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const a = await prisma.announcement.findFirst({ where: { id: req.params.id, deletedAt: null } });
        if (!a) return res.status(404).json({ message: 'Topilmadi' });
        res.json(a);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/announcements
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, content, type, audience, priority, pinned, expiresAt } = req.body;
        if (!title || !content) return res.status(400).json({ message: 'title va content kerak' });
        const a = await prisma.announcement.create({
            data: {
                title,
                content,
                type: type || 'general',
                audience: audience || 'all',
                priority: priority || 'normal',
                pinned: Boolean(pinned),
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdBy: (req as any).user?.name || 'Admin',
            },
        });
        res.status(201).json(a);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/announcements/:id
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const { title, content, type, audience, priority, pinned, expiresAt } = req.body;
        const a = await prisma.announcement.update({
            where: { id: req.params.id },
            data: {
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(type !== undefined && { type }),
                ...(audience !== undefined && { audience }),
                ...(priority !== undefined && { priority }),
                ...(pinned !== undefined && { pinned: Boolean(pinned) }),
                ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
            },
        });
        res.json(a);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/announcements/:id — soft delete
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await prisma.announcement.update({
            where: { id: req.params.id },
            data: { deletedAt: new Date() },
        });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
