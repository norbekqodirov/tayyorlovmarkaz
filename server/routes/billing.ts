/**
 * IP-11 — o'quvchi hisoblari (/api/billing). Qoidalar: server/services/chargeEngine.ts,
 * docs/ADR_HISOB_QOIDALARI.md. Hamma yozish — MANAGER+ va "finance" ruxsati, audit bilan.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import {
    BillingError, getLedgerMode, setLedgerMode, generateMonth, postMonth, settleMonth, adjustCharge, voidDraft,
    studentAccount, shadowReport,
} from '../services/chargeEngine.js';
import { LedgerModeError } from '../services/ledgerMode.js';
import { syncAllBalances, reconcileBalances } from '../services/balanceCache.js';

const router = express.Router();
const canView = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];
const canWrite = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];

const actor = (req: any) => ({ id: req.user?.id as string | undefined, name: (req.user?.name || req.user?.phone || 'tizim') as string });
function sendError(res: express.Response, err: any) {
    if (err instanceof BillingError || err instanceof LedgerModeError) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('[billing]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}

// ─── Rejim ───────────────────────────────────────────────────────────────────
router.get('/mode', ...canView, async (_req, res) => {
    try { res.json({ mode: await getLedgerMode() }); } catch (err) { sendError(res, err); }
});
router.put('/mode', requireAuth, requireMinRole('ADMIN'), requirePermission('finance'), async (req, res) => {
    try {
        const before = await getLedgerMode();
        const mode = await setLedgerMode(req.body?.mode);
        // IP-14: live'ga o'tishda barcha balanslar formula bo'yicha qayta hisoblanadi
        const synced = mode === 'live' && before !== 'live' ? await syncAllBalances() : 0;
        const a = actor(req);
        await logAudit({ userId: a.id, userName: a.name, action: 'ledger_mode', resource: 'setting', resourceId: 'ledger_mode', before: { mode: before }, after: { mode, synced } });
        res.json({ mode, synced });
    } catch (err) { sendError(res, err); }
});

// ─── Balans keshi solishtiruvi (IP-14, J.5 "qarz farqi") ─────────────────────
router.get('/reconcile', ...canView, async (_req, res) => {
    try { res.json(await reconcileBalances()); } catch (err) { sendError(res, err); }
});
router.post('/reconcile/fix', requireAuth, requireMinRole('ADMIN'), requirePermission('finance'), async (req, res) => {
    try {
        const r = await reconcileBalances({ fix: true });
        const a = actor(req);
        await logAudit({ userId: a.id, userName: a.name, action: 'balance_reconcile', resource: 'student', metadata: { mode: r.mode, differences: r.differences, fixed: r.fixed } });
        res.json({ ...r, rows: r.rows.slice(0, 200) });
    } catch (err) { sendError(res, err); }
});

router.get('/periods', ...canView, async (_req, res) => {
    try { res.json(await prisma.billingPeriod.findMany({ orderBy: { month: 'desc' } })); } catch (err) { sendError(res, err); }
});

// ─── Oy amallari ─────────────────────────────────────────────────────────────
router.post('/:month/generate', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await generateMonth(req.params.month, { groupId: req.body?.groupId, studentId: req.body?.studentId }, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'billing_generate', resource: 'charge', metadata: { month: req.params.month, created: r.created, updated: r.updated, skipped: r.skipped.length } });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

router.post('/:month/post', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await postMonth(req.params.month, { groupId: req.body?.groupId }, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'billing_post', resource: 'charge', metadata: r });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

router.post('/:month/settle', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await settleMonth(req.params.month, { groupId: req.body?.groupId }, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'billing_settle', resource: 'charge', metadata: { month: r.month, targetMonth: r.targetMonth, adjustments: r.adjustments.length } });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

router.get('/:month/charges', ...canView, async (req, res) => {
    try {
        const { groupId, studentId, status } = req.query as Record<string, string | undefined>;
        const rows = await prisma.charge.findMany({
            where: { month: req.params.month, ...(groupId && { groupId }), ...(studentId && { studentId }), ...(status && { status }) },
            orderBy: { createdAt: 'asc' },
            include: { lines: true, student: { select: { id: true, name: true, code: true } } },
        });
        res.json(rows.map(r => ({ ...r, calc: r.calc ? JSON.parse(r.calc) : null })));
    } catch (err) { sendError(res, err); }
});

router.get('/:month/shadow-report', ...canView, async (req, res) => {
    try { res.json(await shadowReport(req.params.month)); } catch (err) { sendError(res, err); }
});

// ─── Bitta hisob ─────────────────────────────────────────────────────────────
router.get('/charges/:id', ...canView, async (req, res) => {
    try {
        const ch = await prisma.charge.findUnique({ where: { id: req.params.id }, include: { lines: true } });
        if (!ch) return res.status(404).json({ message: 'Hisob topilmadi' });
        const adjustments = await prisma.charge.findMany({ where: { reversesChargeId: ch.id }, include: { lines: true }, orderBy: { createdAt: 'asc' } });
        res.json({ ...ch, calc: ch.calc ? JSON.parse(ch.calc) : null, adjustments: adjustments.map(x => ({ ...x, calc: x.calc ? JSON.parse(x.calc) : null })) });
    } catch (err) { sendError(res, err); }
});

router.post('/charges/:id/adjust', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const adj = await adjustCharge(req.params.id, req.body || {}, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'charge_adjust', resource: 'charge', resourceId: adj.id, after: adj });
        res.status(201).json(adj);
    } catch (err) { sendError(res, err); }
});

router.post('/charges/:id/void', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const ch = await voidDraft(req.params.id, req.body?.reason);
        await logAudit({ userId: a.id, userName: a.name, action: 'charge_void', resource: 'charge', resourceId: ch.id, after: { status: ch.status, reason: ch.reason } });
        res.json(ch);
    } catch (err) { sendError(res, err); }
});

// ─── O'quvchi hisobi ─────────────────────────────────────────────────────────
router.get('/students/:id/account', ...canView, async (req, res) => {
    try { res.json(await studentAccount(req.params.id)); } catch (err) { sendError(res, err); }
});

// ─── Takrorlanuvchi chegirmalar (OQ-05) ──────────────────────────────────────
const DISCOUNT_KINDS = ['sibling', 'social', 'promo', 'manual'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get('/discounts', ...canView, async (req, res) => {
    try {
        const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
        res.json(await prisma.studentDiscount.findMany({ where: studentId ? { studentId } : {}, orderBy: { createdAt: 'desc' } }));
    } catch (err) { sendError(res, err); }
});

router.post('/discounts', ...canWrite, requirePermission('discounts'), async (req, res) => {
    try {
        const { studentId, groupId, kind, percent, amount, fromMonth, toMonth, reason } = req.body || {};
        if (!studentId) return res.status(400).json({ message: 'studentId kerak' });
        if (!DISCOUNT_KINDS.includes(kind)) return res.status(400).json({ message: "Chegirma turi: sibling | social | promo | manual" });
        if (!MONTH_RE.test(fromMonth || '') || (toMonth && (!MONTH_RE.test(toMonth) || toMonth < fromMonth))) return res.status(400).json({ message: "Oylar YYYY-MM, tugash boshlanishdan oldin emas" });
        const hasPercent = percent != null && percent !== '';
        const hasAmount = amount != null && amount !== '';
        if (hasPercent === hasAmount) return res.status(400).json({ message: 'Foiz YOKI qat\'iy summadan bittasini kiriting' });
        const percentBp = hasPercent ? Math.round(Number(percent) * 100) : null;
        const amt = hasAmount ? Math.round(Number(amount)) : null;
        if (percentBp != null && (!(percentBp > 0) || percentBp > 10000)) return res.status(400).json({ message: "Foiz 0 dan 100 gacha" });
        if (amt != null && (!(amt > 0) || amt > 1e8)) return res.status(400).json({ message: "Summa musbat bo'lishi kerak" });
        if (!reason || String(reason).trim().length < 3) return res.status(400).json({ message: 'Sababni yozing' });
        const a = actor(req);
        const d = await prisma.studentDiscount.create({
            data: { studentId, groupId: groupId || null, kind, percentBp, amount: amt, fromMonth, toMonth: toMonth || null, reason: String(reason).trim(), createdById: a.id ?? null },
        });
        await logAudit({ userId: a.id, userName: a.name, action: 'student_discount_create', resource: 'studentDiscount', resourceId: d.id, after: d });
        res.status(201).json({ ...d, note: "Draft hisoblar keyingi generatsiyada yangilanadi; e'lon qilinganlar — oy yakuni tuzatmasida" });
    } catch (err) { sendError(res, err); }
});

router.post('/discounts/:id/cancel', ...canWrite, requirePermission('discounts'), async (req, res) => {
    try {
        const a = actor(req);
        const d = await prisma.studentDiscount.update({ where: { id: req.params.id }, data: { status: 'cancelled' } }).catch(() => null);
        if (!d) return res.status(404).json({ message: 'Topilmadi' });
        await logAudit({ userId: a.id, userName: a.name, action: 'student_discount_cancel', resource: 'studentDiscount', resourceId: d.id, after: d });
        res.json(d);
    } catch (err) { sendError(res, err); }
});

export default router;
