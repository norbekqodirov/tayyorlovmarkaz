import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { todayDateStr, monthRangeStr, tashkentMidnightInstant } from '../utils/timezone.js';

const router = express.Router();

// Helper: get all GenericDocuments for a collection (kept for fallback generic models)
async function getGenericDocs(collection: string): Promise<any[]> {
    const docs = await prisma.genericDocument.findMany({ where: { collection } });
    return docs.map((d: any) => {
        try { return { id: d.id, ...JSON.parse(d.data), createdAt: d.createdAt, updatedAt: d.updatedAt }; }
        catch { return { id: d.id }; }
    });
}

// Helper: attendance now lives in the native `Attendance` table (Faza 0.2 migration),
// not GenericDocument — `records` is stored as a JSON string and must be parsed back.
async function getAttendanceDocs(): Promise<any[]> {
    const rows = await prisma.attendance.findMany();
    return rows.map((a: any) => {
        let records: any[] = [];
        try { records = JSON.parse(a.records || '[]'); } catch { records = []; }
        return { id: a.id, groupId: a.groupId, date: a.date, records, createdAt: a.createdAt, updatedAt: a.updatedAt };
    });
}

// GET /api/analytics/dashboard — aggregated dashboard stats
router.get('/dashboard', requireAuth, async (_req, res) => {
    try {
        const [students, leads, transactions, groups, teachers, attendance] = await Promise.all([
            prisma.student.findMany(),
            prisma.lead.findMany(),
            prisma.transaction.findMany(),
            prisma.group.findMany(),
            prisma.user.findMany({ where: { role: 'TEACHER' } }),
            getAttendanceDocs(),
        ]);

        const today = todayDateStr();
        const currentMonth = Number(today.slice(5, 7)) - 1; // 0-indeksli, getMonth() bilan mos
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;

        // Revenue
        const thisMonthIncome = transactions
            .filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === currentMonth)
            .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
        const prevMonthIncome = transactions
            .filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === prevMonth)
            .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);

        // Students
        const activeStudents = students.filter(s => s.status === 'Faol' || s.status === 'active');
        const debtors = students.filter(s => (Number(s.balance) || 0) < 0 || s.paymentStatus === 'Qarzdorlik');
        const totalDebt = debtors.reduce((a: number, s: any) => a + Math.abs(Number(s.balance) || 0), 0);

        // Leads
        const thisMonthLeads = leads.filter(l => {
            const d = new Date(l.createdAt || l.date || 0);
            return d.getMonth() === currentMonth;
        });
        const wonLeads = leads.filter(l => l.stage === 'won').length;

        // Attendance today
        const todayAtt = attendance.find((a: any) => a.date === today);
        const todayRecords = todayAtt?.records || [];
        const todayPresent = todayRecords.filter((r: any) => r.status === 'present').length;
        const todayTotal = todayRecords.length;

        res.json({
            students: {
                total: students.length,
                active: activeStudents.length,
                new_this_month: students.filter(s => {
                    const d = new Date(s.joinedDate || s.createdAt || 0);
                    return d.getMonth() === currentMonth;
                }).length,
                debtors: debtors.length,
                total_debt: totalDebt,
            },
            revenue: {
                this_month: thisMonthIncome,
                prev_month: prevMonthIncome,
                growth_pct: prevMonthIncome > 0 ? Math.round(((thisMonthIncome - prevMonthIncome) / prevMonthIncome) * 100) : 0,
                total_income: totalIncome,
                total_expense: totalExpense,
                net_profit: totalIncome - totalExpense,
            },
            leads: {
                total: leads.length,
                this_month: thisMonthLeads.length,
                won: wonLeads,
                conversion_rate: leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0,
                by_stage: {
                    new: leads.filter(l => l.stage === 'new').length,
                    contacted: leads.filter(l => l.stage === 'contacted').length,
                    meeting: leads.filter(l => l.stage === 'meeting').length,
                    won: wonLeads,
                    lost: leads.filter(l => l.stage === 'lost').length,
                }
            },
            groups: {
                total: groups.length,
                active: groups.filter(g => g.status === 'Faol' || g.status === 'active').length,
            },
            teachers: { total: teachers.length },
            attendance: {
                today_present: todayPresent,
                today_total: todayTotal,
                today_rate: todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0,
            }
        });
    } catch (err: any) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/monthly — monthly breakdown for charts
router.get('/monthly', requireAuth, async (_req, res) => {
    try {
        const [students, transactions, leads] = await Promise.all([
            prisma.student.findMany(),
            prisma.transaction.findMany(),
            prisma.lead.findMany(),
        ]);

        const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
        // Yil tekshiruvisiz faqat oy (getMonth()) solishtirilsa, o'tgan yillardagi
        // yozuvlar ham shu yilning oyiga qo'shilib ketardi (masalan 2025-yanvar
        // 2026-yanvar bilan bir ustunga tushardi) — grafik noto'g'ri ko'rsatardi.
        const currentYear = new Date().getFullYear();

        const monthly = Array.from({ length: 12 }, (_, mi) => {
            const income = transactions
                .filter(t => t.type === 'income' && t.date && new Date(t.date).getFullYear() === currentYear && new Date(t.date).getMonth() === mi)
                .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
            const expense = transactions
                .filter(t => t.type === 'expense' && t.date && new Date(t.date).getFullYear() === currentYear && new Date(t.date).getMonth() === mi)
                .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
            const newStudents = students.filter(s => {
                const d = new Date(s.joinedDate || s.createdAt || 0);
                return d.getFullYear() === currentYear && d.getMonth() === mi;
            }).length;
            const newLeads = leads.filter(l => {
                const d = new Date(l.createdAt || l.date || 0);
                return d.getFullYear() === currentYear && d.getMonth() === mi;
            }).length;

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
        console.error('Analytics monthly error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/debtors — students with overdue payments
router.get('/debtors', requireAuth, async (_req, res) => {
    try {
        const students = await prisma.student.findMany();
        const debtors = students
            .filter(s => (Number(s.balance) || 0) < 0 || s.paymentStatus === 'Qarzdorlik')
            .map(s => ({
                id: s.id,
                name: s.name,
                phone: s.phone,
                group: s.group,
                course: s.course,
                balance: Number(s.balance) || 0,
                debt: Math.abs(Number(s.balance) || 0),
                paymentStatus: s.paymentStatus,
            }))
            .sort((a, b) => a.balance - b.balance);

        res.json({ total: debtors.length, totalDebt: debtors.reduce((a, d) => a + d.debt, 0), debtors });
    } catch (err: any) {
        console.error('Analytics debtors error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/lead-sources — lead source breakdown
router.get('/lead-sources', requireAuth, async (_req, res) => {
    try {
        const leads = await prisma.lead.findMany();
        const sources: Record<string, number> = {};
        leads.forEach((l: any) => {
            const src = l.source || 'Boshqa';
            sources[src] = (sources[src] || 0) + 1;
        });
        const data = Object.entries(sources)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        res.json(data);
    } catch (err: any) {
        console.error('Analytics lead-sources error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── FAZA 1.1 HISOBOTLAR ──────────────────────────────────────────────────────

// GET /api/analytics/reports/manager-summary?from=&to=
router.get('/reports/manager-summary', requireAuth, async (req, res) => {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : tashkentMidnightInstant(monthRangeStr(0).start);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();
        const prevFrom = new Date(from); prevFrom.setMonth(prevFrom.getMonth() - 1);
        const prevTo = new Date(to); prevTo.setMonth(prevTo.getMonth() - 1);

        const fromStr = todayDateStr(from);
        const toStr = todayDateStr(to);
        const prevFromStr = todayDateStr(prevFrom);
        const prevToStr = todayDateStr(prevTo);

        const [txCur, txPrev, students, groups, leads, expenses] = await Promise.all([
            prisma.transaction.findMany({ where: { date: { gte: fromStr, lte: toStr } } }),
            prisma.transaction.findMany({ where: { date: { gte: prevFromStr, lte: prevToStr } } }),
            prisma.student.findMany(),
            prisma.group.findMany({ include: { enrollments: true } }),
            prisma.lead.findMany({ where: { createdAt: { gte: from, lte: to } } }),
            prisma.expense.findMany({ where: { date: { gte: fromStr, lte: toStr } } }),
        ]);

        const income = txCur.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = txCur.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) + expenses.reduce((s, e) => s + e.amount, 0);
        const prevIncome = txPrev.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const prevExpense = txPrev.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        const newStudents = students.filter(s => { const d = new Date(s.joinedDate || s.createdAt || 0); return d >= from && d <= to; }).length;
        const leftStudents = students.filter(s => s.status === 'left').length;
        const debtors = students.filter(s => (s.balance || 0) < 0).length;
        const totalDebt = students.reduce((s, st) => { const b = st.balance || 0; return b < 0 ? s + Math.abs(b) : s; }, 0);

        const wonLeads = leads.filter(l => l.stage === 'won').length;
        const conversion = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

        const groupFillRate = groups.length > 0
            ? Math.round((groups.reduce((s, g) => s + g.enrollments.length, 0) / groups.reduce((s, g) => s + g.maxSize, 0)) * 100)
            : 0;

        res.json({
            period: { from: fromStr, to: toStr },
            income, expense, profit: income - expense,
            income_growth: prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0,
            expense_growth: prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : 0,
            new_students: newStudents, left_students: leftStudents,
            debtors, total_debt: totalDebt,
            leads: leads.length, won_leads: wonLeads, conversion,
            group_fill_rate: groupFillRate,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/income-ledger?month=&year=
router.get('/reports/income-ledger', requireAuth, async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = req.query.month !== undefined ? Number(req.query.month) : Number(todayParts[1]);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fromStr = `${year}-${pad(month)}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const toStr = `${year}-${pad(month)}-${pad(lastDay)}`;

        const transactions = await prisma.transaction.findMany({
            where: { type: 'income', date: { gte: fromStr, lte: toStr } },
            orderBy: { date: 'asc' },
        });

        const byDay: Record<string, { date: string; count: number; total: number; items: any[] }> = {};
        for (const t of transactions) {
            const key = t.date || '';
            if (!byDay[key]) byDay[key] = { date: key, count: 0, total: 0, items: [] };
            byDay[key].count++;
            byDay[key].total += t.amount;
            byDay[key].items.push({ id: t.id, amount: t.amount, category: t.category, method: t.method, studentName: t.studentName, description: t.description });
        }

        res.json({
            period: { year, month, from: fromStr, to: toStr },
            total: transactions.reduce((s, t) => s + t.amount, 0),
            count: transactions.length,
            by_day: Object.values(byDay),
            transactions,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/debtors
router.get('/reports/debtors', requireAuth, async (req, res) => {
    try {
        const overdueOnly = req.query.overdueOnly === 'true';
        const students = await prisma.student.findMany({
            include: { payments: { orderBy: { date: 'desc' }, take: 1 } },
        });

        const debtors = students
            .filter(s => overdueOnly ? (s.balance || 0) < 0 : true)
            .filter(s => (s.balance || 0) < 0 || s.paymentStatus === 'Qarzdorlik')
            .map(s => ({
                id: s.id, name: s.name, phone: s.phone,
                group: s.group, course: s.course,
                balance: s.balance || 0,
                debt: Math.abs(s.balance || 0),
                paymentStatus: s.paymentStatus,
                lastPayment: s.payments[0]?.date || null,
                lastPaymentAmount: s.payments[0]?.amount || 0,
            }))
            .sort((a, b) => a.balance - b.balance);

        res.json({ total: debtors.length, totalDebt: debtors.reduce((s, d) => s + d.debt, 0), debtors });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/group-profitability
router.get('/reports/group-profitability', requireAuth, async (req, res) => {
    try {
        const groups = await prisma.group.findMany({
            include: {
                course: true,
                enrollments: { include: { student: { select: { id: true, name: true, balance: true, paymentStatus: true } } } },
                teacher: { select: { id: true, name: true } },
            },
        });

        const data = groups.map(g => {
            const studentCount = g.enrollments.length;
            const expectedMonthly = (g.course?.price || 0) * studentCount;
            const debtors = g.enrollments.filter(e => (e.student?.balance || 0) < 0).length;
            const fillRate = g.maxSize > 0 ? Math.round((studentCount / g.maxSize) * 100) : 0;
            return {
                id: g.id, name: g.name,
                course: g.course?.name,
                teacher: g.teacher?.name,
                students: studentCount,
                maxSize: g.maxSize,
                fillRate,
                expectedMonthly,
                debtors,
                status: g.status,
            };
        });

        res.json(data.sort((a, b) => b.fillRate - a.fillRate));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/salary-sheet?month=&year=
router.get('/reports/salary-sheet', requireAuth, async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);

        const [staff, teachers] = await Promise.all([
            prisma.staffMember.findMany({ where: { status: { in: ['Faol', 'active'] } } }),
            prisma.user.findMany({ where: { role: 'TEACHER' } }),
        ]);

        const sheet = [
            ...staff.map(s => ({
                id: s.id, name: s.name, role: s.role,
                baseSalary: s.salary, department: s.department,
                type: 'staff',
            })),
            ...teachers.map(t => ({
                id: t.id, name: t.name, role: 'O\'qituvchi',
                baseSalary: 0, department: 'Ta\'lim',
                type: 'teacher',
            })),
        ];

        res.json({ year, month, total: sheet.reduce((s, r) => s + r.baseSalary, 0), records: sheet });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/attendance-journal?groupId=&from=&to=
router.get('/reports/attendance-journal', requireAuth, async (req, res) => {
    try {
        const { groupId, from, to } = req.query as Record<string, string>;
        const where: any = {};
        if (groupId) where.groupId = groupId;
        if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

        const records = await prisma.attendanceRecord.findMany({
            where,
            include: { student: { select: { id: true, name: true } }, group: { select: { id: true, name: true } } },
            orderBy: [{ date: 'asc' }, { student: { name: 'asc' } }],
        });

        const total = records.length;
        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;

        res.json({
            summary: { total, present, absent, late, rate: total > 0 ? Math.round((present / total) * 100) : 0 },
            records,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/student-ltv
router.get('/reports/student-ltv', requireAuth, async (req, res) => {
    try {
        const students = await prisma.student.findMany({
            include: { payments: true },
            where: { status: { in: ['active', 'graduated', 'Faol', 'Yakunlagan'] } },
        });

        const withLtv = students.map(s => {
            const totalPaid = s.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const joinDate = new Date(s.joinedDate || s.createdAt || Date.now());
            const months = Math.max(1, Math.round((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            return { id: s.id, name: s.name, totalPaid, months, avgMonthly: Math.round(totalPaid / months), status: s.status };
        });

        const avgLtv = withLtv.length > 0 ? Math.round(withLtv.reduce((s, r) => s + r.totalPaid, 0) / withLtv.length) : 0;
        const avgMonths = withLtv.length > 0 ? Math.round(withLtv.reduce((s, r) => s + r.months, 0) / withLtv.length) : 0;

        res.json({ avgLtv, avgMonths, students: withLtv.sort((a, b) => b.totalPaid - a.totalPaid) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/payment-methods
router.get('/reports/payment-methods', requireAuth, async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({ where: { type: 'income' } });
        const methods: Record<string, { count: number; total: number }> = {};
        for (const t of transactions) {
            const m = t.method || 'Boshqa';
            if (!methods[m]) methods[m] = { count: 0, total: 0 };
            methods[m].count++;
            methods[m].total += t.amount;
        }
        res.json(Object.entries(methods).map(([method, data]) => ({ method, ...data })).sort((a, b) => b.total - a.total));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/expense-breakdown?month=&year=
router.get('/reports/expense-breakdown', requireAuth, async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fromStr = `${year}-${pad(month)}-01`;
        const toStr = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

        const [txExpenses, expenses, budgets] = await Promise.all([
            prisma.transaction.findMany({ where: { type: 'expense', date: { gte: fromStr, lte: toStr } } }),
            prisma.expense.findMany({ where: { date: { gte: fromStr, lte: toStr } } }),
            prisma.budget.findMany({ where: { year, month } }),
        ]);

        const byCategory: Record<string, { actual: number; planned: number }> = {};
        for (const t of txExpenses) {
            const cat = t.category || 'Boshqa';
            if (!byCategory[cat]) byCategory[cat] = { actual: 0, planned: 0 };
            byCategory[cat].actual += t.amount;
        }
        for (const e of expenses) {
            const cat = e.category || 'Boshqa';
            if (!byCategory[cat]) byCategory[cat] = { actual: 0, planned: 0 };
            byCategory[cat].actual += e.amount;
        }
        for (const b of budgets) {
            if (!byCategory[b.category]) byCategory[b.category] = { actual: 0, planned: 0 };
            byCategory[b.category].planned = b.planned;
        }

        const result = Object.entries(byCategory).map(([category, data]) => ({
            category, ...data,
            variance: data.planned > 0 ? Math.round(((data.actual - data.planned) / data.planned) * 100) : null,
        }));

        res.json({ year, month, total_actual: result.reduce((s, r) => s + r.actual, 0), categories: result.sort((a, b) => b.actual - a.actual) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/teacher-performance — teacher KPIs
router.get('/teacher-performance', requireAuth, async (_req, res) => {
    try {
        const [users, students, groups, enrollments, attendance] = await Promise.all([
            prisma.user.findMany({ where: { role: 'TEACHER' } }),
            prisma.student.findMany(),
            prisma.group.findMany(),
            prisma.enrollment.findMany(),
            getAttendanceDocs(),
        ]);

        const data = users.map((teacher: any) => {
            const teacherGroups = groups.filter((g: any) => g.teacherId === teacher.id || g.teacher === teacher.name);
            const studentCount = teacherGroups.reduce((a: number, g: any) => {
                const groupEnrollments = enrollments.filter(e => e.groupId === g.id);
                return a + groupEnrollments.length;
            }, 0);

            // Attendance rate for this teacher's students
            const groupIds = teacherGroups.map((g: any) => g.id);
            const attRecords = attendance.filter((a: any) => groupIds.includes(a.groupId));
            const totalRec = attRecords.flatMap((a: any) => a.records || []).length;
            const presentRec = attRecords.flatMap((a: any) => a.records || []).filter((r: any) => r.status === 'present').length;
            const attRate = totalRec > 0 ? Math.round((presentRec / totalRec) * 100) : 0;

            return {
                id: teacher.id,
                name: teacher.name,
                groups: teacherGroups.length,
                students: studentCount,
                attendanceRate: attRate,
            };
        });

        res.json(data);
    } catch (err: any) {
        console.error('Analytics teacher-performance error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
