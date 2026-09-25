/**
 * IP-12 — kurs to'lovini qabul qilish (kvitansiya) va hisoblarga taqsimlash (TQ-D).
 *
 * Bitta tranzaksiyada: Payment (kvitansiya raqami bilan) + kassa Transaction (TUITION)
 * + taqsimotlar + eski `Student.balance` keshi. Taqsimot invariantlari:
 *   har taqsimot ≤ hisob qarzi; jami taqsimot ≤ to'lov summasi; qolgani — avans.
 * Parallel to'lovlar bir hisobni ortiqcha yopmasligi uchun hisob qatori qulflanadi
 * (Postgres — qator qulfi, SQLite — yozuvchi qulfi), keyin qarz qayta o'qiladi.
 *
 * `ledger_mode = legacy` da to'lov `allocationMode='legacy'` bilan yoziladi va
 * taqsimlanmaydi — yangi tizim avansiga kirmaydi (o'tishda boshlang'ich qoldiq, J.4).
 */
import prisma from '../db.js';
import type { Prisma } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { isValidDate } from '../domain/lessonCalendar.js';
import { getLedgerMode } from './chargeEngine.js';
import { chargeBalances, openCharges, paymentUnallocated, DEBT_CHARGE_TYPES } from './receivables.js';

type Tx = Prisma.TransactionClient;

export class ReceiptError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export interface AllocationInput { chargeId: string; amount: number }

async function reserveReceiptNo(tx: Tx, date: string): Promise<string> {
    const year = date.slice(0, 4);
    const key = `receipt_seq_${year}`;
    for (let i = 0; i < 20; i++) {
        const row = await tx.setting.findUnique({ where: { key } });
        if (!row) {
            try { await tx.setting.create({ data: { key, value: '1' } }); return `Q-${year}-${'1'.padStart(6, '0')}`; }
            catch { continue; }
        }
        const next = Number(row.value) + 1;
        const r = await tx.setting.updateMany({ where: { key, value: row.value }, data: { value: String(next) } });
        if (r.count === 1) return `Q-${year}-${String(next).padStart(6, '0')}`;
    }
    throw new ReceiptError(500, 'Kvitansiya raqamini band qilib bo\'lmadi', 'SEQ');
}

/** Hisob qatorini qulflab, joriy qarzini qaytaradi. */
async function lockedDebt(tx: Tx, chargeId: string, studentId: string) {
    const ch = await tx.charge.findUnique({ where: { id: chargeId }, select: { id: true, studentId: true, status: true, type: true } });
    if (!ch || ch.studentId !== studentId) throw new ReceiptError(400, "Hisob topilmadi yoki boshqa o'quvchiniki", 'BAD_CHARGE');
    if (ch.status !== 'posted' || !DEBT_CHARGE_TYPES.includes(ch.type)) throw new ReceiptError(400, "Faqat e'lon qilingan hisobga taqsimlanadi", 'NOT_POSTED');
    await tx.charge.update({ where: { id: chargeId }, data: { updatedAt: new Date() } });
    const [b] = await chargeBalances(tx, { id: chargeId });
    return b?.debt ?? 0;
}

/** Taqsimotlarni tekshirib yozadi. `auto` — FIFO (preferGroupId oldin). Qaytaradi: yaratilgan taqsimotlar. */
async function applyAllocations(tx: Tx, paymentId: string, studentId: string, available: number, spec: { allocations?: AllocationInput[]; auto?: boolean; preferGroupId?: string | null }, actorId?: string | null) {
    let plan: AllocationInput[] = [];
    if (spec.allocations?.length) {
        plan = spec.allocations.map(a => ({ chargeId: a.chargeId, amount: Number(a.amount) }));
        for (const a of plan) if (!Number.isInteger(a.amount) || a.amount <= 0) throw new ReceiptError(400, "Taqsimot summasi musbat butun son bo'lishi kerak", 'BAD_ALLOCATION');
        if (plan.reduce((s, a) => s + a.amount, 0) > available) throw new ReceiptError(400, "Taqsimotlar jami to'lovdan (qoldiqdan) oshadi", 'OVER_PAYMENT');
    } else if (spec.auto) {
        let left = available;
        for (const c of await openCharges(tx, studentId, spec.preferGroupId)) {
            if (left <= 0) break;
            const amt = Math.min(left, c.debt);
            plan.push({ chargeId: c.id, amount: amt });
            left -= amt;
        }
    }
    const created = [];
    for (const a of plan) {
        const debt = await lockedDebt(tx, a.chargeId, studentId);
        if (a.amount > debt) throw new ReceiptError(409, `Taqsimot hisob qarzidan (${debt}) oshadi`, 'OVER_DEBT');
        created.push(await tx.paymentAllocation.create({ data: { paymentId, chargeId: a.chargeId, amount: a.amount, createdById: actorId ?? null } }));
    }
    return created;
}

export interface ReceiptInput {
    studentId: string; amount: number; method?: string; date?: string; note?: string | null; groupId?: string | null;
    allocations?: AllocationInput[]; auto?: boolean; category?: string; source?: string;
}

export async function createReceipt(input: ReceiptInput, actor: { id?: string | null; name?: string | null }) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1e9) throw new ReceiptError(400, "Summa musbat butun son bo'lishi kerak", 'BAD_AMOUNT');
    const date = input.date || todayDateStr();
    if (!isValidDate(date)) throw new ReceiptError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    if (date > todayDateStr()) throw new ReceiptError(400, "Kelajak sanasi bilan to'lov qabul qilinmaydi", 'FUTURE');
    const mode = await getLedgerMode();
    const wantsAllocation = !!(input.allocations?.length) || input.auto !== false;
    if (mode === 'legacy' && input.allocations?.length) throw new ReceiptError(400, "Eski rejimda (legacy) to'lov hisoblarga taqsimlanmaydi", 'LEGACY_MODE');
    const allocationMode = mode === 'legacy' ? 'legacy' : (input.allocations?.length ? 'manual' : 'auto_fifo');

    return prisma.$transaction(async tx => {
        const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true } });
        if (!student) throw new ReceiptError(404, "O'quvchi topilmadi", 'NO_STUDENT');
        const receiptNo = await reserveReceiptNo(tx, date);
        const payment = await tx.payment.create({
            data: {
                studentId: student.id, amount, method: input.method || 'Naqd', date, status: 'paid',
                notes: input.note || `Kurs to'lovi — ${student.name}`, receiptNo, allocationMode,
                receivedById: actor.id ?? null, groupId: input.groupId ?? null,
                sourceType: input.source ?? 'receipt',
            },
        });
        const transaction = await tx.transaction.create({
            data: {
                type: 'income', amount, category: input.category || "Kurs to'lovi", description: `${receiptNo} · ${input.note || `${student.name} — kurs to'lovi`}`,
                date, method: input.method || 'Naqd', studentId: student.id, studentName: student.name, sourceType: 'receipt', sourceId: payment.id,
            },
        });
        const allocations = mode !== 'legacy' && wantsAllocation
            ? await applyAllocations(tx, payment.id, student.id, amount, { allocations: input.allocations, auto: !input.allocations?.length, preferGroupId: input.groupId }, actor.id)
            : [];
        // Eski balans keshi (IP-14 gacha manba) — avvalgidek oshiriladi
        const updated = await tx.student.update({ where: { id: student.id }, data: { balance: { increment: amount } } });
        await tx.student.update({ where: { id: student.id }, data: { paymentStatus: (updated.balance ?? 0) >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' } });
        const allocatedSum = allocations.reduce((s, a) => s + a.amount, 0);
        return { payment, transaction, allocations, unallocated: amount - allocatedSum, allocationMode };
    });
}

/** Mavjud (yangi rejimdagi) to'lovning taqsimlanmagan qismini hisoblarga biriktirish. */
export async function allocatePayment(paymentId: string, spec: { allocations?: AllocationInput[]; auto?: boolean; groupId?: string | null }, actorId?: string | null) {
    return prisma.$transaction(async tx => {
        const p = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!p || p.deletedAt || p.status !== 'paid') throw new ReceiptError(404, "To'lov topilmadi yoki faol emas", 'NO_PAYMENT');
        if (!['manual', 'auto_fifo'].includes(p.allocationMode || '')) throw new ReceiptError(400, "Eski (legacy) to'lov taqsimlanmaydi — boshlang'ich qoldiq orqali hisobga olinadi", 'LEGACY_PAYMENT');
        await tx.payment.update({ where: { id: paymentId }, data: { notes: p.notes } }); // to'lov qatori qulfi
        const available = await paymentUnallocated(tx, paymentId);
        if (available <= 0) throw new ReceiptError(409, "To'lov to'liq taqsimlangan", 'FULLY_ALLOCATED');
        const created = await applyAllocations(tx, paymentId, p.studentId, available, { allocations: spec.allocations, auto: spec.auto ?? !spec.allocations?.length, preferGroupId: spec.groupId ?? p.groupId }, actorId);
        return { allocations: created, unallocated: available - created.reduce((s, a) => s + a.amount, 0) };
    });
}

export async function reverseAllocation(allocationId: string, reason: string, actorId?: string | null) {
    const clean = String(reason || '').trim();
    if (clean.length < 3) throw new ReceiptError(400, 'Bekor qilish sababini yozing', 'NO_REASON');
    const a = await prisma.paymentAllocation.findUnique({ where: { id: allocationId } });
    if (!a) throw new ReceiptError(404, 'Taqsimot topilmadi', 'NOT_FOUND');
    if (a.reversedAt) throw new ReceiptError(409, 'Taqsimot allaqachon bekor qilingan', 'ALREADY_REVERSED');
    return prisma.paymentAllocation.update({ where: { id: allocationId }, data: { reversedAt: new Date(), reversedById: actorId ?? null, reverseReason: clean } });
}

/** Taklif: summani qaysi hisoblarga (FIFO) taqsimlash mumkin — yozmaydi. */
export async function suggestAllocation(studentId: string, amount: number, groupId?: string | null) {
    const open = await openCharges(prisma, studentId, groupId);
    let left = Math.max(0, Math.round(amount));
    const plan = [];
    for (const c of open) {
        if (left <= 0) break;
        const amt = Math.min(left, c.debt);
        plan.push({ chargeId: c.id, month: c.month, groupId: c.groupId, debt: c.debt, amount: amt });
        left -= amt;
    }
    return { plan, credit: left, openTotal: open.reduce((s, c) => s + c.debt, 0) };
}
