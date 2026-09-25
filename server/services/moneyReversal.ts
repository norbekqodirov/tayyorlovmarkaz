/**
 * IP-17 — pul yozuvlarini tarixni o'chirmasdan tuzatish (OQ-07, OQ-12, H.4).
 *
 * Qoidalar (docs/ADR_HISOB_QOIDALARI.md):
 *  - Kassa yozuvi (Transaction) bog'liq bo'lsa (kvitansiya, maosh/oylik to'lovi, avans,
 *    qaytarish) yoki uning oyi yopilgan bo'lsa — o'chirilmaydi, BEKOR QILINADI: asl yozuv
 *    `voidedAt` bilan belgilanadi va bugungi sana bilan qarshi yozuv (manfiy summa,
 *    sourceType 'reversal') yaratiladi. Hisobotlar yig'indisi o'z-o'zidan to'g'ri qoladi,
 *    yopilgan oy raqamlari esa o'zgarmaydi. Faqat bog'liqliksiz va ochiq oydagi yozuv
 *    (test/xato) jismonan o'chiriladi.
 *  - Kvitansiya `void` — "pul umuman kelmagan" (xato yozuv): shu kuni — moliya menejeri,
 *    keyinroq — faqat ADMIN+, sabab bilan. Taqsimotlar bekor qilinadi.
 *  - Qaytarish (Refund) — "pul kelgan va qaytarildi": faqat taqsimlanmagan avansdan
 *    (OQ-07), `refund_approval_min_role` (standart ADMIN). Kassada manfiy "kirim"
 *    ("To'lov qaytarish") — sof tushum va LTV'dan chiqadi (QT-26).
 *  - Payment.status: to'liq qaytarilsa 'refunded'; qisman qaytarish 'paid' qoladi va
 *    qaytarilgan qism Refund qatorlaridan ayriladi (H.4 dagi `partially_refunded` holati
 *    hosila sifatida ko'rsatiladi — mavjud "status='paid'" yig'indilarini buzmaslik uchun).
 *  - Maosh: accrual (TQ-B) to'lovga bog'liq emas; cash asosidagi tasdiqlangan maoshlarga
 *    "qayta ko'rib chiqing" belgisi qo'yiladi (maosh tuzatmasi belgisi).
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { isValidDate } from '../domain/lessonCalendar.js';
import { ROLE_LEVEL } from '../middleware/auth.js';
import { getLedgerMode } from './ledgerMode.js';
import { NEW_PAYMENT_MODES } from './receivables.js';
import { reversePaymentAllocations } from './allocation.js';
import { syncStudentBalance } from './balanceCache.js';

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

export class ReversalError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export interface Actor { id?: string | null; name?: string | null; role?: string | null }

export const REFUND_CATEGORY = "To'lov qaytarish";
const PAYMENT_SOURCES = ['receipt', 'manual_payment'];
const PAYROLL_SOURCES = ['salary', 'teacher_payroll', 'staff_advance'];

const isElevated = (a: Actor) => (ROLE_LEVEL[a.role || ''] || 0) >= ROLE_LEVEL.ADMIN;
const statusOf = (balance: number) => (balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik');

function cleanReason(reason: unknown) {
    const r = String(reason ?? '').trim();
    if (r.length < 3) throw new ReversalError(400, 'Sababni yozing (kamida 3 belgi)', 'NO_REASON');
    return r.slice(0, 500);
}

export async function isMonthClosed(db: Db, date: string) {
    const p = await db.billingPeriod.findUnique({ where: { month: date.slice(0, 7) }, select: { status: true } });
    return p?.status === 'closed';
}

// ─── Qarshi yozuv ────────────────────────────────────────────────────────────

/**
 * Asl yozuvni belgilaydi (voidedAt: null sharti — parallel ikki bekor qilish bitta
 * qarshi yozuv beradi) va bugungi sana bilan manfiy qarshi yozuv yaratadi.
 */
export async function reverseTransactionInTx(tx: Tx, id: string, reason: string, actor: Actor, date = todayDateStr()) {
    const claimed = await tx.transaction.updateMany({
        // sourceType NULL bo'lishi mumkin — SQL'da NOT (NULL = x) NULL beradi, shuning uchun OR
        where: { id, voidedAt: null, OR: [{ sourceType: null }, { sourceType: { not: 'reversal' } }] },
        data: { voidedAt: new Date(), voidedById: actor.id ?? null, voidReason: reason },
    });
    if (claimed.count !== 1) throw new ReversalError(409, 'Yozuv allaqachon bekor qilingan', 'ALREADY_VOID');
    const o = await tx.transaction.findUniqueOrThrow({ where: { id } });
    return tx.transaction.create({
        data: {
            type: o.type, amount: -o.amount, category: o.category, date, method: o.method,
            description: `Bekor qilindi: ${o.description || o.category} — ${reason}`.slice(0, 1000),
            studentId: o.studentId, studentName: o.studentName, staffId: o.staffId, staffName: o.staffName,
            sourceType: 'reversal', sourceId: o.id,
        },
    });
}

/** Cash asosidagi tasdiqlangan maoshlarga "qayta ko'rib chiqing" belgisi (summa o'zgarmaydi). */
async function flagCashPayrolls(tx: Tx, studentId: string, date: string, text: string) {
    const rows = await tx.teacherPayroll.findMany({
        where: { month: date.slice(0, 7), basis: 'cash', status: { not: 'draft' }, sourceSnapshot: { contains: studentId } },
        select: { id: true, notes: true },
    });
    for (const r of rows) {
        const line = `⚠ ${todayDateStr()}: ${text} — cash asosidagi maoshni qayta ko'rib chiqing`;
        await tx.teacherPayroll.update({ where: { id: r.id }, data: { notes: r.notes ? `${r.notes}\n${line}` : line } });
    }
    return rows.map(r => r.id);
}

/** Legacy kesh (eskicha ±) + live'da formula bo'yicha qayta hisob — createReceipt bilan bir xil naqsh. */
async function moveLegacyBalance(tx: Tx, studentId: string, delta: number, mode?: string) {
    const s = await tx.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!s) return;
    const updated = await tx.student.update({ where: { id: studentId }, data: { balance: { increment: delta } } });
    await tx.student.update({ where: { id: studentId }, data: { paymentStatus: statusOf(updated.balance ?? 0) } });
    await syncStudentBalance(tx, studentId, mode);
}

// ─── Kvitansiyani bekor qilish (void) ───────────────────────────────────────

export async function voidReceipt(paymentId: string, reasonRaw: unknown, actor: Actor) {
    const reason = cleanReason(reasonRaw);
    const mode = await getLedgerMode();
    return prisma.$transaction(async tx => {
        const p = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!p || p.deletedAt) throw new ReversalError(404, "To'lov topilmadi", 'NOT_FOUND');
        if (p.status === 'void') throw new ReversalError(409, "Kvitansiya allaqachon bekor qilingan", 'ALREADY_VOID');
        if (p.status !== 'paid') throw new ReversalError(409, "Faqat faol (to'langan) kvitansiya bekor qilinadi", 'NOT_PAID');
        if (p.sourceType === 'online_transaction') throw new ReversalError(400, "Payme/Click to'lovi faqat to'lov tizimi orqali bekor qilinadi", 'PROVIDER');
        if (await tx.refund.count({ where: { paymentId, status: 'done' } })) {
            throw new ReversalError(409, "Bu to'lovdan qaytarish qilingan — avval qaytarishni bekor qiling", 'HAS_REFUNDS');
        }
        const cashRows = await tx.transaction.findMany({ where: { sourceId: paymentId, sourceType: { in: PAYMENT_SOURCES }, voidedAt: null } });
        if (!cashRows.length) throw new ReversalError(400, "Bu to'lov kassa yozuviga bog'lanmagan (invoice yoki eski yozuv) — «Pul qaytarish» orqali tuzating", 'NO_CASH_LINK');
        const today = todayDateStr();
        const sameDay = p.date === today && todayDateStr(p.createdAt) === today;
        if (!sameDay && !isElevated(actor)) {
            throw new ReversalError(403, "Kvitansiyani faqat qabul qilingan kuni bekor qilish mumkin. Keyinroq — administrator (sabab bilan) yoki «Pul qaytarish»", 'SAME_DAY_ONLY');
        }
        const claimed = await tx.payment.updateMany({
            where: { id: paymentId, status: 'paid', voidedAt: null },
            data: { status: 'void', voidedAt: new Date(), voidedById: actor.id ?? null, voidReason: reason },
        });
        if (claimed.count !== 1) throw new ReversalError(409, "Kvitansiya allaqachon bekor qilingan", 'ALREADY_VOID');
        const releasedAllocations = await reversePaymentAllocations(tx, paymentId, `Kvitansiya bekor qilindi: ${reason}`, actor.id);
        const reversals = [];
        for (const row of cashRows) reversals.push(await reverseTransactionInTx(tx, row.id, reason, actor, today));
        await moveLegacyBalance(tx, p.studentId, -Math.round(p.amount), mode);
        const flaggedPayrolls = await flagCashPayrolls(tx, p.studentId, p.date, `${p.receiptNo || "to'lov"} (${Math.round(p.amount)}) bekor qilindi`);
        return { paymentId, receiptNo: p.receiptNo, amount: Math.round(p.amount), releasedAllocations, reversals, flaggedPayrolls, sameDay };
    });
}

// ─── Qaytarish (Refund) ─────────────────────────────────────────────────────

export async function refundMinRole(db: Db = prisma) {
    const row = await db.setting.findUnique({ where: { key: 'refund_approval_min_role' } });
    const v = (row?.value || 'ADMIN').toUpperCase();
    return ROLE_LEVEL[v] ? v : 'ADMIN';
}

export async function canRefund(actor: Actor) {
    return (ROLE_LEVEL[actor.role || ''] || 0) >= ROLE_LEVEL[await refundMinRole()];
}

interface RefundablePayment { id: string; receiptNo: string | null; date: string; amount: number; allocated: number; refunded: number; available: number }

/** Yangi rejimdagi to'lovlarning qaytarish mumkin bo'lgan (taqsimlanmagan, qaytarilmagan) qismi. */
export async function refundablePayments(db: Db, studentId: string): Promise<RefundablePayment[]> {
    const payments = await db.payment.findMany({
        where: { studentId, status: 'paid', deletedAt: null, allocationMode: { in: NEW_PAYMENT_MODES } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, receiptNo: true, date: true, amount: true },
    });
    if (!payments.length) return [];
    const ids = payments.map(p => p.id);
    const [alloc, refunds] = await Promise.all([
        db.paymentAllocation.groupBy({ by: ['paymentId'], where: { paymentId: { in: ids }, reversedAt: null }, _sum: { amount: true } }),
        db.refund.groupBy({ by: ['paymentId'], where: { paymentId: { in: ids }, status: 'done' }, _sum: { amount: true } }),
    ]);
    const am = new Map(alloc.map(a => [a.paymentId, a._sum.amount ?? 0]));
    const rm = new Map(refunds.map(r => [r.paymentId!, r._sum.amount ?? 0]));
    return payments.map(p => {
        const amount = Math.round(p.amount);
        const allocated = am.get(p.id) ?? 0;
        const refunded = rm.get(p.id) ?? 0;
        return { ...p, amount, allocated, refunded, available: Math.max(0, amount - allocated - refunded) };
    });
}

/** Qaytarish mumkin bo'lgan summa: legacy — musbat balans, shadow/live — yangi avans. */
export async function refundAvailability(db: Db, studentId: string) {
    const mode = await getLedgerMode();
    if (mode === 'legacy') {
        const s = await db.student.findUnique({ where: { id: studentId }, select: { balance: true } });
        return { mode, available: Math.max(0, Math.round(s?.balance ?? 0)), payments: [] as RefundablePayment[] };
    }
    const payments = (await refundablePayments(db, studentId)).filter(p => p.available > 0);
    return { mode, available: payments.reduce((s, p) => s + p.available, 0), payments };
}

export interface RefundInput { studentId: string; amount: number; method?: string; date?: string; reason: string; paymentId?: string | null }

export async function createRefund(input: RefundInput, actor: Actor) {
    if (!(await canRefund(actor))) throw new ReversalError(403, `Pul qaytarish uchun ${await refundMinRole()} huquqi kerak`, 'ROLE');
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1e9) throw new ReversalError(400, "Summa musbat butun son bo'lishi kerak", 'BAD_AMOUNT');
    const reason = cleanReason(input.reason);
    const date = input.date || todayDateStr();
    if (!isValidDate(date)) throw new ReversalError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    if (date > todayDateStr()) throw new ReversalError(400, 'Kelajak sanasi bilan qaytarish yozilmaydi', 'FUTURE');
    if (await isMonthClosed(prisma, date)) throw new ReversalError(409, `${date.slice(0, 7)} oyi yopilgan — bugungi sana bilan yozing`, 'PERIOD_CLOSED');
    const method = input.method || 'Naqd';
    const mode = await getLedgerMode();

    return prisma.$transaction(async tx => {
        const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true } });
        if (!student) throw new ReversalError(404, "O'quvchi topilmadi", 'NO_STUDENT');
        // o'quvchi qatori qulfi — bir o'quvchiga parallel ikki qaytarish avansni ikki marta ishlatmaydi
        const locked = await tx.student.update({ where: { id: student.id }, data: { balance: { increment: 0 } }, select: { balance: true } });

        let pieces: Array<{ paymentId: string | null; amount: number }> = [];
        if (mode === 'legacy') {
            const available = Math.max(0, Math.round(locked.balance ?? 0));
            if (amount > available) throw new ReversalError(409, `Qaytarish mumkin bo'lgan avans: ${available}`, 'NO_CREDIT');
            pieces = [{ paymentId: input.paymentId ?? null, amount }];
        } else {
            let candidates = await refundablePayments(tx, student.id);
            if (input.paymentId) {
                candidates = candidates.filter(p => p.id === input.paymentId);
                if (!candidates.length) throw new ReversalError(400, "Bu to'lovdan qaytarib bo'lmaydi (topilmadi, eski rejimda yoki qaytarilgan)", 'BAD_PAYMENT');
            }
            const available = candidates.reduce((s, p) => s + p.available, 0);
            if (amount > available) throw new ReversalError(409, `Qaytarish mumkin bo'lgan avans: ${available}. Hisobga taqsimlangan pul avval hisob tuzatmasi (yoki a'zolikni yakunlash) orqali bo'shatiladi`, 'NO_CREDIT');
            let left = amount;
            for (const p of candidates) {
                if (left <= 0) break;
                const take = Math.min(left, p.available);
                if (take > 0) { pieces.push({ paymentId: p.id, amount: take }); left -= take; }
            }
        }

        const cash = await tx.transaction.create({
            data: {
                type: 'income', amount: -amount, category: REFUND_CATEGORY, date, method,
                description: `Qaytarish · ${student.name} — ${reason}`.slice(0, 1000),
                studentId: student.id, studentName: student.name, sourceType: 'refund',
            },
        });
        const refunds = [];
        for (const piece of pieces) {
            refunds.push(await tx.refund.create({
                data: { studentId: student.id, paymentId: piece.paymentId, amount: piece.amount, method, date, reason, transactionId: cash.id, createdById: actor.id ?? null },
            }));
        }
        await tx.transaction.update({ where: { id: cash.id }, data: { sourceId: refunds[0].id } });
        await refreshPaymentStatuses(tx, pieces.map(p => p.paymentId));
        await moveLegacyBalance(tx, student.id, -amount, mode);
        const flaggedPayrolls = await flagCashPayrolls(tx, student.id, date, `${amount} so'm qaytarildi`);
        return { refunds, transaction: { ...cash, sourceId: refunds[0].id }, flaggedPayrolls };
    });
}

/** To'liq qaytarilgan to'lov 'refunded', aks holda 'paid' (faqat shu ikki holat orasida). */
async function refreshPaymentStatuses(tx: Tx, ids: Array<string | null>) {
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
        const p = await tx.payment.findUnique({ where: { id }, select: { amount: true, status: true } });
        if (!p || !['paid', 'refunded'].includes(p.status)) continue;
        const agg = await tx.refund.aggregate({ where: { paymentId: id, status: 'done' }, _sum: { amount: true } });
        const next = (agg._sum.amount ?? 0) >= Math.round(p.amount) ? 'refunded' : 'paid';
        if (next !== p.status) await tx.payment.update({ where: { id }, data: { status: next } });
    }
}

/** Qaytarishni bekor qilish (xato yozilgan qaytarish) — shu kassa yozuvidagi barcha qatorlar. */
export async function voidRefund(refundId: string, reasonRaw: unknown, actor: Actor) {
    if (!(await canRefund(actor))) throw new ReversalError(403, `Qaytarishni bekor qilish uchun ${await refundMinRole()} huquqi kerak`, 'ROLE');
    const reason = cleanReason(reasonRaw);
    const mode = await getLedgerMode();
    return prisma.$transaction(async tx => {
        const r = await tx.refund.findUnique({ where: { id: refundId } });
        if (!r) throw new ReversalError(404, 'Qaytarish topilmadi', 'NOT_FOUND');
        const siblings = r.transactionId
            ? await tx.refund.findMany({ where: { transactionId: r.transactionId, status: 'done' } })
            : (r.status === 'done' ? [r] : []);
        if (!siblings.length) throw new ReversalError(409, 'Qaytarish allaqachon bekor qilingan', 'ALREADY_VOID');
        const claimed = await tx.refund.updateMany({ where: { id: { in: siblings.map(s => s.id) }, status: 'done' }, data: { status: 'void' } });
        if (claimed.count !== siblings.length) throw new ReversalError(409, 'Qaytarish allaqachon bekor qilingan', 'ALREADY_VOID');
        const total = siblings.reduce((s, x) => s + x.amount, 0);
        const reversal = r.transactionId ? await reverseTransactionInTx(tx, r.transactionId, reason, actor) : null;
        await refreshPaymentStatuses(tx, siblings.map(s => s.paymentId));
        await moveLegacyBalance(tx, r.studentId, total, mode);
        return { voided: siblings.map(s => s.id), amount: total, reversal };
    });
}

// ─── Kassa yozuvini o'chirish / bekor qilish siyosati (OQ-12) ───────────────

export type TxDecision =
    | { action: 'delete' }
    | { action: 'void'; code: 'LINKED' | 'PERIOD_CLOSED'; message: string }
    | { action: 'blocked'; status: number; code: string; message: string };

type TxRow = { id: string; type: string; date: string; studentId: string | null; sourceType: string | null; sourceId: string | null; voidedAt: Date | null };

export async function transactionDeletePolicy(db: Db, t: TxRow): Promise<TxDecision> {
    const st = t.sourceType || '';
    if (t.voidedAt) return { action: 'blocked', status: 409, code: 'ALREADY_VOID', message: 'Yozuv allaqachon bekor qilingan' };
    if (st === 'reversal') return { action: 'blocked', status: 400, code: 'REVERSAL', message: "Qarshi yozuvni o'chirib yoki bekor qilib bo'lmaydi" };
    if (st === 'invoice') return { action: 'blocked', status: 400, code: 'INVOICE', message: "To'langan invoice to'lovi — o'quvchi profilidagi «Pul qaytarish» orqali tuzatiladi" };
    if (st.startsWith('online_transaction')) return { action: 'blocked', status: 400, code: 'PROVIDER', message: "Payme/Click to'lovi faqat to'lov tizimi orqali bekor qilinadi" };
    const linked = PAYMENT_SOURCES.includes(st) || PAYROLL_SOURCES.includes(st) || st === 'refund' || (t.type === 'income' && !!t.studentId && !st);
    if (linked) return { action: 'void', code: 'LINKED', message: "Bu yozuv to'lov/maosh/avans bilan bog'liq — o'chirilmaydi, sabab bilan bekor qilinadi (kassa tarixida qoladi)" };
    if (await isMonthClosed(db, t.date)) return { action: 'void', code: 'PERIOD_CLOSED', message: `${t.date.slice(0, 7)} oyi yopilgan — yozuv o'chirilmaydi, bugungi sana bilan qarshi yozuv qilinadi` };
    return { action: 'delete' };
}

/** Bog'liqliksiz, ochiq oydagi yozuvni jismonan o'chirish (test/xato yozuvlar). */
export async function deleteTransaction(id: string) {
    const t = await prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new ReversalError(404, 'Topilmadi', 'NOT_FOUND');
    const d = await transactionDeletePolicy(prisma, t);
    if (d.action === 'blocked') throw new ReversalError(d.status, d.message, d.code);
    if (d.action === 'void') throw new ReversalError(409, d.message, 'VOID_REQUIRED');
    await prisma.$transaction(async tx => {
        if (t.sourceType === 'expense' && t.sourceId) await tx.expense.deleteMany({ where: { id: t.sourceId } });
        await tx.transaction.delete({ where: { id } });
    });
    return t;
}

/** Kassa yozuvini bekor qilish: bog'liq hujjat ta'siri qaytariladi + qarshi yozuv. */
export async function voidTransaction(id: string, reasonRaw: unknown, actor: Actor) {
    const reason = cleanReason(reasonRaw);
    const t = await prisma.transaction.findUnique({ where: { id } });
    if (!t) throw new ReversalError(404, 'Topilmadi', 'NOT_FOUND');
    const d = await transactionDeletePolicy(prisma, t);
    if (d.action === 'blocked') throw new ReversalError(d.status, d.message, d.code);
    const st = t.sourceType || '';

    if (PAYMENT_SOURCES.includes(st) && t.sourceId) {
        const p = await prisma.payment.findUnique({ where: { id: t.sourceId }, select: { id: true, status: true, deletedAt: true } });
        if (p && !p.deletedAt && p.status === 'paid') return { kind: 'receipt', ...(await voidReceipt(p.id, reason, actor)) };
    }
    if (st === 'refund' && t.sourceId) return { kind: 'refund', ...(await voidRefund(t.sourceId, reason, actor)) };

    const mode = await getLedgerMode();
    return prisma.$transaction(async tx => {
        if (t.type === 'income' && t.studentId && (!st || PAYMENT_SOURCES.includes(st))) {
            await moveLegacyBalance(tx, t.studentId, -Math.round(t.amount), mode);
        }
        if (st === 'salary' && t.sourceId) {
            const s = await tx.salary.findUnique({ where: { id: t.sourceId } });
            if (s) {
                const paidAmount = Math.max(0, s.paidAmount - t.amount);
                const full = paidAmount + s.advanceApplied >= s.total;
                await tx.salary.update({ where: { id: s.id }, data: { paidAmount, paid: full, paidAt: full ? s.paidAt : null } });
            }
        }
        if (st === 'teacher_payroll' && t.sourceId) {
            const p = await tx.teacherPayroll.findUnique({ where: { id: t.sourceId } });
            if (p) {
                const paidAmount = Math.max(0, p.paidAmount - t.amount);
                const full = paidAmount + p.advanceApplied >= p.accruedAmount;
                await tx.teacherPayroll.update({ where: { id: p.id }, data: { paidAmount, status: full ? 'paid' : 'approved' } });
            }
        }
        if (st === 'staff_advance' && t.sourceId) await reverseStaffAdvance(tx, t.sourceId);
        const reversal = await reverseTransactionInTx(tx, t.id, reason, actor);
        return { kind: st || t.type, reversal };
    });
}

/**
 * Avans bekor qilinganda: u qo'llanilgan har oylik/maoshdan `advanceApplied` qaytariladi,
 * keyin avans hujjati o'chiriladi (kassa izi — asl yozuv + qarshi yozuv — qoladi).
 */
export async function reverseStaffAdvance(tx: Tx, advanceId: string) {
    const applications = await tx.staffAdvanceApplication.findMany({ where: { advanceId } });
    for (const app of applications) {
        if (app.appliedToType === 'salary') {
            const salary = await tx.salary.findUnique({ where: { id: app.appliedToId } });
            if (salary) {
                const advanceApplied = Math.max(0, salary.advanceApplied - app.amount);
                const full = salary.paidAmount + advanceApplied >= salary.total;
                await tx.salary.update({ where: { id: salary.id }, data: { advanceApplied, paid: full, paidAt: full ? salary.paidAt : null } });
            }
        } else if (app.appliedToType === 'teacher_payroll') {
            const payroll = await tx.teacherPayroll.findUnique({ where: { id: app.appliedToId } });
            if (payroll) {
                const advanceApplied = Math.max(0, payroll.advanceApplied - app.amount);
                const full = payroll.paidAmount + advanceApplied >= payroll.accruedAmount;
                await tx.teacherPayroll.update({ where: { id: payroll.id }, data: { advanceApplied, status: full ? 'paid' : 'approved' } });
            }
        }
    }
    await tx.staffAdvanceApplication.deleteMany({ where: { advanceId } });
    await tx.staffAdvance.deleteMany({ where: { id: advanceId } });
}

// ─── Maosh yozuvini o'chirish siyosati (OQ-12) ──────────────────────────────

/** Maosh/oylik yozuvi o'chirilishi mumkinmi: ochiq oy va faol (bekor qilinmagan) to'lovsiz. */
export async function payrollDeleteBlock(db: Db, sourceType: 'teacher_payroll' | 'salary', id: string, month: string, paidAmount: number) {
    if (await isMonthClosed(db, `${month}-01`)) return { status: 409, code: 'PERIOD_CLOSED', message: `${month} oyi yopilgan — maosh yozuvi o'chirilmaydi, keyingi oyda tuzatma kiriting` };
    const payouts = await db.transaction.count({ where: { sourceType, sourceId: id, voidedAt: null } });
    if (payouts > 0 || paidAmount > 0) {
        return { status: 409, code: 'PAYOUTS_EXIST', message: "Bu maoshdan to'lov berilgan — avval to'lovlarni Moliya → Tranzaksiyalar'da «Bekor qilish» orqali qaytaring (kassa tarixida qoladi), keyin o'chiring" };
    }
    return null;
}

/** Avans qo'llanishlarini bo'shatish (maosh o'chirilganda yoki qayta ochilganda). */
export async function releaseAdvanceApplications(tx: Tx, appliedToType: 'teacher_payroll' | 'salary', appliedToId: string) {
    const applications = await tx.staffAdvanceApplication.findMany({ where: { appliedToType, appliedToId } });
    for (const app of applications) await tx.staffAdvance.update({ where: { id: app.advanceId }, data: { remaining: { increment: app.amount } } });
    await tx.staffAdvanceApplication.deleteMany({ where: { appliedToType, appliedToId } });
    return applications.reduce((s, a) => s + a.amount, 0);
}

// ─── Hisobotlar uchun (QT-26) ───────────────────────────────────────────────

/**
 * Qisman qaytarishlar (to'lov hali 'paid' holatida) — o'quvchi bo'yicha. To'liq qaytarilgan
 * to'lov 'refunded' bo'lib `status: 'paid'` yig'indilaridan o'zi chiqadi; qisman qaytarilgan
 * qism esa shu xarita bilan ayriladi (sof tushum / LTV).
 */
export async function partialRefundsByStudent(db: Db, studentIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!studentIds.length) return out;
    const refunds = await db.refund.findMany({
        where: { studentId: { in: studentIds }, status: 'done', paymentId: { not: null } },
        select: { studentId: true, amount: true, paymentId: true },
    });
    if (!refunds.length) return out;
    const paid = new Set((await db.payment.findMany({
        where: { id: { in: [...new Set(refunds.map(r => r.paymentId!))] }, status: 'paid', deletedAt: null },
        select: { id: true },
    })).map(p => p.id));
    for (const r of refunds) if (paid.has(r.paymentId!)) out.set(r.studentId, (out.get(r.studentId) || 0) + r.amount);
    return out;
}

export const sumMap = (m: Map<string, number>, ids?: string[]) =>
    (ids ? ids.map(id => m.get(id) || 0) : [...m.values()]).reduce((a, b) => a + b, 0);
