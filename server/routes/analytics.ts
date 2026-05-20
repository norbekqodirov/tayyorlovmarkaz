import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/dashboard — aggregated dashboard stats
router.get('/dashboard', requireAuth, async (_req, res) => {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed
        const today = now.toISOString().split('T')[0];

        const monthStart = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
        const monthEnd   = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
        const prevMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
        const prevMonthEnd   = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

        const [
            totalStudents,
            activeStudents,
            newStudents,
            totalLeads,
            thisMonthLeads,
            wonLeads,
            teachers,
            totalGroups,
            activeGroups,
            allTransactions,
            overduePayments,
            todayAttendance,
        ] = await Promise.all([
            prisma.student.count(),
            prisma.student.count({ where: { status: 'active' } }),
            prisma.student.count({ where: { createdAt: { gte: new Date(monthStart) } } }),
            prisma.lead.count(),
            prisma.lead.count({ where: { createdAt: { gte: new Date(monthStart) } } }),
            prisma.lead.count({ where: { stage: 'won' } }),
            prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
            prisma.group.count(),
            prisma.group.count({ where: { status: 'active' } }),
            prisma.transaction.findMany({ select: { type: true, amount: true, date: true } }),
            prisma.payment.count({ where: { status: 'overdue' } }),
            prisma.attendanceRecord.findMany({
                where: { date: today },
                select: { status: true }
            }),
        ]);

        // Revenue calculations from real Transaction model
        const thisMonthIncome = allTransactions
            .filter(t => t.type === 'income' && t.date >= monthStart && t.date <= monthEnd)
            .reduce((a, t) => a + t.amount, 0);
        const prevMonthIncome = allTransactions
            .filter(t => t.type === 'income' && t.date >= prevMonthStart && t.date <= prevMonthEnd)
            .reduce((a, t) => a + t.amount, 0);
        const totalIncome = allTransactions
            .filter(t => t.type === 'income')
            .reduce((a, t) => a + t.amount, 0);
        const totalExpense = allTransactions
            .filter(t => t.type === 'expense')
            .reduce((a, t) => a + t.amount, 0);

        // Debtors: students with overdue payments
        const overdueStudentIds = await prisma.payment.findMany({
            where: { status: 'overdue' },
            select: { studentId: true },
            distinct: ['studentId'],
        });
        const debtorCount = overdueStudentIds.length;
        const totalDebt = await prisma.payment.aggregate({
            where: { status: 'overdue' },
            _sum: { amount: true },
        });

        // Attendance today
        const todayPresent = todayAttendance.filter(r => r.status === 'present').length;
        const todayTotal = todayAttendance.length;

        res.json({
            students: {
                total: totalStudents,
                active: activeStudents,
                new_this_month: newStudents,
                debtors: debtorCount,
                total_debt: totalDebt._sum.amount || 0,
            },
            revenue: {
                this_month: thisMonthIncome,
                prev_month: prevMonthIncome,
                growth_pct: prevMonthIncome > 0
                    ? Math.round(((thisMonthIncome - prevMonthIncome) / prevMonthIncome) * 100)
                    : 0,
                total_income: totalIncome,
                total_expense: totalExpense,
                net_profit: totalIncome - totalExpense,
            },
            leads: {
                total: totalLeads,
                this_month: thisMonthLeads,
                won: wonLeads,
                conversion_rate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
                by_stage: {
                    new:       await prisma.lead.count({ where: { stage: 'new' } }),
                    contacted: await prisma.lead.count({ where: { stage: 'contacted' } }),
                    meeting:   await prisma.lead.count({ where: { stage: 'meeting' } }),
                    won:       wonLeads,
                    lost:      await prisma.lead.count({ where: { stage: 'lost' } }),
                }
            },
            groups: {
                total: totalGroups,
                active: activeGroups,
            },
            teachers: { total: teachers },
            attendance: {
                today_present: todayPresent,
                today_total: todayTotal,
                today_rate: todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0,
            },
            payments: {
                overdue_count: overduePayments,
            }
        });
    } catch (err: any) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/monthly — monthly breakdown for charts (current year)
router.get('/monthly', requireAuth, async (_req, res) => {
    try {
        const year = new Date().getFullYear();
        const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

        // Fetch all data at once to avoid N+1 queries
        const [transactions, students, leads] = await Promise.all([
            prisma.transaction.findMany({
                where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
                select: { type: true, amount: true, date: true },
            }),
            prisma.student.findMany({
                where: { createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } },
                select: { createdAt: true },
            }),
            prisma.lead.findMany({
                where: { createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } },
                select: { createdAt: true },
            }),
        ]);

        const monthly = Array.from({ length: 12 }, (_, mi) => {
            const mm = String(mi + 1).padStart(2, '0');
            const monthPrefix = `${year}-${mm}-`;

            const income = transactions
                .filter(t => t.type === 'income' && t.date.startsWith(monthPrefix))
                .reduce((a, t) => a + t.amount, 0);
            const expense = transactions
                .filter(t => t.type === 'expense' && t.date.startsWith(monthPrefix))
                .reduce((a, t) => a + t.amount, 0);
            const newStudents = students
                .filter(s => s.createdAt.getMonth() === mi)
                .length;
            const newLeads = leads
                .filter(l => l.createdAt.getMonth() === mi)
                .length;

            return {
                month: MONTHS[mi],
                month_index: mi,
                income,
                expense,
                profit: income - expense,
                new_students: newStudents,
                new_leads: newLeads,
            };
        });

        res.json(monthly);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/debtors — students with overdue/pending payments
router.get('/debtors', requireAuth, async (_req, res) => {
    try {
        const overduePayments = await prisma.payment.findMany({
            where: { status: { in: ['overdue', 'pending'] } },
            include: {
                student: {
                    select: { id: true, name: true, phone: true },
                },
            },
            orderBy: { amount: 'desc' },
        });

        // Group by student
        const studentMap = new Map<string, any>();
        for (const p of overduePayments) {
            if (!p.student) continue;
            const sid = p.student.id;
            if (!studentMap.has(sid)) {
                studentMap.set(sid, {
                    id: sid,
                    name: p.student.name,
                    phone: p.student.phone,
                    debt: 0,
                    overdueCount: 0,
                });
            }
            const entry = studentMap.get(sid);
            entry.debt += p.amount;
            if (p.status === 'overdue') entry.overdueCount++;
        }

        const debtors = Array.from(studentMap.values())
            .sort((a, b) => b.debt - a.debt);

        res.json({
            total: debtors.length,
            totalDebt: debtors.reduce((a, d) => a + d.debt, 0),
            debtors,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/lead-sources — lead source breakdown
router.get('/lead-sources', requireAuth, async (_req, res) => {
    try {
        const leads = await prisma.lead.findMany({
            select: { source: true },
        });

        const sources: Record<string, number> = {};
        leads.forEach(l => {
            const src = l.source || 'Boshqa';
            sources[src] = (sources[src] || 0) + 1;
        });

        const data = Object.entries(sources)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/teacher-performance — teacher KPIs
router.get('/teacher-performance', requireAuth, async (_req, res) => {
    try {
        const teachers = await prisma.user.findMany({
            where: { role: 'TEACHER', isActive: true },
            select: { id: true, name: true, avatar: true },
        });

        const data = await Promise.all(teachers.map(async (teacher) => {
            const groups = await prisma.group.findMany({
                where: { teacherId: teacher.id },
                select: { id: true, name: true, status: true },
            });

            const groupIds = groups.map(g => g.id);

            const [enrollmentCount, attendanceRecords] = await Promise.all([
                prisma.enrollment.count({ where: { groupId: { in: groupIds } } }),
                prisma.attendanceRecord.findMany({
                    where: { groupId: { in: groupIds } },
                    select: { status: true },
                }),
            ]);

            const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
            const attRate = attendanceRecords.length > 0
                ? Math.round((presentCount / attendanceRecords.length) * 100)
                : 0;

            return {
                id: teacher.id,
                name: teacher.name,
                avatar: teacher.avatar,
                groups: groups.length,
                activeGroups: groups.filter(g => g.status === 'active').length,
                students: enrollmentCount,
                attendanceRate: attRate,
            };
        }));

        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/revenue-by-course — kurs bo'yicha daromad
router.get('/revenue-by-course', requireAuth, async (_req, res) => {
    try {
        const courses = await prisma.course.findMany({
            select: { id: true, name: true },
        });

        const transactions = await prisma.transaction.findMany({
            where: { type: 'income', category: "Kurs to'lovi" },
            select: { amount: true, studentId: true },
        });

        // Get enrollments with group→course info
        const enrollments = await prisma.enrollment.findMany({
            include: { group: { select: { courseId: true } } },
        });

        const studentCourseMap = new Map<string, string>();
        enrollments.forEach(e => {
            if (e.group?.courseId && !studentCourseMap.has(e.studentId)) {
                studentCourseMap.set(e.studentId, e.group.courseId);
            }
        });

        const courseRevenue = new Map<string, number>();
        transactions.forEach(t => {
            if (t.studentId) {
                const courseId = studentCourseMap.get(t.studentId);
                if (courseId) {
                    courseRevenue.set(courseId, (courseRevenue.get(courseId) || 0) + t.amount);
                }
            }
        });

        const result = courses.map(c => ({
            id: c.id,
            name: c.name,
            revenue: courseRevenue.get(c.id) || 0,
        })).sort((a, b) => b.revenue - a.revenue);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/forecast — kelasi oy bashorati
router.get('/forecast', requireAuth, async (_req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();

        // So'nggi 3 oy daromadini olish
        const months = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(year, now.getMonth() - i, 1);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            months.push(`${d.getFullYear()}-${mm}-`);
        }

        const transactions = await prisma.transaction.findMany({
            where: { type: 'income' },
            select: { amount: true, date: true },
        });

        const monthlyRevenues = months.map(prefix =>
            transactions
                .filter(t => t.date.startsWith(prefix))
                .reduce((a, t) => a + t.amount, 0)
        );

        // Oddiy linear bashorat (o'rtacha o'sish tendensiyasi)
        const avg = monthlyRevenues.reduce((a, v) => a + v, 0) / (monthlyRevenues.length || 1);
        const trend = monthlyRevenues.length >= 2
            ? (monthlyRevenues[monthlyRevenues.length - 1] - monthlyRevenues[0]) / Math.max(monthlyRevenues.length - 1, 1)
            : 0;
        const forecast = Math.max(0, avg + trend);

        // Active students forecast
        const activeStudents = await prisma.student.count({ where: { status: 'active' } });
        const newLastMonth = await prisma.student.count({
            where: {
                createdAt: { gte: new Date(year, now.getMonth() - 1, 1), lt: new Date(year, now.getMonth(), 1) }
            }
        });

        res.json({
            forecast_revenue: Math.round(forecast),
            trend_direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
            trend_pct: avg > 0 ? Math.round((trend / avg) * 100) : 0,
            last_3_months: monthlyRevenues,
            student_forecast: activeStudents + Math.round(newLastMonth * 0.8),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
