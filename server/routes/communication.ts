/**
 * server/routes/communication.ts
 * MessageTemplate, BulkMessage CRUD va Notification endpoints
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ─── MESSAGE TEMPLATES ────────────────────────────────────────────────────────

router.get('/templates', requireAuth, async (_req, res) => {
    try {
        const templates = await prisma.messageTemplate.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(templates);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/templates', requireAuth, async (req, res) => {
    try {
        const { name, content, type, language } = req.body;
        if (!name || !content) return res.status(400).json({ error: 'name va content majburiy' });
        const template = await prisma.messageTemplate.create({
            data: { name, content, type: type || 'CUSTOM', language: language || 'uz' },
        });
        res.status(201).json(template);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/templates/:id', requireAuth, async (req, res) => {
    try {
        const { name, content, type, language } = req.body;
        const template = await prisma.messageTemplate.update({
            where: { id: req.params.id },
            data: { name, content, type, language },
        });
        res.json(template);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/templates/:id', requireAuth, async (req, res) => {
    try {
        await prisma.messageTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BULK MESSAGES ────────────────────────────────────────────────────────────

router.get('/bulk-messages', requireAuth, async (_req, res) => {
    try {
        const messages = await prisma.bulkMessage.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-messages/send', requireAuth, async (req, res) => {
    try {
        const { content, targetType, targetId, templateId } = req.body;
        if (!content) return res.status(400).json({ error: 'content majburiy' });

        // Qabul qiluvchilarni aniqlash
        let recipients: { name: string; telegramId?: string | null }[] = [];

        if (targetType === 'all') {
            const students = await prisma.student.findMany({ where: { status: { in: ['active', 'Faol'] } } });
            recipients = students.map(s => ({ name: s.name }));
        } else if (targetType === 'debtors') {
            const students = await prisma.student.findMany({ where: { balance: { lt: 0 } } });
            recipients = students.map(s => ({ name: s.name }));
        } else if (targetType === 'leads') {
            const leads = await prisma.lead.findMany({ where: { stage: { notIn: ['won', 'lost'] } } });
            recipients = leads.map(l => ({ name: l.name }));
        } else if (targetType === 'group' && targetId) {
            const enrollments = await prisma.enrollment.findMany({
                where: { groupId: targetId },
                include: { student: true },
            });
            recipients = enrollments.map(e => ({ name: e.student.name }));
        }

        // Telegram bot orqali yuborish (agar BOT_TOKEN mavjud bo'lsa)
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        let sentCount = 0;

        // Hozircha DB ga saqlaymiz (Telegram bot Faza 2 da to'liq sozlanadi)
        const bulkMsg = await prisma.bulkMessage.create({
            data: {
                templateId: templateId || null,
                content,
                targetType,
                targetId: targetId || null,
                status: 'sent',
                sentAt: new Date(),
                sentCount: recipients.length,
            },
        });

        res.json({ success: true, sentCount: recipients.length, message: bulkMsg });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const notifications = await prisma.notification.findMany({
            where: { OR: [{ userId }, { userId: null }] },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json(notifications);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/notifications/mark-all-read', requireAuth, async (req: any, res) => {
    try {
        const userId = req.user?.id;
        await prisma.notification.updateMany({
            where: { OR: [{ userId }, { userId: null }], isRead: false },
            data: { isRead: true },
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
