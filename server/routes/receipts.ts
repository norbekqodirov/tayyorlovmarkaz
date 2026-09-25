/**
 * IP-12 — kurs to'lovi kvitansiyalari va taqsimot (/api/receipts). Qoidalar:
 * server/services/receipts.ts. Pul komandalari Idempotency-Key bilan himoyalangan.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { idempotent } from '../middleware/idempotency.js';
import { ReceiptError, createReceipt, allocatePayment, reverseAllocation, suggestAllocation } from '../services/receipts.js';
import { studentPosition } from '../services/receivables.js';

const router = express.Router();
const canView = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];
const canWrite = [requireAuth, requireMinRole('MANAGER'), requirePermission('finance')];

const actor = (req: any) => ({ id: req.user?.id as string | undefined, name: (req.user?.name || req.user?.phone || 'tizim') as string });
function sendError(res: express.Response, err: any) {
    if (err instanceof ReceiptError) return res.status(err.status).json({ message: err.message, code: err.code });
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
