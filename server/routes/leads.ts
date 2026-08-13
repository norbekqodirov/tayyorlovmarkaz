/**
 * Lidlar uchun maxsus router — server/routes/crud.ts dagi generic /api/:collection
 * o'rniga. Sabab: lid yozuvlarida yon ta'sirlar kerak (biriktirish, SLA vaqt-
 * belgilari, avtomatik ball, bosqich o'zgarishi logi, socket, bildirishnoma) —
 * generic CRUD'da bunga ilmoq yo'q edi.
 *
 * server/index.ts'da bu router crud.ts'dan OLDIN mount qilinadi, shuning uchun
 * /api/leads* so'rovlari bu yerda to'liq qayta ishlanadi va crud.ts'ga umuman
 * yetib bormaydi.
 *
 * Orqaga moslik: GET /api/leads har doim {data,total,page,limit,stageCounts}
 * qaytaradi. src/hooks/useFirestore.ts allaqachon res.data?.data ni ochadi —
 * page/limit berilmasa hammasi qaytariladi (eski xatti-harakat saqlanadi),
 * shuning uchun CrmBI/CrmDashboard/GlobalSearch/CrmPredictions o'zgarishsiz
 * ishlayveradi.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { withAudit } from '../middleware/audit.js';
import { createLeadFromIntake, LeadIntakeValidationError } from '../services/leadIntake.js';
import { emitToAdmins, emitToUser } from '../services/realtime.js';
import { OPEN_STAGES } from '../constants/leads.js';

const router = express.Router();

router.use(requireAuth, requireMinRole('MANAGER'));

const LEAD_SELECT = {
    id: true, name: true, phone: true, email: true, stage: true, source: true,
    course: true, courseId: true, score: true, status: true, date: true, notes: true,
    extraField: true, createdAt: true, updatedAt: true,
    assignedToId: true, assignedAt: true, firstResponseAt: true, firstResponseMinutes: true,
    slaBreachedAt: true, lastContactAt: true, nextFollowUpAt: true, nextAction: true,
    campaignId: true, formId: true, utmSource: true, utmMedium: true, utmCampaign: true,
    studentId: true, convertedAt: true, lostReason: true, lostAt: true,
    duplicateOfId: true, submitCount: true,
    assignedTo: { select: { id: true, name: true } },
    campaign: { select: { id: true, name: true, platform: true } },
    form: { select: { id: true, title: true } },
    _count: { select: { activities: true } },
} as const;

function parseCsv(v: unknown): string[] | undefined {
    if (typeof v !== 'string' || !v.trim()) return undefined;
    return v.split(',').map(s => s.trim()).filter(Boolean);
}

// ─── GET /api/leads — filtr/qidiruv/sahifalash ─────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const q = (req.query.q as string || '').trim();
        const stage = parseCsv(req.query.stage);
        const status = parseCsv(req.query.status);
        const source = parseCsv(req.query.source);
        const extraField = parseCsv(req.query.extraField);
        const assignedTo = req.query.assignedTo as string | undefined;
        const campaignId = req.query.campaignId as string | undefined;
        const formId = req.query.formId as string | undefined;
        const courseId = req.query.courseId as string | undefined;
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;
        const overdue = req.query.overdue === '1';
        const unresponded = req.query.unresponded === '1';
        const duplicates = req.query.duplicates === '1';
        const trashed = req.query.trashed === '1';
        const sort = (req.query.sort as string) || 'createdAt';
        const dir = (req.query.dir as string) === 'asc' ? 'asc' : 'desc';
        const page = parseInt(req.query.page as string) || 0;
        const limit = parseInt(req.query.limit as string) || 0;

        const where: any = { deletedAt: trashed ? { not: null } : null };
        if (stage) where.stage = { in: stage };
        if (status) where.status = { in: status };
        if (source) where.source = { in: source };
        if (extraField) where.extraField = { in: extraField };
        if (campaignId) where.campaignId = campaignId;
        if (formId) where.formId = formId;
        if (courseId) where.courseId = courseId;
        if (assignedTo === 'me') where.assignedToId = (req as any).user.id;
        else if (assignedTo === 'unassigned') where.assignedToId = null;
        else if (assignedTo) where.assignedToId = assignedTo;
        if (from) where.createdAt = { ...(where.createdAt || {}), gte: new Date(from) };
        if (to) where.createdAt = { ...(where.createdAt || {}), lte: new Date(`${to}T23:59:59`) };
        if (overdue) where.nextFollowUpAt = { lt: new Date() };
        if (unresponded) where.firstResponseAt = null;
        if (duplicates) where.duplicateOfId = { not: null };
        if (q) {
            where.OR = [
                { name: { contains: q } },
                { phone: { contains: q } },
                { course: { contains: q } },
                { searchKey: { contains: q.toLowerCase() } },
            ];
        }

        const validSort = ['createdAt', 'score', 'name', 'nextFollowUpAt', 'lastContactAt'].includes(sort) ? sort : 'createdAt';

        const stageWhere = { ...where };
        delete stageWhere.stage;
        const [total, data, stageCountsRaw] = await Promise.all([
            prisma.lead.count({ where }),
            prisma.lead.findMany({
                where,
                select: LEAD_SELECT,
                orderBy: { [validSort]: dir },
                ...(page > 0 && limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
            }),
            prisma.lead.groupBy({ by: ['stage'], where: stageWhere, _count: { _all: true } }),
        ]);

        const stageCounts: Record<string, number> = {};
        for (const row of stageCountsRaw) stageCounts[row.stage] = row._count._all;

        res.json({ data, total, page: page || 1, limit: limit || total, stageCounts });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET/PUT /api/leads/settings — avtomatik taqsimlash/SLA sozlamalari ────────
// leadIntake.ts (pickAssignee) va scheduler.ts (Faza 7, lead_sla_breach) shu
// aynan shu Setting kalitlarni o'qiydi — bu yerda faqat CRM'dan tahrirlash yo'li.
const SETTINGS_KEYS = {
    mode: 'lead_assignment_mode',
    pool: 'lead_assignment_pool',
    slaMinutes: 'lead_sla_minutes',
    workStart: 'work_hours_start',
    workEnd: 'work_hours_end',
} as const;

router.get('/settings', async (_req, res) => {
    try {
        const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(SETTINGS_KEYS) } } });
        const map = new Map(rows.map(r => [r.key, r.value]));
        let pool: string[] = [];
        try { pool = JSON.parse(map.get(SETTINGS_KEYS.pool) || '[]'); } catch { /* noop */ }
        res.json({
            mode: map.get(SETTINGS_KEYS.mode) || 'on',
            pool,
            slaMinutes: Number(map.get(SETTINGS_KEYS.slaMinutes)) || 30,
            workStart: map.get(SETTINGS_KEYS.workStart) || '09:00',
            workEnd: map.get(SETTINGS_KEYS.workEnd) || '19:00',
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/settings', requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { mode, pool, slaMinutes, workStart, workEnd } = req.body as {
            mode?: string; pool?: string[]; slaMinutes?: number; workStart?: string; workEnd?: string;
        };
        const upserts: [string, string][] = [];
        if (mode !== undefined) upserts.push([SETTINGS_KEYS.mode, mode]);
        if (pool !== undefined) upserts.push([SETTINGS_KEYS.pool, JSON.stringify(pool)]);
        if (slaMinutes !== undefined) upserts.push([SETTINGS_KEYS.slaMinutes, String(slaMinutes)]);
        if (workStart !== undefined) upserts.push([SETTINGS_KEYS.workStart, workStart]);
        if (workEnd !== undefined) upserts.push([SETTINGS_KEYS.workEnd, workEnd]);

        await Promise.all(upserts.map(([key, value]) =>
            prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
        ));
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/leads/my/summary — joriy menejer uchun qisqa hisob ──────────────
router.get('/my/summary', async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const [open, overdue, unresponded] = await Promise.all([
            prisma.lead.count({ where: { assignedToId: userId, deletedAt: null, stage: { in: OPEN_STAGES } } }),
            prisma.lead.count({ where: { assignedToId: userId, deletedAt: null, nextFollowUpAt: { lt: new Date() } } }),
            prisma.lead.count({ where: { assignedToId: userId, deletedAt: null, firstResponseAt: null } }),
        ]);
        res.json({ open, overdue, unresponded });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/leads/assignable-users — biriktirish uchun menejerlar ro'yxati ──
// auth.ts'dagi GET /auth/users faqat ADMIN+ uchun ochiq — oddiy MANAGER ham
// lid biriktirishi kerak bo'lgani uchun bu yerda tor, xavfsiz proyeksiya.
router.get('/assignable-users', async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            where: { role: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
            select: { id: true, name: true, role: true },
            orderBy: { name: 'asc' },
        });
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/leads/meta/facets — filtr paneli uchun mavjud manba/qo'shimcha maydon qiymatlari ──
// LeadFilters.tsx'dagi "Manba" filtri avval faqat statik SOURCES ro'yxatini
// (Instagram/Facebook/...) ko'rsatardi — leadIntake.ts endi kampaniyasiz target
// formalar uchun forma sarlavhasini manba sifatida yozgani sabab, haqiqiy
// ma'lumotlardagi manbalar shu statik ro'yxatdan chiqib ketishi mumkin.
// Shu yo'l /:id'dan OLDIN turishi SHART, aks holda Express uni id="meta" deb tushunadi.
router.get('/meta/facets', async (_req, res) => {
    try {
        const [sourceRows, extraRows] = await Promise.all([
            prisma.lead.findMany({
                where: { deletedAt: null, source: { not: null } },
                distinct: ['source'], select: { source: true }, orderBy: { source: 'asc' },
            }),
            prisma.lead.findMany({
                where: { deletedAt: null, extraField: { not: null } },
                distinct: ['extraField'], select: { extraField: true }, orderBy: { extraField: 'asc' },
            }),
        ]);
        res.json({
            sources: sourceRows.map(r => r.source).filter((s): s is string => !!s),
            extraFields: extraRows.map(r => r.extraField).filter((s): s is string => !!s),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/leads/:id — to'liq (faoliyatlar bilan) ───────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const lead = await prisma.lead.findUnique({
            where: { id: req.params.id },
            include: {
                activities: { orderBy: { createdAt: 'desc' } },
                assignedTo: { select: { id: true, name: true } },
                campaign: { select: { id: true, name: true, platform: true } },
                form: { select: { id: true, title: true } },
                student: { select: { id: true, name: true } },
                duplicateOf: { select: { id: true, name: true, stage: true } },
            },
        });
        if (!lead) return res.status(404).json({ message: 'Topilmadi' });
        res.json(lead);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/leads — qo'lda (CRM'dan) yaratish, xuddi shu qabul quvuridan ───
router.post('/', withAudit('lead'), async (req, res) => {
    try {
        const result = await createLeadFromIntake({
            name: req.body.name,
            phone: req.body.phone,
            email: req.body.email,
            course: req.body.course,
            courseId: req.body.courseId,
            notes: req.body.notes,
            extraField: req.body.extraField,
            source: req.body.source,
            campaignId: req.body.campaignId,
        });
        if (!result.ok) return res.status(400).json({ message: 'Yaratib bo\'lmadi' });
        const lead = await prisma.lead.findUnique({ where: { id: result.id }, select: LEAD_SELECT });
        res.status(201).json(lead);
    } catch (err: any) {
        if (err instanceof LeadIntakeValidationError) return res.status(400).json({ message: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/leads/:id — oddiy maydonlarni yangilash ──────────────────────────
const EDITABLE_FIELDS = [
    'name', 'phone', 'email', 'stage', 'source', 'course', 'courseId', 'score', 'status',
    'notes', 'extraField', 'nextFollowUpAt', 'nextAction', 'lostReason',
    'campaignId', 'formId', 'utmSource', 'utmMedium', 'utmCampaign',
];
router.put('/:id', withAudit('lead'), async (req, res) => {
    try {
        const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.deletedAt) return res.status(404).json({ message: 'Topilmadi' });

        const data: any = {};
        for (const f of EDITABLE_FIELDS) {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        }
        if (data.nextFollowUpAt) data.nextFollowUpAt = new Date(data.nextFollowUpAt);

        // Bosqich o'zgarsa — vaqt belgisi va (lost bo'lsa) lostAt qo'yiladi.
        if (data.stage && data.stage !== existing.stage) {
            data.stageChangedAt = new Date();
            if (data.stage === 'lost') data.lostAt = new Date();
            if (data.stage === 'won' && !existing.convertedAt) data.convertedAt = new Date();
        }

        const updated = await prisma.lead.update({ where: { id: req.params.id }, data, select: LEAD_SELECT });
        try { emitToAdmins('lead:updated', { id: updated.id }); } catch { /* jim */ }
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/leads/:id — soft (hard faqat ADMIN, ?hard=1) ─────────────────
router.delete('/:id', withAudit('lead'), async (req, res) => {
    try {
        if (req.query.hard === '1') {
            const requester = (req as any).user;
            const ROLE_LEVEL: Record<string, number> = { TEACHER: 1, MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4 };
            if ((ROLE_LEVEL[requester.role] || 0) < ROLE_LEVEL.ADMIN) {
                return res.status(403).json({ message: "Faqat administrator butunlay o'chira oladi" });
            }
            await prisma.lead.delete({ where: { id: req.params.id } });
            try { emitToAdmins('lead:deleted', { id: req.params.id }); } catch { /* jim */ }
            return res.json({ success: true, hard: true });
        }
        await prisma.lead.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
        try { emitToAdmins('lead:deleted', { id: req.params.id }); } catch { /* jim */ }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/leads/:id/restore ───────────────────────────────────────────────
router.post('/:id/restore', async (req, res) => {
    try {
        const lead = await prisma.lead.update({ where: { id: req.params.id }, data: { deletedAt: null }, select: LEAD_SELECT });
        try { emitToAdmins('lead:updated', { id: lead.id }); } catch { /* jim */ }
        res.json(lead);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/leads/:id/assign — {userId} ─────────────────────────────────────
router.post('/:id/assign', async (req, res) => {
    try {
        const { userId } = req.body as { userId: string | null };
        const lead = await prisma.lead.update({
            where: { id: req.params.id },
            data: { assignedToId: userId || null, assignedAt: userId ? new Date() : null },
            select: LEAD_SELECT,
        });
        try {
            await prisma.leadActivity.create({
                data: {
                    leadId: lead.id, type: 'note', direction: 'in',
                    content: userId ? "Menejerga biriktirildi" : "Biriktirilgan menejer olib tashlandi",
                    date: new Date().toISOString(), userId: (req as any).user.id,
                },
            });
            if (userId) emitToUser(userId, 'lead:assigned', { id: lead.id, name: lead.name, phone: lead.phone, kind: 'reassign' });
            emitToAdmins('lead:updated', { id: lead.id });
        } catch { /* jim o'tkaziladi */ }
        res.json(lead);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/leads/:id/activities — yagona faoliyat yozish yo'li ────────────
// Bitta amalda: faoliyat logi + lastContactAt + (agar birinchi bo'lsa)
// firstResponseAt/firstResponseMinutes + keyingi qadam. Shu orqali "lid bilan
// bog'lanilgan bo'lsa ham sovuq deb belgilanishi" bugi strukturaviy hal bo'ladi
// (nurturing job endi updatedAt emas, lastContactAt'ga qaraydi — Faza 7).
router.post('/:id/activities', async (req, res) => {
    try {
        const { type, content, outcome, direction, durationSec, nextFollowUpAt, nextAction } = req.body as {
            type: string; content: string; outcome?: string; direction?: 'in' | 'out';
            durationSec?: number; nextFollowUpAt?: string; nextAction?: string;
        };
        if (!type || !content?.trim()) return res.status(400).json({ message: "type va content kiritilishi shart" });

        const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
        if (!lead || lead.deletedAt) return res.status(404).json({ message: 'Topilmadi' });

        const user = (req as any).user;
        const now = new Date();

        const activity = await prisma.leadActivity.create({
            data: {
                leadId: lead.id, type, content: content.trim(), outcome, direction: direction || 'out',
                durationSec, date: now.toISOString(), userId: user.id,
            },
        });

        const leadUpdate: any = { lastContactAt: now };
        if (!lead.firstResponseAt && (direction || 'out') === 'out') {
            leadUpdate.firstResponseAt = now;
            leadUpdate.firstResponseMinutes = Math.round((now.getTime() - lead.createdAt.getTime()) / 60000);
        }
        if (nextFollowUpAt) leadUpdate.nextFollowUpAt = new Date(nextFollowUpAt);
        if (nextAction) leadUpdate.nextAction = nextAction;

        // Faoliyat natijasiga qarab ballni yumshoq yangilash.
        let scoreDelta = 0;
        if (outcome === 'answered') scoreDelta = 8;
        else if (outcome === 'interested') scoreDelta = 12;
        else if (outcome === 'not_interested') scoreDelta = -25;
        else if (outcome === 'no_answer') scoreDelta = -5;
        if (scoreDelta !== 0) {
            leadUpdate.score = Math.max(0, Math.min(100, lead.score + scoreDelta));
            leadUpdate.status = leadUpdate.score >= 70 ? 'hot' : leadUpdate.score >= 40 ? 'warm' : 'cold';
        }

        const updated = await prisma.lead.update({ where: { id: lead.id }, data: leadUpdate, select: LEAD_SELECT });
        try { emitToAdmins('lead:updated', { id: updated.id }); } catch { /* jim */ }
        res.status(201).json({ activity, lead: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/leads/:id/convert — {groupId, courseId?} ────────────────────────
// Hozirgi CrmLeads.tsx'dagi 3 ta alohida chaqiruv (o'quvchi yaratish -> guruhga
// yozish -> lidni yangilash) o'rniga BITTA tranzaksiya — o'rtada xato bo'lsa
// yetim o'quvchi/yangilanmagan lid qolmaydi.
router.post('/:id/convert', async (req, res) => {
    try {
        const { groupId } = req.body as { groupId: string };
        if (!groupId) return res.status(400).json({ message: 'groupId kiritilishi shart' });

        const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
        if (!lead || lead.deletedAt) return res.status(404).json({ message: 'Topilmadi' });
        if (lead.stage === 'lost') return res.status(400).json({ message: "Rad etilgan lidni o'quvchiga aylantirib bo'lmaydi" });

        const result = await prisma.$transaction(async (tx) => {
            const student = await tx.student.create({
                data: {
                    name: lead.name, phone: lead.phone, email: lead.email,
                    source: lead.source, course: lead.course, status: 'active',
                    joinedDate: new Date().toISOString(),
                },
            });
            await tx.enrollment.create({ data: { studentId: student.id, groupId } });
            const updatedLead = await tx.lead.update({
                where: { id: lead.id },
                data: { stage: 'won', studentId: student.id, convertedAt: new Date(), stageChangedAt: new Date() },
                select: LEAD_SELECT,
            });
            return { student, lead: updatedLead };
        });

        try { emitToAdmins('lead:updated', { id: result.lead.id }); } catch { /* jim */ }
        res.status(201).json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
