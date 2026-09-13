/**
 * server/routes/finance.ts
 * Invoice, Expense, Budget CRUD endpoints
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';
import { getBillingSettings, calculateStudentMonthlyDue, calculateTeacherMonthlyRevenue } from '../services/billing.js';

const router = express.Router();

// ─── OYLIK TO'LOV HISOB-KITOBI (davomat asosida) ──────────────────────────────

// GET /api/finance/billing-settings
router.get('/billing-settings', requireAuth, requirePermission('finance'), async (_req, res) => {
    try {
        res.json(await getBillingSettings());
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/finance/billing-settings — faqat ADMIN
router.put('/billing-settings', requireAuth, requireMinRole('ADMIN'), requirePermission('finance'), async (req, res) => {
    try {
        const { lessonsPerMonth, absenceThreshold, teacherSalaryPercent } = req.body as Record<string, number>;
        const updates: Array<{ key: string; value: string }> = [];
        if (lessonsPerMonth !== undefined) updates.push({ key: 'monthly_lessons_count', value: String(lessonsPerMonth) });
        if (absenceThreshold !== undefined) updates.push({ key: 'absence_discount_threshold', value: String(absenceThreshold) });
        if (teacherSalaryPercent !== undefined) updates.push({ key: 'teacher_salary_percent', value: String(teacherSalaryPercent) });

        for (const u of updates) {
            await prisma.setting.upsert({ where: { key: u.key }, update: { value: u.value }, create: u });
        }
        res.json(await getBillingSettings());
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/monthly-due/:studentId?year=&month=
router.get('/monthly-due/:studentId', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const due = await calculateStudentMonthlyDue(req.params.studentId, year, month);
        res.json(due);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-monthly-revenue/:teacherId?year=&month=
// O'qituvchining shu oydagi HAQIQIY (davomat chegirmasidan keyingi) daromadi va
// shundan hisoblangan oyligi — naiv "narx * o'quvchilar soni" o'rniga.
router.get('/teacher-monthly-revenue/:teacherId', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();
        const month = Number(req.query.month) || now.getMonth() + 1;
        const result = await calculateTeacherMonthlyRevenue(req.params.teacherId, year, month);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── INVOICE ──────────────────────────────────────────────────────────────────

// GET /api/finance/invoices
router.get('/invoices', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const { status, studentId, from, to } = req.query as Record<string, string>;
        const where: any = {};
        if (status) where.status = status;
        if (studentId) where.studentId = studentId;
        if (from || to) where.dueDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                student: { select: { id: true, name: true, phone: true, group: true } },
                items: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(invoices);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/finance/invoices/:id
router.get('/invoices/:id', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.id },
            include: { student: true, items: true },
        });
        if (!invoice) return res.status(404).json({ error: 'Invoice topilmadi' });
        res.json(invoice);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/finance/invoices
router.post('/invoices', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { studentId, amount, discount, tax, dueDate, method, description, items } = req.body;
        if (!studentId || !amount || !dueDate) {
            return res.status(400).json({ error: 'studentId, amount va dueDate majburiy' });
        }

        // Generate invoice number: INV-YYYY-NNNN
        const count = await prisma.invoice.count();
        const year = todayDateStr().slice(0, 4);
        const number = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

        const invoice = await prisma.invoice.create({
            data: {
                number,
                studentId,
                amount: Number(amount),
                discount: Number(discount || 0),
                tax: Number(tax || 0),
                dueDate,
                method,
                description,
                items: items?.length ? {
                    create: items.map((item: any) => ({
                        name: item.name,
                        quantity: item.quantity || 1,
                        price: Number(item.price),
                    })),
                } : undefined,
            },
            include: { student: true, items: true },
        });
        res.status(201).json(invoice);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/finance/invoices/:id
router.patch('/invoices/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { status, paidAt, method } = req.body;

        if (status === 'paid') {
            // To'lov belgilash atomar va idempotent bo'lishi kerak — ikki marta
            // bosish, tarmoq retry yoki parallel so'rov pulni/balansni ikki marta
            // hisoblab qo'ymasligi uchun: (1) invoice.status'ni faqat "hali
            // to'lanmagan" bo'lsa yangilaymiz (WHERE shartida, poyga holatisiz —
            // updateMany + count orqali), (2) Payment/Transaction/balans
            // yangilanishi FAQAT shu yangilanish haqiqatan sodir bo'lganda va
            // bittа $transaction ichida bajariladi.
            const todayStr = todayDateStr();
            const paidAtDate = paidAt ? new Date(paidAt) : new Date();

            const result = await prisma.$transaction(async (tx) => {
                const { count } = await tx.invoice.updateMany({
                    where: { id: req.params.id, status: { not: 'paid' } },
                    data: { status: 'paid', paidAt: paidAtDate, ...(method !== undefined ? { method } : {}) },
                });

                const invoice = await tx.invoice.findUnique({
                    where: { id: req.params.id },
                    include: { student: true, items: true },
                });
                if (!invoice || count === 0) return { invoice, applied: false };

                await tx.payment.create({
                    data: {
                        studentId: invoice.studentId,
                        amount: invoice.amount,
                        method: invoice.method || 'Naqd',
                        date: todayStr,
                        status: 'paid',
                        notes: `Invoice ${invoice.number} to'landi`,
                    },
                });
                await tx.transaction.create({
                    data: {
                        type: 'income',
                        amount: invoice.amount,
                        category: "Kurs to'lovi",
                        description: `Invoice ${invoice.number} to'lovi`,
                        date: todayStr,
                        method: invoice.method || 'Naqd',
                        studentId: invoice.studentId,
                        studentName: invoice.student.name,
                    },
                });
                await tx.student.update({
                    where: { id: invoice.studentId },
                    data: { balance: { increment: invoice.amount }, paymentStatus: 'Tolov qilingan' },
                });

                return { invoice, applied: true };
            });

            if (!result.invoice) return res.status(404).json({ error: 'Invoice topilmadi' });
            return res.json(result.invoice);
        }

        const data: any = {};
        if (status !== undefined) data.status = status;
        if (method !== undefined) data.method = method;
        const invoice = await prisma.invoice.update({
            where: { id: req.params.id },
            data,
            include: { student: true, items: true },
        });
        res.json(invoice);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/finance/invoices/:id
router.delete('/invoices/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        await prisma.invoice.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/finance/invoices/:id/payment-links?amount=
router.get('/invoices/:id/payment-links', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: req.params.id },
            include: { student: true },
        });
        if (!invoice) return res.status(404).json({ error: 'Invoice topilmadi' });

        const amount = Number(req.query.amount) || invoice.amount;
        const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || '';
        const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
        const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';

        const paymePayload = `m=${PAYME_MERCHANT_ID};ac.student_id=${invoice.studentId};a=${Math.round(amount * 100)}`;
        const paymeLink = `https://checkout.paycom.uz/${Buffer.from(paymePayload).toString('base64')}`;
        const clickLink = `https://my.click.uz/services/pay?service_id=${CLICK_SERVICE_ID}&merchant_id=${CLICK_MERCHANT_ID}&amount=${amount}&transaction_param=${invoice.studentId}`;

        res.json({ payme: paymeLink, click: clickLink, amount });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── EXPENSE ──────────────────────────────────────────────────────────────────

// GET /api/finance/expenses
router.get('/expenses', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const { category, from, to } = req.query as Record<string, string>;
        const where: any = {};
        if (category) where.category = category;
        if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

        const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
        res.json(expenses);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/finance/expenses
router.post('/expenses', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { category, amount, description, date, receipt } = req.body;
        if (!category || !amount || !date) {
            return res.status(400).json({ error: 'category, amount va date majburiy' });
        }
        const expense = await prisma.expense.create({
            data: { category, amount: Number(amount), description: description || '', date, receipt },
        });

        // Also create a transaction record for consistency
        await prisma.transaction.create({
            data: {
                type: 'expense', amount: Number(amount),
                category, description: description || category,
                date, method: 'Naqd',
            },
        });

        res.status(201).json(expense);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/finance/expenses/:id
router.patch('/expenses/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { category, amount, description, date, receipt } = req.body;
        const data: any = {};
        if (category !== undefined) data.category = category;
        if (amount !== undefined) data.amount = Number(amount);
        if (description !== undefined) data.description = description;
        if (date !== undefined) data.date = date;
        if (receipt !== undefined) data.receipt = receipt;

        const expense = await prisma.expense.update({ where: { id: req.params.id }, data });
        res.json(expense);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/finance/expenses/:id
router.delete('/expenses/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        await prisma.expense.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BUDGET ───────────────────────────────────────────────────────────────────

// GET /api/finance/budget?month=&year=
router.get('/budget', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);
        const budgets = await prisma.budget.findMany({ where: { year, month } });
        res.json({ year, month, budgets });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/finance/budget
router.post('/budget', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { month, year, category, planned } = req.body;
        if (!month || !year || !category || planned === undefined) {
            return res.status(400).json({ error: 'month, year, category va planned majburiy' });
        }
        const budget = await prisma.budget.upsert({
            where: { month_year_category: { month: Number(month), year: Number(year), category } },
            update: { planned: Number(planned) },
            create: { month: Number(month), year: Number(year), category, planned: Number(planned) },
        });
        res.json(budget);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
