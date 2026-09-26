/**
 * server/routes/communication.ts
 * MessageTemplate, BulkMessage CRUD va Notification endpoints
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { sendBroadcast } from '../services/telegramService.js';
import { batchCounts } from '../services/outbox.js';

const router = express.Router();

// ─── MESSAGE TEMPLATES ────────────────────────────────────────────────────────

router.get('/templates', requireAuth, requirePermission('communication'), async (_req, res) => {
    try {
        const templates = await prisma.messageTemplate.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(templates);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/templates', requireAuth, requireMinRole('MANAGER'), requirePermission('communication'), async (req, res) => {
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

router.put('/templates/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('communication'), async (req, res) => {
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

router.delete('/templates/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('communication'), async (req, res) => {
    try {
        await prisma.messageTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BULK MESSAGES ────────────────────────────────────────────────────────────

router.get('/bulk-messages', requireAuth, requirePermission('communication'), async (_req, res) => {
    try {
        const messages = await prisma.bulkMessage.findMany({ orderBy: { createdAt: 'desc' } });
        // IP-29: har ommaviy xabarning yetkazish holati (navbatdan)
        const counts = await batchCounts(messages.map(m => m.id));
        res.json(messages.map(m => ({ ...m, delivery: counts.get(m.id) ?? null })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-messages/send', requireAuth, requireMinRole('MANAGER'), requirePermission('communication'), async (req, res) => {
    try {
        const { content, targetType, targetId, templateId } = req.body;
        if (!content) return res.status(400).json({ error: 'content majburiy' });

        // Qabul qiluvchilarni aniqlash. "leads" ataylab yo'q — Lead modelida
        // Telegram identifikatori (chatId) umuman yo'q (lidlar botni hali
        // boshlamagan), shuning uchun bu yerga qo'shilsa ham hech qachon
        // hech narsa yubormaydi. Lidlar bilan bog'lanish uchun Marketing >
        // Lidlar bo'limidagi telefon raqamlaridan foydalaning.
        // Ota-ona (parentTelegramId) — asosiy manzil, talabaning o'zi bot
        // ishlatmagan bo'lsa telegramChatId'ga tushiladi.
        let recipients: { name: string; chatId: string | null }[] = [];

        if (targetType === 'all') {
            const students = await prisma.student.findMany({
                where: { status: { in: ['active', 'Faol'] } },
                select: { name: true, parentTelegramId: true, telegramChatId: true },
            });
            recipients = students.map(s => ({ name: s.name, chatId: s.parentTelegramId || s.telegramChatId || null }));
        } else if (targetType === 'debtors') {
            const students = await prisma.student.findMany({
                where: { balance: { lt: 0 } },
                select: { name: true, parentTelegramId: true, telegramChatId: true },
            });
            recipients = students.map(s => ({ name: s.name, chatId: s.parentTelegramId || s.telegramChatId || null }));
        } else if (targetType === 'group' && targetId) {
            const enrollments = await prisma.enrollment.findMany({
                where: { groupId: targetId, student: { deletedAt: null } },
                include: { student: { select: { name: true, parentTelegramId: true, telegramChatId: true } } },
            });
            recipients = enrollments.map(e => ({ name: e.student.name, chatId: e.student.parentTelegramId || e.student.telegramChatId || null }));
        }

        // IP-29 (AL-03, QT-91): xabar navbatga qo'yiladi — so'rov darhol qaytadi, ishchi
        // tezlik cheklovi va qayta urinish bilan yuboradi. Bir chatga (bir ota-onaga ikki
        // farzand) bitta xabar. Telegram ulanmaganlar — "Telegram yo'q" deb sanaladi.
        const chatIds = recipients.map(r => r.chatId).filter((id): id is string => !!id);
        const noTelegramCount = recipients.length - chatIds.length;
        const bulkMsg = await prisma.bulkMessage.create({
            data: {
                templateId: templateId || null,
                content,
                targetType,
                targetId: targetId || null,
                status: chatIds.length ? 'queued' : 'failed',
                sentAt: new Date(),
                sentCount: 0,
            },
        });
        const q = chatIds.length
            ? await sendBroadcast(chatIds, content, 'broadcast', { batchId: bulkMsg.id, createdById: (req as any).user?.id })
            : { queued: 0, duplicates: 0, recipients: 0 };

        res.json({
            success: q.queued > 0,
            queuedCount: q.queued,
            duplicateCount: q.duplicates,
            noTelegramCount,
            totalRecipients: recipients.length,
            message: { ...bulkMsg, delivery: { pending: q.queued, sending: 0, sent: 0, failed: 0, cancelled: 0 } },
        });
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
