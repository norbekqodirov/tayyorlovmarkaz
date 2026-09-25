/**
 * IP-12/IP-13 — yagona qarz va avans hisobi (G.3 §5). "Qarz" hamma joyda shu formula:
 *
 *   Qarz(hisob)  = net + Σ e'lon qilingan tuzatmalar − Σ faol taqsimotlar   (≥ 0)
 *   Avans        = Σ yangi rejimdagi to'lovlar − Σ ularning faol taqsimotlari − Σ qaytarishlar
 *                  (to'liq qaytarilgan to'lov 'refunded' — hisobga kirmaydi; qisman — 'paid' va
 *                   Refund qatorlari ayriladi; bekor qilingan 'void' — kirmaydi, IP-17)
 *   Balans (kesh)= Avans − Σ Qarz
 *
 * Eski (`allocationMode` null/legacy) to'lovlar yangi avansga kirmaydi — o'tishdan oldingi
 * davr boshlang'ich qoldiq (opening_balance) orqali hisobga olinadi (J.4), ikki marta emas.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export const DEBT_CHARGE_TYPES = ['tuition', 'opening_balance', 'other_fee'];
export const NEW_PAYMENT_MODES = ['manual', 'auto_fifo'];

export interface ChargeBalance {
    id: string; studentId: string; groupId: string | null; month: string; type: string; createdAt: Date; dueDate: string | null;
    net: number; adjusted: number; allocated: number; debt: number;
}

/** E'lon qilingan asosiy hisoblar, tuzatma va taqsimotlar bilan. */
export async function chargeBalances(db: Db, where: Prisma.ChargeWhereInput): Promise<ChargeBalance[]> {
    const charges = await db.charge.findMany({
        where: { ...where, status: 'posted', type: { in: DEBT_CHARGE_TYPES } },
        orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, studentId: true, groupId: true, month: true, type: true, createdAt: true, dueDate: true, net: true },
    });
    if (!charges.length) return [];
    const ids = charges.map(c => c.id);
    const [adj, alloc] = await Promise.all([
        db.charge.groupBy({ by: ['reversesChargeId'], where: { reversesChargeId: { in: ids }, status: 'posted' }, _sum: { net: true } }),
        db.paymentAllocation.groupBy({ by: ['chargeId'], where: { chargeId: { in: ids }, reversedAt: null }, _sum: { amount: true } }),
    ]);
    const adjMap = new Map(adj.map(a => [a.reversesChargeId!, a._sum.net ?? 0]));
    const allocMap = new Map(alloc.map(a => [a.chargeId, a._sum.amount ?? 0]));
    return charges.map(c => {
        const adjusted = c.net + (adjMap.get(c.id) ?? 0);
        const allocated = allocMap.get(c.id) ?? 0;
        return { ...c, adjusted, allocated, debt: Math.max(0, adjusted - allocated) };
    });
}

/** Ochiq (qarzi bor) hisoblar — eng eskisi birinchi (FIFO, OQ-08: kerak bo'lsa shu guruh oldin). */
export async function openCharges(db: Db, studentId: string, preferGroupId?: string | null): Promise<ChargeBalance[]> {
    const all = (await chargeBalances(db, { studentId })).filter(c => c.debt > 0);
    if (!preferGroupId) return all;
    return [...all.filter(c => c.groupId === preferGroupId), ...all.filter(c => c.groupId !== preferGroupId)];
}

export async function paymentUnallocated(db: Db, paymentId: string): Promise<number> {
    const p = await db.payment.findUnique({ where: { id: paymentId }, select: { amount: true } });
    if (!p) return 0;
    const [agg, ref] = await Promise.all([
        db.paymentAllocation.aggregate({ where: { paymentId, reversedAt: null }, _sum: { amount: true } }),
        db.refund.aggregate({ where: { paymentId, status: 'done' }, _sum: { amount: true } }),
    ]);
    return Math.round(p.amount) - (agg._sum.amount ?? 0) - (ref._sum.amount ?? 0);
}

export interface StudentPosition { debt: number; credit: number; balance: number; charges: ChargeBalance[] }

export async function studentPosition(db: Db, studentId: string): Promise<StudentPosition> {
    const charges = await chargeBalances(db, { studentId });
    const debt = charges.reduce((a, c) => a + c.debt, 0);
    const payments = await db.payment.findMany({
        where: { studentId, status: 'paid', deletedAt: null, allocationMode: { in: NEW_PAYMENT_MODES } },
        select: { id: true, amount: true },
    });
    const paid = payments.reduce((a, p) => a + Math.round(p.amount), 0);
    const ids = payments.map(p => p.id);
    const [allocated, refunded] = payments.length
        ? await Promise.all([
            db.paymentAllocation.aggregate({ where: { paymentId: { in: ids }, reversedAt: null }, _sum: { amount: true } }).then(a => a._sum.amount ?? 0),
            db.refund.aggregate({ where: { paymentId: { in: ids }, status: 'done' }, _sum: { amount: true } }).then(a => a._sum.amount ?? 0),
        ])
        : [0, 0];
    const credit = Math.max(0, paid - allocated - refunded);
    return { debt, credit, balance: credit - debt, charges };
}
