/**
 * To'lov → hisob taqsimoti primitivlari (IP-12). Invariantlar:
 *   har taqsimot ≤ hisob qarzi; jami ≤ mavjud (taqsimlanmagan) summa.
 * Parallel yozuvlar bir hisobni ortiqcha yopmasligi uchun hisob qatori avval
 * qulflanadi (Postgres — qator qulfi, SQLite — yozuvchi qulfi), keyin qarz qayta o'qiladi.
 */
import type { Prisma } from '@prisma/client';
import { chargeBalances, openCharges, paymentUnallocated, DEBT_CHARGE_TYPES, NEW_PAYMENT_MODES } from './receivables.js';

type Tx = Prisma.TransactionClient;

export class AllocationError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export interface AllocationInput { chargeId: string; amount: number }

async function lockedDebt(tx: Tx, chargeId: string, studentId: string) {
    const ch = await tx.charge.findUnique({ where: { id: chargeId }, select: { id: true, studentId: true, status: true, type: true } });
    if (!ch || ch.studentId !== studentId) throw new AllocationError(400, "Hisob topilmadi yoki boshqa o'quvchiniki", 'BAD_CHARGE');
    if (ch.status !== 'posted' || !DEBT_CHARGE_TYPES.includes(ch.type)) throw new AllocationError(400, "Faqat e'lon qilingan hisobga taqsimlanadi", 'NOT_POSTED');
    await tx.charge.update({ where: { id: chargeId }, data: { updatedAt: new Date() } });
    const [b] = await chargeBalances(tx, { id: chargeId });
    return b?.debt ?? 0;
}

/** Taqsimotlarni tekshirib yozadi. `auto` — FIFO (preferGroupId oldin). */
export async function applyAllocations(
    tx: Tx, paymentId: string, studentId: string, available: number,
    spec: { allocations?: AllocationInput[]; auto?: boolean; preferGroupId?: string | null }, actorId?: string | null,
) {
    let plan: AllocationInput[] = [];
    if (spec.allocations?.length) {
        plan = spec.allocations.map(a => ({ chargeId: a.chargeId, amount: Number(a.amount) }));
        for (const a of plan) if (!Number.isInteger(a.amount) || a.amount <= 0) throw new AllocationError(400, "Taqsimot summasi musbat butun son bo'lishi kerak", 'BAD_ALLOCATION');
        if (plan.reduce((s, a) => s + a.amount, 0) > available) throw new AllocationError(400, "Taqsimotlar jami to'lovdan (qoldiqdan) oshadi", 'OVER_PAYMENT');
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
        if (a.amount > debt) throw new AllocationError(409, `Taqsimot hisob qarzidan (${debt}) oshadi`, 'OVER_DEBT');
        created.push(await tx.paymentAllocation.create({ data: { paymentId, chargeId: a.chargeId, amount: a.amount, createdById: actorId ?? null } }));
    }
    return created;
}

/**
 * Hisob kamaytirilganda (tuzatma, oy yakuni) ortiqcha taqsimotni qisqartirish:
 * eng oxirgi taqsimotlardan boshlab bekor qilinadi, kerak bo'lsa kichikroq yangisi
 * yoziladi (taqsimot summasi o'zgarmaydi — "bekor qilib yangisi", H.4). Bo'shagan
 * pul to'lovning taqsimlanmagan qismiga — ya'ni avansga — qaytadi.
 */
export async function trimOverAllocation(tx: Tx, chargeId: string, reason: string, actorId?: string | null) {
    const [b] = await chargeBalances(tx, { id: chargeId });
    if (!b) return 0;
    let excess = b.allocated - Math.max(0, b.adjusted);
    if (excess <= 0) return 0;
    const allocs = await tx.paymentAllocation.findMany({ where: { chargeId, reversedAt: null }, orderBy: { createdAt: 'desc' } });
    let freed = 0;
    for (const a of allocs) {
        if (excess <= 0) break;
        await tx.paymentAllocation.update({ where: { id: a.id }, data: { reversedAt: new Date(), reversedById: actorId ?? null, reverseReason: reason } });
        const keep = a.amount - Math.min(a.amount, excess);
        if (keep > 0) await tx.paymentAllocation.create({ data: { paymentId: a.paymentId, chargeId, amount: keep, createdById: actorId ?? null } });
        const cut = a.amount - keep;
        excess -= cut;
        freed += cut;
    }
    return freed;
}

/** To'lovning barcha faol taqsimotlarini bekor qilish (to'lov bekor/refund bo'lganda). */
export async function reversePaymentAllocations(tx: Tx, paymentId: string, reason: string, actorId?: string | null) {
    const r = await tx.paymentAllocation.updateMany({
        where: { paymentId, reversedAt: null },
        data: { reversedAt: new Date(), reversedById: actorId ?? null, reverseReason: reason },
    });
    return r.count;
}

/**
 * O'quvchining taqsimlanmagan pulini (avansini) ochiq hisoblarga FIFO biriktirish —
 * hisob to'lovdan KEYIN e'lon qilinganda (RS-38: avans yangi oy hisobini avtomatik qoplaydi).
 * Eng eski to'lovdan boshlab; har to'lov o'z guruhini oldin qoplaydi (OQ-08).
 */
export async function applyStudentCredit(tx: Tx, studentId: string, actorId?: string | null) {
    const payments = await tx.payment.findMany({
        where: { studentId, status: 'paid', deletedAt: null, allocationMode: { in: NEW_PAYMENT_MODES } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, groupId: true },
    });
    let created = 0;
    for (const p of payments) {
        const available = await paymentUnallocated(tx, p.id);
        if (available <= 0) continue;
        const rows = await applyAllocations(tx, p.id, studentId, available, { auto: true, preferGroupId: p.groupId }, actorId);
        created += rows.length;
        if (!rows.length) break; // ochiq hisob qolmadi
    }
    return created;
}
