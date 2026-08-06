import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { validateStaffInitData } from '../services/telegramService.js';
import { todayDateStr, nowTimeStr, nowMinutesOfDay, tashkentDayOfWeek, addDaysDateStr } from '../utils/timezone.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-key';

// ─── Staff Portal Auth Middleware ─────────────────────────────────────────────

async function staffPortalAuth(req: any, res: any, next: any) {
    // Dev mode
    const devUserId = req.headers['x-dev-user-id'] as string;
    if (devUserId && process.env.NODE_ENV !== 'production') {
        const user = await prisma.user.findUnique({
            where: { id: devUserId },
            select: { id: true, name: true, role: true, avatar: true, telegramChatId: true },
        });
        if (user) { req.staffUser = user; return next(); }
    }

    // Priority 1: JWT URL token
    const urlToken = (req.query.t || req.headers['x-portal-token']) as string;
    if (urlToken) {
        try {
            const decoded: any = jwt.verify(urlToken, JWT_SECRET);
            if (decoded.userId) {
                const user = await prisma.user.findUnique({
                    where: { id: decoded.userId, isActive: true },
                    select: { id: true, name: true, role: true, avatar: true, telegramChatId: true },
                });
                if (user) {
                    req.staffUser = user;
                    return next();
                }
            }
        } catch {
            // token expired or invalid — fall through
        }
    }

    // Priority 2: Telegram initData (STAFF bot token)
    const initData = req.headers['x-telegram-init-data'] as string;
    if (!initData) {
        return res.status(401).json({
            error: 'Autentifikatsiya talab qilinadi',
            hint: 'Staff botdan portal havolasini oling: /start',
        });
    }

    const result = await validateStaffInitData(initData);
    if (!result.valid || !result.telegramUserId) {
        return res.status(401).json({
            error: 'Telegram auth yaroqsiz',
            hint: '/start buyrug\'ini qayta yuboring',
        });
    }

    const user = await prisma.user.findFirst({
        where: { telegramChatId: result.telegramUserId, isActive: true },
        select: { id: true, name: true, role: true, avatar: true, telegramChatId: true },
    });
    if (!user) {
        return res.status(404).json({ error: 'Tizimda ro\'yxatdan o\'tilmagan' });
    }

    req.staffUser = user;
    next();
}

// ─── Helper: portal foydalanuvchisi uchun StaffMember topadi yoki yaratadi ─────
// CRM User va StaffMember telegramChatId orqali bog'lanadi. Agar foydalanuvchi
// (masalan Super Admin) StaffMember sifatida ro'yxatdan o'tmagan bo'lsa,
// davomat tizimi ishlashi uchun avtomatik StaffMember yaratiladi.
async function getOrCreateStaffMember(staffUser: any) {
    const chatId = staffUser.telegramChatId;
    if (!chatId) {
        throw new Error('Telegram hisobi ulanmagan — davomatdan foydalanish uchun Staff bot orqali kiring');
    }

    const existing = await prisma.staffMember.findFirst({
        where: { telegramChatId: chatId },
    });
    if (existing) return existing;

    const roleMap: Record<string, string> = {
        SUPER_ADMIN: 'Administrator',
        ADMIN: 'Administrator',
        MANAGER: 'Menejer',
        TEACHER: "O'qituvchi",
    };
    const role = roleMap[staffUser.role] || staffUser.role || 'Xodim';

    try {
        return await prisma.staffMember.create({
            data: {
                name: staffUser.name || 'Xodim',
                role,
                telegramChatId: chatId,
                photo: staffUser.avatar || null,
            },
        });
    } catch {
        // Race condition: bir vaqtda yaratilgan bo'lsa — qayta o'qish
        const again = await prisma.staffMember.findFirst({ where: { telegramChatId: chatId } });
        if (again) return again;
        throw new Error('Xodim yozuvini yaratib bo\'lmadi');
    }
}

// ─── GET /api/staff-portal/me ─────────────────────────────────────────────────

router.get('/me', staffPortalAuth, async (req: any, res) => {
    try {
        const { id, name, role, avatar, telegramChatId } = req.staffUser;

        let stats: any = {};

        if (role === 'TEACHER') {
            const today = todayDateStr();
            const todayNum = tashkentDayOfWeek();
            const [groupCount, teacherGroups, allSchedules] = await Promise.all([
                prisma.group.count({ where: { teacherId: id, status: 'active', deletedAt: null } }),
                prisma.group.findMany({ where: { teacherId: id, deletedAt: null }, select: { id: true } }),
                prisma.groupSchedule.findMany(),
            ]);
            const teacherGroupIds = new Set(teacherGroups.map(g => g.id));
            const todayLessons = allSchedules.filter(s => {
                if (!teacherGroupIds.has(s.groupId)) return false;
                try { return (JSON.parse(s.days || '[]') as number[]).includes(todayNum); }
                catch { return false; }
            }).length;
            // attendance marked today
            const marked = await prisma.attendanceRecord.count({
                where: {
                    date: today,
                    group: { teacherId: id, deletedAt: null },
                },
            });
            stats = { groupCount, todayLessons, attendanceMarkedToday: marked };
        } else if (['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
            const today = todayDateStr();
            const [studentCount, groupCount, todayPresent, unpaidCount] = await Promise.all([
                prisma.student.count({ where: { status: 'active', deletedAt: null } }),
                prisma.group.count({ where: { status: 'active', deletedAt: null } }),
                prisma.attendanceRecord.count({ where: { date: today, status: 'present' } }),
                prisma.payment.count({ where: { status: { in: ['pending', 'overdue'] }, deletedAt: null } }),
            ]);
            stats = { studentCount, groupCount, todayPresent, unpaidCount };
        }

        res.json({
            id, name, role, avatar, telegramChatId,
            stats,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/today ─────────────────────────────────────────────

router.get('/today', staffPortalAuth, async (req: any, res) => {
    try {
        const { id, role } = req.staffUser;
        const todayNum = tashkentDayOfWeek();
        const dayUz: Record<number, string> = {
            1: 'Dushanba', 2: 'Seshanba', 3: 'Chorshanba', 4: 'Payshanba',
            5: 'Juma', 6: 'Shanba', 7: 'Yakshanba',
        };

        // Haqiqiy dars jadvali GroupSchedule modelida ("schedule" kolleksiyasi,
        // CrmGroups.tsx/CrmSchedule.tsx to'ldiradi) — Group.schedules (alohida
        // "Schedule" modeli, dayOfWeek) hech qayerda yozilmaydi, shuning uchun
        // bo'sh natija berardi.
        const allSchedules = await prisma.groupSchedule.findMany();
        const todaySchedules = allSchedules.filter(s => {
            try { return (JSON.parse(s.days || '[]') as number[]).includes(todayNum); }
            catch { return false; }
        });

        const groupIds = [...new Set(todaySchedules.map(s => s.groupId))];
        const groupWhere: any = { id: { in: groupIds }, deletedAt: null, status: 'active' };
        if (role === 'TEACHER') groupWhere.teacherId = id;
        const groupsData = groupIds.length ? await prisma.group.findMany({
            where: groupWhere,
            include: {
                course: { select: { name: true } },
                teacher: { select: { id: true, name: true } },
                _count: { select: { enrollments: true } },
            },
        }) : [];
        const groupMap = new Map(groupsData.map(g => [g.id, g]));

        const today = todayDateStr();
        const markedGroups = groupIds.length ? await prisma.attendanceRecord.findMany({
            where: { date: today, groupId: { in: groupIds } },
            select: { groupId: true },
            distinct: ['groupId'],
        }) : [];
        const markedSet = new Set(markedGroups.map(m => m.groupId));

        const lessons = todaySchedules
            .filter(s => groupMap.has(s.groupId))
            .map(s => {
                const g = groupMap.get(s.groupId)!;
                return {
                    scheduleId: s.id,
                    groupId: s.groupId,
                    groupName: g.name,
                    course: g.course?.name || '',
                    teacher: g.teacher?.name || '',
                    teacherId: g.teacher?.id || '',
                    startTime: s.startTime,
                    endTime: s.endTime,
                    room: s.room || '',
                    studentCount: g._count.enrollments,
                    attendanceMarked: markedSet.has(s.groupId),
                };
            })
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        res.json({
            dayName: dayUz[todayNum] || '',
            day: todayNum,
            date: today,
            lessons,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/groups ────────────────────────────────────────────

router.get('/groups', staffPortalAuth, async (req: any, res) => {
    try {
        const { id, role } = req.staffUser;

        const where: any = { deletedAt: null, status: 'active' };
        if (role === 'TEACHER') where.teacherId = id;

        const groups = await prisma.group.findMany({
            where,
            include: {
                course: { select: { name: true } },
                teacher: { select: { name: true } },
                _count: { select: { enrollments: true } },
                schedules: { select: { dayOfWeek: true, startTime: true, endTime: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        // Attendance % for each group (last 30 days)
        const fromStr = addDaysDateStr(-30);

        const groupIds = groups.map(g => g.id);
        const attendanceCounts = await prisma.attendanceRecord.groupBy({
            by: ['groupId', 'status'],
            where: { groupId: { in: groupIds }, date: { gte: fromStr } },
            _count: true,
        });

        const attMap: Record<string, { present: number; total: number }> = {};
        for (const row of attendanceCounts) {
            if (!attMap[row.groupId]) attMap[row.groupId] = { present: 0, total: 0 };
            attMap[row.groupId].total += row._count;
            if (row.status === 'present') attMap[row.groupId].present += row._count;
        }

        res.json({
            groups: groups.map(g => ({
                id: g.id,
                name: g.name,
                course: g.course?.name || '',
                teacher: g.teacher?.name || '',
                studentCount: g._count.enrollments,
                schedules: g.schedules,
                room: (g as any).room || '',
                attendancePercent: attMap[g.id]?.total
                    ? Math.round((attMap[g.id].present / attMap[g.id].total) * 100)
                    : null,
            })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/groups/:id/students ───────────────────────────────

router.get('/groups/:groupId/students', staffPortalAuth, async (req: any, res) => {
    try {
        const { id: userId, role } = req.staffUser;
        const { groupId } = req.params;

        const group = await prisma.group.findUnique({
            where: { id: groupId },
            select: { id: true, name: true, teacherId: true },
        });
        if (!group) return res.status(404).json({ error: 'Guruh topilmadi' });

        // Teachers can only see their own groups
        if (role === 'TEACHER' && group.teacherId !== userId) {
            return res.status(403).json({ error: 'Bu guruhga ruxsat yo\'q' });
        }

        const enrollments = await prisma.enrollment.findMany({
            where: { groupId },
            include: {
                student: {
                    select: { id: true, name: true, photo: true, phone: true, status: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json({
            groupId,
            groupName: group.name,
            students: enrollments.map(e => ({
                id: e.student.id,
                name: e.student.name,
                photo: e.student.photo,
                phone: role !== 'TEACHER' ? e.student.phone : undefined,
                status: e.student.status,
            })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/staff-portal/attendance ───────────────────────────────────────

router.post('/attendance', staffPortalAuth, async (req: any, res) => {
    try {
        const { id: userId, role } = req.staffUser;
        const { groupId, date, records } = req.body as {
            groupId: string;
            date: string;
            records: Array<{ studentId: string; status: string; note?: string }>;
        };

        if (!groupId || !date || !records?.length) {
            return res.status(400).json({ error: 'groupId, date va records talab qilinadi' });
        }

        // Verify teacher owns this group
        if (role === 'TEACHER') {
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { teacherId: true },
            });
            if (!group || group.teacherId !== userId) {
                return res.status(403).json({ error: 'Bu guruhga ruxsat yo\'q' });
            }
        }

        // Upsert attendance records
        const results = await Promise.all(
            records.map(r =>
                prisma.attendanceRecord.upsert({
                    where: { studentId_groupId_date: { studentId: r.studentId, groupId, date } },
                    create: {
                        studentId: r.studentId,
                        groupId,
                        date,
                        status: r.status,
                        note: r.note,
                    },
                    update: {
                        status: r.status,
                        note: r.note,
                    },
                }),
            ),
        );

        res.json({ saved: results.length, date, groupId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/attendance ────────────────────────────────────────

router.get('/attendance', staffPortalAuth, async (req: any, res) => {
    try {
        const { id: userId, role } = req.staffUser;
        const { groupId, date } = req.query as { groupId?: string; date?: string };

        if (!groupId || !date) {
            return res.status(400).json({ error: 'groupId va date talab qilinadi' });
        }

        // Access control for teachers
        if (role === 'TEACHER') {
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: { teacherId: true },
            });
            if (!group || group.teacherId !== userId) {
                return res.status(403).json({ error: 'Bu guruhga ruxsat yo\'q' });
            }
        }

        const records = await prisma.attendanceRecord.findMany({
            where: { groupId, date },
            include: { student: { select: { id: true, name: true, photo: true } } },
        });

        res.json({
            groupId,
            date,
            records: records.map(r => ({
                studentId: r.studentId,
                studentName: r.student.name,
                studentPhoto: r.student.photo,
                status: r.status,
                note: r.note,
            })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/stats ─────────────────────────────────────────────

router.get('/stats', staffPortalAuth, async (req: any, res) => {
    try {
        const { role } = req.staffUser;

        if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
            return res.status(403).json({ error: 'Bu sahifaga ruxsat yo\'q' });
        }

        const today = todayDateStr();
        const firstOfMonth = today.substring(0, 8) + '01';

        const [
            studentCount,
            groupCount,
            todayPresent,
            todayAbsent,
            unpaidCount,
            unpaidSum,
            monthRevenue,
            newStudentsMonth,
        ] = await Promise.all([
            prisma.student.count({ where: { status: 'active', deletedAt: null } }),
            prisma.group.count({ where: { status: 'active', deletedAt: null } }),
            prisma.attendanceRecord.count({ where: { date: today, status: 'present' } }),
            prisma.attendanceRecord.count({ where: { date: today, status: 'absent' } }),
            prisma.payment.count({ where: { status: { in: ['pending', 'overdue'] }, deletedAt: null } }),
            prisma.payment.aggregate({
                where: { status: { in: ['pending', 'overdue'] }, deletedAt: null },
                _sum: { amount: true },
            }),
            prisma.payment.aggregate({
                where: { status: 'paid', deletedAt: null, date: { gte: firstOfMonth } },
                _sum: { amount: true },
            }),
            prisma.student.count({
                where: {
                    status: 'active',
                    deletedAt: null,
                    createdAt: { gte: new Date(firstOfMonth) },
                },
            }),
        ]);

        res.json({
            studentCount,
            groupCount,
            today: {
                present: todayPresent,
                absent: todayAbsent,
                total: todayPresent + todayAbsent,
                percent: todayPresent + todayAbsent > 0
                    ? Math.round((todayPresent / (todayPresent + todayAbsent)) * 100)
                    : null,
            },
            unpaid: {
                count: unpaidCount,
                total: unpaidSum._sum.amount || 0,
            },
            monthRevenue: monthRevenue._sum.amount || 0,
            newStudentsMonth,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/staff-portal/students ──────────────────────────────────────────

router.get('/students', staffPortalAuth, async (req: any, res) => {
    try {
        const { role } = req.staffUser;
        if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
            return res.status(403).json({ error: 'Bu sahifaga ruxsat yo\'q' });
        }

        const { search, status, page = '1', limit = '30' } = req.query as {
            search?: string;
            status?: string;
            page?: string;
            limit?: string;
        };

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where: any = { deletedAt: null };
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
            ];
        }

        const [total, students] = await Promise.all([
            prisma.student.count({ where }),
            prisma.student.findMany({
                where,
                select: {
                    id: true, name: true, photo: true, phone: true,
                    status: true, source: true, createdAt: true,
                    enrollments: {
                        include: { group: { select: { name: true } } },
                        take: 3,
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
        ]);

        res.json({
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
            students: students.map(s => ({
                id: s.id,
                name: s.name,
                photo: s.photo,
                phone: s.phone,
                status: s.status,
                source: s.source,
                groups: s.enrollments.map(e => e.group.name),
                createdAt: s.createdAt,
            })),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/staff-portal/me/telegram ───────────────────────────────────────

router.put('/me/telegram', staffPortalAuth, async (req: any, res) => {
    try {
        const { id } = req.staffUser;
        const { telegramChatId } = req.body as { telegramChatId: string };

        if (!telegramChatId) return res.status(400).json({ error: 'telegramChatId talab qilinadi' });

        // Check if chatId already belongs to another user
        const existing = await prisma.user.findFirst({
            where: { telegramChatId, id: { not: id } },
        });
        if (existing) return res.status(409).json({ error: 'Bu Telegram akkaunt boshqa xodimga bog\'langan' });

        await prisma.user.update({
            where: { id },
            data: { telegramChatId },
        });

        res.json({ ok: true, telegramChatId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Face ID & Davomat ───────────────────────────────────────────────────────

// Euclidean distance — face-api.js descriptor solishtirish (threshold < 0.6)
function faceDistance(d1: number[], d2: number[]): number {
    let sum = 0;
    for (let i = 0; i < d1.length; i++) sum += (d1[i] - d2[i]) ** 2;
    return Math.sqrt(sum);
}

// Haversine — metr
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/staff-portal/face-profile — o'z yuz profil holati
router.get('/face-profile', staffPortalAuth, async (req: any, res) => {
    try {
        const staffMember = await prisma.staffMember.findFirst({
            where: { telegramChatId: req.staffUser.telegramChatId },
        });
        if (!staffMember) {
            const profile = await prisma.staffFaceProfile.findFirst({
                where: { staff: { id: req.staffUser.id } },
                select: { id: true, photoUrl: true, registeredAt: true },
            });
            return res.json({ registered: !!profile, profile });
        }

        const profile = await prisma.staffFaceProfile.findUnique({
            where: { staffId: staffMember.id },
            select: { id: true, photoUrl: true, registeredAt: true },
        });
        res.json({ registered: !!profile, profile });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/staff-portal/face-profile — yuz profilini ro'yxatdan o'tkazish
// Body: { descriptor: number[128], photoDataUrl: string }
router.post('/face-profile', staffPortalAuth, async (req: any, res) => {
    try {
        const { descriptor, photoDataUrl } = req.body;
        if (!Array.isArray(descriptor) || descriptor.length !== 128) {
            return res.status(400).json({ error: 'Yuz aniqlanmadi. Yorug\'roq joyda qayta urinib ko\'ring.' });
        }
        if (!photoDataUrl) {
            return res.status(400).json({ error: 'Yuz rasmi (photoDataUrl) kerak' });
        }

        const staffMember = await getOrCreateStaffMember(req.staffUser);
        const staffId = staffMember.id;

        const profile = await prisma.staffFaceProfile.upsert({
            where: { staffId },
            update: {
                descriptor: JSON.stringify(descriptor),
                photoUrl: photoDataUrl || null,
            },
            create: {
                staffId,
                descriptor: JSON.stringify(descriptor),
                photoUrl: photoDataUrl || null,
            },
        });

        res.json({ ok: true, profileId: profile.id, registeredAt: profile.registeredAt });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/staff-portal/check-in — yuz solishtirish + GPS bilan kirib kelish
// Body: { descriptor: number[128], latitude, longitude, faceBypass?: boolean, photoDataUrl?: string }
router.post('/check-in', staffPortalAuth, async (req: any, res) => {
    try {
        const { descriptor, latitude, longitude, photoDataUrl, faceBypass = false } = req.body;
        if (latitude == null || longitude == null) {
            return res.status(400).json({ error: 'GPS joylashuvi kerak' });
        }
        if (!faceBypass && (!Array.isArray(descriptor) || descriptor.length !== 128)) {
            return res.status(400).json({ error: 'Yuz aniqlanmadi. Qayta urinib ko\'ring.' });
        }

        // 1. Xodimni topish (yoki yaratish)
        const staffMember = await prisma.staffMember.findFirst({
            where: { telegramChatId: req.staffUser.telegramChatId },
            include: { faceProfile: true },
        });
        const staffId = staffMember?.id;
        if (!staffId) return res.status(404).json({ error: 'Xodim topilmadi. Avval yuzingizni ro\'yxatdan o\'tkazing.' });

        // 2. Yuz profilini tekshirish
        const faceProfile = staffMember.faceProfile;
        if (!faceProfile) {
            return res.status(400).json({ error: 'Yuz profili ro\'yxatdan o\'tilmagan. Avval yuzingizni ro\'yxatdan o\'tkazing.' });
        }

        // 3. Face match — kirayotgan yuz ro'yxatdagi yuzga mos kelishi shart
        let faceScore = 1.0;
        if (!faceBypass) {
            const storedDescriptor: number[] = JSON.parse(faceProfile.descriptor || '[]');
            if (!Array.isArray(storedDescriptor) || storedDescriptor.length !== 128) {
                return res.status(409).json({
                    error: 'Yuz profili eskirgan. Iltimos yuzingizni qaytadan ro\'yxatdan o\'tkazing.',
                    needReregister: true,
                });
            }
            const distance = faceDistance(descriptor, storedDescriptor);
            faceScore = Math.max(0, 1 - distance);
            const THRESHOLD = 0.5; // qattiqroq — boshqa odam o'ta olmasligi uchun

            if (distance >= THRESHOLD) {
                return res.status(403).json({
                    error: 'Yuz mos kelmadi. Bu profil boshqa xodimga tegishli.',
                    faceScore: parseFloat(faceScore.toFixed(3)),
                });
            }
        }

        // 4. Joylashuvni tekshirish
        const locations = await prisma.workLocation.findMany({ where: { isActive: true } });
        const matchedLocation = locations.find(loc =>
            haversine(latitude, longitude, loc.latitude, loc.longitude) <= loc.radius
        );

        if (!matchedLocation) {
            return res.status(403).json({
                error: 'Siz ish joyidan tashqaridasiz. Ish joyi hududida bo\'lgandagina kirish mumkin.',
                faceScore: parseFloat(faceScore.toFixed(3)),
            });
        }

        // 5. Kechikkan yoki o'z vaqtida?
        const now = new Date();
        const timeStr = nowTimeStr(now); // "HH:MM" — Toshkent vaqti
        const date = todayDateStr(now);

        const [startH, startM] = matchedLocation.workStartTime.split(':').map(Number);
        const lateMinutes = matchedLocation.lateAfterMin;
        const startMinutes = startH * 60 + startM;
        const nowMinutes = nowMinutesOfDay(now);
        const status = nowMinutes <= startMinutes + lateMinutes ? 'present' : 'late';

        // 6. Avval kirib kelganmi?
        const existing = await prisma.staffAttendance.findUnique({
            where: { staffId_date: { staffId, date } },
        });

        if (existing?.checkIn) {
            return res.status(409).json({
                error: 'Siz bugun allaqachon kirib kelgansiz.',
                checkIn: existing.checkIn,
                status: existing.status,
            });
        }

        // 7. Yozish
        const verifiedBy = faceBypass ? 'gps_only' : 'face_id';
        const record = await prisma.staffAttendance.upsert({
            where: { staffId_date: { staffId, date } },
            update: {
                checkIn: timeStr,
                status,
                locationId: matchedLocation.id,
                checkInLat: latitude,
                checkInLng: longitude,
                faceScore: faceBypass ? null : parseFloat(faceScore.toFixed(4)),
                verifiedBy,
            },
            create: {
                staffId,
                date,
                checkIn: timeStr,
                status,
                locationId: matchedLocation.id,
                checkInLat: latitude,
                checkInLng: longitude,
                faceScore: faceBypass ? null : parseFloat(faceScore.toFixed(4)),
                verifiedBy,
            },
        });

        res.json({
            ok: true,
            checkIn: timeStr,
            status,
            location: matchedLocation.name,
            faceScore: faceBypass ? 0 : parseFloat(faceScore.toFixed(3)),
            faceBypass,
            record,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/staff-portal/check-out — yuz solishtirish + chiqib ketish
// Body: { descriptor: number[128], latitude, longitude, faceBypass?: boolean }
router.post('/check-out', staffPortalAuth, async (req: any, res) => {
    try {
        const { descriptor, latitude, longitude, faceBypass = false } = req.body;

        const staffMember = await prisma.staffMember.findFirst({
            where: { telegramChatId: req.staffUser.telegramChatId },
            include: { faceProfile: true },
        });
        if (!staffMember) return res.status(404).json({ error: 'Xodim topilmadi' });

        const faceProfile = staffMember.faceProfile;
        if (!faceProfile) return res.status(400).json({ error: 'Yuz profili yo\'q' });

        if (!faceBypass) {
            if (!Array.isArray(descriptor) || descriptor.length !== 128) {
                return res.status(400).json({ error: 'Yuz aniqlanmadi. Qayta urinib ko\'ring.' });
            }
            const storedDescriptor: number[] = JSON.parse(faceProfile.descriptor || '[]');
            if (!Array.isArray(storedDescriptor) || storedDescriptor.length !== 128) {
                return res.status(409).json({ error: 'Yuz profili eskirgan. Qaytadan ro\'yxatdan o\'ting.', needReregister: true });
            }
            const distance = faceDistance(descriptor, storedDescriptor);
            if (distance >= 0.5) {
                return res.status(403).json({ error: 'Yuz mos kelmadi', faceScore: Math.max(0, 1 - distance) });
            }
        }

        const date = todayDateStr();
        const timeStr = nowTimeStr();

        const existing = await prisma.staffAttendance.findUnique({
            where: { staffId_date: { staffId: staffMember.id, date } },
        });

        if (!existing?.checkIn) {
            return res.status(400).json({ error: 'Avval kirib kelish belgilanmagan' });
        }
        if (existing.checkOut) {
            return res.status(409).json({ error: 'Chiqib ketish allaqachon belgilangan', checkOut: existing.checkOut });
        }

        const record = await prisma.staffAttendance.update({
            where: { staffId_date: { staffId: staffMember.id, date } },
            data: {
                checkOut: timeStr,
                checkOutLat: latitude,
                checkOutLng: longitude,
            },
        });

        res.json({ ok: true, checkOut: timeStr, record });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/staff-portal/my-attendance — xodimning o'z davomati
router.get('/my-attendance', staffPortalAuth, async (req: any, res) => {
    try {
        const staffMember = await prisma.staffMember.findFirst({
            where: { telegramChatId: req.staffUser.telegramChatId },
        });
        if (!staffMember) return res.status(404).json({ error: 'Xodim topilmadi' });

        const month = (req.query.month as string) || todayDateStr().slice(0, 7);
        const today = todayDateStr();

        const [records, todayRec, faceProfile] = await Promise.all([
            prisma.staffAttendance.findMany({
                where: { staffId: staffMember.id, date: { startsWith: month } },
                include: { location: { select: { name: true } } },
                orderBy: { date: 'desc' },
            }),
            prisma.staffAttendance.findUnique({
                where: { staffId_date: { staffId: staffMember.id, date: today } },
                include: { location: { select: { name: true } } },
            }),
            prisma.staffFaceProfile.findUnique({
                where: { staffId: staffMember.id },
                select: { id: true, photoUrl: true, registeredAt: true, descriptor: true },
            }),
        ]);

        const stats = {
            present: records.filter(r => r.status === 'present').length,
            late:    records.filter(r => r.status === 'late').length,
            absent:  records.filter(r => r.status === 'absent').length,
            total:   records.length,
        };

        // Profil bor, lekin descriptor 128-o'lcham bo'lmasa (eski/bo'sh) — qaytadan ro'yxat kerak
        let validProfile = false;
        if (faceProfile) {
            try {
                const d = JSON.parse(faceProfile.descriptor || '[]');
                validProfile = Array.isArray(d) && d.length === 128;
            } catch { validProfile = false; }
        }
        const profileOut = faceProfile
            ? { id: faceProfile.id, photoUrl: faceProfile.photoUrl, registeredAt: faceProfile.registeredAt }
            : null;

        res.json({ month, today: todayRec, stats, records, faceRegistered: validProfile, faceProfile: profileOut });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;

