/**
 * server/routes/telegram.ts
 * Telegram Bot webhook + admin endpoints
 *
 * POST /api/telegram/webhook       — grammY bot webhook
 * GET  /api/telegram/set-webhook   — webhook URL sozlash
 * GET  /api/telegram/info          — webhook holati
 * GET  /api/telegram/status        — bot holati + statistika
 * GET  /api/telegram/stats         — xabar statistikasi
 * GET  /api/telegram/messages      — xabar tarixi
 * GET  /api/telegram/settings      — sozlamalar olish
 * PUT  /api/telegram/settings      — sozlamalar saqlash (fixed: only updates provided keys)
 * POST /api/telegram/test          — test xabar yuborish
 * POST /api/telegram/send          — server tomonidan xabar yuborish
 * POST /api/telegram/broadcast     — ommaviy xabar
 * POST /api/telegram/link-direct   — o'quvchini Telegram ga ulash
 * POST /api/telegram/set-menu-button — Mini App menu button
 */

import express from 'express';
import { handleBotWebhook } from '../bot/index.js';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
    sendMessage, sendBroadcast, getBotInfo, setMenuButton,
} from '../services/telegramService.js';

const router = express.Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// ─── Bot webhook (grammY) ─────────────────────────────────────────────────────

router.post('/webhook', (req, res) => {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        res.status(403).json({ message: 'Forbidden' });
        return;
    }
    handleBotWebhook(req, res);
});

// ─── Webhook sozlash ──────────────────────────────────────────────────────────

router.get('/set-webhook', async (req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const webhookUrl = req.query.url as string;
    if (!webhookUrl) return res.status(400).json({ error: 'url query param required' });
    const body = JSON.stringify({
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET || undefined,
        allowed_updates: ['message', 'callback_query'],
    });
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    res.json(await r.json());
});

// ─── Webhook holati ───────────────────────────────────────────────────────────

router.get('/info', async (_req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    res.json(await r.json());
});

// ─── Bot holati ───────────────────────────────────────────────────────────────

router.get('/status', requireAuth, async (_req, res) => {
    try {
        const info = await getBotInfo();
        const messagesToday = await prisma.telegramMessage.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        const sentToday = await prisma.telegramMessage.count({
            where: { status: 'sent', createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        });
        res.json({ ...info, messagesToday, sentToday });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Statistika ───────────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (_req, res) => {
    try {
        const [total, sent, failed, today, byType, studentsWithTelegram, parentsWithTelegram, totalStudents] = await Promise.all([
            prisma.telegramMessage.count(),
            prisma.telegramMessage.count({ where: { status: 'sent' } }),
            prisma.telegramMessage.count({ where: { status: 'failed' } }),
            prisma.telegramMessage.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
            prisma.telegramMessage.groupBy({ by: ['type'], _count: { id: true } }),
            prisma.student.count({ where: { telegramChatId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { parentTelegramId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { status: 'active' } }),
        ]);
        res.json({
            messages: { total, sent, failed, today },
            coverage: {
                students: studentsWithTelegram,
                parents: parentsWithTelegram,
                totalStudents,
                studentPct: totalStudents > 0 ? Math.round(studentsWithTelegram / totalStudents * 100) : 0,
                parentPct: totalStudents > 0 ? Math.round(parentsWithTelegram / totalStudents * 100) : 0,
            },
            byType: byType.map(t => ({ type: t.type, count: t._count.id })),
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Xabar tarixi ─────────────────────────────────────────────────────────────

router.get('/messages', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const type = req.query.type as string;
    const status = req.query.status as string;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    try {
        const [total, messages] = await Promise.all([
            prisma.telegramMessage.count({ where }),
            prisma.telegramMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        ]);
        res.json({ data: messages, total, page, limit });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Sozlamalar olish (FIXED: correct DB key names) ──────────────────────────

router.get('/settings', requireAuth, async (_req, res) => {
    try {
        const keys = [
            'telegram_bot_token', 'telegram_admin_chat_id',
            'telegram_auto_attendance', 'telegram_auto_payment', 'telegram_auto_lead',
            'telegram_mini_app_url', 'staff_bot_token', 'staff_mini_app_url',
        ];
        const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
        const map: Record<string, string> = {};
        settings.forEach(s => { map[s.key] = s.value; });
        const tokenIsSet = !!(map['telegram_bot_token'] || process.env.TELEGRAM_BOT_TOKEN);
        res.json({
            botTokenSet: tokenIsSet,
            adminChatId: map['telegram_admin_chat_id'] || process.env.TELEGRAM_ADMIN_IDS || '',
            autoAttendance: map['telegram_auto_attendance'] === 'true',
            autoPayment: map['telegram_auto_payment'] === 'true',
            autoLead: map['telegram_auto_lead'] === 'true',
            miniAppUrl: map['telegram_mini_app_url'] || process.env.TELEGRAM_MINI_APP_URL || '',
            staffMiniAppUrl: map['staff_mini_app_url'] || process.env.STAFF_MINI_APP_URL || '',
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Sozlamalar saqlash (FIXED: only updates provided keys, correct key names) ─

router.put('/settings', requireAuth, async (req, res) => {
    try {
        const { token, adminChatId, autoAttendance, autoPayment, autoLead, staff_bot_token, staffMiniAppUrl } = req.body;

        const updates = [
            token !== undefined ? { key: 'telegram_bot_token', value: token } : null,
            adminChatId !== undefined ? { key: 'telegram_admin_chat_id', value: String(adminChatId) } : null,
            autoAttendance !== undefined ? { key: 'telegram_auto_attendance', value: String(autoAttendance) } : null,
            autoPayment !== undefined ? { key: 'telegram_auto_payment', value: String(autoPayment) } : null,
            autoLead !== undefined ? { key: 'telegram_auto_lead', value: String(autoLead) } : null,
            staff_bot_token !== undefined ? { key: 'staff_bot_token', value: staff_bot_token } : null,
            staffMiniAppUrl !== undefined ? { key: 'staff_mini_app_url', value: staffMiniAppUrl } : null,
        ].filter(Boolean) as { key: string; value: string }[];

        for (const update of updates) {
            await prisma.setting.upsert({
                where: { key: update.key },
                update: { value: update.value },
                create: { key: update.key, value: update.value },
            });
        }
        res.json({ ok: true, message: 'Sozlamalar saqlandi' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Test xabar ───────────────────────────────────────────────────────────────

router.post('/test', requireAuth, async (req, res) => {
    try {
        const { chatId, message } = req.body;
        if (!chatId) return res.status(400).json({ message: 'Chat ID kiritilishi shart' });
        const text = message || `✅ <b>Test Xabari</b>\n\nTabriklaymiz! Telegram bot muvaffaqiyatli sozlandi. 🎉\n\n<i>Tayyorlov Markaz CRM</i>`;
        const ok = await sendMessage(chatId, text);
        res.json({ ok, message: ok ? 'Xabar yuborildi!' : 'Xabar yuborishda xatolik' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Bitta kishiga xabar ──────────────────────────────────────────────────────

router.post('/send', requireAuth, async (req, res) => {
    try {
        const { chatId, message } = req.body;
        if (!chatId || !message) return res.status(400).json({ message: 'chatId va message kiritilishi shart' });
        const ok = await sendMessage(chatId, message);
        res.json({ ok });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Ommaviy xabar ────────────────────────────────────────────────────────────

router.post('/broadcast', requireAuth, async (req, res) => {
    try {
        const { message, targetGroup, groupId } = req.body;
        if (!message) return res.status(400).json({ message: 'Xabar matni kiritilishi shart' });

        let chatIds: string[] = [];

        if (targetGroup === 'all_students') {
            const students = await prisma.student.findMany({
                where: { telegramChatId: { not: null }, status: 'active' },
                select: { telegramChatId: true },
            });
            chatIds = students.map(s => s.telegramChatId!).filter(Boolean);
        } else if (targetGroup === 'all_parents') {
            const students = await prisma.student.findMany({
                where: { parentTelegramId: { not: null }, status: 'active' },
                select: { parentTelegramId: true },
            });
            chatIds = students.map(s => s.parentTelegramId!).filter(Boolean);
        } else if (targetGroup === 'group_students' && groupId) {
            const enrollments = await prisma.enrollment.findMany({
                where: { groupId },
                include: { student: { select: { telegramChatId: true } } },
            });
            chatIds = enrollments.map(e => e.student?.telegramChatId).filter(Boolean) as string[];
        } else if (req.body.chatIds && Array.isArray(req.body.chatIds)) {
            chatIds = req.body.chatIds;
        } else {
            // fallback: all students with telegramChatId OR notes-based tg: tag
            const students = await prisma.student.findMany({
                where: { status: 'active' },
                select: { notes: true, telegramChatId: true },
            });
            for (const s of students) {
                if (s.telegramChatId) chatIds.push(s.telegramChatId);
                else {
                    const match = s.notes?.match(/tg:(\d+)/);
                    if (match) chatIds.push(match[1]);
                }
            }
        }

        if (chatIds.length === 0) {
            return res.json({ ok: false, message: "Telegram ID mavjud o'quvchi/ota-ona topilmadi", sent: 0, failed: 0 });
        }

        const result = await sendBroadcast(chatIds, message, 'broadcast');
        res.json({ ok: true, ...result, total: chatIds.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── O'quvchini to'g'ridan Telegram ga ulash ─────────────────────────────────

router.post('/link-direct', requireAuth, async (req, res) => {
    const { studentId, telegramChatId } = req.body;
    if (!studentId || !telegramChatId) return res.status(400).json({ error: 'studentId and telegramChatId required' });
    try {
        await prisma.student.update({
            where: { id: studentId },
            data: { telegramChatId: String(telegramChatId) },
        });
        await sendMessage(String(telegramChatId), `✅ Akkauntingiz tizimga ulandi! /start yuboring.`);
        res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Mini App menu button o'rnatish ──────────────────────────────────────────

router.post('/set-menu-button', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ message: 'URL kiritilishi shart' });
        await prisma.setting.upsert({
            where: { key: 'telegram_mini_app_url' },
            update: { value: url },
            create: { key: 'telegram_mini_app_url', value: url },
        });
        const ok = await setMenuButton(url);
        res.json({ ok, message: ok ? "Menu button o'rnatildi!" : "Saqlandi, lekin bot bilan ulanishda xato" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
