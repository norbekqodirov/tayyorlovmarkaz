import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';

// IP-03 (RX-01): bu fayldagi barcha hisobotlar markaz miqyosidagi moliya va
// shaxsiy ma'lumot (qarzdorlar telefonlari, tushum, xarajat) qaytaradi. Ilgari
// 8 ta endpoint faqat `requireAuth` bilan ochiq edi — o'qituvchi tokeni ham
// ularni o'qiy olardi. Endi: BI sahifasi ishlatadiganlari — `bi` ruxsati,
// qolgan (hozircha UI'da ishlatilmaydigan) hisobotlar — `reports` ruxsati;
// hammasi MANAGER+ (ADMIN/SUPER_ADMIN har doim o'tadi).
const biAccess = [requireAuth, requireMinRole('MANAGER'), requirePermission('bi')];
const reportsAccess = [requireAuth, requireMinRole('MANAGER'), requirePermission('reports')];
import { todayDateStr, monthRangeStr, tashkentMidnightInstant } from '../utils/timezone.js';
import { getBillingSettings, calculateStudentMonthlyDue } from '../services/billing.js';
import { getLedgerMode } from '../services/ledgerMode.js';
import { chargeBalances } from '../services/receivables.js';

const router = express.Router();

// RS-03 tuzatish: bu fayldagi keng moliyaviy/boshqaruv hisobotlari (dashboard,
// monthly, debtors, income-ledger, group-profitability) ilgari faqat
// requireAuth bilan himoyalangan edi — TEACHER ham to'g'ridan-to'g'ri chaqirsa
// butun markaz moliyasini ko'ra olardi. Bu endpointlar faqat CrmBI.tsx'da
// ('bi' ruxsati, ADMIN/MANAGER) ishlatiladi — Dashboard vidjetlari (masalan
// DebtorsTable) bu yerdan emas, /api/students'dan client-side hisoblaydi,
// shuning uchun bu cheklov ularga ta'sir qilmaydi (tekshirildi).

// IP-04 (HB-01…HB-05): hisobot formulalari umumiy qoidalarga keltirildi —
//  - arxivlangan o'quvchi/guruh/lidlar statistikaga kirmaydi;
//  - oylar "YYYY-MM" (Toshkent) bo'yicha solishtiriladi, yil ham hisobga olinadi;
//  - qarzdor = faqat manfiy balans (to'lov holati matni emas; TR:F16 bilan bir xil);
//  - chiqim faqat Transaction'dan (Expense uning juft yozuvi — qayta qo'shilmaydi);
//  - davomat — haqiqiy AttendanceRecord jadvalidan (eski Attendance JSON emas).
function monthKeyOfDateStr(d: string | null | undefined): string | null {
    return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null;
}
function monthKeyOfInstant(d: Date | null | undefined): string | null {
    return d ? todayDateStr(d).slice(0, 7) : null;
}
function studentJoinMonth(s: { joinedDate?: string | null; createdAt: Date }): string | null {
    return monthKeyOfDateStr(s.joinedDate) ?? monthKeyOfInstant(s.createdAt);
}

// GET /api/analytics/dashboard — aggregated dashboard stats
router.get('/dashboard', ...biAccess, async (_req, res) => {
    try {
        const today = todayDateStr();
        const curKey = today.slice(0, 7);
        const prevKey = monthRangeStr(-1).start.slice(0, 7);
        const [students, leads, transactions, groups, teachers, todayAttendance] = await Promise.all([
            prisma.student.findMany({ where: { deletedAt: null } }),
            prisma.lead.findMany({ where: { deletedAt: null } }),
            prisma.transaction.findMany({ select: { type: true, amount: true, date: true } }),
            prisma.group.findMany({ where: { deletedAt: null } }),
            prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
            prisma.attendanceRecord.findMany({ where: { date: today }, select: { status: true } }),
        ]);

        const sum = (rows: { amount: number }[]) => rows.reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const thisMonthIncome = sum(transactions.filter(t => t.type === 'income' && monthKeyOfDateStr(t.date) === curKey));
        const prevMonthIncome = sum(transactions.filter(t => t.type === 'income' && monthKeyOfDateStr(t.date) === prevKey));
        const totalIncome = sum(transactions.filter(t => t.type === 'income'));
        const totalExpense = sum(transactions.filter(t => t.type === 'expense'));

        const activeStudents = students.filter(s => s.status === 'active' || s.status === 'Faol');
        const debtors = students.filter(s => (Number(s.balance) || 0) < 0);
        const totalDebt = debtors.reduce((a, s) => a + Math.abs(Number(s.balance) || 0), 0);

        const thisMonthLeads = leads.filter(l => monthKeyOfInstant(l.createdAt) === curKey);
        const wonLeads = leads.filter(l => l.stage === 'won').length;

        const marked = todayAttendance.filter(r => r.status !== 'excused');
        const todayPresent = marked.filter(r => r.status === 'present' || r.status === 'late').length;

        res.json({
            students: {
                total: students.length,
                active: activeStudents.length,
                new_this_month: students.filter(s => studentJoinMonth(s) === curKey).length,
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
                active: groups.filter(g => g.status === 'active' || g.status === 'Faol').length,
            },
            teachers: { total: teachers },
            attendance: {
                today_present: todayPresent,
                today_total: marked.length,
                today_rate: marked.length > 0 ? Math.round((todayPresent / marked.length) * 100) : 0,
            }
        });
    } catch (err: any) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/monthly — monthly breakdown for charts (joriy Toshkent yili)
router.get('/monthly', ...biAccess, async (_req, res) => {
    try {
        const year = todayDateStr().slice(0, 4);
        const [students, transactions, leads] = await Promise.all([
            prisma.student.findMany({ where: { deletedAt: null }, select: { joinedDate: true, createdAt: true } }),
            prisma.transaction.findMany({ where: { date: { startsWith: year } }, select: { type: true, amount: true, date: true } }),
            prisma.lead.findMany({ where: { deletedAt: null }, select: { createdAt: true } }),
        ]);

        const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
        const monthly = Array.from({ length: 12 }, (_, mi) => {
            const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
            const income = transactions.filter(t => t.type === 'income' && monthKeyOfDateStr(t.date) === key).reduce((a, t) => a + (Number(t.amount) || 0), 0);
            const expense = transactions.filter(t => t.type === 'expense' && monthKeyOfDateStr(t.date) === key).reduce((a, t) => a + (Number(t.amount) || 0), 0);
            return {
                month: MONTHS[mi],
                month_index: mi,
                income,
                expense,
                profit: income - expense,
                new_students: students.filter(s => studentJoinMonth(s) === key).length,
                new_leads: leads.filter(l => monthKeyOfInstant(l.createdAt) === key).length,
            };
        });

        res.json(monthly);
    } catch (err: any) {
        console.error('Analytics monthly error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/debtors — manfiy balansli o'quvchilar
router.get('/debtors', ...biAccess, async (_req, res) => {
    try {
        const students = await prisma.student.findMany({ where: { deletedAt: null, balance: { lt: 0 } } });
        const debtors = students
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
router.get('/lead-sources', ...biAccess, async (_req, res) => {
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
router.get('/reports/manager-summary', ...biAccess, async (req, res) => {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : tashkentMidnightInstant(monthRangeStr(0).start);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();
        const prevFrom = new Date(from); prevFrom.setMonth(prevFrom.getMonth() - 1);
        const prevTo = new Date(to); prevTo.setMonth(prevTo.getMonth() - 1);

        const fromStr = todayDateStr(from);
        const toStr = todayDateStr(to);
        const prevFromStr = todayDateStr(prevFrom);
        const prevToStr = todayDateStr(prevTo);

        const [txCur, txPrev, students, groups, leads] = await Promise.all([
            prisma.transaction.findMany({ where: { date: { gte: fromStr, lte: toStr } } }),
            prisma.transaction.findMany({ where: { date: { gte: prevFromStr, lte: prevToStr } } }),
            prisma.student.findMany({ where: { deletedAt: null } }),
            prisma.group.findMany({ where: { deletedAt: null }, include: { enrollments: { where: { student: { deletedAt: null } } } } }),
            prisma.lead.findMany({ where: { createdAt: { gte: from, lte: to }, deletedAt: null } }),
        ]);

        const income = txCur.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        // HB-01: Expense yozuvi o'zining juft Transaction'iga ega (finance.ts) —
        // ikkalasini qo'shish har xarajatni ikki marta sanardi.
        const expense = txCur.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const prevIncome = txPrev.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const prevExpense = txPrev.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        const newStudents = students.filter(s => { const d = new Date(s.joinedDate || s.createdAt || 0); return d >= from && d <= to; }).length;
        const leftStudents = students.filter(s => s.status === 'left').length;
        const debtors = students.filter(s => (s.balance || 0) < 0).length;
        const totalDebt = students.reduce((s, st) => { const b = st.balance || 0; return b < 0 ? s + Math.abs(b) : s; }, 0);

        const wonLeads = leads.filter(l => l.stage === 'won').length;
        const conversion = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

        const capacity = groups.reduce((s, g) => s + g.maxSize, 0);
        const groupFillRate = capacity > 0
            ? Math.round((groups.reduce((s, g) => s + g.enrollments.length, 0) / capacity) * 100)
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
router.get('/reports/income-ledger', ...reportsAccess, async (req, res) => {
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
router.get('/reports/debtors', ...reportsAccess, async (req, res) => {
    try {
        const overdueOnly = req.query.overdueOnly === 'true';
        const students = await prisma.student.findMany({
            where: { deletedAt: null, balance: { lt: 0 } },
            include: { payments: { where: { status: 'paid', deletedAt: null }, orderBy: { date: 'desc' }, take: 1 } },
        });
        void overdueOnly; // qarzdor — faqat manfiy balans (TR:F16 qoidasi)

        const debtors = students
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
router.get('/reports/group-profitability', ...reportsAccess, async (req, res) => {
    try {
        const groups = await prisma.group.findMany({
            where: { deletedAt: null },
            include: {
                course: true,
                enrollments: { where: { student: { deletedAt: null } }, include: { student: { select: { id: true, name: true, balance: true, paymentStatus: true } } } },
                teacher: { select: { id: true, name: true } },
            },
        });

        // HB-03: kutilgan oylik tushum endi guruh narxi (Group.price, bo'lmasa
        // Course.price) va davomat chegirmasi bilan — billing.ts bilan bir xil
        // formula (ilgari kurs narxi × o'quvchi soni edi).
        const [ty, tm] = todayDateStr().split('-').map(Number);
        const settings = await getBillingSettings();
        const dueCache = new Map<string, Awaited<ReturnType<typeof calculateStudentMonthlyDue>>>();
        const dueOf = async (studentId: string) => {
            if (!dueCache.has(studentId)) dueCache.set(studentId, await calculateStudentMonthlyDue(studentId, ty, tm, settings));
            return dueCache.get(studentId)!;
        };
        const expectedByGroup = new Map<string, number>();
        if ((await getLedgerMode()) === 'live') {
            // Jonli rejim: joriy oy e'lon qilingan hisoblari (tuzatmalar bilan) — "Oylik hisoblar" bilan bir xil
            const month = todayDateStr().slice(0, 7);
            for (const r of await chargeBalances(prisma, { month, type: 'tuition' })) {
                if (r.groupId) expectedByGroup.set(r.groupId, (expectedByGroup.get(r.groupId) || 0) + r.adjusted);
            }
        } else for (const g of groups) {
            let sum = 0;
            for (const e of g.enrollments) {
                const due = await dueOf(e.studentId);
                sum += due.byGroup.find(b => b.groupId === g.id)?.finalPrice || 0;
            }
            expectedByGroup.set(g.id, sum);
        }

        const data = groups.map(g => {
            const studentCount = g.enrollments.length;
            const expectedMonthly = expectedByGroup.get(g.id) || 0;
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
// SEC-04 tuzatish: ilgari faqat requireAuth bor edi — istalgan login qilgan
// TEACHER butun xodimlar/o'qituvchilar ro'yxatidagi asosiy maoshlarni
// ko'ra olardi. Maosh ma'lumoti HR-maxfiy, MANAGER+ talab qilinadi.
router.get('/reports/salary-sheet', ...reportsAccess, async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);

        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const [staff, teachers, salaries, payrolls] = await Promise.all([
            prisma.staffMember.findMany({ where: { status: { in: ['Faol', 'active'] }, deletedAt: null } }),
            prisma.user.findMany({ where: { role: 'TEACHER', isActive: true } }),
            prisma.salary.findMany({ where: { month: monthKey } }),
            prisma.teacherPayroll.findMany({ where: { month: monthKey, status: { in: ['approved', 'paid'] } } }),
        ]);
        // HB-03: o'qituvchi uchun tasdiqlangan oylik hisob (ilgari doim 0),
        // xodim uchun shu oyning Salary yozuvi (bo'lmasa shartnomadagi oylik).
        const salaryByStaff = new Map(salaries.map(s => [s.staffId, s]));
        const payrollByTeacher = new Map(payrolls.map(p => [p.teacherId, p]));

        const sheet = [
            ...staff.map(s => ({
                id: s.id, name: s.name, role: s.role,
                baseSalary: salaryByStaff.get(s.id)?.total ?? s.salary, department: s.department,
                type: 'staff',
                source: salaryByStaff.has(s.id) ? 'salary' : 'contract',
            })),
            ...teachers.map(t => ({
                id: t.id, name: t.name, role: 'O\'qituvchi',
                baseSalary: payrollByTeacher.get(t.id)?.accruedAmount ?? 0, department: 'Ta\'lim',
                type: 'teacher',
                source: payrollByTeacher.has(t.id) ? 'teacher_payroll' : 'not_calculated',
            })),
        ];

        res.json({ year, month, total: sheet.reduce((s, r) => s + r.baseSalary, 0), records: sheet });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/reports/attendance-journal?groupId=&from=&to=
router.get('/reports/attendance-journal', ...reportsAccess, async (req, res) => {
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
router.get('/reports/student-ltv', ...reportsAccess, async (req, res) => {
    try {
        // HB-04: faqat haqiqatan to'langan (refund/pending emas), o'chirilmagan to'lovlar.
        const students = await prisma.student.findMany({
            include: { payments: { where: { status: 'paid', deletedAt: null } } },
            where: { deletedAt: null, status: { in: ['active', 'graduated', 'Faol', 'Yakunlagan'] } },
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
router.get('/reports/payment-methods', ...reportsAccess, async (req, res) => {
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
router.get('/reports/expense-breakdown', ...reportsAccess, async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fromStr = `${year}-${pad(month)}-01`;
        const toStr = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

        // HB-01: faqat Transaction — Expense yozuvlari o'z juft Transaction'iga ega.
        const [txExpenses, budgets] = await Promise.all([
            prisma.transaction.findMany({ where: { type: 'expense', date: { gte: fromStr, lte: toStr } } }),
            prisma.budget.findMany({ where: { year, month } }),
        ]);

        const byCategory: Record<string, { actual: number; planned: number }> = {};
        for (const t of txExpenses) {
            const cat = t.category || 'Boshqa';
            if (!byCategory[cat]) byCategory[cat] = { actual: 0, planned: 0 };
            byCategory[cat].actual += t.amount;
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
router.get('/teacher-performance', ...biAccess, async (_req, res) => {
    try {
        // HB-02 (FA:EDU-03): davomat endi haqiqiy AttendanceRecord jadvalidan
        // (eski Attendance JSON 2026-09-13'dan beri yozilmaydi — foiz 0 yoki
        // eskirgan chiqardi). Oxirgi 90 kun, sababli qoldirishlar hisobga kirmaydi.
        const since = todayDateStr(new Date(Date.now() - 90 * 24 * 3600 * 1000));
        const [users, groups, enrollments, attendance] = await Promise.all([
            prisma.user.findMany({ where: { role: 'TEACHER', isActive: true } }),
            prisma.group.findMany({ where: { deletedAt: null } }),
            prisma.enrollment.findMany({ where: { student: { deletedAt: null } }, select: { groupId: true } }),
            prisma.attendanceRecord.groupBy({ by: ['groupId', 'status'], where: { date: { gte: since } }, _count: { _all: true } }),
        ]);

        const data = users.map((teacher: any) => {
            const teacherGroups = groups.filter((g: any) => g.teacherId === teacher.id);
            const groupIds = new Set(teacherGroups.map((g: any) => g.id));
            const studentCount = enrollments.filter(e => groupIds.has(e.groupId)).length;
            const rows = attendance.filter(a => groupIds.has(a.groupId) && a.status !== 'excused');
            const totalRec = rows.reduce((s, a) => s + a._count._all, 0);
            const presentRec = rows.filter(a => a.status === 'present' || a.status === 'late').reduce((s, a) => s + a._count._all, 0);
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
