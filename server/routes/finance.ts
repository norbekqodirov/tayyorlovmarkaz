/**
 * server/routes/finance.ts
 * Invoice, Expense, Budget CRUD endpoints
 */

import express from 'express';
import prisma from '../db.js';
import { createReceipt, ReceiptError, AllocationError } from '../services/receipts.js';
import { afterExternalPayment } from '../services/balanceCache.js';
import { categoryKind } from '../services/categories.js';
import { idempotent } from '../middleware/idempotency.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';
import { getBillingSettings, calculateStudentMonthlyDue, calculateTeacherMonthlyRevenue } from '../services/billing.js';
import { logAudit } from '../middleware/audit.js';
import { voidTransaction, ReversalError, isMonthClosed } from '../services/moneyReversal.js';

const router = express.Router();

// Finance-audit (2026-09-16), F02 tuzatish: `Invoice.discount` FOIZ sifatida
// saqlanadi (masalan 10 = 10%) va CrmFinance.tsx UI'da yakuniy summani
// `amount * (1 - discount/100) + tax` sifatida hisoblab ko'rsatadi — lekin
// invoice "paid" qilinganda server bu formulani ISHLATMASDI, xom
// `invoice.amount`ni Payment/Transaction/balansga yozardi (600 000 va 10%
// misolida UI 540 000 ko'rsatadi, server 600 000 yozadi). Endi bitta
// funksiya HAR IKKI joyda (paid yozish, payment-link summasi) ishlatiladi —
// gross/discount/tax/net formulasi endi bitta joyda.
export function computeInvoiceNetAmount(invoice: { amount: number; discount: number; tax: number }): number {
    const gross = Number(invoice.amount) || 0;
    const discountPercent = Math.max(0, Number(invoice.discount) || 0);
    const tax = Number(invoice.tax) || 0;
    const afterDiscount = gross * (1 - discountPercent / 100);
    return Math.max(0, Math.round(afterDiscount + tax));
}

// IP-17 (H.4, QT-74): invoice holat mashinasi. `pending` — chiqarilgan (issued).
// `paid` va `cancelled` — yakuniy: bekor qilingan invoice to'lanmaydi va qayta
// ochilmaydi (yangisi yaratiladi), to'langani faqat «Pul qaytarish» (kredit) orqali tuzatiladi.
export const INVOICE_TRANSITIONS: Record<string, string[]> = {
    pending: ['paid', 'overdue', 'cancelled'],
    overdue: ['paid', 'pending', 'cancelled'],
    partially_paid: ['paid'],
    paid: [],
    cancelled: [],
};
const INVOICE_PAYABLE = ['pending', 'overdue', 'partially_paid'];

// ML-11: raqam `count()`dan emas — yil bo'yicha ketma-ketlik (Setting, CAS). Birinchi
// ishlatishda mavjud eng katta raqamdan davom etadi; P2002 bo'lsa keyingisi olinadi.
async function reserveInvoiceNo(year: string): Promise<string> {
    const key = `invoice_seq_${year}`;
    const prefix = `INV-${year}-`;
    for (let i = 0; i < 20; i++) {
        const row = await prisma.setting.findUnique({ where: { key } });
        if (!row) {
            const existing = await prisma.invoice.findMany({ where: { number: { startsWith: prefix } }, select: { number: true } });
            const max = existing.reduce((m, x) => Math.max(m, Number(x.number.slice(prefix.length)) || 0), 0);
            try { await prisma.setting.create({ data: { key, value: String(max) } }); } catch { /* parallel yaratildi */ }
            continue;
        }
        const next = Number(row.value) + 1;
        const r = await prisma.setting.updateMany({ where: { key, value: row.value }, data: { value: String(next) } });
        if (r.count === 1) return `${prefix}${String(next).padStart(4, '0')}`;
    }
    throw new Error("Invoice raqamini band qilib bo'lmadi");
}

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
// RF-12 tuzatish: ilgari hech qanday tekshiruvsiz String(value) sifatida
// saqlanardi — masalan teacherSalaryPercent=500 yoki absenceThreshold=-1
// ham qabul qilinib, billing.ts'da jimgina noto'g'ri natija berardi.
router.put('/billing-settings', requireAuth, requireMinRole('ADMIN'), requirePermission('finance'), async (req, res) => {
    try {
        const { lessonsPerMonth, absenceThreshold, teacherSalaryPercent } = req.body as Record<string, number>;
        const cycleMode = (req.body as any)?.cycleMode as string | undefined;
        if (cycleMode !== undefined && !['calendar', 'group_anniversary'].includes(cycleMode)) {
            return res.status(400).json({ message: "Oy hisoblash usuli: calendar yoki group_anniversary" });
        }

        const isNonNegativeInt = (v: number) => Number.isInteger(v) && v >= 0;

        if (lessonsPerMonth !== undefined && (!isNonNegativeInt(lessonsPerMonth) || lessonsPerMonth === 0)) {
            return res.status(400).json({ message: "Oyiga necha dars — musbat butun son bo'lishi kerak" });
        }
        if (absenceThreshold !== undefined && !isNonNegativeInt(absenceThreshold)) {
            return res.status(400).json({ message: "Chegirma boshlanadigan dars soni — manfiy bo'lmagan butun son bo'lishi kerak" });
        }
        if (teacherSalaryPercent !== undefined && (!isNonNegativeInt(teacherSalaryPercent) || teacherSalaryPercent > 100)) {
            return res.status(400).json({ message: "O'qituvchi stavkasi 0 dan 100 gacha butun son bo'lishi kerak" });
        }

        const updates: Array<{ key: string; value: string }> = [];
        if (lessonsPerMonth !== undefined) updates.push({ key: 'monthly_lessons_count', value: String(lessonsPerMonth) });
        if (absenceThreshold !== undefined) updates.push({ key: 'absence_discount_threshold', value: String(absenceThreshold) });
        if (teacherSalaryPercent !== undefined) updates.push({ key: 'teacher_salary_percent', value: String(teacherSalaryPercent) });
        // Yangi usul hali hisob chiqmagan guruhlarga qo'llanadi (chargeEngine.groupCycleMode)
        if (cycleMode !== undefined) updates.push({ key: 'billing_cycle_mode', value: cycleMode });

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
        // ML-18: standart oy — Toshkent vaqti bo'yicha (server TZ emas).
        const [ty, tm] = todayDateStr().split('-').map(Number);
        const year = Number(req.query.year) || ty;
        const month = Number(req.query.month) || tm;
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
        const [ty, tm] = todayDateStr().split('-').map(Number);
        const year = Number(req.query.year) || ty;
        const month = Number(req.query.month) || tm;
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
        const grossAmount = Number(amount);
        if (!Number.isFinite(grossAmount) || grossAmount <= 0) return res.status(400).json({ error: "Summa musbat son bo'lishi kerak" });
        const discountPct = Number(discount || 0);
        if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) return res.status(400).json({ error: "Chegirma 0–100% oralig'ida bo'lishi kerak" });
        // ML-11: bandlar berilsa — ularning yig'indisi invoice summasiga teng bo'lishi shart
        if (Array.isArray(items) && items.length) {
            const itemsSum = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1) * (Number(it.price) || 0), 0);
            if (Math.round(itemsSum) !== Math.round(grossAmount)) {
                return res.status(400).json({ error: `Bandlar yig'indisi (${Math.round(itemsSum)}) invoice summasiga (${Math.round(grossAmount)}) teng emas` });
            }
        }

        // FIN-03 tuzatish: raqam ilgari bitta count()dan hisoblanardi — ikki
        // parallel so'rov bir xil count'ni o'qib, bir xil raqam (number
        // @unique) yaratishga urinishi mumkin edi. `number` unique bo'lgani
        // uchun ikkinchisi P2002 bilan xato berardi (ma'lumot buzilmaydi,
        // lekin foydalanuvchi uchun tushunarsiz 500 xatosi bilan). Endi
        // to'qnashuvda raqam qayta hisoblab qayta urinilad.
        const year = todayDateStr().slice(0, 4);
        let invoice;
        for (let attempt = 0; attempt < 5; attempt++) {
            const number = await reserveInvoiceNo(year);
            try {
                invoice = await prisma.invoice.create({
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
                break;
            } catch (e: any) {
                const isDuplicateNumber = e.code === 'P2002' && e.meta?.target?.includes?.('number');
                if (!isDuplicateNumber || attempt === 4) throw e;
                // raqam allaqachon band — keyingi urinishda qayta hisoblanadi
            }
        }
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
                // IP-17 (QT-74): faqat to'lanadigan holatdan — bekor qilingan invoice to'lanmaydi
                const { count } = await tx.invoice.updateMany({
                    where: { id: req.params.id, status: { in: INVOICE_PAYABLE } },
                    data: { status: 'paid', paidAt: paidAtDate, ...(method !== undefined ? { method } : {}) },
                });

                const invoice = await tx.invoice.findUnique({
                    where: { id: req.params.id },
                    include: { student: true, items: true },
                });
                if (!invoice || count === 0) return { invoice, applied: false, cancelled: invoice?.status === 'cancelled' };

                const netAmount = computeInvoiceNetAmount(invoice);

                const invPayment = await tx.payment.create({
                    data: {
                        studentId: invoice.studentId,
                        amount: netAmount,
                        method: invoice.method || 'Naqd',
                        date: todayStr,
                        status: 'paid',
                        notes: `Invoice ${invoice.number} to'landi`,
                    },
                });
                await tx.transaction.create({
                    data: {
                        type: 'income',
                        amount: netAmount,
                        category: "Kurs to'lovi",
                        description: `Invoice ${invoice.number} to'lovi`,
                        date: todayStr,
                        method: invoice.method || 'Naqd',
                        studentId: invoice.studentId,
                        studentName: invoice.student.name,
                        sourceType: 'invoice',
                        sourceId: invoice.id,
                    },
                });
                await tx.student.update({
                    where: { id: invoice.studentId },
                    data: { balance: { increment: netAmount }, paymentStatus: 'Tolov qilingan' },
                });
                // IP-14/16: shadow/live — FIFO taqsimot, live — balans formula bo'yicha
                await afterExternalPayment(tx, invPayment.id, (req as any).user?.id);

                return { invoice, applied: true };
            });

            if (!result.invoice) return res.status(404).json({ error: 'Invoice topilmadi' });
            if (result.cancelled) return res.status(409).json({ error: "Bekor qilingan invoice to'lanmaydi — kerak bo'lsa yangi invoice yarating", code: 'CANCELLED' });

            // F22 tuzatish (2026-09-16 audit): "Asosiy moliyaviy yo'llarning
            // auditi izchil emas" — invoice "to'landi" qilish real pul
            // hodisasi, lekin markazlashgan Audit Jurnali'da umuman
            // ko'rinmasdi. Faqat HAQIQATAN qo'llangan (applied=true)
            // holatda yoziladi — idempotent qayta so'rovlar uchun emas.
            if (result.applied) {
                const user = (req as any).user;
                await logAudit({
                    userId: user?.id, userName: user?.name || 'system',
                    action: 'update', resource: 'invoice', resourceId: result.invoice.id,
                    after: { status: 'paid', amount: result.invoice.amount },
                });
            }
            return res.json(result.invoice);
        }

        // FIN-03 tuzatish: ilgari status'ga HECH QANDAY cheklov yo'q edi —
        // "paid" holatidan istalgan boshqa holatga (masalan "pending") erkin
        // qaytarish mumkin edi, keyin qayta "paid" qilinsa yuqoridagi shart
        // (`status: {not: 'paid'}`) yana rost bo'lib, Payment/Transaction/
        // balans IKKINCHI marta yaratilardi (paid -> pending -> paid orqali
        // takror kredit). Endi "paid" holatidan chiqish shu umumiy yo'l
        // orqali UMUMAN taqiqlanadi — to'langan invoice'ni bekor qilish
        // uchun alohida (hali qo'shilmagan) reversal jarayoni kerak bo'ladi.
        // IP-17 (H.4): ruxsat etilgan o'tishlar jadvali; bekor qilish — sabab bilan.
        const current = await prisma.invoice.findUnique({ where: { id: req.params.id }, select: { status: true } });
        if (!current) return res.status(404).json({ error: 'Invoice topilmadi' });
        const data: any = {};
        if (status !== undefined && status !== current.status) {
            if (current.status === 'paid') {
                return res.status(409).json({ error: "To'langan invoice holatini o'zgartirib bo'lmaydi — o'quvchi profilidagi «Pul qaytarish» orqali tuzating", code: 'BAD_TRANSITION' });
            }
            if (!(INVOICE_TRANSITIONS[current.status] ?? []).includes(status)) {
                return res.status(409).json({ error: `Invoice holatini «${current.status}» dan «${status}» ga o'zgartirib bo'lmaydi`, code: 'BAD_TRANSITION' });
            }
            data.status = status;
            if (status === 'cancelled') {
                const reason = String(req.body.reason ?? req.body.cancelReason ?? '').trim();
                if (reason.length < 3) return res.status(400).json({ error: 'Bekor qilish sababini yozing' });
                data.cancelledAt = new Date();
                data.cancelReason = reason.slice(0, 500);
            }
        }
        if (method !== undefined) {
            if (['paid', 'cancelled'].includes(current.status)) return res.status(409).json({ error: "Yakunlangan invoice'ni tahrirlab bo'lmaydi", code: 'FINAL' });
            data.method = method;
        }
        // holat o'qilgandan beri o'zgarmagan bo'lsagina yoziladi (parallel o'tishlar)
        const { count } = await prisma.invoice.updateMany({ where: { id: req.params.id, status: current.status }, data });
        if (count === 0) return res.status(409).json({ error: "Invoice holati o'zgargan — sahifani yangilang", code: 'CONFLICT' });
        const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { student: true, items: true } });
        if (data.status === 'cancelled') {
            const user = (req as any).user;
            await logAudit({ userId: user?.id, userName: user?.name || 'system', action: 'invoice_cancel', resource: 'invoice', resourceId: req.params.id, before: { status: current.status }, after: { status: 'cancelled', reason: data.cancelReason } });
        }
        res.json(invoice);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/finance/invoices/:id
// FIN-03 tuzatish: to'langan invoice'ni o'chirishga hech qanday cheklov
// yo'q edi — Payment/Transaction/balans o'zgarishi (haqiqiy moliyaviy
// tarix) qolgan holda invoice yozuvining o'zi yo'qolib, hisobotlarda
// "manba"siz to'lov qolib ketardi.
router.delete('/invoices/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, select: { status: true } });
        if (!invoice) return res.status(404).json({ error: 'Invoice topilmadi' });
        if (invoice.status === 'paid') {
            return res.status(400).json({ error: "To'langan invoice'ni o'chirib bo'lmaydi — moliyaviy tarix saqlanishi shart" });
        }
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

        // F02 tuzatish: ilgari `req.query.amount` bo'lmasa xom `invoice.amount`
        // (chegirma/soliqsiz gross summa) ishlatilardi — mijoz aslida
        // to'lashi kerak bo'lgan net summadan ko'proq to'lashga yo'naltirilardi.
        const amount = Number(req.query.amount) || computeInvoiceNetAmount(invoice);
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

// ─── TRANSACTION (qo'lda kirim/chiqim) ─────────────────────────────────────────

// POST /api/finance/transactions — FIN-01 tuzatish.
// Ilgari CrmFinance.tsx (frontend) balansni O'ZI hisoblab (eski balansni
// o'qib + summa qo'shib) alohida PUT /students/:id bilan yozar, keyin
// alohida POST bilan Transaction yaratardi — bu klassik "eski qiymatni
// o'qib yangi qiymat yozish" poyga holati edi (ikki parallel to'lov bir-
// birining ustidan yozilishi mumkin) va ikkalasi orasida xato bo'lsa
// (masalan tarmoq uzilishi) balans yozuvsiz o'zgarib qolardi. Endi bitta
// $transaction ichida: Transaction yaratiladi va (kirim + studentId bo'lsa)
// Student.balance ATOMAR `increment` bilan yangilanadi — brauzer yakuniy
// balansni hech qachon hisoblamaydi/yubormaydi.
//
// Finance-audit (2026-09-16), F01 tuzatish: bu yo'l ilgari faqat Transaction
// yaratardi, Payment yozuvi YO'Q edi — natijada qo'lda kiritilgan naqd/karta
// to'lov "haqiqiy tushum" hisoblaydigan hech bir joyda (teacher payroll CASH
// bazasi, ota-ona portali to'lovlar tarixi, /finance/reports/students) umuman
// ko'rinmasdi. Endi kirim + studentId bo'lsa, bitta $transaction ichida
// Payment(status='paid') ham yaratiladi — Transaction va Payment shu yerdan
// boshlab BIR VOQEANING ikki proyeksiyasi (`sourceType`/`sourceId` bilan
// bog'langan), mustaqil ikki yozuv emas.
router.post('/transactions', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), idempotent('finance_transaction'), async (req, res) => {
    try {
        const { type, amount, category, description, date, method, studentId, studentName, staffId, staffName, groupId, month } = req.body;
        if (!type || !category || !date) {
            return res.status(400).json({ error: 'type, category va date majburiy' });
        }
        if (type !== 'income' && type !== 'expense') {
            return res.status(400).json({ error: "type faqat 'income' yoki 'expense' bo'lishi mumkin" });
        }
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: "Summa musbat son bo'lishi kerak" });
        }
        // IP-17: yopilgan oyga yangi kassa yozuvi kiritilmaydi (oy raqamlari o'zgarmasin)
        if (await isMonthClosed(prisma, String(date))) {
            return res.status(409).json({ error: `${String(date).slice(0, 7)} oyi yopilgan — yozuvni joriy sana bilan kiriting`, code: 'PERIOD_CLOSED' });
        }
        if (studentId) {
            const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
            if (!student) return res.status(400).json({ error: "Ko'rsatilgan o'quvchi topilmadi" });
        }
        // IP-12 (TQ-D, TQ-E): qoida kategoriya TURIga bog'liq, nomga emas.
        const kind = await categoryKind(prisma, category, type);
        if (type === 'income' && kind === 'REFUND') {
            return res.status(400).json({ error: "O'quvchiga pul qaytarish faqat o'quvchi profilidagi «Pul qaytarish» orqali yoziladi" });
        }
        if (type === 'income' && kind === 'TUITION') {
            if (!studentId) return res.status(400).json({ error: "Kurs to'lovi uchun o'quvchini tanlang" });
            try {
                const requester = (req as any).user;
                const r = await createReceipt({
                    studentId, amount: Math.round(numAmount), method, date, note: description, category, source: 'finance_form',
                    groupId: groupId || null, month: month || null,
                }, { id: requester?.id, name: requester?.name });
                return res.json(r.transaction);
            } catch (e: any) {
                if (e instanceof ReceiptError || e instanceof AllocationError) return res.status(e.status).json({ error: e.message, code: e.code });
                throw e;
            }
        }
        if (type === 'income' && studentId) {
            return res.status(400).json({ error: "Bu kirim turi o'quvchi qarziga ta'sir qilmaydi — o'quvchini olib tashlang yoki \"Kurs to'lovi\" kategoriyasini tanlang" });
        }

        const result = await prisma.$transaction(async (tx) => {
            let payment: { id: string } | null = null;
            // Faqat kirim + studentId bo'lsa balansga ta'sir qiladi va Payment
            // yozuvi yaratiladi — eski frontend mantig'i bilan bir xil shart,
            // endi atomar va ikkalasi (balans + Payment) bir hodisa sifatida.
            if (type === 'income' && studentId) {
                payment = await tx.payment.create({
                    data: {
                        studentId, amount: numAmount, method: method || 'Naqd', date,
                        status: 'paid',
                        notes: description || "Qo'lda kiritilgan to'lov (Moliya)",
                    },
                    select: { id: true },
                });
            }

            const transaction = await tx.transaction.create({
                data: {
                    type, amount: numAmount, category, description, date, method,
                    studentId: studentId || null, studentName: studentName || null,
                    staffId: staffId || null, staffName: staffName || null,
                    ...(payment ? { sourceType: 'manual_payment', sourceId: payment.id } : {}),
                },
            });

            if (type === 'income' && studentId) {
                const updated = await tx.student.update({
                    where: { id: studentId },
                    data: { balance: { increment: numAmount } },
                });
                await tx.student.update({
                    where: { id: studentId },
                    data: { paymentStatus: updated.balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' },
                });
            }

            return transaction;
        });

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/finance/transactions/:id/void — { reason } (IP-17, OQ-12): bog'liq yoki yopilgan
// oydagi yozuv o'chirilmaydi — bog'liq hujjat ta'siri qaytariladi va qarshi yozuv yaratiladi.
router.post('/transactions/:id/void', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const user = (req as any).user;
        const actor = { id: user?.id, name: user?.name, role: user?.role };
        const before = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        const result = await voidTransaction(req.params.id, req.body?.reason, actor);
        await logAudit({
            userId: user?.id, userName: user?.name || 'system', action: 'void', resource: 'transaction', resourceId: req.params.id,
            before: before ? { type: before.type, amount: before.amount, category: before.category, date: before.date, sourceType: before.sourceType, sourceId: before.sourceId } : undefined,
            after: { reason: String(req.body?.reason || '').trim(), result },
        });
        res.json(result);
    } catch (err: any) {
        if (err instanceof ReversalError) return res.status(err.status).json({ error: err.message, message: err.message, code: err.code });
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

// POST /api/finance/expenses — Finance-audit (2026-09-16), F04 tuzatish.
// Ilgari Expense va uning Transaction "juftligi" IKKI ALOHIDA, tranzaksiyasiz
// yozuv edi (birinchisi muvaffaqiyatli, ikkinchisi xato bersa — yarim yozuv
// qolardi) va hech qanday bog'lanish (sourceId) saqlanmasdi. Endi ikkalasi
// bitta $transaction ichida va Transaction.sourceType='expense'/sourceId
// orqali aniq bog'langan — PATCH/DELETE shu bog'lanish orqali juft yozuvni
// ham izchil saqlaydi (pastga q.).
router.post('/expenses', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { category, amount, description, date, receipt } = req.body;
        if (!category || !amount || !date) {
            return res.status(400).json({ error: 'category, amount va date majburiy' });
        }
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: "Summa musbat son bo'lishi kerak" });
        }

        const expense = await prisma.$transaction(async (tx) => {
            const created = await tx.expense.create({
                data: {
                    category, amount: numAmount, description: description || '', date, receipt,
                    createdById: (req as any).user?.id || null,
                },
            });
            await tx.transaction.create({
                data: {
                    type: 'expense', amount: numAmount,
                    category, description: description || category,
                    date, method: 'Naqd',
                    sourceType: 'expense', sourceId: created.id,
                },
            });
            return created;
        });

        res.status(201).json(expense);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/finance/expenses/:id — F04 tuzatish: ilgari faqat Expense
// yangilanardi, POST'da yaratilgan juft Transaction yozuvi ESKI summa/
// kategoriya/sana bilan qolib ketardi — umumiy chiqim jami (Transaction'dan
// hisoblanadi) Expense ro'yxatidagi summaga mos kelmay qolardi. Endi
// (sourceType='expense', sourceId=bu Expense) bo'yicha topilgan Transaction
// ham bitta $transaction ichida bir xil qiymatlarga yangilanadi. Eski
// (bog'lanishsiz, sourceId=null) Expense yozuvlari uchun mos Transaction
// topilmasa — Expense baribir yangilanadi (orqaga qarab qattiq bog'lash
// mumkin emas), lekin bu holat javobda `transactionSynced: false` bilan
// ko'rsatiladi.
router.patch('/expenses/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { category, amount, description, date, receipt } = req.body;
        const data: any = {};
        if (category !== undefined) data.category = category;
        if (amount !== undefined) {
            const numAmount = Number(amount);
            if (!Number.isFinite(numAmount) || numAmount <= 0) {
                return res.status(400).json({ error: "Summa musbat son bo'lishi kerak" });
            }
            data.amount = numAmount;
        }
        if (description !== undefined) data.description = description;
        if (date !== undefined) data.date = date;
        if (receipt !== undefined) data.receipt = receipt;

        const result = await prisma.$transaction(async (tx) => {
            const expense = await tx.expense.update({ where: { id: req.params.id }, data });
            const linkedTx = await tx.transaction.findFirst({ where: { sourceType: 'expense', sourceId: expense.id } });
            if (linkedTx) {
                await tx.transaction.update({
                    where: { id: linkedTx.id },
                    data: {
                        amount: expense.amount,
                        category: expense.category,
                        description: expense.description || expense.category,
                        date: expense.date,
                    },
                });
            }
            return { expense, transactionSynced: !!linkedTx };
        });

        res.json({ ...result.expense, transactionSynced: result.transactionSynced });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/finance/expenses/:id — F04 tuzatish: ilgari faqat Expense
// o'chirilardi, juft Transaction "orfan" (manbasiz) chiqim sifatida
// tarixda abadiy qolib ketardi. Endi bog'langan Transaction ham bitta
// $transaction ichida birga o'chiriladi.
router.delete('/expenses/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        // IP-17 (OQ-12): yopilgan oy yoki allaqachon bekor qilingan xarajat o'chirilmaydi
        const expense = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { date: true } });
        if (!expense) return res.status(404).json({ error: 'Xarajat topilmadi' });
        if (await isMonthClosed(prisma, expense.date)) {
            return res.status(409).json({ error: `${expense.date.slice(0, 7)} oyi yopilgan — xarajatni Tranzaksiyalar bo'limida «Bekor qilish» orqali qaytaring`, code: 'VOID_REQUIRED' });
        }
        if (await prisma.transaction.count({ where: { sourceType: 'expense', sourceId: req.params.id, voidedAt: { not: null } } })) {
            return res.status(409).json({ error: "Bu xarajat kassada bekor qilingan — o'chirilmaydi (tarix)", code: 'ALREADY_VOID' });
        }
        await prisma.$transaction(async (tx) => {
            await tx.transaction.deleteMany({ where: { sourceType: 'expense', sourceId: req.params.id } });
            await tx.expense.delete({ where: { id: req.params.id } });
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BUDGET ───────────────────────────────────────────────────────────────────

// GET /api/finance/budget?month=&year=
// Finance-audit (2026-09-16), F19 tuzatish: `Budget.actual` ustuni HECH
// QAYERDA yozilmasdi (doim 0) — "reja/fakt" solishtirish imkonsiz edi.
// Endi har bir kategoriya uchun "fakt" (actual) shu oy/yil uchun HAQIQIY
// xarajat Transaction'laridan (type='expense') JONLI hisoblanadi — qo'lda
// alohida saqlanadigan, eskirishi mumkin bo'lgan son emas.
router.get('/budget', requireAuth, requirePermission('finance'), async (req, res) => {
    try {
        const todayParts = todayDateStr().split('-');
        const year = Number(req.query.year) || Number(todayParts[0]);
        const month = Number(req.query.month) || Number(todayParts[1]);
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        const [budgets, actuals] = await Promise.all([
            prisma.budget.findMany({ where: { year, month } }),
            prisma.transaction.groupBy({
                by: ['category'],
                where: { type: 'expense', date: { startsWith: monthStr } },
                _sum: { amount: true },
            }),
        ]);
        const actualByCategory = new Map(actuals.map(a => [a.category, a._sum.amount || 0]));

        // Reja kiritilmagan, lekin shu oy real xarajati bo'lgan kategoriyalar
        // ham ko'rinishi kerak (aks holda "fakt" borligi butunlay yashirin qolardi).
        const categories = new Set([...budgets.map(b => b.category), ...actualByCategory.keys()]);
        const merged = Array.from(categories).map(category => {
            const b = budgets.find(x => x.category === category);
            const actual = actualByCategory.get(category) || 0;
            const planned = b?.planned || 0;
            return {
                id: b?.id,
                month, year, category, planned, actual,
                remaining: planned - actual,
                usedPercent: planned > 0 ? Math.round((actual / planned) * 100) : (actual > 0 ? 100 : 0),
            };
        });
        res.json({ year, month, budgets: merged });
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
