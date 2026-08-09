/**
 * server/routes/marketing.ts (Faza 5)
 * Marketing/lid analitikasi — haqiqiy hisob-kitoblar. analytics.ts allaqachon
 * 550 qator bo'lgani uchun bu yerga alohida chiqarildi.
 *
 * MUHIM: bu yerda hech qanday konversiya/ROI qo'lda kiritilgan sondan
 * hisoblanmaydi — hammasi Lead.campaignId/Lead.studentId va haqiqiy
 * Payment yozuvlaridan real vaqtda hisoblanadi.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { tashkentMidnightInstant, todayDateStr } from '../utils/timezone.js';
import { OPEN_STAGES } from '../constants/leads.js';

const router = express.Router();
router.use(requireAuth, requireMinRole('MANAGER'));

function monthAgoStr(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
}

function parseRange(req: any): { from: Date; to: Date; fromStr: string; toStr: string } {
    const fromStr = (req.query.from as string) || monthAgoStr(1);
    const toStr = (req.query.to as string) || todayDateStr();
    return {
        from: tashkentMidnightInstant(fromStr),
        to: new Date(tashkentMidnightInstant(toStr).getTime() + 24 * 60 * 60 * 1000 - 1),
        fromStr, toStr,
    };
}

// ─── GET /api/marketing/overview ───────────────────────────────────────────────
router.get('/overview', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const prevSpan = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - prevSpan);
        const prevTo = new Date(from.getTime() - 1);

        const [leads, leadsPrev, won, lost, open, campaigns, slaBreaches] = await Promise.all([
            prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to } } }),
            prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: prevFrom, lte: prevTo } } }),
            prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to }, studentId: { not: null } } }),
            prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to }, stage: 'lost' } }),
            prisma.lead.count({ where: { deletedAt: null, stage: { in: OPEN_STAGES } } }),
            prisma.campaign.findMany({ where: { OR: [{ startDate: null }, { startDate: { lte: to.toISOString() } }] }, select: { spent: true } }),
            prisma.lead.count({ where: { deletedAt: null, slaBreachedAt: { not: null }, createdAt: { gte: from, lte: to } } }),
        ]);
        const wonPrev = await prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: prevFrom, lte: prevTo }, studentId: { not: null } } });

        // Shu davrda olingan lidlarning (keyinchalik o'quvchi bo'lgan) haqiqiy to'lovlari.
        const wonLeadsInRange = await prisma.lead.findMany({
            where: { deletedAt: null, createdAt: { gte: from, lte: to }, studentId: { not: null } },
            select: { studentId: true, convertedAt: true },
        });
        const studentIds = wonLeadsInRange.map(l => l.studentId).filter(Boolean) as string[];
        const payments = studentIds.length
            ? await prisma.payment.findMany({ where: { studentId: { in: studentIds }, status: 'paid', deletedAt: null }, select: { amount: true, studentId: true, createdAt: true } })
            : [];
        const revenue = payments.reduce((s, p) => s + p.amount, 0);

        // CAC "qoplanishi" — konversiyadan keyingi 90 kun ichidagi to'lovlar.
        const convertedAtMap = new Map(wonLeadsInRange.map(l => [l.studentId, l.convertedAt]));
        const revenueFirst90d = payments.reduce((s, p) => {
            const conv = convertedAtMap.get(p.studentId);
            if (!conv) return s;
            const days = (p.createdAt.getTime() - new Date(conv).getTime()) / 86400000;
            return days >= 0 && days <= 90 ? s + p.amount : s;
        }, 0);

        const spend = campaigns.reduce((s, c) => s + (c.spent || 0), 0);
        const avgFirstResponse = await prisma.lead.aggregate({
            where: { deletedAt: null, createdAt: { gte: from, lte: to }, firstResponseMinutes: { not: null } },
            _avg: { firstResponseMinutes: true },
        });

        res.json({
            leads, leadsPrev,
            won, wonPrev, lost, open,
            conversionRate: leads ? Math.round((won / leads) * 1000) / 10 : 0,
            conversionRatePrev: leadsPrev ? Math.round((wonPrev / leadsPrev) * 1000) / 10 : 0,
            avgFirstResponseMin: avgFirstResponse._avg.firstResponseMinutes ? Math.round(avgFirstResponse._avg.firstResponseMinutes) : null,
            slaBreaches,
            spend, revenue, revenueFirst90d,
            cpl: leads ? Math.round(spend / leads) : 0,
            cac: won ? Math.round(spend / won) : 0,
            roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/by-source ──────────────────────────────────────────────
router.get('/by-source', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const leads = await prisma.lead.findMany({
            where: { deletedAt: null, createdAt: { gte: from, lte: to } },
            select: { source: true, stage: true, studentId: true, score: true, firstResponseMinutes: true },
        });
        const bySource = new Map<string, { leads: number; contacted: number; won: number; lost: number; scoreSum: number; frmSum: number; frmCount: number }>();
        for (const l of leads) {
            const key = l.source || 'Boshqa';
            if (!bySource.has(key)) bySource.set(key, { leads: 0, contacted: 0, won: 0, lost: 0, scoreSum: 0, frmSum: 0, frmCount: 0 });
            const row = bySource.get(key)!;
            row.leads++;
            row.scoreSum += l.score;
            if (l.stage !== 'new') row.contacted++;
            if (l.studentId) row.won++;
            if (l.stage === 'lost') row.lost++;
            if (l.firstResponseMinutes != null) { row.frmSum += l.firstResponseMinutes; row.frmCount++; }
        }

        const studentIds = leads.filter(l => l.studentId).map(l => l.studentId) as string[];
        const payments = studentIds.length
            ? await prisma.payment.findMany({ where: { studentId: { in: studentIds }, status: 'paid', deletedAt: null }, select: { amount: true, studentId: true } })
            : [];
        const revenueByStudent = new Map<string, number>();
        for (const p of payments) revenueByStudent.set(p.studentId, (revenueByStudent.get(p.studentId) || 0) + p.amount);
        const leadsByStudent = new Map(leads.filter(l => l.studentId).map(l => [l.studentId as string, l.source || 'Boshqa']));
        const revenueBySource = new Map<string, number>();
        for (const [studentId, amount] of revenueByStudent) {
            const src = leadsByStudent.get(studentId) || 'Boshqa';
            revenueBySource.set(src, (revenueBySource.get(src) || 0) + amount);
        }

        const result = Array.from(bySource.entries()).map(([source, r]) => ({
            source,
            leads: r.leads,
            contacted: r.contacted,
            won: r.won,
            lost: r.lost,
            conversionRate: r.leads ? Math.round((r.won / r.leads) * 1000) / 10 : 0,
            avgScore: r.leads ? Math.round(r.scoreSum / r.leads) : 0,
            avgFirstResponseMin: r.frmCount ? Math.round(r.frmSum / r.frmCount) : null,
            revenue: revenueBySource.get(source) || 0,
        })).sort((a, b) => b.leads - a.leads);

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/by-campaign ────────────────────────────────────────────
router.get('/by-campaign', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
        const result = await Promise.all(campaigns.map(async (c) => {
            const leads = await prisma.lead.findMany({
                where: { campaignId: c.id, deletedAt: null, createdAt: { gte: from, lte: to } },
                select: { studentId: true },
            });
            const leadsReal = leads.length;
            const studentIds = leads.filter(l => l.studentId).map(l => l.studentId) as string[];
            const won = studentIds.length;
            const payments = studentIds.length
                ? await prisma.payment.aggregate({ where: { studentId: { in: studentIds }, status: 'paid', deletedAt: null }, _sum: { amount: true } })
                : { _sum: { amount: 0 } };
            const revenue = payments._sum.amount || 0;
            return {
                id: c.id, name: c.name, platform: c.platform, status: c.status,
                budget: c.budget, spent: c.spent,
                impressions: c.impressions, clicks: c.clicks,
                ctr: c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0,
                leadsReported: c.leads, // platforma o'zi ko'rsatgan (qo'lda kiritilgan)
                leadsReal, won, revenue,
                cpl: leadsReal ? Math.round(c.spent / leadsReal) : 0,
                cac: won ? Math.round(c.spent / won) : 0,
                roas: c.spent > 0 ? Math.round((revenue / c.spent) * 100) / 100 : 0,
            };
        }));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/by-form ────────────────────────────────────────────────
router.get('/by-form', async (req, res) => {
    try {
        const forms = await prisma.targetForm.findMany({ orderBy: { createdAt: 'desc' } });
        const result = await Promise.all(forms.map(async (f) => {
            const leads = await prisma.lead.findMany({ where: { formId: f.id, deletedAt: null }, select: { studentId: true } });
            const submissionsReal = leads.length;
            const won = leads.filter(l => l.studentId).length;
            return {
                id: f.id, title: f.title, isActive: f.isActive,
                views: f.views, submissionsReal,
                conversionRate: f.views ? Math.round((submissionsReal / f.views) * 1000) / 10 : 0,
                won,
            };
        }));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/funnel ──────────────────────────────────────────────────
router.get('/funnel', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const counts = await prisma.lead.groupBy({
            by: ['stage'], where: { deletedAt: null, createdAt: { gte: from, lte: to } }, _count: { _all: true },
        });
        const map: Record<string, number> = {};
        for (const c of counts) map[c.stage] = c._count._all;
        const order = ['new', 'contacted', 'meeting', 'won', 'lost'];
        let prev: number | null = null;
        const result = order.map(stage => {
            const count = map[stage] || 0;
            const dropOffPct = prev !== null && prev > 0 ? Math.round((1 - count / prev) * 1000) / 10 : null;
            if (stage !== 'lost') prev = count; // "lost" alohida oqim, voronka bosqichi emas
            return { stage, count, dropOffPct };
        });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/velocity ───────────────────────────────────────────────
router.get('/velocity', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const leads = await prisma.lead.findMany({
            where: { deletedAt: null, createdAt: { gte: from, lte: to } },
            select: { createdAt: true, stageChangedAt: true, convertedAt: true, stage: true },
        });
        const toContacted = leads.filter(l => l.stage !== 'new' && l.stageChangedAt).map(l => (l.stageChangedAt!.getTime() - l.createdAt.getTime()) / 86400000);
        const toWon = leads.filter(l => l.convertedAt).map(l => (l.convertedAt!.getTime() - l.createdAt.getTime()) / 86400000);

        const median = (arr: number[]) => {
            if (arr.length === 0) return null;
            const s = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(s.length / 2);
            return Math.round((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) * 10) / 10;
        };
        const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null;

        res.json({
            avgDaysNewToContacted: avg(toContacted), medianDaysNewToContacted: median(toContacted),
            avgDaysNewToWon: avg(toWon), medianDaysNewToWon: median(toWon),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/managers — reyting ─────────────────────────────────────
router.get('/managers', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const managers = await prisma.user.findMany({
            where: { role: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
            select: { id: true, name: true },
        });

        const result = await Promise.all(managers.map(async (m) => {
            const [assigned, contacted, won, lost, open, overdueFollowUps, slaBreaches, frm] = await Promise.all([
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, createdAt: { gte: from, lte: to } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, firstResponseAt: { not: null }, createdAt: { gte: from, lte: to } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, studentId: { not: null }, createdAt: { gte: from, lte: to } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, stage: 'lost', createdAt: { gte: from, lte: to } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, stage: { in: OPEN_STAGES } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, nextFollowUpAt: { lt: new Date() } } }),
                prisma.lead.count({ where: { assignedToId: m.id, deletedAt: null, slaBreachedAt: { not: null }, createdAt: { gte: from, lte: to } } }),
                prisma.lead.aggregate({ where: { assignedToId: m.id, deletedAt: null, firstResponseMinutes: { not: null }, createdAt: { gte: from, lte: to } }, _avg: { firstResponseMinutes: true } }),
            ]);
            const wonLeads = await prisma.lead.findMany({ where: { assignedToId: m.id, deletedAt: null, studentId: { not: null }, createdAt: { gte: from, lte: to } }, select: { studentId: true } });
            const studentIds = wonLeads.map(l => l.studentId).filter(Boolean) as string[];
            const revenueAgg = studentIds.length
                ? await prisma.payment.aggregate({ where: { studentId: { in: studentIds }, status: 'paid', deletedAt: null }, _sum: { amount: true } })
                : { _sum: { amount: 0 } };

            return {
                userId: m.id, name: m.name,
                assigned, contacted, won, lost, open,
                conversionRate: assigned ? Math.round((won / assigned) * 1000) / 10 : 0,
                avgFirstResponseMin: frm._avg.firstResponseMinutes ? Math.round(frm._avg.firstResponseMinutes) : null,
                slaBreaches, overdueFollowUps,
                revenue: revenueAgg._sum.amount || 0,
            };
        }));

        result.sort((a, b) => b.won - a.won);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/lost-reasons ───────────────────────────────────────────
router.get('/lost-reasons', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const lost = await prisma.lead.findMany({
            where: { deletedAt: null, stage: 'lost', lostAt: { gte: from, lte: to } },
            select: { lostReason: true, source: true },
        });
        const total = lost.length;
        const byReason = new Map<string, number>();
        for (const l of lost) {
            const r = l.lostReason || "Sabab ko'rsatilmagan";
            byReason.set(r, (byReason.get(r) || 0) + 1);
        }
        const result = Array.from(byReason.entries())
            .map(([reason, count]) => ({ reason, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }))
            .sort((a, b) => b.count - a.count);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/marketing/timeseries?granularity=day|week|month ─────────────────
router.get('/timeseries', async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const granularity = (req.query.granularity as string) || 'day';
        const [leads, wonLeads, campaigns] = await Promise.all([
            prisma.lead.findMany({ where: { deletedAt: null, createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
            prisma.lead.findMany({ where: { deletedAt: null, convertedAt: { gte: from, lte: to } }, select: { convertedAt: true } }),
            prisma.campaign.findMany({ select: { spent: true, startDate: true, endDate: true } }),
        ]);

        const bucketKey = (d: Date) => {
            if (granularity === 'month') return d.toISOString().slice(0, 7);
            if (granularity === 'week') {
                const onejan = new Date(d.getFullYear(), 0, 1);
                const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
                return `${d.getFullYear()}-W${week}`;
            }
            return d.toISOString().slice(0, 10);
        };

        const buckets = new Map<string, { leads: number; won: number; spend: number }>();
        for (const l of leads) {
            const k = bucketKey(l.createdAt);
            if (!buckets.has(k)) buckets.set(k, { leads: 0, won: 0, spend: 0 });
            buckets.get(k)!.leads++;
        }
        for (const l of wonLeads) {
            const k = bucketKey(new Date(l.convertedAt!));
            if (!buckets.has(k)) buckets.set(k, { leads: 0, won: 0, spend: 0 });
            buckets.get(k)!.won++;
        }
        // Xarajat — kampaniya davomiyligiga qarab kunlarga taxminan bo'lib tarqatiladi.
        for (const c of campaigns) {
            if (!c.startDate) continue;
            const start = new Date(c.startDate);
            const end = c.endDate ? new Date(c.endDate) : to;
            const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
            const perDay = c.spent / days;
            for (let d = new Date(Math.max(start.getTime(), from.getTime())); d <= end && d <= to; d.setDate(d.getDate() + 1)) {
                const k = bucketKey(d);
                if (!buckets.has(k)) buckets.set(k, { leads: 0, won: 0, spend: 0 });
                buckets.get(k)!.spend += perDay;
            }
        }

        const result = Array.from(buckets.entries())
            .map(([date, v]) => ({ date, leads: v.leads, won: v.won, spend: Math.round(v.spend) }))
            .sort((a, b) => a.date.localeCompare(b.date));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
