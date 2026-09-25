/**
 * IP-21 — oy yopish va davr qulfi (F.10).
 *
 * Yopishdan oldin checklist: oy tugaganmi, darslar davomati olinganmi, hisoblar kuchga
 * kirganmi, avans ochiq qarzga biriktirilganmi, balans keshi formula bilan mosmi, ustoz
 * maoshlari tasdiqlanganmi. Yopish komandasi avval avtomatik tuzatiladiganlarini tuzatadi
 * (hisoblarni yangilash, oyna tugagan hisoblarga davomat tuzatmasi, avansni biriktirish,
 * balansni solishtirish), keyin checklist'ni qayta tekshiradi.
 *
 * Qulf (BillingPeriod.status = 'closed'): davomat, dars rejasi, hisob, xarajat va maosh
 * qayta hisobi yopilgan oyga yozilmaydi — keyingi o'zgarish keyingi ochiq oyda tuzatma.
 * Kechikkan to'lovni yopilgan oy qarziga biriktirish mumkin (aks holda eski qarz yopilmasdi).
 * Qayta ochish — faqat SUPER_ADMIN, sabab bilan (audit).
 */
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { monthRange } from '../domain/lessonCalendar.js';
import { ROLE_LEVEL } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { windowLessonDates } from './lessonPlan.js';
import { groupScheduleDays } from './enrollment.js';
import { getLedgerMode } from './ledgerMode.js';
import { refreshMonth, settleMonth } from './chargeEngine.js';
import { reconcileBalances } from './balanceCache.js';
import { applyStudentCredit } from './allocation.js';
import { studentPosition } from './receivables.js';

export class PeriodError extends Error {
    constructor(public status: number, message: string, public code?: string, public details?: unknown) { super(message); }
}

export interface Actor { id?: string | null; name?: string | null; role?: string | null }
export type CheckStatus = 'ok' | 'warn' | 'block';
export interface CheckItem { key: string; label: string; status: CheckStatus; count: number; hint?: string; details?: unknown[] }

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function assertMonth(month: string) {
    if (!MONTH_RE.test(month)) throw new PeriodError(400, "Oy YYYY-MM formatida bo'lishi kerak", 'BAD_MONTH');
}

/** Guruhlar bo'yicha davomati olinmagan o'tgan darslar (reja bo'lsa rejadan, aks holda jadvaldan). */
async function missingAttendance(month: string) {
    const { first, last } = monthRange(month);
    const today = todayDateStr();
    const end = last < today ? last : today;
    const periods = await prisma.enrollmentPeriod.findMany({
        where: { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: first } }] },
        select: { groupId: true, startDate: true, endDate: true },
    });
    const byGroup = new Map<string, { from: string; to: string }>();
    for (const p of periods) {
        const from = p.startDate > first ? p.startDate : first;
        const to = p.endDate && p.endDate < end ? p.endDate : end;
        if (from > to) continue;
        const cur = byGroup.get(p.groupId);
        byGroup.set(p.groupId, { from: cur && cur.from < from ? cur.from : from, to: cur && cur.to > to ? cur.to : to });
    }
    const groups = await prisma.group.findMany({ where: { id: { in: [...byGroup.keys()] } }, select: { id: true, name: true, startDate: true, endDate: true, deletedAt: true } });
    const out: Array<{ groupId: string; groupName: string; dates: string[] }> = [];
    for (const g of groups) {
        const r = byGroup.get(g.id)!;
        const from = g.startDate && g.startDate > r.from ? g.startDate : r.from;
        const to = g.endDate && g.endDate < r.to ? g.endDate : r.to;
        if (from > to) continue;
        const wl = await windowLessonDates(prisma, g.id, await groupScheduleDays(prisma, g.id), from, to);
        if (!wl?.dates.length) continue;
        const marked = new Set((await prisma.attendanceRecord.findMany({
            where: { groupId: g.id, date: { gte: from, lte: to } }, select: { date: true }, distinct: ['date'],
        })).map(a => a.date));
        const missing = wl.dates.filter(d => !marked.has(d));
        if (missing.length) out.push({ groupId: g.id, groupName: g.name, dates: missing });
    }
    return out.sort((a, b) => a.groupName.localeCompare(b.groupName));
}

/** Yopish checklist'i (faqat o'qiydi). */
export async function closeChecklist(month: string) {
    assertMonth(month);
    const mode = await getLedgerMode();
    const period = await prisma.billingPeriod.findUnique({ where: { month } });
    const items: CheckItem[] = [];
    const ended = month < todayDateStr().slice(0, 7);
    items.push({ key: 'ended', label: 'Oy tugagan', status: ended ? 'ok' : 'block', count: ended ? 0 : 1, hint: ended ? undefined : "Joriy yoki kelgusi oyni yopib bo'lmaydi" });

    const missing = await missingAttendance(month);
    const missingCount = missing.reduce((a, g) => a + g.dates.length, 0);
    items.push({
        key: 'attendance', label: "Barcha o'tgan darslar davomati olingan", status: missingCount ? 'block' : 'ok', count: missingCount,
        hint: missingCount ? "Davomatni belgilang yoki o'tmagan darsni rejada bekor qiling. Zarur bo'lsa — administrator sabab bilan majburiy yopadi." : undefined,
        details: missing,
    });

    if (mode === 'live') {
        const drafts = await prisma.charge.count({ where: { month, status: 'draft' } });
        items.push({ key: 'charges', label: 'Hisoblar kuchga kirgan', status: drafts ? 'warn' : 'ok', count: drafts, hint: drafts ? 'Yopishda avtomatik kuchga kiradi' : undefined });
        items.push({ key: 'settlement', label: "Davomat bo'yicha yakuniy tuzatmalar", status: 'ok', count: 0, hint: "Yopishda avtomatik hisoblanadi (hisob davri tugaganlar uchun)" });

        // Avans bor, lekin ochiq qarz ham bor — biriktirilmagan
        const studentsWithCharges = await prisma.charge.findMany({ where: { month, status: 'posted' }, select: { studentId: true }, distinct: ['studentId'] });
        let unapplied = 0;
        for (const s of studentsWithCharges) {
            const pos = await studentPosition(prisma, s.studentId);
            if (pos.credit > 0 && pos.debt > 0) unapplied++;
        }
        items.push({ key: 'credit', label: "Avans ochiq qarzlarga biriktirilgan", status: unapplied ? 'warn' : 'ok', count: unapplied, hint: unapplied ? 'Yopishda avtomatik biriktiriladi' : undefined });

        const rec = await reconcileBalances();
        items.push({ key: 'balances', label: "Balans keshi hisoblar bilan mos", status: rec.differences ? 'warn' : 'ok', count: rec.differences, hint: rec.differences ? 'Yopishda avtomatik tuzatiladi' : undefined, details: rec.rows.slice(0, 20) });

        // Ustoz maoshi: shu oy hisoblarida ustozi bor, lekin maosh tasdiqlanmagan
        const teacherIds = (await prisma.charge.findMany({ where: { month, status: 'posted', teacherId: { not: null } }, select: { teacherId: true }, distinct: ['teacherId'] })).map(c => c.teacherId!);
        const approved = new Set((await prisma.teacherPayroll.findMany({ where: { month, teacherId: { in: teacherIds }, status: { not: 'draft' } }, select: { teacherId: true } })).map(p => p.teacherId));
        const pending = teacherIds.filter(t => !approved.has(t));
        const names = pending.length ? await prisma.user.findMany({ where: { id: { in: pending } }, select: { id: true, name: true } }) : [];
        items.push({ key: 'payroll', label: 'Ustoz maoshlari tasdiqlangan', status: pending.length ? 'warn' : 'ok', count: pending.length, hint: pending.length ? "Tavsiya: yopishdan oldin tasdiqlang (majburiy emas)" : undefined, details: names });
    }

    const blockers = items.filter(i => i.status === 'block');
    return {
        month, mode, status: period?.status ?? 'open',
        closedAt: period?.closedAt ?? null, closedById: period?.closedById ?? null,
        items, blockers: blockers.map(b => b.key), canClose: blockers.length === 0 && period?.status !== 'closed',
    };
}

/** Oyni yopish (ADMIN+). Avtomatik tuzatishlar → checklist → qulf. Takror so'rov — o'sha natija. */
export async function closeMonth(month: string, opts: { force?: boolean; reason?: string }, actor: Actor) {
    assertMonth(month);
    if ((ROLE_LEVEL[actor.role || ''] || 0) < ROLE_LEVEL.ADMIN) throw new PeriodError(403, "Oyni faqat administrator yopadi", 'ROLE');
    const existing = await prisma.billingPeriod.findUnique({ where: { month } });
    if (existing?.status === 'closed') return { period: existing, alreadyClosed: true, checklist: existing.checklist ? JSON.parse(existing.checklist) : null };
    if (month >= todayDateStr().slice(0, 7)) throw new PeriodError(409, "Joriy yoki kelgusi oyni yopib bo'lmaydi", 'NOT_ENDED');

    // Avtomatik tuzatishlar (jonli rejim)
    const fixes: Record<string, number> = {};
    if ((await getLedgerMode()) === 'live') {
        const r = await refreshMonth(month, actor.id);
        fixes.posted = r.posted;
        const st = await settleMonth(month, { endedBefore: todayDateStr() }, actor.id);
        fixes.settlementAdjustments = st.adjustments.length;
        const studs = await prisma.charge.findMany({ where: { month, status: 'posted' }, select: { studentId: true }, distinct: ['studentId'] });
        let applied = 0;
        for (const s of studs) applied += await prisma.$transaction(tx => applyStudentCredit(tx, s.studentId, actor.id));
        fixes.creditApplied = applied;
        fixes.balancesFixed = (await reconcileBalances({ fix: true })).fixed;
    }

    const checklist = await closeChecklist(month);
    const reason = String(opts.reason || '').trim();
    const blockers = checklist.items.filter(i => i.status === 'block');
    if (blockers.some(b => b.key === 'ended')) throw new PeriodError(409, "Joriy yoki kelgusi oyni yopib bo'lmaydi", 'NOT_ENDED', checklist);
    if (blockers.length && !opts.force) {
        throw new PeriodError(409, `Yopib bo'lmaydi: ${blockers.map(b => b.label.toLowerCase()).join('; ')}`, 'CHECKLIST', checklist);
    }
    if (blockers.length && reason.length < 3) throw new PeriodError(400, 'Majburiy yopish uchun sababni yozing', 'NO_REASON', checklist);

    const record = { items: checklist.items, fixes, forced: blockers.length > 0, reason: blockers.length ? reason : null, closedByName: actor.name ?? null };
    const period = await prisma.billingPeriod.upsert({
        where: { month },
        create: { month, status: 'closed', closedAt: new Date(), closedById: actor.id ?? null, checklist: JSON.stringify(record) },
        update: { status: 'closed', closedAt: new Date(), closedById: actor.id ?? null, checklist: JSON.stringify(record) },
    });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'period_close', resource: 'billingPeriod', resourceId: period.id, after: { month, forced: record.forced, reason: record.reason, fixes, blockers: blockers.map(b => ({ key: b.key, count: b.count })) } });
    return { period, alreadyClosed: false, checklist: record };
}

/** Qayta ochish — faqat SUPER_ADMIN, sabab majburiy. */
export async function reopenMonth(month: string, reasonRaw: unknown, actor: Actor) {
    assertMonth(month);
    if (actor.role !== 'SUPER_ADMIN') throw new PeriodError(403, 'Yopilgan oyni faqat SUPER_ADMIN qayta ochadi', 'ROLE');
    const reason = String(reasonRaw ?? '').trim();
    if (reason.length < 3) throw new PeriodError(400, 'Qayta ochish sababini yozing', 'NO_REASON');
    const p = await prisma.billingPeriod.findUnique({ where: { month } });
    if (!p || p.status !== 'closed') throw new PeriodError(409, 'Bu oy yopilmagan', 'NOT_CLOSED');
    const period = await prisma.billingPeriod.update({ where: { month }, data: { status: 'open', reopenedAt: new Date(), reopenReason: reason } });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'period_reopen', resource: 'billingPeriod', resourceId: period.id, before: { status: 'closed', closedAt: p.closedAt }, after: { month, reason } });
    return period;
}
