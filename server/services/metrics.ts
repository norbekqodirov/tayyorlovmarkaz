/**
 * IP-24 — metrikalar lug'ati (H.9) va yagona server agregatsiyasi (HB-05).
 *
 * "Daromad" ilgari har ekranda boshqacha edi: barcha `income` tranzaksiyalari (boshqa kirim va
 * bekor qilish qarshi yozuvlari ham), brauzerda oy raqami bo'yicha (yil hisobga olinmay), kurs
 * narxi × o'quvchilar soni... Endi Dashboard, BI, ijroiya hisobot, KPI maqsadlari va hisobotlar
 * shu yerdan oladi: bir xil oy → har ekranda bir xil raqam. Har metrika ta'rifi (formula, vaqt
 * asosi, manba) bilan qaytadi — kartada ko'rsatiladi.
 *
 * Kassa metrikalari kassa yozuvlaridan (Transaction) kategoriya TURI bo'yicha (IP-12/23): bekor
 * qilingan yozuv va uning qarshi yozuvi birga 0 beradi, "Kassa va hisoblar" bilan bir xil.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { guessCategoryKind, CATEGORY_KINDS, type CategoryKind } from './categories.js';
import { chargeBalances } from './receivables.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface MetricDef { key: string; label: string; formula: string; basis: string; source: string; unit: 'som' | 'count' | 'percent' }

export const METRIC_DEFS: MetricDef[] = [
    { key: 'accrualRevenue', label: 'Hisoblangan tushum', unit: 'som', basis: 'Xizmat oyi', source: 'Oylik hisoblar',
      formula: "Shu oy uchun chiqqan o'quvchi hisoblari (kurs, boshqa to'lov) + ularning tuzatmalari" },
    { key: 'tuitionCash', label: "Kurs to'lovi (kassa)", unit: 'som', basis: "To'lov sanasi", source: 'Kassa yozuvlari',
      formula: "Shu oyda kassaga tushgan kurs to'lovlari − o'quvchiga qaytarilgan pul (bekor qilinganlar hisobga olinmaydi)" },
    { key: 'otherIncome', label: 'Boshqa kirim', unit: 'som', basis: 'Sana', source: 'Kassa yozuvlari',
      formula: "Kurs to'lovidan boshqa kirimlar (kitob, forma va h.k.) — o'quvchi qarziga ta'sir qilmaydi" },
    { key: 'operatingExpense', label: 'Operatsion xarajat', unit: 'som', basis: 'Sana', source: 'Kassa yozuvlari',
      formula: "Ijara, kommunal, reklama va boshqa xarajatlar (oylik va avans kirmaydi)" },
    { key: 'payrollCash', label: "Oylik to'lovi (kassa)", unit: 'som', basis: 'Sana', source: 'Kassa yozuvlari',
      formula: "Shu oyda xodim va ustozlarga berilgan oylik (avans alohida)" },
    { key: 'advancesCash', label: 'Berilgan avanslar', unit: 'som', basis: 'Sana', source: 'Kassa yozuvlari',
      formula: "Shu oyda xodim va ustozlarga oldindan berilgan pul" },
    { key: 'netCashFlow', label: 'Sof pul oqimi', unit: 'som', basis: 'Sana', source: 'Kassa yozuvlari',
      formula: "Kurs to'lovi + boshqa kirim − operatsion xarajat − oylik − avans (ichki o'tkazmalar kirmaydi)" },
    { key: 'payrollAccrual', label: 'Hisoblangan oylik', unit: 'som', basis: 'Oy', source: 'Xodimlar oyligi',
      formula: "Shu oy uchun tasdiqlangan ustoz oyligi + xodim oyligi (to'langan-to'lanmaganidan qat'i nazar)" },
    { key: 'receivables', label: 'Qarz (debitorlik)', unit: 'som', basis: 'Hozirgi holat', source: 'Oylik hisoblar',
      formula: "Barcha hisoblar bo'yicha to'lanmagan qoldiq, hozirgi holat" },
    { key: 'overdueDebt', label: "Muddati o'tgan qarz", unit: 'som', basis: 'Hozirgi holat', source: 'Oylik hisoblar',
      formula: "To'lov muddati o'tgan hisoblar qarzi (1–7, 8–30, 31–60, 60+ kun bo'yicha)" },
    { key: 'studentCredit', label: "O'quvchi avanslari", unit: 'som', basis: 'Hozirgi holat', source: "To'lovlar",
      formula: "O'quvchilar oldindan to'lagan, hali hisobga taqsimlanmagan pul" },
    { key: 'activeStudents', label: "Faol o'quvchilar", unit: 'count', basis: "Oy oxiri (joriy oyda — bugun)", source: "Guruh a'zoliklari",
      formula: "Shu kuni kamida bitta guruhda a'zoligi bor o'quvchilar (guruhsizlar kirmaydi)" },
    { key: 'newStudents', label: "Yangi o'quvchilar", unit: 'count', basis: 'Oy', source: "Guruh a'zoliklari",
      formula: "Birinchi guruh a'zoligi shu oyda boshlangan o'quvchilar" },
    { key: 'churnRate', label: 'Ketish (churn)', unit: 'percent', basis: 'Oy', source: "Guruh a'zoliklari",
      formula: "Shu oyda \"ketdi\" sababi bilan tugagan a'zoliklar / oy boshidagi faol a'zoliklar" },
    { key: 'groupFill', label: "Guruhlar to'liqligi", unit: 'percent', basis: "Oy oxiri (joriy oyda — bugun)", source: "Guruhlar, a'zoliklar",
      formula: "Faol a'zoliklar / faol guruhlar sig'imi (maxSize) yig'indisi" },
    { key: 'attendanceRate', label: 'Davomat', unit: 'percent', basis: 'Oy', source: 'Davomat',
      formula: "(keldi + kechikdi) / (keldi + kechikdi + kelmadi); sababli alohida, belgilanmagan kirmaydi" },
    { key: 'leadConversion', label: 'Lid konversiyasi', unit: 'percent', basis: 'Kohort (lid yaratilgan oy)', source: 'Lidlar',
      formula: "Shu oyda yaratilgan lidlardan o'quvchiga aylanganlari / shu oyda yaratilgan lidlar" },
];

function monthBounds(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Object.assign(new Error("Oy YYYY-MM formatida bo'lishi kerak"), { status: 400 });
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
const prevDay = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const round = (n: number) => Math.round(n);

/** Kategoriya nomi+turi → tur (TransactionCategory.kind, bo'lmasa nom bo'yicha taxmin). */
async function kindResolver(db: Db) {
    const rows = await db.transactionCategory.findMany({ select: { name: true, type: true, kind: true } });
    const map = new Map(rows.filter(r => r.kind && (CATEGORY_KINDS as readonly string[]).includes(r.kind)).map(r => [`${r.type}|${r.name}`, r.kind as CategoryKind]));
    return (name: string, type: string): CategoryKind => map.get(`${type}|${name}`) ?? guessCategoryKind(name, type);
}

/** Kassa metrikalari [from, to] oralig'i uchun (tur bo'yicha). byMonth — 'YYYY-MM' bo'yicha ham. */
export async function cashFlows(db: Db, from: string, to: string) {
    const rows = await db.transaction.groupBy({ by: ['type', 'category', 'date'], where: { date: { gte: from, lte: to } }, _sum: { amount: true } });
    const kindOf = await kindResolver(db);
    const empty = () => ({ tuitionCash: 0, otherIncome: 0, operatingExpense: 0, payrollCash: 0, advancesCash: 0, netCashFlow: 0 });
    const total = empty();
    const byMonth = new Map<string, ReturnType<typeof empty>>();
    for (const r of rows) {
        const amt = r._sum.amount ?? 0;
        const kind = kindOf(r.category, r.type);
        const key = r.type === 'income'
            ? (kind === 'TUITION' || kind === 'REFUND' ? 'tuitionCash' : kind === 'TRANSFER' ? null : 'otherIncome')
            : (kind === 'PAYROLL_PAYOUT' ? 'payrollCash' : kind === 'STAFF_ADVANCE' ? 'advancesCash' : kind === 'TRANSFER' ? null
                : kind === 'REFUND' ? 'tuitionCash' : 'operatingExpense');
        if (!key) continue;
        // Chiqim sifatida yozilgan eski qaytarish — kurs tushumidan ayiriladi
        const v = r.type === 'expense' && key === 'tuitionCash' ? -amt : amt;
        const m = r.date.slice(0, 7);
        if (!byMonth.has(m)) byMonth.set(m, empty());
        (total as any)[key] += v; (byMonth.get(m) as any)[key] += v;
    }
    const finish = (x: ReturnType<typeof empty>) => {
        for (const k of Object.keys(x)) (x as any)[k] = round((x as any)[k]);
        x.netCashFlow = x.tuitionCash + x.otherIncome - x.operatingExpense - x.payrollCash - x.advancesCash;
        return x;
    };
    finish(total);
    for (const v of byMonth.values()) finish(v);
    return { total, byMonth };
}

/** Hisoblangan tushum oylar bo'yicha (posted hisoblar + tuzatmalar; boshlang'ich qoldiq kirmaydi). */
export async function accrualByMonth(db: Db, fromMonth: string, toMonth: string) {
    const rows = await db.charge.groupBy({
        by: ['month'], where: { status: 'posted', type: { in: ['tuition', 'other_fee', 'adjustment'] }, month: { gte: fromMonth, lte: toMonth } }, _sum: { net: true },
    });
    return new Map(rows.map(r => [r.month, round(r._sum.net ?? 0)]));
}

/** Bitta oy uchun barcha metrikalar (H.9). */
export async function computeMetrics(month: string, db: Db = prisma) {
    const { from, to: monthEnd } = monthBounds(month);
    const today = todayDateStr();
    const asOf = monthEnd < today ? monthEnd : today; // a'zolik metrikalari shu kun holatiga

    const [cash, accrual, teacherPay, staffPay, periods, groups, attendance, leads, open, credit] = await Promise.all([
        cashFlows(db, from, monthEnd),
        accrualByMonth(db, month, month),
        db.teacherPayroll.aggregate({ where: { month, status: { not: 'draft' } }, _sum: { accruedAmount: true } }),
        db.salary.aggregate({ where: { month }, _sum: { total: true } }),
        db.enrollmentPeriod.findMany({ select: { studentId: true, groupId: true, startDate: true, endDate: true, endReason: true } }),
        db.group.findMany({ where: { deletedAt: null }, select: { id: true, maxSize: true, status: true } }),
        db.attendanceRecord.groupBy({ by: ['status'], where: { date: { gte: from, lte: monthEnd } }, _count: { _all: true } }),
        db.lead.findMany({ where: { deletedAt: null, createdAt: { gte: new Date(`${from}T00:00:00+05:00`), lte: new Date(`${monthEnd}T23:59:59.999+05:00`) } }, select: { convertedAt: true, studentId: true, stage: true } }),
        chargeBalances(db, {}),
        studentCreditTotal(db),
    ]);

    // A'zolik metrikalari (sana bo'yicha: boshlangan va tugamagan)
    const activeOn = (d: string) => periods.filter(p => p.startDate <= d && (!p.endDate || p.endDate >= d));
    const activeAt = activeOn(asOf);
    const startedBefore = activeOn(prevDay(from));
    const firstStart = new Map<string, string>();
    for (const p of periods) { const cur = firstStart.get(p.studentId); if (!cur || p.startDate < cur) firstStart.set(p.studentId, p.startDate); }
    const newStudents = [...firstStart.values()].filter(d => d >= from && d <= monthEnd).length;
    const leftInMonth = periods.filter(p => p.endReason === 'left' && p.endDate && p.endDate >= from && p.endDate <= monthEnd).length;
    const activeGroupIds = new Set(groups.filter(g => g.status === 'active' || g.status === 'Faol').map(g => g.id));
    const capacity = groups.filter(g => activeGroupIds.has(g.id)).reduce((a, g) => a + (g.maxSize || 0), 0);
    const activeInActiveGroups = activeAt.filter(p => activeGroupIds.has(p.groupId)).length;

    // Davomat
    const att = Object.fromEntries(attendance.map(a => [a.status, a._count._all]));
    const attended = (att.present || 0) + (att.late || 0);
    const markedForRate = attended + (att.absent || 0);

    // Qarz va muddati o'tgan qarz (hozirgi holat)
    const buckets = { d1_7: 0, d8_30: 0, d31_60: 0, d60: 0 };
    let receivables = 0, overdue = 0;
    for (const c of open) {
        if (c.debt <= 0) continue;
        receivables += c.debt;
        if (c.dueDate && c.dueDate < today) {
            overdue += c.debt;
            const days = daysBetween(c.dueDate, today);
            if (days <= 7) buckets.d1_7 += c.debt; else if (days <= 30) buckets.d8_30 += c.debt; else if (days <= 60) buckets.d31_60 += c.debt; else buckets.d60 += c.debt;
        }
    }

    const converted = leads.filter(l => l.convertedAt || l.studentId).length;
    const values: Record<string, number> = {
        accrualRevenue: accrual.get(month) ?? 0,
        ...cash.total,
        payrollAccrual: round((teacherPay._sum.accruedAmount ?? 0) + (staffPay._sum.total ?? 0)),
        receivables: round(receivables),
        overdueDebt: round(overdue),
        studentCredit: round(credit),
        activeStudents: new Set(activeAt.map(p => p.studentId)).size,
        newStudents,
        churnRate: pct(leftInMonth, startedBefore.length),
        groupFill: pct(activeInActiveGroups, capacity),
        attendanceRate: pct(attended, markedForRate),
        leadConversion: pct(converted, leads.length),
    };
    return {
        month, from, to: monthEnd, asOf, generatedAt: new Date().toISOString(),
        definitions: METRIC_DEFS, values,
        details: {
            overdueBuckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round(v)])),
            attendance: { present: att.present || 0, late: att.late || 0, absent: att.absent || 0, excused: att.excused || 0 },
            leads: { created: leads.length, converted },
            churn: { left: leftInMonth, activeAtStart: startedBefore.length },
            groups: { activeMemberships: activeInActiveGroups, capacity },
        },
    };
}

/** O'quvchilarning taqsimlanmagan avansi (yangi rejimdagi to'lovlar − taqsimot − qaytarish). */
async function studentCreditTotal(db: Db) {
    const payments = await db.payment.findMany({
        where: { status: 'paid', deletedAt: null, allocationMode: { in: ['manual', 'auto_fifo'] } }, select: { id: true, amount: true },
    });
    if (!payments.length) return 0;
    const ids = payments.map(p => p.id);
    const [alloc, ref] = await Promise.all([
        db.paymentAllocation.groupBy({ by: ['paymentId'], where: { paymentId: { in: ids }, reversedAt: null }, _sum: { amount: true } }),
        db.refund.groupBy({ by: ['paymentId'], where: { paymentId: { in: ids }, status: 'done' }, _sum: { amount: true } }),
    ]);
    const used = new Map<string, number>();
    for (const a of alloc) used.set(a.paymentId, (used.get(a.paymentId) ?? 0) + (a._sum.amount ?? 0));
    for (const r of ref) if (r.paymentId) used.set(r.paymentId, (used.get(r.paymentId) ?? 0) + (r._sum.amount ?? 0));
    return payments.reduce((s, p) => s + Math.max(0, Math.round(p.amount) - (used.get(p.id) ?? 0)), 0);
}

/** Yil bo'yicha oylik moliya qatori (grafiklar uchun): hisoblangan tushum va kassa metrikalari. */
export async function financeSeries(year: string, db: Db = prisma) {
    if (!/^\d{4}$/.test(year)) throw Object.assign(new Error("Yil YYYY formatida bo'lishi kerak"), { status: 400 });
    const [cash, accrual] = await Promise.all([cashFlows(db, `${year}-01-01`, `${year}-12-31`), accrualByMonth(db, `${year}-01`, `${year}-12`)]);
    return Array.from({ length: 12 }, (_, i) => {
        const month = `${year}-${String(i + 1).padStart(2, '0')}`;
        const c = cash.byMonth.get(month) ?? { tuitionCash: 0, otherIncome: 0, operatingExpense: 0, payrollCash: 0, advancesCash: 0, netCashFlow: 0 };
        return {
            month, accrualRevenue: accrual.get(month) ?? 0, ...c,
            income: c.tuitionCash + c.otherIncome,
            expense: c.operatingExpense + c.payrollCash + c.advancesCash,
        };
    });
}
