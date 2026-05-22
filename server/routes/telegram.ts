import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
    sendMessage, sendBroadcast, getBotInfo,
    sendTelegramRequest, setMenuButton, extractPhoneDigits,
} from '../services/telegramService.js';

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

// GET /api/telegram/settings — sozlamalarni olish
router.get('/settings', requireAuth, async (_req, res) => {
    try {
        const keys = ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_auto_attendance', 'telegram_auto_payment', 'telegram_auto_lead', 'telegram_mini_app_url', 'staff_bot_token', 'staff_mini_app_url'];
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
            miniAppUrl: result.telegram_mini_app_url || '',
            staffMiniAppUrl: result.staff_mini_app_url || '',
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
        const text = (message.text || '').trim();

        // ── Contact shared: auto-link handler ────────────────────────────────
        if (message.contact) {
            const tgPhone = message.contact.phone_number || '';
            const tgDigits = extractPhoneDigits(tgPhone);

            if (!tgDigits) {
                await sendMessage(chatId, '❌ Telefon raqam o\'qilmadi. Iltimos qayta urinib ko\'ring.', 'HTML', { remove_keyboard: true });
                return res.json({ ok: true });
            }

            // Load all active students with phones
            const students = await prisma.student.findMany({
                where: { deletedAt: null },
                select: { id: true, name: true, phone: true, parentPhone: true, telegramChatId: true, parentTelegramId: true },
            });

            let matchedId: string | null = null;
            let matchedName = '';
            let matchedRole: 'student' | 'parent' = 'student';

            for (const s of students) {
                if (s.phone && extractPhoneDigits(s.phone) === tgDigits) {
                    matchedId = s.id;
                    matchedName = s.name;
                    matchedRole = 'student';
                    break;
                }
                if (s.parentPhone && extractPhoneDigits(s.parentPhone) === tgDigits) {
                    matchedId = s.id;
                    matchedName = s.name;
                    matchedRole = 'parent';
                    break;
                }
            }

            if (matchedId) {
                // Update the student record
                await prisma.student.update({
                    where: { id: matchedId },
                    data: matchedRole === 'student'
                        ? { telegramChatId: chatId }
                        : { parentTelegramId: chatId },
                });

                const miniAppSetting = await prisma.setting.findUnique({ where: { key: 'telegram_mini_app_url' } });
                const miniAppUrl = miniAppSetting?.value || '';

                // JWT token generatsiya — portal auth uchun (24 soat amal qiladi)
                const portalSecret = process.env.JWT_SECRET || 'dev-only-secret-key';
                const portalToken = jwt.sign(
                    { chatId, role: matchedRole, studentId: matchedId },
                    portalSecret,
                    { expiresIn: '24h' }
                );

                // Portal URL ga token qo'shish
                const portalUrl = miniAppUrl
                    ? `${miniAppUrl}?t=${portalToken}`
                    : '';

                const replyMarkup = portalUrl
                    ? {
                        inline_keyboard: [
                            [{ text: '📱 Portalga kirish', web_app: { url: portalUrl } }],
                            [{ text: '🔗 Brauzerda ochish', url: portalUrl }],
                        ]
                      }
                    : { remove_keyboard: true };

                const successText = matchedRole === 'student'
                    ? `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
                      `Salom, <b>${matchedName}</b>! 👋\n\n` +
                      `Sizning Telegram hisobingiz tizimga bog'landi. Endi quyidagi bildirishnomalarni olasiz:\n` +
                      `• 📚 Davomat xabarlari\n• 💰 To'lov eslatmalari\n• 📊 Baho natijalari\n` +
                      (miniAppUrl ? `\n📱 <b>Portal</b> orqali ma'lumotlaringizni istalgan vaqt ko'rishingiz mumkin!` : '')
                    : `✅ <b>Ota-ona sifatida ulandi!</b>\n\n` +
                      `Hurmatli ota-ona! <b>${matchedName}</b> ning Telegram hisobingiz tizimga bog'landi.\n\n` +
                      `Farzandingiz haqida bildirishnomalar olasiz:\n` +
                      `• 📚 Davomat xabarlari\n• 💰 To'lov eslatmalari\n• 📊 Baho natijalari\n` +
                      (miniAppUrl ? `\n📱 <b>Portal</b> orqali farzandingiz ma'lumotlarini ko'rishingiz mumkin!` : '');

                await sendMessage(chatId, successText, 'HTML', replyMarkup);
            } else {
                await sendMessage(chatId,
                    `❌ <b>Raqam topilmadi</b>\n\n` +
                    `Sizning <code>${tgPhone}</code> raqamingiz tizimda ro'yxatda yo'q.\n\n` +
                    `Iltimos, markaz administratori bilan bog'laning yoki o'z raqamingizni CRM ga qo'shishni so'rang.`,
                    'HTML',
                    { remove_keyboard: true }
                );
            }

            return res.json({ ok: true });
        }

        // ── Text commands ─────────────────────────────────────────────────────
        if (text === '/start') {
            // Check if already linked
            const linked = await prisma.student.findFirst({
                where: {
                    OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }],
                    deletedAt: null,
                },
                select: { id: true, name: true },
            });

            if (linked) {
                const miniAppSetting = await prisma.setting.findUnique({ where: { key: 'telegram_mini_app_url' } });
                const miniAppUrl = miniAppSetting?.value || '';

                // Har safar /start bosishda yangi token
                const portalSecret = process.env.JWT_SECRET || 'dev-only-secret-key';
                const portalToken = jwt.sign({ chatId, studentId: linked.id }, portalSecret, { expiresIn: '24h' });
                const portalUrl = miniAppUrl ? `${miniAppUrl}?t=${portalToken}` : '';

                const replyMarkup = portalUrl
                    ? {
                        inline_keyboard: [
                            [{ text: '📱 Portalga kirish', web_app: { url: portalUrl } }],
                            [{ text: '🔗 Brauzerda ochish', url: portalUrl }],
                        ]
                      }
                    : undefined;

                await sendMessage(chatId,
                    `👋 <b>Qayta xush kelibsiz, ${linked.name}!</b>\n\n` +
                    `Hisobingiz tizimga bog'liq. Barcha bildirishnomalar avtomatik yuboriladi.\n\n` +
                    `/help — buyruqlar ro'yxati`,
                    'HTML', replyMarkup
                );
            } else {
                // Ask to share contact
                await sendTelegramRequest('sendMessage', {
                    chat_id: chatId,
                    text:
                        `👋 <b>Salom! Tayyorlov Markaz botiga xush kelibsiz!</b>\n\n` +
                        `Bildirishnomalar olish uchun telefon raqamingizni ulashing. ` +
                        `Raqam CRM tizimidagi ma'lumotingiz bilan solishtiriladi.\n\n` +
                        `👇 Quyidagi tugmani bosing:`,
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
                        resize_keyboard: true,
                        one_time_keyboard: true,
                    },
                });
            }
        } else if (text === '/help') {
            await sendMessage(chatId,
                `📌 <b>Buyruqlar ro'yxati</b>\n\n` +
                `/start — Boshlash / qayta bog'lash\n` +
                `/id — Chat ID ko'rish\n` +
                `/info — Profilingiz ma'lumotlari\n` +
                `/help — Yordam\n\n` +
                `<b>Bildirishnomalar:</b>\n` +
                `• 📚 Davomat (kelmagan kun)\n` +
                `• 💰 To'lov eslatmasi\n` +
                `• 📊 Baho natijalari\n` +
                `• 📅 Jadval o'zgarishlari\n\n` +
                `Savollar uchun markaz bilan bog'laning. 📞`
            );
        } else if (text === '/id') {
            await sendMessage(chatId, `🔑 Sizning Telegram Chat ID: <code>${chatId}</code>`);
        } else if (text === '/info') {
            const linked = await prisma.student.findFirst({
                where: { OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }], deletedAt: null },
                include: {
                    enrollments: {
                        include: { group: { include: { course: { select: { name: true } } } } },
                    },
                },
            });
            if (!linked) {
                await sendMessage(chatId,
                    `❌ Hisobingiz tizimga ulanmagan.\n\n/start buyrug'ini yuboring va telefon raqamingizni ulashing.`
                );
            } else {
                const groups = linked.enrollments.map(e => `• ${e.group.name} (${e.group.course?.name || 'Kurs'})`).join('\n') || '—';
                await sendMessage(chatId,
                    `👤 <b>${linked.name}</b>\n\n` +
                    `📚 <b>Guruhlar:</b>\n${groups}\n\n` +
                    `📊 Status: ${linked.status === 'active' ? '✅ Faol' : linked.status}`
                );
            }
        }

        res.json({ ok: true });
    } catch (err: any) {
        console.error('[Telegram webhook]', err);
        res.json({ ok: true });
    }
});

// POST /api/telegram/set-menu-button — Mini App menu button sozlash
router.post('/set-menu-button', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ message: 'URL kiritilishi shart' });

        // Save to settings
        await prisma.setting.upsert({
            where: { key: 'telegram_mini_app_url' },
            update: { value: url },
            create: { key: 'telegram_mini_app_url', value: url },
        });

        const ok = await setMenuButton(url);
        res.json({ ok, message: ok ? 'Menu button o\'rnatildi!' : 'Saqlandi, lekin bot bilan ulanishda xato' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
