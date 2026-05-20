import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendMessage, sendBroadcast, getBotInfo } from '../services/telegramService.js';

const router = express.Router();

// GET /api/telegram/status — bot holati
router.get('/status', requireAuth, async (_req, res) => {
    try {
        const info = await getBotInfo();
        const messagesToday = await prisma.telegramMessage.count({
            where: {
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        });
        const sentToday = await prisma.telegramMessage.count({
            where: {
                status: 'sent',
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
        });

        res.json({ ...info, messagesToday, sentToday });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/telegram/test — test xabar yuborish
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

// POST /api/telegram/send — bitta kishiga xabar
router.post('/send', requireAuth, async (req, res) => {
    try {
        const { chatId, message, type = 'manual', entityId } = req.body;
        if (!chatId || !message) return res.status(400).json({ message: 'chatId va message kiritilishi shart' });

        const ok = await sendMessage(chatId, message);
        res.json({ ok });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/telegram/broadcast — ommaviy xabar
router.post('/broadcast', requireAuth, async (req, res) => {
    try {
        const { message, targetGroup, groupId } = req.body;
        if (!message) return res.status(400).json({ message: 'Xabar matni kiritilishi shart' });

        let chatIds: string[] = [];

        if (targetGroup === 'all_students') {
            // Barcha o'quvchilarga (telegramChatId bor bo'lganlarga)
            const students = await prisma.student.findMany({
                where: { telegramChatId: { not: null }, status: 'active' },
                select: { telegramChatId: true },
            });
            chatIds = students.map(s => s.telegramChatId!).filter(Boolean);
        } else if (targetGroup === 'all_parents') {
            // Barcha ota-onalarga
            const students = await prisma.student.findMany({
                where: { parentTelegramId: { not: null }, status: 'active' },
                select: { parentTelegramId: true },
            });
            chatIds = students.map(s => s.parentTelegramId!).filter(Boolean);
        } else if (targetGroup === 'group_students' && groupId) {
            // Bitta guruh o'quvchilariga
            const enrollments = await prisma.enrollment.findMany({
                where: { groupId },
                include: { student: { select: { telegramChatId: true, parentTelegramId: true } } },
            });
            chatIds = enrollments
                .map(e => e.student?.telegramChatId)
                .filter(Boolean) as string[];
        } else if (req.body.chatIds && Array.isArray(req.body.chatIds)) {
            chatIds = req.body.chatIds;
        }

        if (chatIds.length === 0) {
            return res.json({ ok: false, message: 'Telegram ID mavjud o\'quvchi/ota-ona topilmadi', sent: 0, failed: 0 });
        }

        const result = await sendBroadcast(chatIds, message, 'broadcast');
        res.json({ ok: true, ...result, total: chatIds.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/telegram/messages — xabarlar tarixi
router.get('/messages', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const type = req.query.type as string;
        const status = req.query.status as string;

        const where: any = {};
        if (type) where.type = type;
        if (status) where.status = status;

        const [total, messages] = await Promise.all([
            prisma.telegramMessage.count({ where }),
            prisma.telegramMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        res.json({ data: messages, total, page, limit });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/telegram/stats — statistika
router.get('/stats', requireAuth, async (_req, res) => {
    try {
        const [total, sent, failed, today] = await Promise.all([
            prisma.telegramMessage.count(),
            prisma.telegramMessage.count({ where: { status: 'sent' } }),
            prisma.telegramMessage.count({ where: { status: 'failed' } }),
            prisma.telegramMessage.count({
                where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            }),
        ]);

        // O'quvchilar Telegram statistikasi
        const [studentsWithTelegram, parentsWithTelegram, totalStudents] = await Promise.all([
            prisma.student.count({ where: { telegramChatId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { parentTelegramId: { not: null }, status: 'active' } }),
            prisma.student.count({ where: { status: 'active' } }),
        ]);

        // Type bo'yicha statistika
        const byType = await prisma.telegramMessage.groupBy({
            by: ['type'],
            _count: { id: true },
        });

        res.json({
            messages: { total, sent, failed, today },
            coverage: {
                students: studentsWithTelegram,
                parents: parentsWithTelegram,
                totalStudents,
                studentPct: totalStudents > 0 ? Math.round((studentsWithTelegram / totalStudents) * 100) : 0,
                parentPct: totalStudents > 0 ? Math.round((parentsWithTelegram / totalStudents) * 100) : 0,
            },
            byType: byType.map(t => ({ type: t.type, count: t._count.id })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/telegram/settings — bot sozlamalari
router.put('/settings', requireAuth, async (req, res) => {
    try {
        const { token, adminChatId, autoAttendance, autoPayment, autoLead } = req.body;

        const updates = [
            token !== undefined ? { key: 'telegram_bot_token', value: token } : null,
            adminChatId !== undefined ? { key: 'telegram_admin_chat_id', value: String(adminChatId) } : null,
            autoAttendance !== undefined ? { key: 'telegram_auto_attendance', value: String(autoAttendance) } : null,
            autoPayment !== undefined ? { key: 'telegram_auto_payment', value: String(autoPayment) } : null,
            autoLead !== undefined ? { key: 'telegram_auto_lead', value: String(autoLead) } : null,
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

// GET /api/telegram/settings — sozlamalarni olish
router.get('/settings', requireAuth, async (_req, res) => {
    try {
        const keys = ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_auto_attendance', 'telegram_auto_payment', 'telegram_auto_lead'];
        const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });

        const result: Record<string, string> = {};
        settings.forEach(s => { result[s.key] = s.value; });

        // Token ni maskalash (xavfsizlik)
        if (result.telegram_bot_token) {
            const token = result.telegram_bot_token;
            result.telegram_bot_token = token.length > 10
                ? token.substring(0, 6) + '...' + token.substring(token.length - 4)
                : '***';
            result.telegram_bot_token_set = 'true';
        }

        res.json({
            botTokenSet: !!result.telegram_bot_token_set,
            adminChatId: result.telegram_admin_chat_id || '',
            autoAttendance: result.telegram_auto_attendance === 'true',
            autoPayment: result.telegram_auto_payment === 'true',
            autoLead: result.telegram_auto_lead === 'true',
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/telegram/webhook — Telegram dan kelgan xabarlar
router.post('/webhook', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.json({ ok: true });

        const chatId = String(message.chat?.id);
        const text = message.text || '';

        // Oddiy buyruqlar
        if (text === '/start') {
            await sendMessage(chatId,
                `👋 <b>Salom!</b>\n\nTayyorlov Markaz CRM botiga xush kelibsiz!\n\n` +
                `📋 <b>Mavjud buyruqlar:</b>\n` +
                `/info — Ma'lumot olish\n` +
                `/help — Yordam\n\n` +
                `<i>Sizning chat ID: <b>${chatId}</b></i>\n` +
                `Bu IDni CRM tizimiga qo'shish uchun adminга murojaat qiling.`
            );
        } else if (text === '/id') {
            await sendMessage(chatId, `🔑 Sizning Telegram Chat ID: <b>${chatId}</b>`);
        } else if (text === '/help') {
            await sendMessage(chatId,
                `📌 <b>Yordam</b>\n\n` +
                `Bu bot orqali quyidagi bildirishnomalarni olasiz:\n` +
                `• 📚 Davomat ma'lumotlari\n` +
                `• 💰 To'lov eslatmalari\n` +
                `• 📊 Baho ma'lumotlari\n` +
                `• 📅 Jadval o'zgarishlari\n\n` +
                `Savollar uchun markaz administratoriga murojaat qiling.`
            );
        }

        res.json({ ok: true });
    } catch (err: any) {
        console.error('[Telegram webhook]', err);
        res.json({ ok: true }); // Telegram ga doimo ok qaytaramiz
    }
});

export default router;
