import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { validateInitData } from '../services/telegramService.js';

const router = express.Router();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function portalAuth(req: any, res: any, next: any) {
    // Dev mode: allow chatId via header (never in production)
    const devChatId = req.headers['x-dev-chat-id'] as string;
    if (devChatId && process.env.NODE_ENV !== 'production') {
        req.portalChatId = devChatId;
        return next();
    }

    const portalSecret = process.env.JWT_SECRET || 'dev-only-secret-key';

    // ── 1. URL token auth (bot xabari orqali kelgan link) ─────────────────
    const urlToken = (req.query.t || req.headers['x-portal-token']) as string;
    if (urlToken) {
        try {
            const decoded: any = jwt.verify(urlToken, portalSecret);
            if (decoded.chatId) {
                req.portalChatId = decoded.chatId;
                return next();
            }
        } catch {
            // Token yaroqsiz yoki muddati o'tgan → Telegram initData bilan davom etamiz
        }
    }

    // ── 2. Telegram initData auth (web_app button orqali) ─────────────────
    const initData = req.headers['x-telegram-init-data'] as string;
    if (!initData) return res.status(401).json({ error: 'Autentifikatsiya talab qilinadi', hint: 'Botdan portal havolasini oling' });

    const result = await validateInitData(initData);
    if (!result.valid || !result.telegramUserId) {
        return res.status(401).json({ error: 'Telegram auth yaroqsiz', hint: '/start buyrug\'ini qayta yuboring' });
    }

    req.portalChatId = result.telegramUserId;
    req.portalFirstName = result.firstName;
    next();
}

// ─── GET /api/portal/me ───────────────────────────────────────────────────────

router.get('/me', portalAuth, async (req: any, res) => {
    try {
        const chatId = req.portalChatId;

        const student = await prisma.student.findFirst({
            where: {
                OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }],
                deletedAt: null,
            },
            include: {
                enrollments: {
                    include: {
                        group: {
                            include: {
                                course: { select: { id: true, name: true } },
                                teacher: { select: { id: true, name: true } },
                                schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!student) {
            return res.status(404).json({ error: 'Tizimda ro\'yxatdan o\'tilmagan', linked: false });
        }

        const role = student.telegramChatId === chatId ? 'student' : 'parent';

        const groups = student.enrollments.map(e => ({
            id: e.group.id,
            name: e.group.name,
            course: e.group.course?.name || 'Kurs',
            teacher: e.group.teacher?.name || '',
            days: e.group.days || '',
            time: e.group.time || '',
            room: e.group.room || '',
            status: e.group.status,
            schedules: e.group.schedules,
        }));

        res.json({
            linked: true,
            role,
            student: {
                id: student.id,
                name: student.name,
                photo: student.photo,
                status: student.status,
                phone: role === 'student' ? student.phone : undefined,
                email: role === 'student' ? student.email : undefined,
            },
            groups,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/portal/attendance ───────────────────────────────────────────────

router.get('/attendance', portalAuth, async (req: any, res) => {
    try {
        const chatId = req.portalChatId;
        const { month } = req.query as { month?: string };

        const student = await prisma.student.findFirst({
            where: { OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }], deletedAt: null },
            select: { id: true },
        });
        if (!student) return res.status(404).json({ error: 'Topilmadi' });

        // Filter by month if provided (format: YYYY-MM), otherwise last 30 days
        let records;
        if (month) {
            records = await prisma.attendanceRecord.findMany({
                where: {
                    studentId: student.id,
                    date: { startsWith: month },
                },
                include: { group: { select: { name: true, course: { select: { name: true } } } } },
                orderBy: { date: 'desc' },
            });
        } else {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const fromStr = thirtyDaysAgo.toISOString().split('T')[0];

            records = await prisma.attendanceRecord.findMany({
                where: {
                    studentId: student.id,
                    date: { gte: fromStr },
                },
                include: { group: { select: { name: true, course: { select: { name: true } } } } },
                orderBy: { date: 'desc' },
                take: 60,
            });
        }

        const summary = {
            present: records.filter(r => r.status === 'present').length,
            absent: records.filter(r => r.status === 'absent').length,
            late: records.filter(r => r.status === 'late').length,
            excused: records.filter(r => r.status === 'excused').length,
            total: records.length,
        };

        res.json({
            records: records.map(r => ({
                id: r.id,
                date: r.date,
                status: r.status,
                group: r.group.name,
                course: r.group.course?.name || '',
                note: r.note,
            })),
            summary,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/portal/payments ─────────────────────────────────────────────────

router.get('/payments', portalAuth, async (req: any, res) => {
    try {
        const chatId = req.portalChatId;

        const student = await prisma.student.findFirst({
            where: { OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }], deletedAt: null },
            select: { id: true },
        });
        if (!student) return res.status(404).json({ error: 'Topilmadi' });

        const [unpaid, recent] = await Promise.all([
            prisma.payment.findMany({
                where: { studentId: student.id, status: { in: ['pending', 'overdue'] }, deletedAt: null },
                orderBy: { dueDate: 'asc' },
                take: 10,
            }),
            prisma.payment.findMany({
                where: { studentId: student.id, status: 'paid', deletedAt: null },
                orderBy: { date: 'desc' },
                take: 10,
            }),
        ]);

        const totalUnpaid = unpaid.reduce((sum, p) => sum + p.amount, 0);

        res.json({
            unpaid: unpaid.map(p => ({
                id: p.id,
                amount: p.amount,
                dueDate: p.dueDate,
                month: p.month,
                status: p.status,
                notes: p.notes,
            })),
            recent: recent.map(p => ({
                id: p.id,
                amount: p.amount,
                date: p.date,
                method: p.method,
                month: p.month,
            })),
            totalUnpaid,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/portal/grades ───────────────────────────────────────────────────

router.get('/grades', portalAuth, async (req: any, res) => {
    try {
        const chatId = req.portalChatId;

        const student = await prisma.student.findFirst({
            where: { OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }], deletedAt: null },
            select: { id: true },
        });
        if (!student) return res.status(404).json({ error: 'Topilmadi' });

        const assessments = await prisma.assessment.findMany({
            where: { studentId: student.id },
            orderBy: { date: 'desc' },
            take: 20,
        });

        const avgScore = assessments.length
            ? Math.round(assessments.reduce((s, a) => s + (a.score / a.maxScore) * 100, 0) / assessments.length)
            : null;

        res.json({
            assessments: assessments.map(a => ({
                id: a.id,
                title: a.title,
                type: a.type,
                score: a.score,
                maxScore: a.maxScore,
                percent: Math.round((a.score / a.maxScore) * 100),
                date: a.date,
                subject: a.subject,
                notes: a.notes,
            })),
            avgScore,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/portal/schedule ─────────────────────────────────────────────────

router.get('/schedule', portalAuth, async (req: any, res) => {
    try {
        const chatId = req.portalChatId;

        const student = await prisma.student.findFirst({
            where: { OR: [{ telegramChatId: chatId }, { parentTelegramId: chatId }], deletedAt: null },
            select: { id: true },
        });
        if (!student) return res.status(404).json({ error: 'Topilmadi' });

        const enrollments = await prisma.enrollment.findMany({
            where: { studentId: student.id },
            include: {
                group: {
                    include: {
                        course: { select: { name: true } },
                        teacher: { select: { name: true } },
                        schedules: {
                            include: { room: { select: { name: true, capacity: true } } },
                        },
                    },
                },
            },
        });

        const days: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

        for (const e of enrollments) {
            for (const sch of e.group.schedules) {
                days[sch.dayOfWeek]?.push({
                    groupId: e.group.id,
                    groupName: e.group.name,
                    course: e.group.course?.name || '',
                    teacher: e.group.teacher?.name || '',
                    startTime: sch.startTime,
                    endTime: sch.endTime,
                    room: sch.room?.name || e.group.room || '',
                });
            }
        }

        // Sort each day by start time
        Object.values(days).forEach(d => d.sort((a, b) => a.startTime.localeCompare(b.startTime)));

        const DAY_NAMES = ['', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

        res.json({
            schedule: Object.entries(days).map(([day, items]) => ({
                day: parseInt(day),
                dayName: DAY_NAMES[parseInt(day)],
                items,
            })).filter(d => d.items.length > 0),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
