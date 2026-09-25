/**
 * IP-10 — dars rejasi (TL-09, OQ-03). `LessonSession` endi ikki xil yozuv:
 *   kind = 'regular' — jadvaldan generatsiya qilingan rejadagi dars (R va F manbai);
 *   kind = 'extra' | 'makeup' | 'trial' — qo'shimcha, qoplash, sinov darslari;
 *   kind = null — eski (IP-10 dan oldingi) qo'shimcha darslar.
 *
 * Qoidalar (docs/ADR_HISOB_QOIDALARI.md, OQ-03):
 * - ko'chirilgan dars — o'sha dars: eskisi `moved` (billable emas), yangisi billable;
 * - bayram kuniga rejadagi dars yaratilmaydi;
 * - markaz bekor qilgan dars — billable emas, `compensate` bo'lsa P/N kredit (IP-11);
 * - qoplash va sinov darslari billable emas; pullik qo'shimcha dars — `price` bilan.
 * Generatsiya idempotent: guruh qulfi ostida, mavjud sanaga qayta yaratilmaydi (QT-64).
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { isValidDate, monthRange, scheduledDates, versionAt } from '../domain/lessonCalendar.js';

type Db = PrismaClient | Prisma.TransactionClient;

export class LessonPlanError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const CANCEL_REASONS = ['center', 'teacher', 'holiday', 'other'] as const;
const ACTIVE_STATUSES = ['planned', 'held'];

async function scheduleOf(db: Db, groupId: string) {
    const rows = await db.groupSchedule.findMany({ where: { groupId }, select: { days: true, startTime: true } });
    const days = new Set<number>();
    for (const r of rows) { try { for (const d of JSON.parse(r.days || '[]')) if (Number.isInteger(d)) days.add(d); } catch { /* buzuq */ } }
    return { days: [...days], startTime: rows[0]?.startTime ?? null };
}

async function teacherResolver(db: Db, groupId: string, fallback: string | null) {
    const rows = await db.groupTeacherAssignment.findMany({ where: { groupId, role: 'primary' } });
    const versions = rows.map(r => ({ ...r, effectiveFrom: r.fromDate, effectiveTo: r.toDate }));
    return (date: string) => (versions.length ? versionAt(versions, date)?.teacherId ?? null : fallback);
}

/** Sana bo'yicha haqiqiy ustoz (tayinlash tarixi bo'yicha; tarix yo'q bo'lsa Group.teacherId). */
export async function teacherAt(db: Db, groupId: string, date: string): Promise<string | null> {
    const g = await db.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return (await teacherResolver(db, groupId, g?.teacherId ?? null))(date);
}

// ─── Generatsiya ─────────────────────────────────────────────────────────────

export async function generateMonthPlan(groupId: string, month: string, actorId?: string | null) {
    if (!MONTH_RE.test(month)) throw new LessonPlanError(400, "Oy YYYY-MM formatida bo'lishi kerak", 'BAD_MONTH');
    const today = todayDateStr();
    return prisma.$transaction(async tx => {
        const group = await tx.group.findUnique({ where: { id: groupId }, select: { id: true, deletedAt: true, status: true, startDate: true, endDate: true, teacherId: true } });
        if (!group || group.deletedAt) throw new LessonPlanError(404, 'Guruh topilmadi yoki arxivlangan', 'NOT_FOUND');
        await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } }); // parallel generatsiyaga qarshi qulf
        const { days, startTime } = await scheduleOf(tx, groupId);
        const { first, last } = monthRange(month);
        const from = group.startDate && group.startDate > first ? group.startDate : first;
        const to = group.endDate && group.endDate < last ? group.endDate : last;
        const holidays = new Set((await tx.holiday.findMany({ where: { date: { gte: first, lte: last } }, select: { date: true } })).map(h => h.date));
        const all = scheduledDates(days, from, to);
        const dates = all.filter(d => !holidays.has(d));
        const existing = await tx.lessonSession.findMany({ where: { groupId, kind: 'regular', date: { gte: first, lte: last } } });
        const have = new Set(existing.map(s => s.date));
        const teacherOf = await teacherResolver(tx, groupId, group.teacherId);
        let created = 0;
        for (const d of dates) {
            if (have.has(d)) continue;
            await tx.lessonSession.create({
                data: { groupId, date: d, startTime, kind: 'regular', status: 'planned', billable: true, teacherId: teacherOf(d), createdById: actorId ?? null },
            });
            created++;
        }
        // Jadval o'zgargan yoki bayram qo'shilgan: rejada qolib ketgan, hali o'tmagan,
        // davomatsiz rejadagi darslar olib tashlanadi (ko'chirilgan darslarga tegilmaydi)
        const wanted = new Set(dates);
        const stale = existing.filter(s => s.status === 'planned' && !s.replacesSessionId && !wanted.has(s.date) && s.date >= today);
        let removed = 0;
        for (const s of stale) {
            const marked = await tx.attendanceRecord.count({ where: { groupId, date: s.date } });
            if (!marked) { await tx.lessonSession.delete({ where: { id: s.id } }); removed++; }
        }
        return {
            groupId, month, planned: dates.length, created, removed,
            holidaysSkipped: all.filter(d => holidays.has(d)),
            warning: days.length ? null : "Guruh dars jadvali yo'q — reja bo'sh",
        };
    }, { timeout: 30000 });
}

/** Barcha faol guruhlar uchun (oy boshida, scheduler). */
export async function generateAllPlans(month: string) {
    const groups = await prisma.group.findMany({ where: { deletedAt: null, status: { not: 'completed' } }, select: { id: true } });
    const results = [];
    for (const g of groups) {
        try { results.push(await generateMonthPlan(g.id, month)); }
        catch (e: any) { results.push({ groupId: g.id, month, error: e?.message }); }
    }
    return results;
}

// ─── Bekor qilish, ko'chirish, qo'shimcha darslar ────────────────────────────

async function hasAttendanceOn(db: Db, groupId: string, date: string, sessionId: string) {
    const [a, b] = await Promise.all([
        db.attendanceRecord.count({ where: { groupId, date, OR: [{ sessionId }, { sessionId: null }] } }),
        db.lessonAttendance.count({ where: { sessionId } }),
    ]);
    return a + b > 0;
}

export async function cancelSession(sessionId: string, input: { reason: string; compensate?: boolean; note?: string }, actorId?: string | null) {
    if (!(CANCEL_REASONS as readonly string[]).includes(input.reason)) throw new LessonPlanError(400, "Bekor qilish sababi noto'g'ri", 'BAD_REASON');
    const s = await prisma.lessonSession.findUnique({ where: { id: sessionId } });
    if (!s) throw new LessonPlanError(404, 'Dars topilmadi', 'NOT_FOUND');
    if (s.status === 'cancelled' || s.status === 'moved') throw new LessonPlanError(409, 'Dars allaqachon bekor qilingan yoki ko\'chirilgan', 'NOT_ACTIVE');
    if (await hasAttendanceOn(prisma, s.groupId, s.date, s.id)) throw new LessonPlanError(409, "Bu darsga davomat belgilangan — avval davomatni olib tashlang", 'HAS_ATTENDANCE');
    return prisma.lessonSession.update({
        where: { id: sessionId },
        data: { status: 'cancelled', billable: false, cancelReason: input.reason, compensate: !!input.compensate, label: input.note ?? s.label },
    });
}

export async function moveSession(sessionId: string, input: { toDate: string; startTime?: string | null }, actorId?: string | null) {
    if (!isValidDate(input.toDate)) throw new LessonPlanError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    return prisma.$transaction(async tx => {
        const s = await tx.lessonSession.findUnique({ where: { id: sessionId } });
        if (!s) throw new LessonPlanError(404, 'Dars topilmadi', 'NOT_FOUND');
        if (s.kind !== 'regular' || s.status !== 'planned') throw new LessonPlanError(409, "Faqat rejadagi (o'tmagan) darsni ko'chirish mumkin", 'NOT_PLANNED');
        if (s.date === input.toDate) throw new LessonPlanError(400, 'Yangi sana eskisidan farq qilishi kerak', 'SAME_DATE');
        if (await hasAttendanceOn(tx, s.groupId, s.date, s.id)) throw new LessonPlanError(409, "Bu darsga davomat belgilangan", 'HAS_ATTENDANCE');
        const clash = await tx.lessonSession.findFirst({ where: { groupId: s.groupId, date: input.toDate, kind: 'regular', status: { in: ACTIVE_STATUSES } } });
        if (clash) throw new LessonPlanError(409, `${input.toDate} kuni guruhda allaqachon dars bor`, 'CLASH');
        await tx.lessonSession.update({ where: { id: s.id }, data: { status: 'moved', billable: false } });
        return tx.lessonSession.create({
            data: {
                groupId: s.groupId, date: input.toDate, startTime: input.startTime ?? s.startTime, kind: 'regular', status: 'planned',
                billable: true, teacherId: s.teacherId, replacesSessionId: s.id, label: `Ko'chirilgan dars (${s.date})`, createdById: actorId ?? null,
            },
        });
    });
}

export interface AddSessionInput { groupId: string; date: string; kind: 'extra' | 'makeup' | 'trial'; price?: number | null; label?: string | null; startTime?: string | null; replacesSessionId?: string | null }

export async function addSession(input: AddSessionInput, actorId?: string | null) {
    if (!['extra', 'makeup', 'trial'].includes(input.kind)) throw new LessonPlanError(400, "Dars turi noto'g'ri", 'BAD_KIND');
    if (!isValidDate(input.date)) throw new LessonPlanError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    const price = input.price == null ? null : Math.round(Number(input.price));
    if (price != null && (!Number.isFinite(price) || price < 0 || price > 1e8)) throw new LessonPlanError(400, "Narx noto'g'ri", 'BAD_PRICE');
    if (input.kind !== 'extra' && price) throw new LessonPlanError(400, "Qoplash va sinov darslari pullik bo'lmaydi", 'NOT_BILLABLE_KIND');
    const group = await prisma.group.findUnique({ where: { id: input.groupId }, select: { id: true, deletedAt: true, teacherId: true } });
    if (!group || group.deletedAt) throw new LessonPlanError(404, 'Guruh topilmadi', 'NOT_FOUND');
    return prisma.$transaction(async tx => {
        if (input.kind === 'makeup') {
            if (!input.replacesSessionId) throw new LessonPlanError(400, 'Qaysi bekor qilingan dars qoplanayotganini tanlang', 'NO_REPLACES');
            const orig = await tx.lessonSession.findUnique({ where: { id: input.replacesSessionId } });
            if (!orig || orig.groupId !== input.groupId || orig.status !== 'cancelled') throw new LessonPlanError(400, "Qoplash faqat shu guruhning bekor qilingan darsi uchun", 'BAD_REPLACES');
            // Qoplangan dars uchun kompensatsiya kerak emas (bir xizmat ikki marta — QT-24)
            await tx.lessonSession.update({ where: { id: orig.id }, data: { compensate: false } });
        }
        return tx.lessonSession.create({
            data: {
                groupId: input.groupId, date: input.date, startTime: input.startTime ?? null, kind: input.kind, status: 'planned',
                billable: input.kind === 'extra' && !!price, price: input.kind === 'extra' ? price : null,
                teacherId: await teacherAt(tx, input.groupId, input.date), replacesSessionId: input.replacesSessionId ?? null,
                label: input.label ?? (input.kind === 'makeup' ? 'Qoplash darsi' : input.kind === 'trial' ? 'Sinov darsi' : "Qo'shimcha dars"),
                createdById: actorId ?? null,
            },
        });
    });
}

// ─── O'qish ──────────────────────────────────────────────────────────────────

export async function monthPlan(groupId: string, month: string) {
    if (!MONTH_RE.test(month)) throw new LessonPlanError(400, "Oy YYYY-MM formatida bo'lishi kerak", 'BAD_MONTH');
    const { first, last } = monthRange(month);
    const [sessions, marked] = await Promise.all([
        prisma.lessonSession.findMany({ where: { groupId, date: { gte: first, lte: last } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
        prisma.attendanceRecord.groupBy({ by: ['date'], where: { groupId, date: { gte: first, lte: last } }, _count: { _all: true } }),
    ]);
    const markedDates = new Map(marked.map(m => [m.date, m._count._all]));
    const regular = sessions.filter(s => s.kind === 'regular');
    return {
        groupId, month,
        sessions: sessions.map(s => ({ ...s, markedCount: markedDates.get(s.date) ?? 0 })),
        summary: {
            planned: regular.filter(s => s.status === 'planned').length,
            held: regular.filter(s => s.status === 'held').length,
            cancelled: regular.filter(s => s.status === 'cancelled').length,
            moved: regular.filter(s => s.status === 'moved').length,
            billable: regular.filter(s => s.billable && ACTIVE_STATUSES.includes(s.status || '')).length,
            paidExtra: sessions.filter(s => s.kind === 'extra' && s.billable).length,
        },
    };
}

/** Reja bo'lsa — oyning billable rejadagi dars sanalari (R/F manbai); reja yo'q bo'lsa null. */
export async function billableLessonDates(db: Db, groupId: string, month: string): Promise<string[] | null> {
    const { first, last } = monthRange(month);
    const rows = await db.lessonSession.findMany({ where: { groupId, kind: 'regular', date: { gte: first, lte: last } }, select: { date: true, status: true, billable: true } });
    if (!rows.length) return null;
    return [...new Set(rows.filter(r => r.billable && ACTIVE_STATUSES.includes(r.status || '')).map(r => r.date))].sort();
}

/** Davomati belgilanmagan o'tgan darslar (kunlik nazorat ro'yxati). */
export async function unmarkedLessons(opts: { upTo?: string; teacherId?: string | null; days?: number }) {
    const upTo = opts.upTo ?? todayDateStr();
    const [y, m, d] = upTo.split('-').map(Number);
    const since = new Date(Date.UTC(y, m - 1, d - (opts.days ?? 14))).toISOString().slice(0, 10);
    const sessions = await prisma.lessonSession.findMany({
        where: {
            kind: 'regular', status: 'planned', date: { gte: since, lte: upTo },
            group: { deletedAt: null, ...(opts.teacherId ? { teacherId: opts.teacherId } : {}) },
        },
        orderBy: { date: 'asc' },
        select: { id: true, date: true, startTime: true, groupId: true, teacherId: true, group: { select: { name: true } } },
    });
    const out = [];
    for (const s of sessions) {
        const [members, marked] = await Promise.all([
            prisma.enrollment.count({ where: { groupId: s.groupId, student: { deletedAt: null } } }),
            prisma.attendanceRecord.count({ where: { groupId: s.groupId, date: s.date } }),
        ]);
        if (members > 0 && marked === 0) out.push({ sessionId: s.id, date: s.date, startTime: s.startTime, groupId: s.groupId, groupName: s.group.name, teacherId: s.teacherId, members });
    }
    return out;
}
