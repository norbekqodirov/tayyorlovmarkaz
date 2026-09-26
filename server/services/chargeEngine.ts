/**
 * IP-11 — oylik hisob dvigateli (charge engine).
 *
 * Har a'zolik davri × oy uchun bitta tuition hisobi (`chargeKey = T:{periodId}:{YYYY-MM}`,
 * unique — takroriy va parallel generatsiya dublikat bermaydi, QT-65). Formula —
 * server/domain/billingFormula.ts (ADR: docs/ADR_HISOB_QOIDALARI.md); kiruvchi
 * qiymatlar `calc` JSON'da saqlanadi — har summa "qanday hisoblandi" izohlanadi.
 *
 * Holatlar: draft → posted | void. E'lon qilingan hisob o'zgarmaydi (QT-66):
 * keyingi o'zgarish (davomat, pauza, tarif) — `settleMonth` tuzatma hisobi
 * (`S:{chargeId}:{n}`); qo'lda — `adjustCharge` (sabab majburiy). Yopilgan oyga
 * tuzatma keyingi ochiq oyga tushadi (OQ-10).
 *
 * `ledger_mode` (Setting): legacy — dvigatel faqat qo'lda ishga tushiriladi va
 * natijasi hech qayerda ishlatilmaydi; shadow — kunlik draft va eski hisob bilan
 * solishtirish; live — (IP-13/14) qarz va balans shu hisoblardan.
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { computeCharge, chargeDueDate, roundSom, type ChargeInput, type ChargeResult, type DiscountInput } from '../domain/billingFormula.js';
import { monthLessons, monthRange, versionAt, addDays, billingWindow, type CycleMode } from '../domain/lessonCalendar.js';
import { billableLessonDates, teacherAt, windowLessonDates } from './lessonPlan.js';
import { groupScheduleDays } from './enrollment.js';
import { getBillingSettings, calculateStudentMonthlyDue, type BillingSettings } from './billing.js';
import { studentPosition, chargeBalances } from './receivables.js';
import { getLedgerMode, setLedgerMode, LEDGER_MODES, type LedgerMode } from './ledgerMode.js';
import { syncStudents } from './balanceCache.js';
import { trimOverAllocation, applyStudentCredit } from './allocation.js';

export { getLedgerMode, setLedgerMode, LEDGER_MODES, type LedgerMode };

type Db = PrismaClient | Prisma.TransactionClient;

export class BillingError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function assertMonth(month: string) {
    if (!MONTH_RE.test(month)) throw new BillingError(400, "Oy YYYY-MM formatida bo'lishi kerak", 'BAD_MONTH');
}
function nextMonth(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

// ─── Davr ────────────────────────────────────────────────────────────────────

async function getPeriod(db: Db, month: string) {
    return db.billingPeriod.findUnique({ where: { month } });
}

/** Oy uchun davr (yo'q bo'lsa ochiq holda yaratiladi). Yopilgan oyga yozib bo'lmaydi. */
async function ensureOpenPeriod(db: Db, month: string) {
    let p = await getPeriod(db, month);
    if (!p) {
        try { p = await db.billingPeriod.create({ data: { month } }); }
        catch { p = await getPeriod(db, month); }
    }
    if (!p) throw new BillingError(500, 'Davr yaratilmadi', 'NO_PERIOD');
    if (p.status === 'closed') throw new BillingError(409, `${month} oyi yopilgan — faqat keyingi oyda tuzatma`, 'CLOSED');
    return p;
}

/** Tuzatma tushadigan oy: berilgan oy ochiq bo'lsa o'zi, aks holda keyingi ochiq oy (OQ-10). */
async function openMonthFrom(db: Db, month: string): Promise<string> {
    let m = month;
    for (let i = 0; i < 24; i++) {
        const p = await getPeriod(db, m);
        if (!p || p.status !== 'closed') return m;
        m = nextMonth(m);
    }
    throw new BillingError(500, 'Ochiq oy topilmadi', 'NO_OPEN_MONTH');
}

// ─── Bitta davr × oy hisobi ──────────────────────────────────────────────────

export interface PeriodMonthCalc {
    skip?: string;
    input?: ChargeInput;
    result?: ChargeResult;
    calc: Record<string, unknown>;
    teacherId: string | null;
    dueDate: string | null;
}

type PeriodWithPauses = Prisma.EnrollmentPeriodGetPayload<{ include: { pauses: true } }>;

/**
 * Guruhning hisob usuli: bir marta hisob e'lon qilingan bo'lsa — o'sha usulda davom etadi
 * (oylar orasida bo'shliq yoki ikki marta hisob bo'lmasligi uchun); aks holda sozlama.
 */
export async function groupCycleMode(db: Db, groupId: string, fallback: CycleMode): Promise<CycleMode> {
    const last = await db.charge.findFirst({ where: { groupId, type: 'tuition', status: 'posted' }, orderBy: { month: 'desc' }, select: { calc: true } });
    if (!last) return fallback;
    try { return (JSON.parse(last.calc || '{}').cycleMode as CycleMode) || 'calendar'; } catch { return 'calendar'; }
}

/** Mavjud hisob qaysi usulda hisoblangan (qayta hisoblash shu usulda bo'ladi). */
function chargeCycleMode(calc: string | null): CycleMode {
    try { return (JSON.parse(calc || '{}').cycleMode as CycleMode) || 'calendar'; } catch { return 'calendar'; }
}

export interface CalcOptions {
    /** Majburiy usul (mavjud hisobni qayta hisoblashda — o'sha hisob usuli). */
    cycleMode?: CycleMode;
    /** Shu sanadan keyin boshlanadigan oyna uchun hisob chiqmaydi (avtomatik generatsiya). */
    upTo?: string;
}

export async function calcPeriodMonth(db: Db, period: PeriodWithPauses, month: string, settings?: BillingSettings, opts: CalcOptions = {}): Promise<PeriodMonthCalc> {
    const s = settings ?? await getBillingSettings();
    const base = { calc: { month, periodId: period.id }, teacherId: null, dueDate: null } as PeriodMonthCalc;
    const [group, student] = await Promise.all([
        db.group.findUnique({ where: { id: period.groupId }, select: { id: true, startDate: true, endDate: true, teacherId: true, price: true, course: { select: { price: true } } } }),
        db.student.findUnique({ where: { id: period.studentId }, select: { deletedAt: true } }),
    ]);
    if (!group) return { ...base, skip: 'Guruh topilmadi' };
    const cycleMode = opts.cycleMode ?? await groupCycleMode(db, group.id, s.cycleMode);
    const win = billingWindow(month, cycleMode, group.startDate);
    if (!win) return { ...base, skip: 'Guruh bu oyda hali boshlanmagan' };
    const first = win.from, last = win.to;
    if (opts.upTo && first > opts.upTo) return { ...base, skip: 'Hisob davri hali boshlanmagan' };
    if (period.startDate > last || (period.endDate && period.endDate < first)) return { ...base, skip: 'Davr bu oyni qamramaydi' };
    if (student?.deletedAt && todayDateStr(student.deletedAt) < first) return { ...base, skip: "O'quvchi bu oydan oldin arxivlangan" };

    const days = await groupScheduleDays(db, group.id);
    const wl = await windowLessonDates(db, group.id, days, first, last);
    if (!wl) return { ...base, skip: "Guruh dars jadvali va rejasi yo'q" };
    const pauses = period.pauses.filter(p => p.status === 'active').map(p => ({ from: p.fromDate, to: p.toDate }));
    const ml = monthLessons({
        month, window: win, days, groupStart: group.startDate, groupEnd: group.endDate,
        periodStart: period.startDate, periodEnd: period.endDate, pauses, lessonDates: wl.dates,
    });
    const inPeriod = (d: string) => d >= period.startDate && (!period.endDate || d <= period.endDate) && !pauses.some(p => d >= p.from && d <= p.to);

    // Pullik qo'shimcha darslar (OQ-03) — o'quvchi qatnashgan bo'lsa
    const extraSessions = await db.lessonSession.findMany({
        where: { groupId: group.id, kind: 'extra', billable: true, date: { gte: first, lte: last }, status: { not: 'cancelled' } },
        include: { attendance: { where: { studentId: period.studentId, status: { in: ['present', 'late'] } } } },
    });
    const extras = extraSessions.filter(x => inPeriod(x.date) && x.attendance.length && (x.price ?? 0) > 0)
        .map(x => ({ amount: x.price!, description: `${x.label || "Qo'shimcha dars"} (${x.date})`, sourceId: x.id }));
    if (!ml.billable.length && !extras.length) return { ...base, skip: "Bu oyda billable dars yo'q" };

    // Tarif: o'quvchining birinchi billable kunidagi versiya, aks holda eski narx
    const versions = await db.tariffVersion.findMany({ where: { groupId: group.id } });
    const tariffDate = ml.billable[0] ?? first;
    const v = versionAt(versions, tariffDate);
    const price = v ? v.monthlyPrice : (group.price ?? group.course?.price ?? null);
    const N = v ? v.lessonsPerPackage : s.lessonsPerMonth;
    if (price == null) return { ...base, skip: "Guruh va kursda narx yo'q" };
    if (!(N > 0)) return { ...base, skip: "Oylik darslar soni (N) 0 — avtomatik hisob chiqmaydi" };

    const absentRows = ml.billable.length ? await db.attendanceRecord.findMany({
        where: { studentId: period.studentId, groupId: group.id, date: { in: ml.billable }, status: 'absent' }, select: { date: true },
    }) : [];

    const otherDiscounts: DiscountInput[] = [];
    // Markaz/ustoz bekor qilgan, qoplanmagan dars — faqat to'liq oyda (qisman oyda R ga kirmaydi, ikki marta chegirilmaydi)
    let cancelCredits: string[] = [];
    if (ml.fullMonth) {
        const cancelled = await db.lessonSession.findMany({ where: { groupId: group.id, kind: 'regular', status: 'cancelled', compensate: true, date: { gte: first, lte: last } }, select: { id: true, date: true } });
        cancelCredits = cancelled.filter(c => inPeriod(c.date)).map(c => c.date);
        if (cancelCredits.length) otherDiscounts.push({ kind: 'cancel_credit', amount: roundSom(price * cancelCredits.length / N), description: `Bekor qilingan dars: ${cancelCredits.join(', ')}` });
    }
    const studentDiscounts = await db.studentDiscount.findMany({
        where: { studentId: period.studentId, status: 'active', fromMonth: { lte: month }, OR: [{ toMonth: null }, { toMonth: { gte: month } }] },
    });
    for (const d of studentDiscounts.filter(d => !d.groupId || d.groupId === group.id)) {
        otherDiscounts.push({ kind: d.kind as DiscountInput['kind'], ...(d.percentBp != null ? { percentBp: d.percentBp } : { amount: d.amount ?? 0 }), description: d.reason, sourceId: d.id });
    }

    const input: ChargeInput = {
        price: Math.round(price), lessonsPerPackage: N, billableLessons: ml.billable.length, fullMonth: ml.fullMonth,
        absences: absentRows.length, threshold: s.absenceThreshold, extraLessons: extras, otherDiscounts,
    };
    const result = computeCharge(input);

    // Ustoz darslari (IP-15 ulushi uchun): rejadagi dars ustozi, bo'lmasa sana bo'yicha tayinlash
    const sessions = ml.billable.length ? await db.lessonSession.findMany({ where: { groupId: group.id, kind: 'regular', date: { in: ml.billable } }, select: { date: true, teacherId: true, status: true } }) : [];
    const teacherLessons: Record<string, number> = {};
    for (const d of ml.billable) {
        const sess = sessions.find(x => x.date === d && x.status !== 'cancelled' && x.status !== 'moved');
        const t = sess?.teacherId ?? await teacherAt(db, group.id, d) ?? group.teacherId ?? 'noma\'lum';
        teacherLessons[t] = (teacherLessons[t] ?? 0) + 1;
    }
    const mainTeacher = Object.entries(teacherLessons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? group.teacherId ?? null;
    const [y, m] = month.split('-').map(Number);
    return {
        input, result,
        teacherId: mainTeacher === "noma'lum" ? null : mainTeacher,
        dueDate: chargeDueDate({
            year: y, month: m, fullMonth: ml.fullMonth, startDate: period.startDate > first ? period.startDate : undefined,
            windowStart: cycleMode === 'group_anniversary' ? first : undefined,
        }),
        calc: {
            month, periodId: period.id, periodStart: period.startDate, periodEnd: period.endDate,
            cycleMode, windowFrom: first, windowTo: last,
            P: input.price, N, R: ml.billable.length, F: ml.groupLessons.length, A: absentRows.length, M: s.absenceThreshold,
            fullMonth: ml.fullMonth, planUsed: wl.planUsed, tariffSource: v ? 'version' : 'legacy', tariffVersionId: v?.id ?? null,
            billableDates: ml.billable, absentDates: absentRows.map(r => r.date), pauses, cancelCredits,
            extras: extras.map(e => ({ sessionId: e.sourceId, amount: e.amount })), discounts: studentDiscounts.map(d => d.id),
            teacherLessons,
        },
    };
}

// ─── Generatsiya ─────────────────────────────────────────────────────────────

export interface GenerateResult {
    month: string; created: number; updated: number; unchanged: number; voided: number;
    postedDiffs: Array<{ chargeId: string; studentId: string; groupId: string | null; postedNet: number; freshNet: number }>;
    skipped: Array<{ periodId: string; studentId: string; groupId: string; reason: string }>;
    legacyWithoutPeriod: number;
}

function sameLines(a: Array<{ kind: string; amount: number }>, b: Array<{ kind: string; amount: number }>) {
    const key = (xs: Array<{ kind: string; amount: number }>) => xs.map(x => `${x.kind}:${x.amount}`).sort().join('|');
    return a.length === b.length && key(a) === key(b);
}

export async function generateMonth(month: string, opts: { groupId?: string; studentId?: string; upTo?: string } = {}, actorId?: string | null): Promise<GenerateResult> {
    assertMonth(month);
    await ensureOpenPeriod(prisma, month);
    const { first } = monthRange(month);
    const settings = await getBillingSettings();
    // Oyna keyingi oyga o'tishi mumkin (guruh boshlangan kundan hisob) — keng oraliq, aniq tekshiruv calc'da
    const periods = await prisma.enrollmentPeriod.findMany({
        where: {
            startDate: { lte: addDays(monthRange(nextMonth(month)).last, 0) }, OR: [{ endDate: null }, { endDate: { gte: first } }],
            ...(opts.groupId && { groupId: opts.groupId }), ...(opts.studentId && { studentId: opts.studentId }),
        },
        include: { pauses: true },
    });
    const out: GenerateResult = { month, created: 0, updated: 0, unchanged: 0, voided: 0, postedDiffs: [], skipped: [], legacyWithoutPeriod: 0 };

    for (const period of periods) {
        const c = await calcPeriodMonth(prisma, period, month, settings, { upTo: opts.upTo });
        const chargeKey = `T:${period.id}:${month}`;
        let existing = await prisma.charge.findUnique({ where: { chargeKey }, include: { lines: true } });
        if (c.skip || !c.result) {
            out.skipped.push({ periodId: period.id, studentId: period.studentId, groupId: period.groupId, reason: c.skip || 'hisob yo\'q' });
            if (existing?.status === 'draft') { await prisma.charge.update({ where: { id: existing.id }, data: { status: 'void', reason: c.skip } }); out.voided++; }
            continue;
        }
        const r = c.result;
        const data = {
            gross: r.gross, net: r.net, teacherBase: r.teacherBase, dueDate: c.dueDate, teacherId: c.teacherId,
            calc: JSON.stringify(c.calc),
        };
        const lines = r.lines.map(l => ({ kind: l.kind, amount: l.amount, description: l.description, sourceId: l.sourceId ?? null }));
        if (!existing) {
            try {
                await prisma.charge.create({
                    data: {
                        ...data, chargeKey, studentId: period.studentId, groupId: period.groupId, enrollmentPeriodId: period.id,
                        month, type: 'tuition', status: 'draft', createdById: actorId ?? null, lines: { create: lines },
                    },
                });
                out.created++;
                continue;
            } catch {
                // Parallel generatsiya kalitni band qildi (QT-65) — mavjudini yangilaymiz
                existing = await prisma.charge.findUnique({ where: { chargeKey }, include: { lines: true } });
                if (!existing) throw new BillingError(500, 'Hisob yaratilmadi', 'CREATE_FAILED');
            }
        }
        if (existing.status === 'posted') {
            if (existing.net !== r.net || existing.teacherBase !== r.teacherBase) {
                out.postedDiffs.push({ chargeId: existing.id, studentId: existing.studentId, groupId: existing.groupId, postedNet: existing.net, freshNet: r.net });
            } else out.unchanged++;
            continue;
        }
        if (existing.status === 'draft' && existing.net === r.net && existing.gross === r.gross && sameLines(existing.lines, lines) && existing.calc === data.calc) { out.unchanged++; continue; }
        await prisma.$transaction([
            prisma.chargeLine.deleteMany({ where: { chargeId: existing.id } }),
            prisma.charge.update({ where: { id: existing.id }, data: { ...data, status: 'draft', reason: null, lines: { create: lines } } }),
        ]);
        out.updated++;
    }

    // Davri yo'q eski a'zoliklar (backfill qilinmagan) — hisobotga
    const enrollments = await prisma.enrollment.findMany({ where: { ...(opts.groupId && { groupId: opts.groupId }), ...(opts.studentId && { studentId: opts.studentId }), student: { deletedAt: null } }, select: { studentId: true, groupId: true } });
    const pairs = new Set((await prisma.enrollmentPeriod.findMany({ select: { studentId: true, groupId: true } })).map(p => `${p.studentId}|${p.groupId}`));
    out.legacyWithoutPeriod = enrollments.filter(e => !pairs.has(`${e.studentId}|${e.groupId}`)).length;
    return out;
}

/** Draft hisoblarni e'lon qilish (bundan keyin o'zgarmaydi). */
export async function postMonth(month: string, opts: { groupId?: string; studentId?: string } = {}, actorId?: string | null) {
    assertMonth(month);
    await ensureOpenPeriod(prisma, month);
    const where = { month, status: 'draft', ...(opts.groupId && { groupId: opts.groupId }), ...(opts.studentId && { studentId: opts.studentId }) };
    const affected = await prisma.charge.findMany({ where, select: { studentId: true }, distinct: ['studentId'] });
    const r = await prisma.charge.updateMany({ where, data: { status: 'posted', postedAt: new Date(), postedById: actorId ?? null } });
    // Oldindan kiritilgan to'lov (avans) yangi e'lon qilingan hisobni avtomatik qoplaydi (RS-38)
    let creditApplied = 0;
    if ((await getLedgerMode()) !== 'legacy') {
        for (const a of affected) creditApplied += await prisma.$transaction(tx => applyStudentCredit(tx, a.studentId, actorId));
    }
    await syncStudents(prisma, affected.map(a => a.studentId));
    return { month, posted: r.count, creditApplied };
}

/**
 * A'zolik boshlanishi (yoki guruh boshlanishi) o'zgarganda — ta'sirlangan oylar hisobini
 * yangilash: qoralama qayta hisoblanadi; e'lon qilingan hisob o'zgarmaydi, farq tuzatma
 * bo'lib yoziladi (QT-66; yopilgan oyniki keyingi ochiq oyga). legacy rejimda — hech narsa.
 */
export async function refreshMembershipCharges(input: { studentId: string; groupId: string; months: string[]; reason: string }, actorId?: string | null) {
    const out = { months: [] as string[], drafts: 0, newDrafts: 0, adjustments: [] as Array<{ month: string; chargeId: string; delta: number }> };
    if ((await getLedgerMode()) === 'legacy') return out;
    const current = todayDateStr().slice(0, 7);
    const settings = await getBillingSettings();
    // Sana oldingi oy oynasiga tushishi mumkin (15.09–14.10 "sentabr hisobi") — oldingi oy ham tekshiriladi
    const months = new Set(input.months);
    const earliest = [...months].sort()[0];
    if (earliest) months.add(addDays(monthRange(earliest).first, -1).slice(0, 7));
    for (const month of [...months].sort()) {
        if (month > current) continue;
        out.months.push(month);
        const period = await getPeriod(prisma, month);
        const posted = await prisma.charge.findMany({ where: { month, studentId: input.studentId, groupId: input.groupId, type: 'tuition', status: 'posted' } });
        if (period?.status !== 'closed') {
            const g = await generateMonth(month, { groupId: input.groupId, studentId: input.studentId, upTo: todayDateStr() }, actorId);
            out.drafts += g.updated + g.voided;
            out.newDrafts += g.created;
            // Jonli rejimda hisob darhol kuchga kiradi (qo'lda "e'lon qilish" yo'q)
            if ((await getLedgerMode()) === 'live') await postMonth(month, { groupId: input.groupId, studentId: input.studentId }, actorId);
        }
        for (const ch of posted) {
            const ep = ch.enrollmentPeriodId ? await prisma.enrollmentPeriod.findUnique({ where: { id: ch.enrollmentPeriodId }, include: { pauses: true } }) : null;
            const fresh = ep ? await calcPeriodMonth(prisma, ep, month, settings, { cycleMode: chargeCycleMode(ch.calc) }) : null;
            const adj = await adjustmentsSum(prisma, ch.id);
            const delta = (fresh?.result?.net ?? 0) - (ch.net + adj.net);
            if (delta !== 0) {
                await adjustCharge(ch.id, { amount: delta, reason: input.reason }, actorId);
                out.adjustments.push({ month, chargeId: ch.id, delta });
            }
        }
    }
    return out;
}

/** Sana oralig'idagi oylar (YYYY-MM), ikkala chet ham kiradi. */
export function monthsBetween(a: string, b: string): string[] {
    let [from, to] = [a.slice(0, 7), b.slice(0, 7)].sort();
    const out: string[] = [];
    for (let i = 0; i < 36 && from <= to; i++) { out.push(from); from = nextMonth(from); }
    return out;
}

// ─── Tuzatmalar ──────────────────────────────────────────────────────────────

async function adjustmentsSum(db: Db, chargeId: string) {
    const rows = await db.charge.findMany({ where: { reversesChargeId: chargeId, status: 'posted' }, select: { net: true, teacherBase: true } });
    return { net: rows.reduce((a, r) => a + r.net, 0), teacherBase: rows.reduce((a, r) => a + r.teacherBase, 0), count: rows.length };
}

/**
 * Oy yakuni (yoki keyin): e'lon qilingan tuition hisoblarini hozirgi davomat/reja/
 * pauza bo'yicha qayta hisoblash; farq — tuzatma hisobi (e'lon qilingan hisob
 * o'zgarmaydi, QT-66). Idempotent: farq 0 bo'lsa hech narsa yaratilmaydi.
 */
export async function settleMonth(month: string, opts: { groupId?: string; endedBefore?: string } = {}, actorId?: string | null) {
    assertMonth(month);
    const settings = await getBillingSettings();
    const charges = await prisma.charge.findMany({ where: { month, type: 'tuition', status: 'posted', ...(opts.groupId && { groupId: opts.groupId }) } });
    const targetMonth = await openMonthFrom(prisma, month);
    await ensureOpenPeriod(prisma, targetMonth);
    const created: Array<{ chargeId: string; delta: number; teacherBaseDelta: number; month: string }> = [];
    for (const ch of charges) {
        if (!ch.enrollmentPeriodId) continue;
        // Avtomatik yakun: faqat oynasi tugagan hisoblar (davomat to'liq bo'lganda)
        if (opts.endedBefore) {
            let windowTo = monthRange(month).last;
            try { windowTo = JSON.parse(ch.calc || '{}').windowTo || windowTo; } catch { /* eski hisob — kalendar oy */ }
            if (windowTo >= opts.endedBefore) continue;
        }
        const period = await prisma.enrollmentPeriod.findUnique({ where: { id: ch.enrollmentPeriodId }, include: { pauses: true } });
        if (!period) continue;
        const c = await calcPeriodMonth(prisma, period, month, settings, { cycleMode: chargeCycleMode(ch.calc) });
        const freshNet = c.result?.net ?? 0;
        const freshTb = c.result?.teacherBase ?? 0;
        const adj = await adjustmentsSum(prisma, ch.id);
        const delta = freshNet - (ch.net + adj.net);
        const tbDelta = freshTb - (ch.teacherBase + adj.teacherBase);
        if (delta === 0 && tbDelta === 0) continue;
        await prisma.charge.create({
            data: {
                chargeKey: `S:${ch.id}:${adj.count + 1}`, studentId: ch.studentId, groupId: ch.groupId, enrollmentPeriodId: ch.enrollmentPeriodId,
                month: targetMonth, type: 'adjustment', status: 'posted', gross: delta, net: delta, teacherBase: tbDelta,
                reversesChargeId: ch.id, reason: `${month} oyi yakuni: davomat/reja/a'zolik o'zgarishi`,
                calc: JSON.stringify({ settlementOf: ch.id, serviceMonth: month, before: { net: ch.net + adj.net, teacherBase: ch.teacherBase + adj.teacherBase }, after: { net: freshNet, teacherBase: freshTb }, fresh: c.calc, skip: c.skip ?? null }),
                postedAt: new Date(), postedById: actorId ?? null, createdById: actorId ?? null,
                lines: { create: [{ kind: 'manual', amount: delta, description: `${month} hisobiga tuzatma (${ch.net + adj.net} → ${freshNet})` }] },
            },
        });
        if (delta < 0) await prisma.$transaction(tx => trimOverAllocation(tx, ch.id, `${month} oyi yakuni tuzatmasi`, actorId));
        created.push({ chargeId: ch.id, delta, teacherBaseDelta: tbDelta, month: targetMonth });
    }
    await syncStudents(prisma, charges.filter(c => created.some(x => x.chargeId === c.id)).map(c => c.studentId));
    return { month, targetMonth, adjustments: created };
}

/** Qo'lda tuzatma (sabab majburiy). Hisob bo'yicha jami net manfiy bo'lmaydi. */
export async function adjustCharge(chargeId: string, input: { amount: number; reason: string; affectsTeacher?: boolean }, actorId?: string | null) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1e8) throw new BillingError(400, "Summa noldan farqli butun son bo'lishi kerak", 'BAD_AMOUNT');
    const reason = String(input.reason || '').trim();
    if (reason.length < 3) throw new BillingError(400, 'Tuzatma sababini yozing', 'NO_REASON');
    return prisma.$transaction(async tx => {
        const ch = await tx.charge.findUnique({ where: { id: chargeId } });
        if (!ch) throw new BillingError(404, 'Hisob topilmadi', 'NOT_FOUND');
        if (ch.status !== 'posted' || ch.type === 'adjustment') throw new BillingError(409, "Faqat e'lon qilingan asosiy hisobga tuzatma qilinadi (draft — qayta generatsiya bilan o'zgaradi)", 'NOT_POSTED');
        const adj = await adjustmentsSum(tx, ch.id);
        if (ch.net + adj.net + amount < 0) throw new BillingError(400, `Tuzatma hisobni manfiy qiladi (hozirgi jami ${ch.net + adj.net})`, 'NEGATIVE');
        const month = await openMonthFrom(tx, ch.month);
        await ensureOpenPeriod(tx, month);
        const tb = input.affectsTeacher === false ? 0 : amount;
        return tx.charge.create({
            data: {
                chargeKey: `A:${ch.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, studentId: ch.studentId, groupId: ch.groupId,
                enrollmentPeriodId: ch.enrollmentPeriodId, month, type: 'adjustment', status: 'posted', gross: amount, net: amount, teacherBase: tb,
                reversesChargeId: ch.id, reason, calc: JSON.stringify({ manual: true, serviceMonth: ch.month, affectsTeacher: input.affectsTeacher !== false }),
                postedAt: new Date(), postedById: actorId ?? null, createdById: actorId ?? null,
                lines: { create: [{ kind: 'manual', amount, description: reason }] },
            },
            include: { lines: true },
        }).then(async adj => {
            if (amount < 0) await trimOverAllocation(tx, ch.id, `Hisob kamaytirildi: ${reason}`, actorId);
            await syncStudents(tx, [ch.studentId]);
            return adj;
        });
    });
}

export async function voidDraft(chargeId: string, reason?: string) {
    const ch = await prisma.charge.findUnique({ where: { id: chargeId } });
    if (!ch) throw new BillingError(404, 'Hisob topilmadi', 'NOT_FOUND');
    if (ch.status !== 'draft') throw new BillingError(409, "Faqat e'lon qilinmagan (draft) hisob bekor qilinadi", 'NOT_DRAFT');
    return prisma.charge.update({ where: { id: chargeId }, data: { status: 'void', reason: reason || null } });
}

// ─── O'qish va solishtirish ──────────────────────────────────────────────────

export async function studentAccount(studentId: string) {
    const charges = await prisma.charge.findMany({
        where: { studentId, status: { in: ['draft', 'posted'] } },
        orderBy: [{ month: 'desc' }, { createdAt: 'asc' }],
        include: { lines: true, allocations: { where: { reversedAt: null }, select: { id: true, paymentId: true, amount: true, createdAt: true } } },
    });
    const groups = await prisma.group.findMany({ where: { id: { in: [...new Set(charges.map(c => c.groupId).filter(Boolean) as string[])] } }, select: { id: true, name: true } });
    const gName = new Map(groups.map(g => [g.id, g.name]));
    const posted = charges.filter(c => c.status === 'posted');
    const position = await studentPosition(prisma, studentId);
    return {
        studentId,
        position: { debt: position.debt, credit: position.credit, balance: position.balance },
        totals: { posted: posted.reduce((a, c) => a + c.net, 0), draft: charges.filter(c => c.status === 'draft').reduce((a, c) => a + c.net, 0) },
        charges: charges.map(c => ({ ...c, groupName: c.groupId ? gName.get(c.groupId) ?? null : null, calc: c.calc ? JSON.parse(c.calc) : null })),
    };
}

/**
 * Shadow solishtirish (J.5): yangi hisob (tuition + tuzatmalar, guruh bo'yicha) va
 * eski `calculateStudentMonthlyDue` farqi, taxminiy sabab kodi bilan.
 */
export async function shadowReport(month: string) {
    assertMonth(month);
    const [y, m] = month.split('-').map(Number);
    const charges = await prisma.charge.findMany({ where: { status: { in: ['draft', 'posted'] }, OR: [{ month, type: 'tuition' }, { type: 'adjustment', calc: { contains: `"serviceMonth":"${month}"` } }] } });
    const byStudent = new Map<string, Map<string, { net: number; calc: any }>>();
    for (const c of charges) {
        const g = c.groupId ?? '-';
        if (!byStudent.has(c.studentId)) byStudent.set(c.studentId, new Map());
        const cur = byStudent.get(c.studentId)!.get(g) ?? { net: 0, calc: null };
        cur.net += c.net;
        if (c.type === 'tuition' && c.calc) cur.calc = JSON.parse(c.calc);
        byStudent.get(c.studentId)!.set(g, cur);
    }
    const legacyStudents = await prisma.enrollment.findMany({ where: { student: { deletedAt: null } }, select: { studentId: true }, distinct: ['studentId'] });
    const ids = new Set([...byStudent.keys(), ...legacyStudents.map(e => e.studentId)]);
    const settings = await getBillingSettings();
    const rows: Array<{ studentId: string; groupId: string; newNet: number; legacyNet: number; diff: number; reason: string }> = [];
    for (const sid of ids) {
        const legacy = await calculateStudentMonthlyDue(sid, y, m, settings);
        const fresh = byStudent.get(sid) ?? new Map();
        const groupIds = new Set([...fresh.keys(), ...legacy.byGroup.map(g => g.groupId)]);
        for (const gid of groupIds) {
            const newNet = fresh.get(gid)?.net ?? 0;
            const legacyNet = legacy.byGroup.find(g => g.groupId === gid)?.finalPrice ?? 0;
            const diff = newNet - legacyNet;
            if (diff === 0) continue;
            const calc = fresh.get(gid)?.calc;
            const reason = !fresh.has(gid) ? "yangi hisob yo'q (davr yo'q/skip)"
                : !legacy.byGroup.some(g => g.groupId === gid) ? "eski hisobda guruh yo'q (a'zolik tugagan)"
                : calc && calc.fullMonth === false ? "qisman oy (TQ-A)"
                : calc?.cancelCredits?.length ? "bekor qilingan dars krediti"
                : calc?.discounts?.length ? "chegirma"
                : calc?.extras?.length ? "pullik qo'shimcha dars"
                : calc?.tariffSource === 'version' ? "tarif tarixi"
                : "izohlanmagan";
            rows.push({ studentId: sid, groupId: gid, newNet, legacyNet, diff, reason });
        }
    }
    const byReason: Record<string, number> = {};
    for (const r of rows) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    const [sNames, gNames] = await Promise.all([
        prisma.student.findMany({ where: { id: { in: [...new Set(rows.map(r => r.studentId))] } }, select: { id: true, name: true, code: true } }),
        prisma.group.findMany({ where: { id: { in: [...new Set(rows.map(r => r.groupId))] } }, select: { id: true, name: true } }),
    ]);
    const sMap = new Map(sNames.map(s => [s.id, s]));
    const gMap = new Map(gNames.map(g => [g.id, g.name]));
    return {
        month,
        totals: {
            newNet: [...byStudent.values()].reduce((a, mp) => a + [...mp.values()].reduce((b, x) => b + x.net, 0), 0),
            diffRows: rows.length, unexplained: rows.filter(r => r.reason === 'izohlanmagan').length,
        },
        byReason,
        rows: rows.map(r => ({ ...r, studentName: sMap.get(r.studentId)?.name ?? null, studentCode: sMap.get(r.studentId)?.code ?? null, groupName: gMap.get(r.groupId) ?? null })),
    };
}

/** Kunlik (shadow/live): joriy oy draft'larini yangilash. */
/**
 * Har kecha (01:30): shadow — joriy oy qoralamalari; live — hisoblar avtomatik chiqadi va
 * darhol kuchga kiradi, oynasi tugagan hisoblarga davomat bo'yicha yakuniy tuzatma yoziladi.
 */
export async function dailyRefresh(): Promise<GenerateResult | null> {
    const mode = await getLedgerMode();
    if (mode === 'legacy') return null;
    const today = todayDateStr();
    const month = today.slice(0, 7);
    const r = await generateMonth(month, { upTo: today });
    if (mode === 'live') {
        await postMonth(month);
        const prev = monthRange(month).first;
        const prevMonth = addDays(prev, -1).slice(0, 7);
        for (const m of [prevMonth, month]) {
            const p = await getPeriod(prisma, m);
            if (p?.status === 'closed') continue;
            await settleMonth(m, { endedBefore: today }).catch(e => console.error('[billing] oy yakuni', m, e?.message));
        }
    }
    return r;
}

/** "Yangilash" (UI): joriy/ko'rsatilgan oy hisoblarini hozir hisoblash; live — darhol e'lon. */
export async function refreshMonth(month: string, actorId?: string | null) {
    assertMonth(month);
    const today = todayDateStr();
    if (month > today.slice(0, 7)) throw new BillingError(400, "Kelgusi oy hisobi oldindan chiqarilmaydi", 'FUTURE_MONTH');
    const r = await generateMonth(month, { upTo: today }, actorId);
    const posted = (await getLedgerMode()) === 'live' ? (await postMonth(month, {}, actorId)).posted : 0;
    return { ...r, posted };
}

/**
 * Hisob qatorlarini ko'rsatish uchun boyitish (o'quvchi, guruh nomi, davr oynasi, muddat o'tganmi).
 * CRM "Oylik hisoblar", o'quvchi profili, ota-ona portali va bot — hammasi shu shakldan
 * (yagona manba: receivables.chargeBalances).
 */
const LINE_LABELS: Record<string, string> = {
    extra_lesson: "qo'shimcha dars", absence_discount: 'davomat chegirmasi', cancel_credit: 'bekor qilingan dars',
    promo: 'promo chegirma', sibling: 'aka-uka chegirmasi', social: 'ijtimoiy chegirma', manual: 'tuzatma',
};
const fmtSom = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/\u00A0/g, ' ');

/**
 * Hisobning qisqa izohi ("nima uchun shu summa"): asosiy qism, chegirma/qo'shimchalar va tuzatmalar.
 * Masalan: "7 dars × 600 000 / 12 · davomat chegirmasi −50 000 · tuzatma −100 000".
 */
function explainCharge(type: string, calc: any, lines: Array<{ kind: string; amount: number }>, net: number, adjusted: number): string {
    const parts: string[] = [];
    if (type === 'tuition' && calc?.P != null) {
        parts.push(calc.fullMonth ? `To'liq oy ${fmtSom(calc.P)}` : `${calc.R} dars × ${fmtSom(calc.P)} / ${calc.N}`);
    } else if (type === 'other_fee') parts.push(`Boshqa to'lov ${fmtSom(net)}`);
    else if (type === 'opening_balance') parts.push(`Boshlang'ich qoldiq ${fmtSom(net)}`);
    for (const l of lines) {
        if (l.kind === 'base' || !l.amount) continue;
        parts.push(`${LINE_LABELS[l.kind] || l.kind} ${l.amount > 0 ? '+' : '−'}${fmtSom(Math.abs(l.amount))}`);
    }
    const adj = adjusted - net;
    if (adj) parts.push(`tuzatma ${adj > 0 ? '+' : '−'}${fmtSom(Math.abs(adj))}`);
    return parts.join(' · ');
}

async function describeCharges(rows: Awaited<ReturnType<typeof chargeBalances>>) {
    const today = todayDateStr();
    const lineRows = rows.length ? await prisma.chargeLine.findMany({ where: { chargeId: { in: rows.map(r => r.id) } }, select: { chargeId: true, kind: true, amount: true } }) : [];
    const linesOf = new Map<string, Array<{ kind: string; amount: number }>>();
    for (const l of lineRows) { if (!linesOf.has(l.chargeId)) linesOf.set(l.chargeId, []); linesOf.get(l.chargeId)!.push(l); }
    const [students, groups, calcs] = await Promise.all([
        prisma.student.findMany({ where: { id: { in: [...new Set(rows.map(r => r.studentId))] } }, select: { id: true, name: true, code: true } }),
        prisma.group.findMany({ where: { id: { in: [...new Set(rows.map(r => r.groupId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
        prisma.charge.findMany({ where: { id: { in: rows.map(r => r.id) } }, select: { id: true, calc: true } }),
    ]);
    const sm = new Map(students.map(x => [x.id, x]));
    const gm = new Map(groups.map(x => [x.id, x.name]));
    const cm = new Map(calcs.map(x => { try { return [x.id, JSON.parse(x.calc || '{}')]; } catch { return [x.id, {}]; } }));
    return rows.map(r => {
        const c: any = cm.get(r.id) || {};
        const range = monthRange(r.month);
        return {
            chargeId: r.id, type: r.type, month: r.month, dueDate: r.dueDate,
            student: sm.get(r.studentId) ?? { id: r.studentId, name: '—', code: null },
            groupId: r.groupId, groupName: r.groupId ? gm.get(r.groupId) ?? '—' : null,
            windowFrom: c.windowFrom ?? (r.type === 'tuition' ? range.first : null), windowTo: c.windowTo ?? (r.type === 'tuition' ? range.last : null),
            lessons: c.R ?? null, groupLessons: c.F ?? null, fullMonth: c.fullMonth ?? null,
            amount: r.adjusted, paid: r.allocated, debt: r.debt,
            overdue: r.debt > 0 && !!r.dueDate && today > r.dueDate,
            explain: explainCharge(r.type, c, linesOf.get(r.id) ?? [], r.net, r.adjusted),
        };
    });
}

/** Oy bo'yicha o'quvchilar hisobi: hisob, to'langan, qarz (yagona formula — receivables). */
export async function monthSummary(month: string, opts: { groupId?: string } = {}) {
    assertMonth(month);
    const rows = await chargeBalances(prisma, { month, ...(opts.groupId && { groupId: opts.groupId }) });
    return (await describeCharges(rows)).sort((a, b) => a.student.name.localeCompare(b.student.name));
}

/**
 * O'quvchining hisob varag'i: jami qarz, avans, balans va oylar bo'yicha hisoblar
 * (eng yangisi birinchi). Ota-ona portali, CRM profili va bot shu yerdan oladi.
 */
export async function studentLedger(studentId: string, opts: { limit?: number } = {}) {
    const position = await studentPosition(prisma, studentId);
    const rows = [...position.charges].sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.getTime() - a.createdAt.getTime());
    const charges = await describeCharges(opts.limit ? rows.slice(0, opts.limit) : rows);
    return {
        debt: position.debt, credit: position.credit, balance: position.balance,
        overdueDebt: charges.filter(c => c.overdue).reduce((a, c) => a + c.debt, 0),
        charges: charges.map(({ student: _s, ...c }) => c),
    };
}

/**
 * Qarzdorlar ro'yxati (live) — hisoblardan, "Oylik hisoblar" bilan bir xil manba.
 * O'quvchi bo'yicha jami qarz va har guruh (hisob) alohida — "Oylik hisoblar"da guruh
 * qatorlari, bu yerda ularning o'quvchi bo'yicha yig'indisi.
 */
export async function debtorsList() {
    const rows = (await chargeBalances(prisma, {})).filter(r => r.debt > 0);
    const described = await describeCharges(rows);
    const contacts = new Map((await prisma.student.findMany({
        where: { id: { in: [...new Set(rows.map(r => r.studentId))] } }, select: { id: true, phone: true, parentPhone: true },
    })).map(s => [s.id, s]));
    const by = new Map<string, any>();
    for (const c of described) {
        const ct = contacts.get(c.student.id);
        const cur = by.get(c.student.id) ?? { student: { ...c.student, phone: ct?.phone ?? null, parentPhone: ct?.parentPhone ?? null }, debt: 0, overdueDebt: 0, dueDate: null as string | null, items: [] as any[] };
        cur.debt += c.debt;
        if (c.overdue) cur.overdueDebt += c.debt;
        if (c.dueDate && (!cur.dueDate || c.dueDate < cur.dueDate)) cur.dueDate = c.dueDate;
        cur.items.push({ chargeId: c.chargeId, month: c.month, groupName: c.groupName, type: c.type, amount: c.amount, paid: c.paid, debt: c.debt, dueDate: c.dueDate, overdue: c.overdue, explain: c.explain });
        by.set(c.student.id, cur);
    }
    return [...by.values()].sort((a, b) => b.debt - a.debt);
}

/** Faol, lekin hech qaysi guruhda a'zoligi yo'q o'quvchilar — ularga hisob chiqmaydi. */
export async function studentsWithoutMembership() {
    const members = new Set((await prisma.enrollmentPeriod.findMany({ where: { status: 'active' }, select: { studentId: true } })).map(p => p.studentId));
    const students = await prisma.student.findMany({
        where: { deletedAt: null, status: { in: ['active', 'Faol'] } },
        select: { id: true, name: true, code: true, phone: true, createdAt: true },
        orderBy: { name: 'asc' },
    });
    return students.filter(s => !members.has(s.id));
}

export { nextMonth, addDays };
