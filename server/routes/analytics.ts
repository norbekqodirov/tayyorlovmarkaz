import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Helper: get all GenericDocuments for a collection
async function getGenericDocs(collection: string): Promise<any[]> {
    const docs = await prisma.genericDocument.findMany({ where: { collection } });
    return docs.map((d: any) => {
        try { return { id: d.id, ...JSON.parse(d.data), createdAt: d.createdAt, updatedAt: d.updatedAt }; }
        catch { return { id: d.id }; }
    });
}

// GET /api/analytics/dashboard — aggregated dashboard stats
router.get('/dashboard', requireAuth, async (_req, res) => {
    try {
        const [students, leads, transactions, groups, teachers, attendance] = await Promise.all([
            getGenericDocs('students'),
            getGenericDocs('leads'),
            getGenericDocs('finance'),
            getGenericDocs('groups'),
            prisma.user.findMany({ where: { role: 'TEACHER' } }),
            getGenericDocs('attendance'),
        ]);

        const now = new Date();
        const currentMonth = now.getMonth();
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const today = now.toISOString().split('T')[0];

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
        console.error('Analytics error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/monthly — monthly breakdown for charts
router.get('/monthly', requireAuth, async (_req, res) => {
    try {
        const [students, transactions, leads] = await Promise.all([
            getGenericDocs('students'),
            getGenericDocs('finance'),
            getGenericDocs('leads'),
        ]);

        const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

        const monthly = Array.from({ length: 12 }, (_, mi) => {
            const income = transactions
                .filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi)
                .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
            const expense = transactions
                .filter(t => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi)
                .reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
            const newStudents = students.filter(s => {
                const d = new Date(s.joinedDate || s.createdAt || 0);
                return d.getMonth() === mi;
            }).length;
            const newLeads = leads.filter(l => {
                const d = new Date(l.createdAt || l.date || 0);
                return d.getMonth() === mi;
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
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/debtors — students with overdue payments
router.get('/debtors', requireAuth, async (_req, res) => {
    try {
        const students = await getGenericDocs('students');
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
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/lead-sources — lead source breakdown
router.get('/lead-sources', requireAuth, async (_req, res) => {
    try {
        const leads = await getGenericDocs('leads');
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
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/teacher-performance — teacher KPIs
router.get('/teacher-performance', requireAuth, async (_req, res) => {
    try {
        const [users, students, groups, attendance] = await Promise.all([
            prisma.user.findMany({ where: { role: 'TEACHER' } }),
            getGenericDocs('students'),
            getGenericDocs('groups'),
            getGenericDocs('attendance'),
        ]);

        const data = users.map((teacher: any) => {
            const teacherGroups = groups.filter((g: any) => g.teacherId === teacher.id || g.teacher === teacher.name);
            const studentCount = teacherGroups.reduce((a: number, g: any) => a + (g.students?.length || 0), 0);

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
        res.status(500).json({ error: err.message });
    }
});

export default router;
