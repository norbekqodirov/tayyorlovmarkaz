import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/leave — barcha ta'til so'rovlari
router.get('/', requireAuth, async (req, res) => {
    try {
        const { staffId, status } = req.query;
        const where: any = {};
        if (staffId) where.staffId = staffId as string;
        if (status) where.status = status as string;

        const requests = await prisma.leaveRequest.findMany({
            where,
            include: {
                staff: { select: { id: true, name: true, role: true, photo: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/leave — yangi so'rov
router.post('/', requireAuth, async (req, res) => {
    try {
        const { staffId, type, startDate, endDate, reason } = req.body;
        if (!staffId || !type || !startDate || !endDate) {
            return res.status(400).json({ message: 'staffId, type, startDate, endDate kerak' });
        }

        const request = await prisma.leaveRequest.create({
            data: { staffId, type, startDate, endDate, reason, status: 'pending' },
            include: { staff: { select: { name: true } } },
        });
        res.status(201).json(request);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/leave/:id/approve — tasdiqlash
router.patch('/:id/approve', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { notes } = req.body;
        const approvedBy = (req as any).user?.name || 'Admin';
        const request = await prisma.leaveRequest.update({
            where: { id: req.params.id },
            data: {
                status: 'approved',
                approvedBy,
                approvedAt: new Date(),
                ...(notes && { notes }),
            },
            include: { staff: { select: { name: true } } },
        });
        res.json(request);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/leave/:id/reject — rad etish
router.patch('/:id/reject', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { notes } = req.body;
        const approvedBy = (req as any).user?.name || 'Admin';
        const request = await prisma.leaveRequest.update({
            where: { id: req.params.id },
            data: {
                status: 'rejected',
                approvedBy,
                approvedAt: new Date(),
                ...(notes && { notes }),
            },
        });
        res.json(request);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/leave/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await prisma.leaveRequest.delete({ where: { id: req.params.id } });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
