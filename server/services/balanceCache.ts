/**
 * IP-13/IP-14 — `Student.balance` yangi tizimning KESHI (live rejimda).
 *
 * live: har pul/hisob komandasidan keyin balans = avans − qarz (receivables formulasi)
 * qayta hisoblanadi — shuning uchun `balance < 0` ga tayanadigan barcha ekranlar
 * (dashboard, moliya, bot, portal, hisobotlar) avtomatik yangi qarzni ko'rsatadi.
 * legacy/shadow: hech narsa qilmaydi (balans eskicha yangilanadi).
 *
 * Tashqi to'lov yo'llari (Payme/Click, invoice) Payment yaratgach `afterExternalPayment`
 * chaqiradi: live/shadow'da FIFO taqsimlanadi, legacy'da `allocationMode='legacy'`.
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getLedgerMode } from './ledgerMode.js';
import { studentPosition, paymentUnallocated } from './receivables.js';
import { applyAllocations, reversePaymentAllocations } from './allocation.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Live'da to'lov holati hisoblardan: qarz bor — "Qarzdorlik"; hisob chiqib to'liq to'langan yoki
 * avans bor — "Tolov qilingan"; hisob umuman yo'q (guruhga yozilmagan yoki hisobi 0 ga tuzatilgan)
 * — "Hisobsiz". Ilgari balans 0 bo'lgani uchun guruhsiz o'quvchi ham "To'lov qilingan" chiqardi
 * (2026-09-26: 73 o'quvchi, birorta kirimsiz).
 */
export function liveStatus(pos: { debt: number; credit: number; charges: Array<{ adjusted: number }> }) {
    if (pos.debt > 0) return 'Qarzdorlik';
    if (pos.credit > 0 || pos.charges.some(c => c.adjusted > 0)) return 'Tolov qilingan';
    return 'Hisobsiz';
}

/** live rejimda balans keshini formula bo'yicha yangilaydi; boshqa rejimda — no-op. */
export async function syncStudentBalance(db: Db, studentId: string, mode?: string) {
    if ((mode ?? await getLedgerMode()) !== 'live') return null;
    const pos = await studentPosition(db, studentId);
    await db.student.update({ where: { id: studentId }, data: { balance: pos.balance, paymentStatus: liveStatus(pos) } });
    return pos.balance;
}

export async function syncStudents(db: Db, ids: Iterable<string>) {
    const mode = await getLedgerMode();
    if (mode !== 'live') return 0;
    let n = 0;
    for (const id of new Set(ids)) { await syncStudentBalance(db, id, mode); n++; }
    return n;
}

/** live'ga o'tishda va kunlik: barcha faol o'quvchilar balansini formula bo'yicha. */
export async function syncAllBalances() {
    const students = await prisma.student.findMany({ where: { deletedAt: null }, select: { id: true } });
    return syncStudents(prisma, students.map(s => s.id));
}

/**
 * Solishtirish (J.5 "qarz farqi"): kesh (Student.balance) va formula farqi.
 * live'da farq bo'lmasligi kerak; shadow'da — eski va yangi tizim farqi.
 */
export async function reconcileBalances(opts: { fix?: boolean } = {}) {
    const mode = await getLedgerMode();
    const students = await prisma.student.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true, balance: true, paymentStatus: true } });
    const rows: Array<{ studentId: string; name: string; code: string | null; cache: number; derived: number; diff: number; debt: number; credit: number }> = [];
    // Faqat holati eskirgan (balans to'g'ri) o'quvchilar — live'da tuzatiladi, "farq" hisoblanmaydi
    const statusRows: Array<{ studentId: string; status: string }> = [];
    for (const s of students) {
        const pos = await studentPosition(prisma, s.id);
        const cache = Math.round(s.balance ?? 0);
        const status = liveStatus(pos);
        if (cache !== pos.balance) rows.push({ studentId: s.id, name: s.name, code: s.code, cache, derived: pos.balance, diff: cache - pos.balance, debt: pos.debt, credit: pos.credit });
        if (s.paymentStatus !== status) statusRows.push({ studentId: s.id, status });
    }
    let fixed = 0, statusFixed = 0;
    if (opts.fix && mode === 'live') {
        const statusOf = new Map(statusRows.map(r => [r.studentId, r.status]));
        for (const r of rows) {
            await prisma.student.update({ where: { id: r.studentId }, data: { balance: r.derived, ...(statusOf.has(r.studentId) ? { paymentStatus: statusOf.get(r.studentId) } : {}) } });
            fixed++; statusOf.delete(r.studentId);
        }
        for (const [studentId, status] of statusOf) { await prisma.student.update({ where: { id: studentId }, data: { paymentStatus: status } }); statusFixed++; }
    }
    return { mode, checked: students.length, differences: rows.length, fixed, statusDifferences: mode === 'live' ? statusRows.length : 0, statusFixed, rows };
}

/** Tashqi yo'l (Payme/Click/invoice) Payment yaratgandan keyin — rejimga ko'ra taqsimlash va kesh. */
export async function afterExternalPayment(tx: Prisma.TransactionClient, paymentId: string, actorId?: string | null) {
    const mode = await getLedgerMode();
    const p = await tx.payment.findUnique({ where: { id: paymentId }, select: { id: true, studentId: true, groupId: true, allocationMode: true } });
    if (!p) return;
    if (mode === 'legacy') {
        if (!p.allocationMode) await tx.payment.update({ where: { id: p.id }, data: { allocationMode: 'legacy' } });
        return;
    }
    await tx.payment.update({ where: { id: p.id }, data: { allocationMode: 'auto_fifo' } });
    const available = await paymentUnallocated(tx, p.id);
    if (available > 0) await applyAllocations(tx, p.id, p.studentId, available, { auto: true, preferGroupId: p.groupId }, actorId);
    await syncStudentBalance(tx, p.studentId, mode);
}

/** To'lov bekor qilinganda (refund, o'chirish): taqsimotlar qaytariladi va kesh yangilanadi. */
export async function afterPaymentVoided(tx: Prisma.TransactionClient, paymentId: string, reason: string, actorId?: string | null) {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, select: { studentId: true } });
    if (!p) return 0;
    const n = await reversePaymentAllocations(tx, paymentId, reason, actorId);
    await syncStudentBalance(tx, p.studentId);
    return n;
}
