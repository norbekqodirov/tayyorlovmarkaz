import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { emitToUser } from '../services/realtime.js';

const router = express.Router();

// GET /api/messages — suhbatlar ro'yxati
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: 'Autentifikatsiya kerak' });

        const sent = await prisma.message.findMany({
            where: { senderId: userId },
            select: { receiverId: true },
            distinct: ['receiverId'],
        });
        const received = await prisma.message.findMany({
            where: { receiverId: userId },
            select: { senderId: true },
            distinct: ['senderId'],
        });

        const partnerIds = new Set([
            ...sent.map((s: any) => s.receiverId),
            ...received.map((r: any) => r.senderId),
        ]);

        const conversations = await Promise.all(
            Array.from(partnerIds).map(async (partnerId: any) => {
                const lastMsg = await prisma.message.findFirst({
                    where: {
                        OR: [
                            { senderId: userId, receiverId: partnerId },
                            { senderId: partnerId, receiverId: userId },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                });

                const unread = await prisma.message.count({
                    where: { senderId: partnerId, receiverId: userId, readAt: null },
                });

                const partnerUser = await prisma.user.findFirst({
                    where: { id: partnerId },
                    select: { name: true, role: true },
                });

                return { partnerId, partnerName: partnerUser?.name || partnerId, partnerRole: partnerUser?.role, lastMsg, unread };
            })
        );

        res.json(conversations.sort((a, b) =>
            new Date(b.lastMsg?.createdAt ?? 0).getTime() - new Date(a.lastMsg?.createdAt ?? 0).getTime()
        ));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/messages/:partnerId — suhbat tarixi
router.get('/:partnerId', requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        const { partnerId } = req.params;

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: partnerId },
                    { senderId: partnerId, receiverId: userId },
                ],
            },
            orderBy: { createdAt: 'asc' },
            take: 100,
        });

        await prisma.message.updateMany({
            where: { senderId: partnerId, receiverId: userId, readAt: null },
            data: { readAt: new Date() },
        });

        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/messages — xabar yuborish
router.post('/', requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        const userRole = (req as any).user?.role || 'admin';
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ message: 'receiverId va content kerak' });
        }

        const message = await prisma.message.create({
            data: {
                senderId: userId,
                receiverId,
                senderType: userRole.toLowerCase(),
                content,
            },
        });

        emitToUser(receiverId, 'message:new', {
            ...message,
            senderName: (req as any).user?.name || "Noma'lum",
        });

        res.status(201).json(message);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/messages/:id/read
router.patch('/:id/read', requireAuth, async (req, res) => {
    try {
        const msg = await prisma.message.update({
            where: { id: req.params.id },
            data: { readAt: new Date() },
        });
        res.json(msg);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
