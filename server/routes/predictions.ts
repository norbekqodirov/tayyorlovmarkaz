/**
 * server/routes/predictions.ts
 * Faza 5.1 — AI bashorat va tahlil
 *
 * GET /api/predictions/dropout-risk    — Chiqib ketish ehtimoli yuqori o'quvchilar
 * GET /api/predictions/payment-risk    — To'lov xavfi
 * GET /api/predictions/revenue-forecast — Oylik daromad bashorati
 * GET /api/predictions/best-leads      — Eng istiqbolli lidlar
 */

import express from 'express';
import prisma from '../db.js';

const router = express.Router();

// ─── Dropout Risk (chiqib ketish ehtimoli) ───────────────────────────────────

router.get('/dropout-risk', async (_req, res) => {
    try {
        const students = await prisma.student.findMany({
            where: { status: 'active' },
            include: {
                attendanceRecords: {
                    orderBy: { date: 'desc' },
                    take: 30
                },
                payments: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                },
                assessments: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                }
            }
        });

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const risks = students.map(s => {
            let riskScore = 0;
            const factors: string[] = [];

            // Faktor 1: Davomat (0-40 ball)
            const recentAttendance = s.attendanceRecords.filter(r => new Date(r.date) >= thirtyDaysAgo);
            const attendanceRate = recentAttendance.length > 0
                ? recentAttendance.filter(r => r.status === 'present').length / recentAttendance.length
                : 0.5;
            if (attendanceRate < 0.5) { riskScore += 40; factors.push(`Davomat juda past (${Math.round(attendanceRate * 100)}%)`); }
            else if (attendanceRate < 0.7) { riskScore += 20; factors.push(`Davomat past (${Math.round(attendanceRate * 100)}%)`); }

            // Faktor 2: Moliyaviy holat (0-30 ball)
            const balance = s.balance ?? 0;
            if (balance < -500000) { riskScore += 30; factors.push(`Katta qarz (${Math.abs(balance).toLocaleString()} so'm)`); }
            else if (balance < 0) { riskScore += 15; factors.push(`Qarz bor (${Math.abs(balance).toLocaleString()} so'm)`); }

            // Faktor 3: So'nggi to'lov (0-20 ball)
            const lastPayment = s.payments[0];
            if (!lastPayment) { riskScore += 20; factors.push("Hech qachon to'lov qilmagan"); }
            else {
                const daysSincePayment = Math.floor((now.getTime() - new Date(lastPayment.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                if (daysSincePayment > 60) { riskScore += 15; factors.push(`${daysSincePayment} kun to'lov yo'q`); }
                else if (daysSincePayment > 30) { riskScore += 8; factors.push(`${daysSincePayment} kun to'lov yo'q`); }
            }

            // Faktor 4: Baholash (0-10 ball)
            const recentScores = s.assessments.slice(0, 3);
            if (recentScores.length > 0) {
                const avgScore = recentScores.reduce((sum, a) => sum + (a.score / a.maxScore), 0) / recentScores.length;
                if (avgScore < 0.4) { riskScore += 10; factors.push(`O'rtacha ball juda past (${Math.round(avgScore * 100)}%)`); }
            }

            const risk = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

            return {
                id: s.id,
                name: s.name,
                phone: s.phone,
                riskScore,
                risk,
                factors,
                balance,
                attendanceRate: Math.round(attendanceRate * 100),
            };
        });

        // Sort by risk score descending, only return non-low risk
        const highRisk = risks.filter(r => r.risk !== 'low').sort((a, b) => b.riskScore - a.riskScore);

        res.json({
            data: highRisk,
            summary: {
                total: students.length,
                high: risks.filter(r => r.risk === 'high').length,
                medium: risks.filter(r => r.risk === 'medium').length,
                low: risks.filter(r => r.risk === 'low').length,
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Revenue Forecast (oylik daromad bashorati) ───────────────────────────────

router.get('/revenue-forecast', async (_req, res) => {
    try {
        // So'nggi 6 oy ma'lumotlari
        const months: { month: string; actual: number; label: string }[] = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const monthStr = d.toISOString().split('T')[0].slice(0, 7);

            const income = await prisma.transaction.aggregate({
                _sum: { amount: true },
                where: {
                    type: 'income',
                    date: { gte: monthStr + '-01', lt: nextD.toISOString().split('T')[0] }
                }
            });

            const monthNames = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
            months.push({
                month: monthStr,
                actual: income._sum.amount ?? 0,
                label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`
            });
        }

        // Simple linear regression bashorat
        const validMonths = months.filter(m => m.actual > 0);
        let forecast = 0;
        let trend = 0;

        if (validMonths.length >= 2) {
            const last = validMonths[validMonths.length - 1].actual;
            const prev = validMonths[validMonths.length - 2].actual;
            trend = last > 0 ? ((last - prev) / prev) * 100 : 0;

            // Weighted average of last 3 months
            const weights = [0.5, 0.3, 0.2];
            const recent = validMonths.slice(-3).reverse();
            forecast = recent.reduce((sum, m, i) => sum + m.actual * (weights[i] || 0), 0);
            forecast = Math.round(forecast * (1 + trend / 100 * 0.3)); // Partial trend
        }

        // Active students * average monthly fee estimate
        const activeStudents = await prisma.student.count({ where: { status: 'active' } });
        const avgFee = await prisma.payment.aggregate({
            _avg: { amount: true },
            where: { status: 'paid', createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) } }
        });
        const studentBasedForecast = activeStudents * (avgFee._avg.amount ?? 300000);

        const nextMonthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        res.json({
            historical: months,
            forecast: {
                amount: forecast || studentBasedForecast,
                month: `${nextMonthNames[nextMonth.getMonth()]} ${nextMonth.getFullYear()}`,
                trend: Math.round(trend),
                confidence: validMonths.length >= 4 ? 'high' : validMonths.length >= 2 ? 'medium' : 'low',
                activeStudents,
                avgFee: Math.round(avgFee._avg.amount ?? 300000),
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Best Leads (eng istiqbolli lidlar) ──────────────────────────────────────

router.get('/best-leads', async (_req, res) => {
    try {
        const leads = await prisma.lead.findMany({
            where: { stage: { in: ['new', 'contacted', 'meeting'] } },
            include: { activities: { orderBy: { date: 'desc' }, take: 1 } },
            orderBy: { score: 'desc' }
        });

        const scored = leads.map(l => {
            let priority = l.score || 0;

            // Bonus: hot status
            if (l.status === 'hot') priority += 20;
            else if (l.status === 'warm') priority += 10;

            // Bonus: meeting stage
            if (l.stage === 'meeting') priority += 15;
            else if (l.stage === 'contacted') priority += 5;

            // Bonus: recent activity
            const lastActivity = l.activities[0];
            if (lastActivity) {
                const daysSince = Math.floor((Date.now() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince <= 1) priority += 10;
                else if (daysSince <= 3) priority += 5;
            } else {
                priority -= 10; // No activity is bad
            }

            return { ...l, priority, lastActivity: lastActivity || null };
        });

        scored.sort((a, b) => b.priority - a.priority);

        res.json({ data: scored.slice(0, 20) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Payment Risk ─────────────────────────────────────────────────────────────

router.get('/payment-risk', async (_req, res) => {
    try {
        const students = await prisma.student.findMany({
            where: { status: 'active' },
            include: {
                payments: { orderBy: { createdAt: 'desc' }, take: 3 },
                enrollments: { take: 1 }
            }
        });

        const now = new Date();
        const risks = students
            .filter(s => (s.balance ?? 0) < 0 || s.payments.length === 0)
            .map(s => {
                const balance = s.balance ?? 0;
                const lastPayment = s.payments[0];
                const daysSince = lastPayment
                    ? Math.floor((now.getTime() - new Date(lastPayment.createdAt).getTime()) / (1000 * 60 * 60 * 24))
                    : 999;

                const severity = balance < -1000000 || daysSince > 90 ? 'critical'
                    : balance < -500000 || daysSince > 60 ? 'high'
                    : 'medium';

                return {
                    id: s.id, name: s.name, phone: s.phone,
                    balance, daysSincePayment: daysSince, severity,
                    lastPaymentDate: lastPayment?.date || null,
                    lastPaymentAmount: lastPayment?.amount || 0,
                };
            })
            .sort((a, b) => a.balance - b.balance);

        res.json({ data: risks });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
