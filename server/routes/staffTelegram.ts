import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import {
    sendStaffMessage,
    setStaffWebhook,
    getStaffWebhookInfo,
} from '../services/telegramService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-key';

// ─── Helper: get staff mini app URL ─────────────────────────────────────────

async function getStaffMiniAppUrl(): Promise<string> {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: 'staff_mini_app_url' } });
        return setting?.value || process.env.STAFF_MINI_APP_URL || '';
    } catch {
        return process.env.STAFF_MINI_APP_URL || '';
    }
}

// ─── POST /api/staff-telegram/webhook ────────────────────────────────────────

router.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.sendStatus(200);

        const msg = update.message;
        if (!msg?.text) return res.sendStatus(200);

        const chatId = String(msg.chat.id);
        const text = (msg.text || '').trim();
        const firstName = msg.from?.first_name || '';

        // ── /start ────────────────────────────────────────────────────────────
        if (text.startsWith('/start')) {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: chatId, isActive: true, deletedAt: null },
                select: { id: true, name: true, role: true },
            });

            if (!user) {
                await sendStaffMessage(
                    chatId,
                    `👋 Assalomu alaykum, ${firstName}!\n\nSiz tizimda ro'yxatdan o'tilmagansiz. Admin bilan bog'laning va Telegram ID'ingizni ulashishni so'rang.\n\n<code>ID: ${chatId}</code>`,
                    'HTML',
                );
                return res.sendStatus(200);
            }

            const token = jwt.sign(
                { userId: user.id, role: user.role, chatId },
                JWT_SECRET,
                { expiresIn: '24h' },
            );
            const staffPortalUrl = await getStaffMiniAppUrl();
            const portalUrl = staffPortalUrl
                ? `${staffPortalUrl}${staffPortalUrl.includes('?') ? '&' : '?'}t=${token}`
                : '';

            const roleLabel: Record<string, string> = {
                SUPER_ADMIN: '👑 Super Admin',
                ADMIN: '🔑 Admin',
                MANAGER: '📊 Menejer',
                TEACHER: '📚 O\'qituvchi',
                HR: '👥 HR',
            };

            const replyMarkup = portalUrl ? {
                inline_keyboard: [
                    [{ text: '📱 Staff Portalga kirish', web_app: { url: portalUrl } }],
                    [{ text: '🔗 Brauzerda ochish', url: portalUrl }],
                ],
            } : undefined;

            await sendStaffMessage(
                chatId,
                `✅ <b>Xush kelibsiz, ${user.name}!</b>\n\n` +
                `Rol: ${roleLabel[user.role] || user.role}\n\n` +
                (portalUrl
                    ? `Staff portaliga kirish uchun quyidagi tugmani bosing:`
                    : `Portal URL sozlanmagan. Admin bilan bog'laning.`),
                'HTML',
                replyMarkup,
            );
            return res.sendStatus(200);
        }

        // ── /today ────────────────────────────────────────────────────────────
        if (text === '/today') {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: chatId, isActive: true, deletedAt: null },
                select: { id: true, name: true, role: true },
            });
            if (!user) return res.sendStatus(200);

            const todayNum = new Date().getDay() || 7; // 0=Sun→7, 1=Mon, ... 6=Sat
            const dayMap: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
            const dayUz: Record<number, string> = {
                1: 'Dushanba', 2: 'Seshanba', 3: 'Chorshanba', 4: 'Payshanba',
                5: 'Juma', 6: 'Shanba', 7: 'Yakshanba',
            };

            const where: any = {
                group: { deletedAt: null },
                dayOfWeek: todayNum,
            };
            if (user.role === 'TEACHER') {
                where.group = { ...where.group, teacherId: user.id };
            }

            const schedules = await prisma.schedule.findMany({
                where,
                include: {
                    group: {
                        include: {
                            course: { select: { name: true } },
                            teacher: { select: { name: true } },
                        },
                    },
                    room: { select: { name: true } },
                },
                orderBy: { startTime: 'asc' },
            });

            if (schedules.length === 0) {
                await sendStaffMessage(chatId, `📅 <b>${dayUz[todayNum]}</b>\n\nBugun darslar yo'q.`, 'HTML');
                return res.sendStatus(200);
            }

            const lines = schedules.map(s =>
                `• <b>${s.startTime}–${s.endTime}</b> | ${s.group.name}` +
                (s.group.course ? ` (${s.group.course.name})` : '') +
                (s.room ? ` | 🚪 ${s.room.name}` : s.group.room ? ` | 🚪 ${s.group.room}` : '') +
                (user.role !== 'TEACHER' && s.group.teacher ? ` | 👤 ${s.group.teacher.name}` : ''),
            );

            await sendStaffMessage(
                chatId,
                `📅 <b>Bugungi darslar (${dayUz[todayNum]})</b>\n\n${lines.join('\n')}`,
                'HTML',
            );
            return res.sendStatus(200);
        }

        // ── /mygroups ─────────────────────────────────────────────────────────
        if (text === '/mygroups') {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: chatId, isActive: true, deletedAt: null },
                select: { id: true, role: true },
            });
            if (!user) return res.sendStatus(200);

            const where: any = { deletedAt: null, status: 'active' };
            if (user.role === 'TEACHER') where.teacherId = user.id;

            const groups = await prisma.group.findMany({
                where,
                include: {
                    course: { select: { name: true } },
                    _count: { select: { enrollments: true } },
                },
                take: 20,
            });

            if (groups.length === 0) {
                await sendStaffMessage(chatId, '👥 Faol guruhlar topilmadi.', 'HTML');
                return res.sendStatus(200);
            }

            const lines = groups.map(g =>
                `• <b>${g.name}</b>${g.course ? ` — ${g.course.name}` : ''} | 👤 ${g._count.enrollments} o'quvchi`,
            );
            await sendStaffMessage(
                chatId,
                `👥 <b>Guruhlar (${groups.length} ta)</b>\n\n${lines.join('\n')}`,
                'HTML',
            );
            return res.sendStatus(200);
        }

        // ── /stats ────────────────────────────────────────────────────────────
        if (text === '/stats') {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: chatId, isActive: true, deletedAt: null },
                select: { id: true, role: true },
            });
            if (!user || !['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(user.role)) {
                await sendStaffMessage(chatId, '⛔ Bu buyruq faqat menejer va adminlar uchun.', 'HTML');
                return res.sendStatus(200);
            }

            const today = new Date().toISOString().split('T')[0];
            const [studentCount, groupCount, todayAttendance, unpaidCount] = await Promise.all([
                prisma.student.count({ where: { status: 'active', deletedAt: null } }),
                prisma.group.count({ where: { status: 'active', deletedAt: null } }),
                prisma.attendanceRecord.count({ where: { date: today, status: 'present' } }),
                prisma.payment.count({ where: { status: { in: ['pending', 'overdue'] }, deletedAt: null } }),
            ]);

            await sendStaffMessage(
                chatId,
                `📊 <b>Bugungi statistika</b>\n\n` +
                `🎓 Faol o'quvchilar: <b>${studentCount}</b>\n` +
                `👥 Faol guruhlar: <b>${groupCount}</b>\n` +
                `✅ Bugungi davomat: <b>${todayAttendance}</b>\n` +
                `💳 To'lanmagan: <b>${unpaidCount}</b>`,
                'HTML',
            );
            return res.sendStatus(200);
        }

        // ── /link ─────────────────────────────────────────────────────────────
        if (text === '/link') {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: chatId, isActive: true, deletedAt: null },
                select: { id: true, name: true, role: true },
            });
            if (!user) {
                await sendStaffMessage(chatId, '❌ Siz tizimda topilmadingiz.', 'HTML');
                return res.sendStatus(200);
            }

            const token = jwt.sign({ userId: user.id, role: user.role, chatId }, JWT_SECRET, { expiresIn: '24h' });
            const staffPortalUrl = await getStaffMiniAppUrl();
            const portalUrl = staffPortalUrl
                ? `${staffPortalUrl}${staffPortalUrl.includes('?') ? '&' : '?'}t=${token}`
                : '';

            if (!portalUrl) {
                await sendStaffMessage(chatId, '⚙️ Portal URL hali sozlanmagan. Admin bilan bog\'laning.', 'HTML');
                return res.sendStatus(200);
            }

            await sendStaffMessage(
                chatId,
                `🔗 <b>Portal havolasi (24 soat amal qiladi)</b>\n\n${portalUrl}`,
                'HTML',
                {
                    inline_keyboard: [
                        [{ text: '📱 Portalni ochish', web_app: { url: portalUrl } }],
                        [{ text: '🌐 Brauzerda ochish', url: portalUrl }],
                    ],
                },
            );
            return res.sendStatus(200);
        }

        // ── Unknown command ───────────────────────────────────────────────────
        if (text.startsWith('/')) {
            await sendStaffMessage(
                chatId,
                `ℹ️ <b>Mavjud buyruqlar:</b>\n\n` +
                `/start — Kirish va portal havolasi\n` +
                `/today — Bugungi darslar\n` +
                `/mygroups — Guruhlar ro'yxati\n` +
                `/stats — Statistika (menejer/admin)\n` +
                `/link — Portal havolasi`,
                'HTML',
            );
        }

        res.sendStatus(200);
    } catch (err: any) {
        console.error('[StaffBot] Webhook xato:', err.message);
        res.sendStatus(200);
    }
});

// ─── GET /api/staff-telegram/webhook-info ─────────────────────────────────────

router.get('/webhook-info', requireAuth, async (_req, res) => {
    try {
        const info = await getStaffWebhookInfo();
        res.json(info);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/staff-telegram/set-webhook ────────────────────────────────────

router.post('/set-webhook', requireAuth, async (req, res) => {
    try {
        const { url } = req.body as { url: string };
        if (!url) return res.status(400).json({ error: 'URL talab qilinadi' });
        const result = await setStaffWebhook(url);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/staff-telegram/send ───────────────────────────────────────────

router.post('/send', requireAuth, async (req, res) => {
    try {
        const { userId, text } = req.body as { userId: string; text: string };
        if (!userId || !text) return res.status(400).json({ error: 'userId va text talab qilinadi' });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { telegramChatId: true, name: true },
        });
        if (!user?.telegramChatId) return res.status(404).json({ error: 'Xodimning Telegram ulangan emas' });

        const ok = await sendStaffMessage(user.telegramChatId, text);
        res.json({ ok, chatId: user.telegramChatId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/staff-telegram/broadcast ──────────────────────────────────────

router.post('/broadcast', requireAuth, async (req, res) => {
    try {
        const { role, text } = req.body as { role?: string; text: string };
        if (!text) return res.status(400).json({ error: 'text talab qilinadi' });

        const where: any = {
            isActive: true,
            deletedAt: null,
            telegramChatId: { not: null },
        };
        if (role) where.role = role;

        const users = await prisma.user.findMany({
            where,
            select: { telegramChatId: true },
        });

        let sent = 0;
        let failed = 0;
        for (const u of users) {
            if (!u.telegramChatId) continue;
            const ok = await sendStaffMessage(u.telegramChatId, text);
            if (ok) sent++; else failed++;
            await new Promise(r => setTimeout(r, 50));
        }

        res.json({ sent, failed, total: users.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
