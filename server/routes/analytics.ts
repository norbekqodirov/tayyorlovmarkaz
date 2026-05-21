import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { cached, TTL, NS } from '../services/cache.js';

const router = express.Router();

// GET /api/analytics/dashboard — aggregated dashboard stats
router.get('/dashboard', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}dashboard`, async () => {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
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
                leadsByStage,        // groupBy — replaces 5 separate count queries
                teachers,
                totalGroups,
                activeGroups,
                allTransactions,
                overdueStudentIds,   // distinct studentIds with overdue
                totalDebtAgg,        // total debt sum
                todayAttendance,
                overduePaymentCount,
            ] = await Promise.all([
                prisma.student.count({ where: { deletedAt: null } }),
                prisma.student.count({ where: { status: 'active', deletedAt: null } }),
                prisma.student.count({ where: { createdAt: { gte: new Date(monthStart) }, deletedAt: null } }),
                prisma.lead.count({ where: { deletedAt: null } }),
                prisma.lead.count({ where: { createdAt: { gte: new Date(monthStart) }, deletedAt: null } }),
                prisma.lead.groupBy({
                    by: ['stage'],
                    _count: { _all: true },
                    where: { deletedAt: null },
                }),
                prisma.user.count({ where: { role: 'TEACHER', isActive: true, deletedAt: null } }),
                prisma.group.count({ where: { deletedAt: null } }),
                prisma.group.count({ where: { status: 'active', deletedAt: null } }),
                prisma.transaction.findMany({
                    select: { type: true, amount: true, date: true },
                    where: { deletedAt: null },
                }),
                prisma.payment.findMany({
                    where: { status: 'overdue', deletedAt: null },
                    select: { studentId: true },
                    distinct: ['studentId'],
                }),
                prisma.payment.aggregate({
                    where: { status: 'overdue', deletedAt: null },
                    _sum: { amount: true },
                }),
                prisma.attendanceRecord.findMany({
                    where: { date: today },
                    select: { status: true },
                }),
                prisma.payment.count({ where: { status: 'overdue', deletedAt: null } }),
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

            // Lead stage counts from groupBy
            const stageMap: Record<string, number> = {};
            leadsByStage.forEach((g: any) => { stageMap[g.stage] = g._count._all; });
            const wonLeads = stageMap.won || 0;

            // Attendance today
            const todayPresent = todayAttendance.filter(r => r.status === 'present').length;
            const todayTotal = todayAttendance.length;

            return {
                students: {
                    total: totalStudents,
                    active: activeStudents,
                    new_this_month: newStudents,
                    debtors: overdueStudentIds.length,
                    total_debt: totalDebtAgg._sum.amount || 0,
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
                        new: stageMap.new || 0,
                        contacted: stageMap.contacted || 0,
                        meeting: stageMap.meeting || 0,
                        won: wonLeads,
                        lost: stageMap.lost || 0,
                    },
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
                    overdue_count: overduePaymentCount,
                },
            };
        }, TTL.SHORT);

        res.json(result);
    } catch (err: any) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/monthly — monthly breakdown for charts (current year)
router.get('/monthly', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}monthly`, async () => {
            const year = new Date().getFullYear();
            const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

            // Fetch all data at once to avoid N+1 queries
            const [transactions, students, leads] = await Promise.all([
                prisma.transaction.findMany({
                    where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` }, deletedAt: null },
                    select: { type: true, amount: true, date: true },
                }),
                prisma.student.findMany({
                    where: {
                        createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) },
                        deletedAt: null,
                    },
                    select: { createdAt: true },
                }),
                prisma.lead.findMany({
                    where: {
                        createdAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) },
                        deletedAt: null,
                    },
                    select: { createdAt: true },
                }),
            ]);

            return Array.from({ length: 12 }, (_, mi) => {
                const mm = String(mi + 1).padStart(2, '0');
                const monthPrefix = `${year}-${mm}-`;

                const income = transactions
                    .filter(t => t.type === 'income' && t.date.startsWith(monthPrefix))
                    .reduce((a, t) => a + t.amount, 0);
                const expense = transactions
                    .filter(t => t.type === 'expense' && t.date.startsWith(monthPrefix))
                    .reduce((a, t) => a + t.amount, 0);
                const newStudents = students.filter(s => s.createdAt.getMonth() === mi).length;
                const newLeads = leads.filter(l => l.createdAt.getMonth() === mi).length;

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
        }, TTL.LONG);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/debtors — students with overdue/pending payments
router.get('/debtors', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}debtors`, async () => {
            const overduePayments = await prisma.payment.findMany({
                where: { status: { in: ['overdue', 'pending'] }, deletedAt: null },
                include: {
                    student: {
                        select: { id: true, name: true, phone: true, telegramChatId: true, parentTelegramId: true },
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
                        telegramChatId: p.student.telegramChatId,
                        parentTelegramId: p.student.parentTelegramId,
                        debt: 0,
                        overdueCount: 0,
                        pendingCount: 0,
                    });
                }
                const entry = studentMap.get(sid);
                entry.debt += p.amount;
                if (p.status === 'overdue') entry.overdueCount++;
                else if (p.status === 'pending') entry.pendingCount++;
            }

            const debtors = Array.from(studentMap.values()).sort((a, b) => b.debt - a.debt);

            return {
                total: debtors.length,
                totalDebt: debtors.reduce((a, d) => a + d.debt, 0),
                debtors,
            };
        }, TTL.MEDIUM);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/lead-sources — lead source breakdown
router.get('/lead-sources', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}lead-sources`, async () => {
            const grouped = await prisma.lead.groupBy({
                by: ['source'],
                _count: { _all: true },
                where: { deletedAt: null },
            });

            return grouped
                .map((g: any) => ({
                    name: g.source || 'Boshqa',
                    count: g._count._all,
                }))
                .sort((a, b) => b.count - a.count);
        }, TTL.LONG);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/teacher-performance — teacher KPIs (N+1 fixed)
router.get('/teacher-performance', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}teacher-performance`, async () => {
            // Single query for all teachers with their groups, enrollments and attendance
            const teachers = await prisma.user.findMany({
                where: { role: 'TEACHER', isActive: true, deletedAt: null },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    taughtGroups: {
                        select: {
                            id: true,
                            status: true,
                            _count: { select: { enrollments: true } },
                        },
                    },
                },
            });

            // Single bulk fetch of all attendance records for all teachers' groups
            const allGroupIds = teachers.flatMap(t => t.taughtGroups.map(g => g.id));
            const allAttendance = allGroupIds.length > 0
                ? await prisma.attendanceRecord.findMany({
                    where: { groupId: { in: allGroupIds } },
                    select: { groupId: true, status: true },
                })
                : [];

            // Build a map of groupId -> {present, total}
            const groupAtt = new Map<string, { present: number; total: number }>();
            allAttendance.forEach(a => {
                if (!groupAtt.has(a.groupId)) groupAtt.set(a.groupId, { present: 0, total: 0 });
                const e = groupAtt.get(a.groupId)!;
                e.total++;
                if (a.status === 'present') e.present++;
            });

            return teachers.map(teacher => {
                const groups = teacher.taughtGroups;
                const studentsCount = groups.reduce((a, g) => a + g._count.enrollments, 0);

                let present = 0, total = 0;
                groups.forEach(g => {
                    const att = groupAtt.get(g.id);
                    if (att) { present += att.present; total += att.total; }
                });
                const attRate = total > 0 ? Math.round((present / total) * 100) : 0;

                return {
                    id: teacher.id,
                    name: teacher.name,
                    avatar: teacher.avatar,
                    groups: groups.length,
                    activeGroups: groups.filter(g => g.status === 'active').length,
                    students: studentsCount,
                    attendanceRate: attRate,
                    lessonCount: total,
                };
            });
        }, TTL.MEDIUM);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/revenue-by-course — kurs bo'yicha daromad
router.get('/revenue-by-course', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}revenue-by-course`, async () => {
            const [courses, transactions, enrollments] = await Promise.all([
                prisma.course.findMany({
                    where: { deletedAt: null },
                    select: { id: true, name: true, price: true, _count: { select: { groups: true } } },
                }),
                prisma.transaction.findMany({
                    where: { type: 'income', category: "Kurs to'lovi", deletedAt: null },
                    select: { amount: true, studentId: true },
                }),
                prisma.enrollment.findMany({
                    include: { group: { select: { courseId: true } } },
                }),
            ]);

            const studentCourseMap = new Map<string, string>();
            enrollments.forEach(e => {
                if (e.group?.courseId && !studentCourseMap.has(e.studentId)) {
                    studentCourseMap.set(e.studentId, e.group.courseId);
                }
            });

            const courseRevenue = new Map<string, number>();
            const courseStudents = new Map<string, number>();
            transactions.forEach(t => {
                if (t.studentId) {
                    const courseId = studentCourseMap.get(t.studentId);
                    if (courseId) {
                        courseRevenue.set(courseId, (courseRevenue.get(courseId) || 0) + t.amount);
                        if (!courseStudents.has(courseId)) courseStudents.set(courseId, new Set<string>().add(t.studentId).size);
                    }
                }
            });

            // Count students per course
            const studentSetByCourse = new Map<string, Set<string>>();
            transactions.forEach(t => {
                if (t.studentId) {
                    const courseId = studentCourseMap.get(t.studentId);
                    if (courseId) {
                        if (!studentSetByCourse.has(courseId)) studentSetByCourse.set(courseId, new Set());
                        studentSetByCourse.get(courseId)!.add(t.studentId);
                    }
                }
            });

            return courses
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    price: c.price,
                    groups: c._count.groups,
                    students: studentSetByCourse.get(c.id)?.size || 0,
                    revenue: courseRevenue.get(c.id) || 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);
        }, TTL.MEDIUM);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/forecast — kelasi oy bashorati
router.get('/forecast', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}forecast`, async () => {
            const now = new Date();
            const year = now.getFullYear();

            // So'nggi 3 oy daromadini olish
            const months: string[] = [];
            for (let i = 2; i >= 0; i--) {
                const d = new Date(year, now.getMonth() - i, 1);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                months.push(`${d.getFullYear()}-${mm}-`);
            }

            const [transactions, activeStudents, newLastMonth] = await Promise.all([
                prisma.transaction.findMany({
                    where: { type: 'income', deletedAt: null },
                    select: { amount: true, date: true },
                }),
                prisma.student.count({ where: { status: 'active', deletedAt: null } }),
                prisma.student.count({
                    where: {
                        createdAt: { gte: new Date(year, now.getMonth() - 1, 1), lt: new Date(year, now.getMonth(), 1) },
                        deletedAt: null,
                    },
                }),
            ]);

            const monthlyRevenues = months.map(prefix =>
                transactions
                    .filter(t => t.date.startsWith(prefix))
                    .reduce((a, t) => a + t.amount, 0)
            );

            const avg = monthlyRevenues.reduce((a, v) => a + v, 0) / (monthlyRevenues.length || 1);
            const trend = monthlyRevenues.length >= 2
                ? (monthlyRevenues[monthlyRevenues.length - 1] - monthlyRevenues[0]) / Math.max(monthlyRevenues.length - 1, 1)
                : 0;
            const forecast = Math.max(0, avg + trend);

            return {
                forecast_revenue: Math.round(forecast),
                trend_direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
                trend_pct: avg > 0 ? Math.round((trend / avg) * 100) : 0,
                last_3_months: monthlyRevenues,
                student_forecast: activeStudents + Math.round(newLastMonth * 0.8),
            };
        }, TTL.LONG);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/cohort — O'quvchi retention (N+1 fixed)
router.get('/cohort', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}cohort`, async () => {
            const now = new Date();
            const cohortMonths = 6;

            // 1) Get all cohort students at once
            const earliestCohortStart = new Date(now.getFullYear(), now.getMonth() - (cohortMonths - 1), 1);
            const allCohortStudents = await prisma.student.findMany({
                where: { createdAt: { gte: earliestCohortStart }, deletedAt: null },
                select: { id: true, status: true, createdAt: true },
            });

            // 2) Get ALL attendance records for these students at once
            const allStudentIds = allCohortStudents.map(s => s.id);
            const allAttendance = allStudentIds.length > 0
                ? await prisma.attendanceRecord.findMany({
                    where: { studentId: { in: allStudentIds } },
                    select: { studentId: true, date: true },
                })
                : [];

            // 3) Build attendance map: studentId -> Set of YYYY-MM
            const attendanceByMonth = new Map<string, Set<string>>();
            allAttendance.forEach(a => {
                const monthStr = a.date.substring(0, 7);
                if (!attendanceByMonth.has(a.studentId)) attendanceByMonth.set(a.studentId, new Set());
                attendanceByMonth.get(a.studentId)!.add(monthStr);
            });

            // 4) Group students by cohort month
            const cohortStudentsMap = new Map<string, typeof allCohortStudents>();
            allCohortStudents.forEach(s => {
                const m = `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, '0')}`;
                if (!cohortStudentsMap.has(m)) cohortStudentsMap.set(m, []);
                cohortStudentsMap.get(m)!.push(s);
            });

            // 5) Build cohort matrix in-memory
            const cohorts = [];
            for (let i = cohortMonths - 1; i >= 0; i--) {
                const cohortDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const cohortStr = `${cohortDate.getFullYear()}-${String(cohortDate.getMonth() + 1).padStart(2, '0')}`;
                const cohortStudents = cohortStudentsMap.get(cohortStr) || [];

                if (cohortStudents.length === 0) {
                    cohorts.push({ month: cohortStr, total: 0, retention: [] });
                    continue;
                }

                const retention: number[] = [100];
                for (let j = 1; j <= Math.min(i, 5); j++) {
                    const checkDate = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + j, 1);
                    const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`;

                    let activeCount = 0;
                    for (const s of cohortStudents) {
                        if (attendanceByMonth.get(s.id)?.has(checkStr)) activeCount++;
                    }
                    retention.push(Math.round((activeCount / cohortStudents.length) * 100));
                }

                cohorts.push({
                    month: cohortStr,
                    total: cohortStudents.length,
                    active: cohortStudents.filter(s => s.status === 'active').length,
                    retention,
                });
            }
            return cohorts;
        }, TTL.EXTRA_LONG);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/churn-risk — qaysi o'quvchi ketishi mumkin
router.get('/churn-risk', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}churn-risk`, async () => {
            const now = new Date();
            const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const [students, attendance, overduePayments] = await Promise.all([
                prisma.student.findMany({
                    where: { status: { not: 'left' }, deletedAt: null },
                    select: { id: true, name: true, phone: true, status: true, enrollments: { select: { groupId: true, group: { select: { name: true } } } } },
                }),
                prisma.attendanceRecord.findMany({
                    where: { date: { startsWith: thisMonthStr } },
                    select: { studentId: true, status: true },
                }),
                prisma.payment.groupBy({
                    by: ['studentId'],
                    where: { status: 'overdue', deletedAt: null },
                    _sum: { amount: true },
                }),
            ]);

            const attMap = new Map<string, { present: number; total: number }>();
            attendance.forEach(r => {
                if (!attMap.has(r.studentId)) attMap.set(r.studentId, { present: 0, total: 0 });
                const e = attMap.get(r.studentId)!;
                e.total++;
                if (r.status === 'present') e.present++;
            });

            const debtMap = new Map<string, number>();
            overduePayments.forEach((p: any) => debtMap.set(p.studentId, p._sum.amount || 0));

            const risks = students.map(s => {
                let riskScore = 0;
                const reasons: string[] = [];
                const debt = debtMap.get(s.id) || 0;
                if (debt > 0) { riskScore += 40; reasons.push(`Qarz: ${Math.round(debt).toLocaleString()} so'm`); }

                const att = attMap.get(s.id);
                if (att && att.total > 0) {
                    const rate = Math.round((att.present / att.total) * 100);
                    if (rate < 50) { riskScore += 35; reasons.push(`Davomat ${rate}%`); }
                    else if (rate < 70) { riskScore += 20; reasons.push(`Davomat ${rate}%`); }
                }

                if (s.status === 'frozen' || s.status === 'Muzlatilgan') { riskScore += 25; reasons.push('Muzlatilgan'); }
                if (!att || att.total === 0) { riskScore += 15; reasons.push("Bu oy hech qaysi darsda yo'q"); }

                return {
                    id: s.id,
                    name: s.name,
                    phone: s.phone,
                    status: s.status,
                    group: s.enrollments[0]?.group?.name || '—',
                    riskScore,
                    reasons,
                };
            })
                .filter(s => s.riskScore >= 30)
                .sort((a, b) => b.riskScore - a.riskScore)
                .slice(0, 20);

            return risks;
        }, TTL.MEDIUM);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/kpi — kengaytirilgan KPI (o'qituvchi, kurs, guruh)
router.get('/kpi', requireAuth, async (_req, res) => {
    try {
        const result = await cached(`${NS.ANALYTICS}kpi`, async () => {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            const [
                avgGroupSize,
                avgAttendance,
                totalAssessments,
                newCertificates,
            ] = await Promise.all([
                prisma.enrollment.count().then(async (total) => {
                    const groups = await prisma.group.count({ where: { status: 'active', deletedAt: null } });
                    return groups > 0 ? Math.round(total / groups) : 0;
                }),
                prisma.attendanceRecord.findMany({
                    where: { date: { gte: monthStart.toISOString().split('T')[0] } },
                    select: { status: true },
                }).then(records => {
                    if (!records.length) return 0;
                    const present = records.filter(r => r.status === 'present').length;
                    return Math.round((present / records.length) * 100);
                }),
                prisma.assessment.count({ where: { date: { gte: monthStart.toISOString().split('T')[0] } } }),
                prisma.certificate.count({ where: { issuedAt: { gte: monthStart } } }).catch(() => 0),
            ]);

            return {
                avg_group_size: avgGroupSize,
                avg_attendance_pct: avgAttendance,
                total_assessments_this_month: totalAssessments,
                new_certificates_this_month: newCertificates,
            };
        }, TTL.MEDIUM);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
