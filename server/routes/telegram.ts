/**
 * server/routes/telegram.ts
 * Telegram Bot webhook + admin endpoints
 *
 * POST /api/telegram/webhook       — grammY bot webhook
 * GET  /api/telegram/set-webhook   — webhook URL sozlash (dev)
 * GET  /api/telegram/info          — webhook holati
 * POST /api/telegram/send          — server tomonidan xabar yuborish (admin)
 * POST /api/telegram/link-student  — o'quvchini Telegram ga ulash
 */

import express from 'express';
import { handleBotWebhook, sendTelegramNotification } from '../bot/index.js';
import prisma from '../db.js';

const router = express.Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// ─── Bot webhook ──────────────────────────────────────────────────────────────

router.post('/webhook', (req, res) => {
    // Webhook secret tekshiruvi
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        res.status(403).json({ message: 'Forbidden' });
        return;
    }
    handleBotWebhook(req, res);
});

// ─── Webhook sozlash (dev) ────────────────────────────────────────────────────

router.get('/set-webhook', async (req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const webhookUrl = req.query.url as string;
    if (!webhookUrl) return res.status(400).json({ error: 'url query param required' });

    const body = JSON.stringify({
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET || undefined,
        allowed_updates: ['message', 'callback_query']
    });
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });
    res.json(await r.json());
});

// ─── Webhook holati ───────────────────────────────────────────────────────────

router.get('/info', async (_req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    res.json(await r.json());
});

// ─── Server tomonidan xabar yuborish ─────────────────────────────────────────

router.post('/send', async (req, res) => {
    const { chatId, message } = req.body;
    if (!chatId || !message) return res.status(400).json({ error: 'chatId and message required' });
    await sendTelegramNotification(chatId, message);
    res.json({ ok: true });
});

// ─── O'quvchini Telegram ga ulash ────────────────────────────────────────────

router.post('/link-student', async (req, res) => {
    const { studentId, telegramChatId } = req.body;
    if (!studentId || !telegramChatId) {
        return res.status(400).json({ error: 'studentId and telegramChatId required' });
    }

    try {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // notes ga tg:<chatId> tegli yozuv qo'shamiz
        const existingNotes = student.notes || '';
        const tgTag = `tg:${telegramChatId}`;
        const updatedNotes = existingNotes.includes('tg:')
            ? existingNotes.replace(/tg:\d+/, tgTag)
            : existingNotes + (existingNotes ? '\n' : '') + tgTag;

        await prisma.student.update({
            where: { id: studentId },
            data: { notes: updatedNotes }
        });

        // O'quvchiga xabar yuboramiz
        await sendTelegramNotification(
            telegramChatId,
            `✅ <b>Muvaffaqiyat!</b>\n\nSizning akkauntingiz ${student.name} nomi bilan tizimga ulandi.\n\n/start yuboring!`
        );

        res.json({ ok: true, message: 'Student linked to Telegram' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Ommaviy xabar (bulk notify) ─────────────────────────────────────────────

router.post('/broadcast', async (req, res) => {
    const { message, targetType, groupId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    try {
        let students: { notes: string | null; name: string }[] = [];

        if (targetType === 'debtors') {
            students = await prisma.student.findMany({
                where: { balance: { lt: 0 }, status: 'active' },
                select: { notes: true, name: true }
            });
        } else if (targetType === 'group' && groupId) {
            const enrollments = await prisma.enrollment.findMany({
                where: { groupId },
                include: { student: { select: { notes: true, name: true } } }
            });
            students = enrollments.map(e => e.student);
        } else {
            students = await prisma.student.findMany({
                where: { status: 'active' },
                select: { notes: true, name: true }
            });
        }

        let sent = 0;
        for (const s of students) {
            const match = s.notes?.match(/tg:(\d+)/);
            if (match) {
                await sendTelegramNotification(match[1], message);
                sent++;
            }
        }

        res.json({ ok: true, sent, total: students.length });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
