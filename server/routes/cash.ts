/**
 * IP-22 — "Kassa va hisoblar": hisoblar ro'yxati va qoldiqlar, kunni yopish, ichki o'tkazma,
 * oylik solishtirish va kassa daftari. Mantiq: server/services/cashAccounts.ts.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { todayDateStr } from '../utils/timezone.js';
import { isValidDate } from '../domain/lessonCalendar.js';
import {
    CashError, ACCOUNT_TYPES, accountsOverview, getAccounts, dayPreview, closeDay, reopenDay,
    createTransfer, voidTransfer, monthlyReport, cashBook,
} from '../services/cashAccounts.js';

const router = express.Router();
router.use(requireAuth, requirePermission('finance'));

const actor = (req: any) => ({ id: req.user?.id, name: req.user?.name, role: req.user?.role });
function fail(res: express.Response, err: any) {
    if (err instanceof CashError) return res.status(err.status).json({ error: err.message, message: err.message, code: err.code });
    console.error('[cash]', err);
    return res.status(500).json({ error: err.message });
}

// GET /api/cash/accounts — hisoblar, bugungi qoldiq va harakat, oxirgi yopilgan kun
router.get('/accounts', async (_req, res) => {
    try { res.json(await accountsOverview(prisma)); } catch (e) { fail(res, e); }
});

// Hisob maydonlari (ADMIN)
function accountData(body: any, partial: boolean) {
    const data: any = {};
    if (!partial || body.name !== undefined) {
        const name = String(body.name ?? '').trim();
        if (name.length < 2) throw new CashError(400, 'Hisob nomini yozing', 'BAD_NAME');
        data.name = name.slice(0, 80);
    }
    if (!partial || body.type !== undefined) {
        if (!(ACCOUNT_TYPES as readonly string[]).includes(body.type)) throw new CashError(400, "Tur: naqd, karta, bank yoki onlayn", 'BAD_TYPE');
        data.type = body.type;
    }
    if (!partial || body.method !== undefined) {
        const method = String(body.method ?? '').trim();
        if (!method) throw new CashError(400, "To'lov usuli yorlig'ini yozing (masalan: Naqd)", 'BAD_METHOD');
        data.method = method.slice(0, 40);
    }
    if (body.openingBalance !== undefined) {
        const v = Number(body.openingBalance);
        if (!Number.isFinite(v) || Math.abs(v) > 1e11) throw new CashError(400, "Boshlang'ich qoldiq son bo'lishi kerak", 'BAD_OPENING');
        data.openingBalance = Math.round(v);
    }
    if (body.openingDate !== undefined) {
        if (body.openingDate && !isValidDate(String(body.openingDate))) throw new CashError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
        if (body.openingDate && String(body.openingDate) > todayDateStr()) throw new CashError(400, "Boshlang'ich sana kelajakda bo'lmasin", 'FUTURE');
        data.openingDate = body.openingDate || null;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.sortOrder !== undefined && Number.isInteger(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);
    return data;
}

// POST /api/cash/accounts (ADMIN)
router.post('/accounts', requireMinRole('ADMIN'), async (req: any, res) => {
    try {
        await getAccounts(prisma);
        const data = accountData(req.body || {}, false);
        const created = await prisma.cashAccount.create({ data });
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'create', resource: 'cash_account', resourceId: created.id, after: data });
        res.status(201).json(created);
    } catch (e) { fail(res, e); }
});

// PUT /api/cash/accounts/:id (ADMIN) — yopilgan kunlari bor hisobda boshlang'ich qoldiq o'zgarmaydi
router.put('/accounts/:id', requireMinRole('ADMIN'), async (req: any, res) => {
    try {
        const cur = await prisma.cashAccount.findUnique({ where: { id: req.params.id } });
        if (!cur) return res.status(404).json({ error: 'Hisob topilmadi' });
        const data = accountData(req.body || {}, true);
        const openingChanged = (data.openingBalance !== undefined && data.openingBalance !== cur.openingBalance)
            || (data.openingDate !== undefined && data.openingDate !== cur.openingDate);
        if (openingChanged && await prisma.cashSession.count({ where: { accountId: cur.id, status: 'closed' } })) {
            return res.status(409).json({ error: "Bu hisobda yopilgan kunlar bor — boshlang'ich qoldiqni o'zgartirish ularni buzadi. Avval kunlarni qayta oching", code: 'HAS_SESSIONS' });
        }
        const updated = await prisma.cashAccount.update({ where: { id: cur.id }, data });
        await logAudit({
            userId: req.user?.id, userName: req.user?.name || 'system', action: 'update', resource: 'cash_account', resourceId: cur.id,
            before: { name: cur.name, type: cur.type, method: cur.method, openingBalance: cur.openingBalance, openingDate: cur.openingDate, isActive: cur.isActive }, after: data,
        });
        res.json(updated);
    } catch (e) { fail(res, e); }
});

// GET /api/cash/day?accountId&date — kunni yopishdan oldingi ko'rinish
router.get('/day', async (req, res) => {
    try {
        const { accountId, date } = req.query as Record<string, string>;
        if (!accountId) return res.status(400).json({ error: 'accountId kerak' });
        res.json(await dayPreview(prisma, accountId, date || todayDateStr()));
    } catch (e) { fail(res, e); }
});

// POST /api/cash/close — { accountId, date, counted, note } (MANAGER+)
router.post('/close', requireMinRole('MANAGER'), async (req: any, res) => {
    try {
        const s = await closeDay(req.body || {}, actor(req));
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'cash_close', resource: 'cash_session', resourceId: s.id, after: { accountId: s.accountId, date: s.date, expected: s.expected, counted: s.counted, difference: s.difference, note: s.note } });
        res.json(s);
    } catch (e) { fail(res, e); }
});

// POST /api/cash/sessions/:id/reopen — { reason } (ADMIN)
router.post('/sessions/:id/reopen', requireMinRole('ADMIN'), async (req: any, res) => {
    try {
        const s = await reopenDay(req.params.id, req.body?.reason, actor(req));
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'cash_reopen', resource: 'cash_session', resourceId: req.params.id, after: { reason: req.body?.reason, date: s?.date, accountId: s?.accountId } });
        res.json(s);
    } catch (e) { fail(res, e); }
});

// GET /api/cash/sessions?accountId&month — yopilgan kunlar tarixi
router.get('/sessions', async (req, res) => {
    try {
        const { accountId, month } = req.query as Record<string, string>;
        const where: any = {};
        if (accountId) where.accountId = accountId;
        if (month) where.date = { startsWith: month };
        res.json(await prisma.cashSession.findMany({ where, orderBy: [{ date: 'desc' }, { closedAt: 'desc' }], take: 200 }));
    } catch (e) { fail(res, e); }
});

// GET /api/cash/transfers?month
router.get('/transfers', async (req, res) => {
    try {
        const month = String(req.query.month || todayDateStr().slice(0, 7));
        res.json(await prisma.cashTransfer.findMany({ where: { date: { startsWith: month } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }));
    } catch (e) { fail(res, e); }
});

// POST /api/cash/transfers — { fromAccountId, toAccountId, amount, fee?, date?, note? } (MANAGER+)
router.post('/transfers', requireMinRole('MANAGER'), async (req: any, res) => {
    try {
        const t = await createTransfer(req.body || {}, actor(req));
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'create', resource: 'cash_transfer', resourceId: t.id, after: { from: t.fromAccountId, to: t.toAccountId, amount: t.amount, fee: t.fee, date: t.date } });
        res.status(201).json(t);
    } catch (e) { fail(res, e); }
});

// POST /api/cash/transfers/:id/void — { reason } (MANAGER+)
router.post('/transfers/:id/void', requireMinRole('MANAGER'), async (req: any, res) => {
    try {
        const t = await voidTransfer(req.params.id, req.body?.reason, actor(req));
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'void', resource: 'cash_transfer', resourceId: req.params.id, after: { reason: req.body?.reason } });
        res.json(t);
    } catch (e) { fail(res, e); }
});

// GET /api/cash/report?month — oylik solishtirish
router.get('/report', async (req, res) => {
    try { res.json(await monthlyReport(prisma, String(req.query.month || todayDateStr().slice(0, 7)))); } catch (e) { fail(res, e); }
});

// GET /api/cash/accounts/:id/book?month — kassa daftari (kunma-kun)
router.get('/accounts/:id/book', async (req, res) => {
    try { res.json(await cashBook(prisma, req.params.id, String(req.query.month || todayDateStr().slice(0, 7)))); } catch (e) { fail(res, e); }
});

export default router;
