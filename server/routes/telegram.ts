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
 * PUT  /api/telegram/settings      — sozlamalar saqlash
 * POST /api/telegram/send          — server tomonidan xabar yuborish
 * POST /api/telegram/link-student  — o'quvchini Telegram ga ulash
 * POST /api/telegram/broadcast     — ommaviy xabar
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

// ─── Bot holati ───────────────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        const [botInfo, messagesToday, sentToday, linkedStudents, totalStudents] = await Promise.all([
            BOT_TOKEN
                ? fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`).then(r => r.json())
                : Promise.resolve({ ok: false }),
            prisma.telegramMessage.count({ where: { createdAt: { gte: new Date(todayStart) } } }),
            prisma.telegramMessage.count({ where: { status: 'sent', createdAt: { gte: new Date(todayStart) } } }),
            prisma.student.count({ where: { telegramChatId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { status: 'active' } }),
        ]);

        const info = botInfo?.result || {};
        res.json({
            ok: botInfo?.ok ?? false,
            username: info.username,
            name: info.first_name,
            error: botInfo?.ok ? undefined : (botInfo?.description || 'Token noto\'g\'ri'),
            messagesToday,
            sentToday,
            linkedStudents,
            totalStudents,
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Statistika ───────────────────────────────────────────────────────────────

router.get('/stats', async (_req, res) => {
    try {
        const [total, sent, failed, today, byType, linkedStudents, linkedParents, totalStudents] = await Promise.all([
            prisma.telegramMessage.count(),
            prisma.telegramMessage.count({ where: { status: 'sent' } }),
            prisma.telegramMessage.count({ where: { status: 'failed' } }),
            prisma.telegramMessage.count({ where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
            prisma.telegramMessage.groupBy({ by: ['type'], _count: { id: true } }),
            prisma.student.count({ where: { telegramChatId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { parentTelegramId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { status: 'active' } }),
        ]);
        res.json({
            messages: { total, sent, failed, today },
            coverage: { students: linkedStudents, parents: linkedParents, totalStudents, studentPct: totalStudents > 0 ? Math.round(linkedStudents/totalStudents*100) : 0, parentPct: totalStudents > 0 ? Math.round(linkedParents/totalStudents*100) : 0 },
            byType: byType.map((b: any) => ({ type: b.type, count: b._count.id })),
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Xabar tarixi ─────────────────────────────────────────────────────────────

router.get('/messages', async (req, res) => {
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
            prisma.telegramMessage.findMany({
                where, orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit, take: limit,
            }),
        ]);
        res.json({ data: messages, total, page, limit });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Sozlamalar ───────────────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
    try {
        const keys = ['telegram_bot_token', 'telegram_admin_chat_id', 'auto_attendance_notify', 'auto_payment_notify', 'auto_lead_notify', 'telegram_mini_app_url', 'staff_mini_app_url'];
        const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
        const map: Record<string, string> = {};
        settings.forEach((s: any) => { map[s.key] = s.value; });
        res.json({
            botTokenSet: !!(map['telegram_bot_token'] || process.env.TELEGRAM_BOT_TOKEN),
            adminChatId: map['telegram_admin_chat_id'] || process.env.TELEGRAM_ADMIN_IDS || '',
            autoAttendance: map['auto_attendance_notify'] === 'true',
            autoPayment: map['auto_payment_notify'] === 'true',
            autoLead: map['auto_lead_notify'] === 'true',
            miniAppUrl: map['telegram_mini_app_url'] || process.env.TELEGRAM_MINI_APP_URL || '',
            staffMiniAppUrl: map['staff_mini_app_url'] || process.env.STAFF_MINI_APP_URL || '',
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', async (req, res) => {
    const { botToken, adminChatId, autoAttendance, autoPayment, autoLead, miniAppUrl, staffMiniAppUrl } = req.body;
    try {
        const upsertMany = [
            { key: 'telegram_admin_chat_id', value: String(adminChatId || '') },
            { key: 'auto_attendance_notify', value: String(!!autoAttendance) },
            { key: 'auto_payment_notify', value: String(!!autoPayment) },
            { key: 'auto_lead_notify', value: String(!!autoLead) },
            { key: 'telegram_mini_app_url', value: String(miniAppUrl || '') },
            { key: 'staff_mini_app_url', value: String(staffMiniAppUrl || '') },
        ];
        if (botToken && botToken.length > 10 && !botToken.includes('***')) {
            upsertMany.push({ key: 'telegram_bot_token', value: botToken });
        }
        await Promise.all(upsertMany.map(s => prisma.setting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
        })));
        res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── O'quvchini to'g'ridan ID bo'yicha ulash (yangi usul) ────────────────────

router.post('/link-direct', async (req, res) => {
    const { studentId, telegramChatId } = req.body;
    if (!studentId || !telegramChatId) return res.status(400).json({ error: 'studentId and telegramChatId required' });
    try {
        await prisma.student.update({
            where: { id: studentId },
            data: { telegramChatId: String(telegramChatId) },
        });
        await sendTelegramNotification(String(telegramChatId),
            `✅ Akkauntingiz tizimga ulandi! /start yuboring.`);
        res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
