/**
 * IP-12 — kurs to'lovi kvitansiyalari va taqsimot (/api/receipts). Qoidalar:
 * server/services/receipts.ts. Pul komandalari Idempotency-Key bilan himoyalangan.
 * IP-17 — kvitansiyani bekor qilish (void) va pul qaytarish (refund):
 * server/services/moneyReversal.ts.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { idempotent } from '../middleware/idempotency.js';
import { ReceiptError, AllocationError, createReceipt, allocatePayment, reverseAllocation, suggestAllocation } from '../services/receipts.js';
import { studentPosition } from '../services/receivables.js';
import { ReversalError, voidReceipt, createRefund, voidRefund, refundAvailability, refundMinRole } from '../services/moneyReversal.js';

const router = express.Router();
const canView = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];
const canWrite = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];

const actor = (req: any) => ({ id: req.user?.id as string | undefined, name: (req.user?.name || req.user?.phone || 'tizim') as string, role: req.user?.role as string | undefined });
function sendError(res: express.Response, err: any) {
    if (err instanceof ReceiptError || err instanceof AllocationError || err instanceof ReversalError) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error('[receipts]', err);
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}

// POST /api/receipts — { studentId, amount, method, date, note, groupId?, allocations?: [{chargeId, amount}], auto? }
router.post('/', ...canWrite, idempotent('receipt'), async (req, res) => {
    try {
        const a = actor(req);
        const r = await createReceipt(req.body || {}, a);
        await logAudit({ userId: a.id, userName: a.name, action: 'receipt_create', resource: 'payment', resourceId: r.payment.id, after: { receiptNo: r.payment.receiptNo, amount: r.payment.amount, allocations: r.allocations.map(x => ({ chargeId: x.chargeId, amount: x.amount })), mode: r.allocationMode } });
        res.status(201).json(r);
    } catch (err) { sendError(res, err); }
});

// GET /api/receipts?studentId= — to'lovlar va taqsimotlari
router.get('/', ...canView, async (req, res) => {
    try {
        const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
        if (!studentId) return res.status(400).json({ message: 'studentId kerak' });
        const payments = await prisma.payment.findMany({
            where: { studentId, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            include: { allocations: { include: { charge: { select: { month: true, groupId: true, type: true } } } } },
        });
        res.json(payments);
    } catch (err) { sendError(res, err); }
});

// GET /api/receipts/suggest?studentId=&amount=&groupId= — FIFO taklif (yozmaydi)
router.get('/suggest', ...canView, async (req, res) => {
    try {
        const { studentId, amount, groupId } = req.query as Record<string, string | undefined>;
        if (!studentId) return res.status(400).json({ message: 'studentId kerak' });
        res.json(await suggestAllocation(studentId, Number(amount) || 0, groupId || null));
    } catch (err) { sendError(res, err); }
});

// GET /api/receipts/position/:studentId — qarz, avans, balans (yagona formula)
router.get('/position/:studentId', ...canView, async (req, res) => {
    try { res.json(await studentPosition(prisma, req.params.studentId)); } catch (err) { sendError(res, err); }
});

// ─── IP-17: qaytarish (refund) va bekor qilish ───────────────────────────────

// GET /api/receipts/refundable/:studentId — qaytarish mumkin bo'lgan avans va talab qilinadigan rol
router.get('/refundable/:studentId', ...canView, async (req, res) => {
    try {
        const r = await refundAvailability(prisma, req.params.studentId);
        res.json({ ...r, minRole: await refundMinRole() });
    } catch (err) { sendError(res, err); }
});

// GET /api/receipts/refunds?studentId=
router.get('/refunds', ...canView, async (req, res) => {
    try {
        const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
        if (!studentId) return res.status(400).json({ message: 'studentId kerak' });
        res.json(await prisma.refund.findMany({ where: { studentId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }));
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/refunds — { studentId, amount, method, date?, reason, paymentId? } (OQ-07: faqat avansdan)
router.post('/refunds', ...canWrite, idempotent('refund'), async (req, res) => {
    try {
        const a = actor(req);
        const r = await createRefund(req.body || {}, a);
        await logAudit({ userId: a.id, userName: a.name, action: 'refund_create', resource: 'refund', resourceId: r.refunds[0]?.id, after: { studentId: req.body?.studentId, amount: req.body?.amount, method: req.body?.method, reason: req.body?.reason, pieces: r.refunds.map(x => ({ paymentId: x.paymentId, amount: x.amount })), transactionId: r.transaction.id, flaggedPayrolls: r.flaggedPayrolls } });
        res.status(201).json(r);
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/refunds/:id/void — { reason } (xato yozilgan qaytarish)
router.post('/refunds/:id/void', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await voidRefund(req.params.id, req.body?.reason, a);
        await logAudit({ userId: a.id, userName: a.name, action: 'refund_void', resource: 'refund', resourceId: req.params.id, after: { reason: req.body?.reason, voided: r.voided, amount: r.amount } });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/:paymentId/refund — { amount, method, date?, reason } (H.5: aniq kvitansiya avansidan)
router.post('/:paymentId/refund', ...canWrite, idempotent('refund'), async (req, res) => {
    try {
        const a = actor(req);
        const payment = await prisma.payment.findUnique({ where: { id: req.params.paymentId }, select: { studentId: true } });
        if (!payment) return res.status(404).json({ message: "To'lov topilmadi" });
        const r = await createRefund({ ...(req.body || {}), studentId: payment.studentId, paymentId: req.params.paymentId }, a);
        await logAudit({ userId: a.id, userName: a.name, action: 'refund_create', resource: 'refund', resourceId: r.refunds[0]?.id, after: { paymentId: req.params.paymentId, amount: req.body?.amount, reason: req.body?.reason, transactionId: r.transaction.id } });
        res.status(201).json(r);
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/:paymentId/void — { reason } (H.4: shu kuni — moliya menejeri; keyin — ADMIN+)
router.post('/:paymentId/void', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await voidReceipt(req.params.paymentId, req.body?.reason, a);
        await logAudit({ userId: a.id, userName: a.name, action: 'receipt_void', resource: 'payment', resourceId: req.params.paymentId, after: { reason: req.body?.reason, receiptNo: r.receiptNo, amount: r.amount, releasedAllocations: r.releasedAllocations, flaggedPayrolls: r.flaggedPayrolls } });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/:paymentId/allocate — { allocations? | auto, groupId? }
router.post('/:paymentId/allocate', ...canWrite, idempotent('receipt_allocate'), async (req, res) => {
    try {
        const a = actor(req);
        const r = await allocatePayment(req.params.paymentId, req.body || {}, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'receipt_allocate', resource: 'payment', resourceId: req.params.paymentId, after: r.allocations.map(x => ({ chargeId: x.chargeId, amount: x.amount })) });
        res.status(201).json(r);
    } catch (err) { sendError(res, err); }
});

// POST /api/receipts/allocations/:id/reverse — { reason }
router.post('/allocations/:id/reverse', ...canWrite, async (req, res) => {
    try {
        const a = actor(req);
        const r = await reverseAllocation(req.params.id, req.body?.reason, a.id);
        await logAudit({ userId: a.id, userName: a.name, action: 'allocation_reverse', resource: 'paymentAllocation', resourceId: r.id, after: r });
        res.json(r);
    } catch (err) { sendError(res, err); }
});

export default router;
