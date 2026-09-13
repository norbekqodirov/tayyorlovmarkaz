import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { JOBS } from '../services/scheduler.js';
import { todayDateStr, monthRangeStr } from '../utils/timezone.js';

const router = express.Router();

// GET /api/reports/summary — umumiy hisobot
// MUHIM: ilgari requireAuth FAQAT edi — har qanday rol (TEACHER ham)
// to'liq moliyaviy/tashkilot hisobotini to'g'ridan-to'g'ri olishi mumkin
// edi, /api/finance'ning o'zi talab qiladigan MANAGER+ darajasini
// chetlab o'tib. Frontend (CrmReports.tsx) allaqachon MANAGER+ talab
// qiladi (App.tsx: requiredPermission="reports", allowedRoles=['ADMIN','MANAGER']).
router.get('/summary', requireAuth, requireMinRole('MANAGER'), requirePermission('reports'), async (req, res) => {
    try {
        const { from, to } = req.query;
        const fromDate = from ? String(from) : monthRangeStr(0).start;
        const toDate = to ? String(to) : todayDateStr();

        const [
            newStudents, transactions, attendance, newLeads, wonLeads,
        ] = await Promise.all([
            prisma.student.findMany({
                where: { createdAt: { gte: new Date(fromDate), lte: new Date(toDate + 'T23:59:59') } },
                select: { name: true, source: true, createdAt: true },
            }),
            prisma.transaction.findMany({
                where: { date: { gte: fromDate, lte: toDate } },
                select: { type: true, amount: true, category: true, date: true },
            }),
            prisma.attendanceRecord.findMany({
                where: { date: { gte: fromDate, lte: toDate } },
                select: { status: true },
            }),
            prisma.lead.count({ where: { createdAt: { gte: new Date(fromDate), lte: new Date(toDate + 'T23:59:59') } } }),
            prisma.lead.count({ where: { stage: 'won', updatedAt: { gte: new Date(fromDate), lte: new Date(toDate + 'T23:59:59') } } }),
        ]);

        const income = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
        const presentCount = attendance.filter(r => r.status === 'present').length;
        const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

        // Kategoriya bo'yicha daromad
        const incomeByCategory: Record<string, number> = {};
        transactions.filter(t => t.type === 'income').forEach(t => {
            incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
        });

        const expenseByCategory: Record<string, number> = {};
        transactions.filter(t => t.type === 'expense').forEach(t => {
            expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
        });

        res.json({
            period: { from: fromDate, to: toDate },
            students: {
                new: newStudents.length,
                bySources: newStudents.reduce((acc: any, s) => {
                    const src = s.source || 'Boshqa';
                    acc[src] = (acc[src] || 0) + 1;
                    return acc;
                }, {}),
            },
            finance: {
                income,
                expense,
                profit: income - expense,
                incomeByCategory,
                expenseByCategory,
            },
            attendance: {
                total: attendance.length,
                present: presentCount,
                rate: attendanceRate,
            },
            leads: {
                new: newLeads,
                won: wonLeads,
                conversionRate: newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0,
            },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/financial — moliyaviy hisobot
router.get('/financial', requireAuth, requireMinRole('MANAGER'), requirePermission('reports'), async (req, res) => {
    try {
        const { from, to } = req.query;
        const fromDate = from ? String(from) : `${todayDateStr().slice(0, 4)}-01-01`;
        const toDate = to ? String(to) : todayDateStr();

        const transactions = await prisma.transaction.findMany({
            where: { date: { gte: fromDate, lte: toDate } },
            orderBy: { date: 'desc' },
        });

        const income = transactions.filter(t => t.type === 'income');
        const expense = transactions.filter(t => t.type === 'expense');

        const totalIncome = income.reduce((a, t) => a + t.amount, 0);
        const totalExpense = expense.reduce((a, t) => a + t.amount, 0);

        // Oylik breakdown
        const monthly: Record<string, { income: number; expense: number }> = {};
        transactions.forEach(t => {
            const month = t.date.substring(0, 7); // YYYY-MM
            if (!monthly[month]) monthly[month] = { income: 0, expense: 0 };
            if (t.type === 'income') monthly[month].income += t.amount;
            else monthly[month].expense += t.amount;
        });

        res.json({
            period: { from: fromDate, to: toDate },
            summary: {
                totalIncome,
                totalExpense,
                netProfit: totalIncome - totalExpense,
                transactionCount: transactions.length,
            },
            monthly: Object.entries(monthly)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([month, data]) => ({ month, ...data, profit: data.income - data.expense })),
            transactions,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/attendance — davomat hisoboti
router.get('/attendance', requireAuth, requireMinRole('MANAGER'), requirePermission('reports'), async (req, res) => {
    try {
        const { groupId, from, to } = req.query;
        const fromDate = from ? String(from) : monthRangeStr(0).start;
        const toDate = to ? String(to) : todayDateStr();

        const where: any = { date: { gte: fromDate, lte: toDate } };
        if (groupId) where.groupId = String(groupId);

        const records = await prisma.attendanceRecord.findMany({
            where,
            include: {
                student: { select: { id: true, name: true } },
                group: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
        });

        // O'quvchi bo'yicha statistika
        const studentStats: Record<string, any> = {};
        records.forEach(r => {
            const sid = r.student.id;
            if (!studentStats[sid]) {
                studentStats[sid] = {
                    id: sid,
                    name: r.student.name,
                    group: r.group?.name,
                    total: 0, present: 0, absent: 0, late: 0, excused: 0,
                };
            }
            studentStats[sid].total++;
            studentStats[sid][r.status]++;
        });

        const studentList = Object.values(studentStats).map((s: any) => ({
            ...s,
            rate: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
        })).sort((a: any, b: any) => b.rate - a.rate);

        const totalPresent = records.filter(r => r.status === 'present').length;

        res.json({
            period: { from: fromDate, to: toDate },
            summary: {
                total: records.length,
                present: totalPresent,
                absent: records.filter(r => r.status === 'absent').length,
                late: records.filter(r => r.status === 'late').length,
                excused: records.filter(r => r.status === 'excused').length,
                rate: records.length > 0 ? Math.round((totalPresent / records.length) * 100) : 0,
            },
            students: studentList,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/students — o'quvchilar hisoboti
router.get('/students', requireAuth, requireMinRole('MANAGER'), requirePermission('reports'), async (req, res) => {
    try {
        const students = await prisma.student.findMany({
            include: {
                enrollments: {
                    include: { group: { include: { course: true } } },
                },
                payments: {
                    orderBy: { date: 'desc' },
                    take: 5,
                },
                _count: {
                    select: {
                        attendanceRecords: true,
                        assessments: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const enriched = students.map(s => {
            const totalPaid = s.payments.filter(p => p.status === 'paid').reduce((a, p) => a + p.amount, 0);
            const totalDebt = s.payments.filter(p => p.status === 'overdue').reduce((a, p) => a + p.amount, 0);
            const activeGroups = s.enrollments.filter(e => e.group?.status === 'active');

            return {
                id: s.id,
                name: s.name,
                phone: s.phone,
                status: s.status,
                source: s.source,
                groups: activeGroups.map(e => e.group?.name).filter(Boolean),
                courses: activeGroups.map(e => e.group?.course?.name).filter(Boolean),
                totalPaid,
                totalDebt,
                attendanceCount: s._count.attendanceRecords,
                assessmentCount: s._count.assessments,
                createdAt: s.createdAt,
            };
        });

        res.json({
            total: enriched.length,
            active: enriched.filter(s => s.status === 'active').length,
            withDebt: enriched.filter(s => s.totalDebt > 0).length,
            students: enriched,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/teachers — o'qituvchi KPI hisoboti
router.get('/teachers', requireAuth, requireMinRole('MANAGER'), requirePermission('reports'), async (req, res) => {
    try {
        const { from, to } = req.query;
        const fromDate = from ? String(from) : monthRangeStr(0).start;
        const toDate = to ? String(to) : todayDateStr();

        const teachers = await prisma.user.findMany({
            where: { role: 'TEACHER', isActive: true },
            select: { id: true, name: true, avatar: true, phone: true },
        });

        const report = await Promise.all(teachers.map(async (teacher) => {
            const groups = await prisma.group.findMany({
                where: { teacherId: teacher.id },
                select: { id: true, name: true, status: true },
            });

            const groupIds = groups.map(g => g.id);

            const [enrollments, attendanceRecords, journalEntries] = await Promise.all([
                prisma.enrollment.count({ where: { groupId: { in: groupIds } } }),
                prisma.attendanceRecord.findMany({
                    where: { groupId: { in: groupIds }, date: { gte: fromDate, lte: toDate } },
                    select: { status: true },
                }),
                prisma.journalEntry.count({ where: { teacherId: teacher.id, date: { gte: fromDate, lte: toDate } } }),
            ]);

            const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
            const attRate = attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;

            return {
                id: teacher.id,
                name: teacher.name,
                phone: teacher.phone,
                groups: groups.length,
                activeGroups: groups.filter(g => g.status === 'active').length,
                students: enrollments,
                attendanceRate: attRate,
                journalEntries,
                lessonsMarked: journalEntries,
            };
        }));

        res.json({ period: { from: fromDate, to: toDate }, teachers: report });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/executive — Investor/Direktor hisoboti (CrmExecutiveReport.tsx
// shu endpointga so'rov yuborardi, lekin u hech qachon mavjud bo'lmagan — sahifa
// 2026-09-07'gacha butunlay ishlamas edi, Codex audit paytida aniqladi).
router.get('/executive', requireAuth, requireMinRole('ADMIN'), requirePermission('reports'), async (_req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-indeksli
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const currentYear = now.getFullYear();

        const [students, transactions, leads, groups] = await Promise.all([
            prisma.student.findMany({ select: { status: true, balance: true, paymentStatus: true } }),
            prisma.transaction.findMany({ where: { type: 'income' }, select: { amount: true, date: true } }),
            prisma.lead.findMany({ select: { stage: true } }),
            prisma.group.findMany({
                where: { status: 'active' },
                select: { course: { select: { name: true } } },
            }),
        ]);

        const activeStudents = students.filter(s => s.status === 'Faol' || s.status === 'active');
        const overduePayments = students.filter(s => (Number(s.balance) || 0) < 0 || s.paymentStatus === 'Qarzdorlik').length;

        const sumIncome = (rows: typeof transactions) => rows.reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const thisMonthIncome = sumIncome(transactions.filter(t => t.date && new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear));
        const prevMonthIncome = sumIncome(transactions.filter(t => t.date && new Date(t.date).getMonth() === prevMonth && new Date(t.date).getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear)));
        const yearToDateIncome = sumIncome(transactions.filter(t => t.date && new Date(t.date).getFullYear() === currentYear));
        const growthPct = prevMonthIncome > 0 ? Math.round(((thisMonthIncome - prevMonthIncome) / prevMonthIncome) * 100) : (thisMonthIncome > 0 ? 100 : 0);

        const totalLeads = leads.length;
        const wonLeads = leads.filter(l => l.stage === 'won').length;

        const courseGroupCounts: Record<string, number> = {};
        groups.forEach(g => {
            const name = g.course?.name || "Noma'lum kurs";
            courseGroupCounts[name] = (courseGroupCounts[name] || 0) + 1;
        });
        const topCourses = Object.entries(courseGroupCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, groups]) => ({ name, groups }));

        const MONTH_NAMES = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

        res.json({
            period: { month: MONTH_NAMES[currentMonth], year: currentYear },
            students: { total: students.length, active: activeStudents.length },
            revenue: { thisMonth: thisMonthIncome, prevMonth: prevMonthIncome, growthPct, yearToDate: yearToDateIncome },
            leads: { total: totalLeads, won: wonLeads, conversionRate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0 },
            overduePayments,
            topCourses,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reports/workflows — workflow'lar tarixi
router.get('/workflows', requireAuth, requirePermission('reports'), async (req, res) => {
    try {
        const workflows = await prisma.workflow.findMany({
            include: {
                logs: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        res.json(workflows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/reports/workflows/:trigger/run — Manual ishga tushirish
router.post('/workflows/:trigger/run', requireAuth, requireMinRole('ADMIN'), requirePermission('reports'), async (req, res) => {
    try {
        const { trigger } = req.params;
        const job = JOBS[trigger];
        if (!job) return res.status(404).json({ message: 'Workflow topilmadi' });

        // Background da ishga tushirish
        job().catch(err => console.error('[Manual job]', err));

        res.json({ ok: true, message: `${trigger} ishga tushirildi` });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/reports/workflows/:id — Workflow toggle
router.put('/workflows/:id', requireAuth, requireMinRole('ADMIN'), requirePermission('reports'), async (req, res) => {
    try {
        const { isActive } = req.body;
        const workflow = await prisma.workflow.update({
            where: { id: req.params.id },
            data: { isActive },
        });
        res.json(workflow);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
