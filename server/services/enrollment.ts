/**
 * IP-09 — a'zolik komandalari (H.5): preview, yozish, yakunlash, transfer, pauza.
 *
 * Model: `EnrollmentPeriod` — a'zolik tarixi (sanalar bilan); `Enrollment` —
 * JORIY a'zolik keshi (eski kod — davomat ro'yxati, ustoz doirasi, billing —
 * shunga tayanadi). Davr yakunlanganda Enrollment qatori o'chiriladi, davr qoladi.
 *
 * Sig'im poygasi (QT-62): tranzaksiya ichida AVVAL guruh qatori yangilanadi
 * (Postgres'da qator qulfi, SQLite'da yozuvchi qulfi), keyin a'zolar sanaladi —
 * ikki parallel so'rov oxirgi o'ringa ikkalasi ham yozila olmaydi.
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { logAudit } from '../middleware/audit.js';
import { addDays, daysBetween, firstOfMonth, isValidDate, monthLessons, monthOf, versionAt } from '../domain/lessonCalendar.js';
import { computeBase } from '../domain/billingFormula.js';
import { getBillingSettings } from './billing.js';
import { ensureStudentIdentitySafe } from './studentIdentity.js';
import { billableLessonDates } from './lessonPlan.js';

type Db = PrismaClient | Prisma.TransactionClient;

export class EnrollmentError extends Error {
    constructor(public status: number, message: string, public code?: string, public details?: unknown) { super(message); }
}

export interface Actor { id?: string | null; name?: string | null }

export const END_REASONS = ['left', 'graduated', 'transfer', 'admin_fix', 'unknown'] as const;

// ─── Yordamchilar ────────────────────────────────────────────────────────────

function assertDate(value: unknown, label: string): string {
    if (!isValidDate(value)) throw new EnrollmentError(400, `${label} YYYY-MM-DD formatida bo'lishi kerak`, 'BAD_DATE');
    return value;
}

async function loadGroup(db: Db, groupId: string) {
    return db.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true, status: true, deletedAt: true, maxSize: true, startDate: true, endDate: true, price: true, courseId: true, course: { select: { name: true, price: true } } },
    });
}

export async function groupScheduleDays(db: Db, groupId: string): Promise<number[]> {
    const rows = await db.groupSchedule.findMany({ where: { groupId }, select: { days: true } });
    const set = new Set<number>();
    for (const r of rows) {
        try { for (const d of JSON.parse(r.days || '[]')) if (Number.isInteger(d)) set.add(d); } catch { /* buzuq qator */ }
    }
    return [...set].sort();
}

export interface ResolvedTariff { monthlyPrice: number; lessonsPerPackage: number; source: 'version' | 'legacy'; versionId?: string }

/** Sana uchun tarif: versiya bo'lsa undan, aks holda eski Group.price → Course.price (legacy). */
export async function resolveTariff(db: Db, group: { id: string; price: number | null; course: { price: number } | null }, date: string): Promise<ResolvedTariff | null> {
    const versions = await db.tariffVersion.findMany({ where: { groupId: group.id } });
    const v = versionAt(versions, date);
    if (v) return { monthlyPrice: v.monthlyPrice, lessonsPerPackage: v.lessonsPerPackage, source: 'version', versionId: v.id };
    const price = group.price ?? group.course?.price ?? null;
    if (price == null) return null;
    const settings = await getBillingSettings();
    return { monthlyPrice: Math.round(price), lessonsPerPackage: settings.lessonsPerMonth, source: 'legacy' };
}

async function currentMemberCount(db: Db, groupId: string) {
    return db.enrollment.count({ where: { groupId, student: { deletedAt: null } } });
}

/** Student.group / Student.course — eski ekranlar uchun kesh (joriy guruhlar nomi). */
export async function refreshStudentCache(db: Db, studentId: string) {
    const current = await db.enrollment.findMany({
        where: { studentId, group: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { group: { select: { name: true, course: { select: { name: true } } } } },
    });
    await db.student.update({
        where: { id: studentId },
        data: {
            group: current.length ? current.map(c => c.group.name).join(', ') : null,
            course: current[0]?.group.course?.name ?? null,
        },
    });
}

async function hasAttendanceFrom(db: Db, studentId: string, groupId: string, from: string) {
    return (await db.attendanceRecord.count({ where: { studentId, groupId, date: { gte: from } } })) > 0;
}

async function pauseSettings() {
    const rows = await prisma.setting.findMany({ where: { key: { in: ['pause_min_days', 'pause_max_days'] } } });
    const map = Object.fromEntries(rows.map(r => [r.key, Number(r.value)]));
    return {
        min: Number.isFinite(map.pause_min_days) ? map.pause_min_days : 7,
        max: Number.isFinite(map.pause_max_days) ? map.pause_max_days : 60,
    };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export interface EnrollmentPreview {
    ok: boolean;
    errors: string[];
    warnings: string[];
    startDate: string;
    month: string;
    group: { id: string; name: string; capacity: { current: number; max: number } } | null;
    tariff: ResolvedTariff | null;
    groupLessonsInMonth: number | null;
    billableLessons: number | null;
    firstBillableDate: string | null;
    fullMonth: boolean | null;
    firstMonthAmount: number | null;
}

/** Yozishdan oldin: xatolar, ogohlantirishlar va birinchi oy summasi (TQ-A). Hech narsa yozmaydi. */
export async function previewEnrollment(db: Db, input: { studentId?: string; groupId: string; startDate: string }): Promise<EnrollmentPreview> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const startDate = input.startDate;
    const base: EnrollmentPreview = {
        ok: false, errors, warnings, startDate, month: isValidDate(startDate) ? monthOf(startDate) : '',
        group: null, tariff: null, groupLessonsInMonth: null, billableLessons: null, firstBillableDate: null, fullMonth: null, firstMonthAmount: null,
    };
    if (!isValidDate(startDate)) { errors.push("Boshlanish sanasi YYYY-MM-DD formatida bo'lishi kerak"); return base; }
    const group = await loadGroup(db, input.groupId);
    if (!group) { errors.push('Guruh topilmadi'); return base; }
    const current = await currentMemberCount(db, group.id);
    base.group = { id: group.id, name: group.name, capacity: { current, max: group.maxSize } };
    if (group.deletedAt) errors.push('Guruh arxivlangan');
    if (group.status === 'completed') errors.push('Guruh yakunlangan');
    if (group.startDate && startDate < group.startDate) errors.push(`Guruh ${group.startDate} dan boshlanadi — undan oldin yozib bo'lmaydi`);
    if (group.endDate && startDate > group.endDate) errors.push(`Guruh ${group.endDate} da tugaydi`);
    if (group.maxSize > 0 && current >= group.maxSize) errors.push("Guruhda bo'sh o'rin yo'q");
    if (input.studentId) {
        const student = await db.student.findUnique({ where: { id: input.studentId }, select: { deletedAt: true } });
        if (!student) errors.push("O'quvchi topilmadi");
        else if (student.deletedAt) errors.push("O'quvchi arxivlangan");
        const [enr, lastEnded] = await Promise.all([
            db.enrollment.findUnique({ where: { studentId_groupId: { studentId: input.studentId, groupId: group.id } } }),
            db.enrollmentPeriod.findFirst({ where: { studentId: input.studentId, groupId: group.id, status: 'ended' }, orderBy: { endDate: 'desc' } }),
        ]);
        if (enr) errors.push("O'quvchi allaqachon shu guruhda");
        if (lastEnded?.endDate && lastEnded.endDate >= startDate) errors.push(`Oldingi a'zolik ${lastEnded.endDate} da tugagan — yangisi undan keyin boshlanadi`);
    }
    if (startDate > addDays(todayDateStr(), 62)) warnings.push("Boshlanish sanasi 2 oydan uzoq kelajakda");
    base.tariff = await resolveTariff(db, group, startDate);
    if (!base.tariff) warnings.push("Guruh va kursda narx yo'q — birinchi oy summasi hisoblanmaydi");
    else if (base.tariff.source === 'legacy') warnings.push("Tarif tarixi hali yo'q — joriy guruh narxi ishlatildi");
    const days = await groupScheduleDays(db, group.id);
    // IP-10: oy rejasi (bayram, bekor/ko'chirilgan darslar bilan) bo'lsa — undan, aks holda jadvaldan
    const planDates = await billableLessonDates(db, group.id, base.month);
    if (!days.length && !planDates) warnings.push("Guruh dars jadvali yo'q — darslar soni va birinchi oy summasi hisoblanmaydi");
    else {
        const ml = monthLessons({ month: base.month, days, groupStart: group.startDate, groupEnd: group.endDate, periodStart: startDate, lessonDates: planDates ?? undefined });
        base.groupLessonsInMonth = ml.groupLessons.length;
        base.billableLessons = ml.billable.length;
        base.firstBillableDate = ml.billable[0] ?? null;
        base.fullMonth = ml.fullMonth;
        if (base.tariff && base.tariff.lessonsPerPackage > 0) {
            base.firstMonthAmount = computeBase({ price: base.tariff.monthlyPrice, lessonsPerPackage: base.tariff.lessonsPerPackage, billableLessons: ml.billable.length, fullMonth: ml.fullMonth });
        }
        if (ml.billable.length === 0) warnings.push("Shu oyda boshlanish sanasidan keyin dars yo'q — birinchi hisob keyingi oydan");
    }
    base.ok = errors.length === 0;
    return base;
}

// ─── Yozish ──────────────────────────────────────────────────────────────────

export interface EnrollInput { studentId: string; groupId: string; startDate: string; source?: string; transferFromId?: string | null; note?: string | null }

export async function enrollInTx(tx: Prisma.TransactionClient, input: EnrollInput, actorId?: string | null) {
    const startDate = assertDate(input.startDate, 'Boshlanish sanasi');
    const [student, group] = await Promise.all([
        tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, deletedAt: true } }),
        loadGroup(tx, input.groupId),
    ]);
    if (!student || !group) throw new EnrollmentError(404, "O'quvchi yoki guruh topilmadi", 'NOT_FOUND');
    if (student.deletedAt) throw new EnrollmentError(400, "O'quvchi arxivlangan — avval uni arxivdan tiklang", 'STUDENT_ARCHIVED');
    if (group.deletedAt) throw new EnrollmentError(400, "Guruh arxivlangan — avval uni arxivdan tiklang", 'GROUP_ARCHIVED');
    if (group.status === 'completed') throw new EnrollmentError(400, 'Guruh yakunlangan', 'GROUP_COMPLETED');
    if (group.startDate && startDate < group.startDate) throw new EnrollmentError(400, `Guruh ${group.startDate} dan boshlanadi — undan oldin yozib bo'lmaydi`, 'BEFORE_GROUP_START');
    if (group.endDate && startDate > group.endDate) throw new EnrollmentError(400, `Guruh ${group.endDate} da tugaydi`, 'AFTER_GROUP_END');

    const [existing, active] = await Promise.all([
        tx.enrollment.findUnique({ where: { studentId_groupId: { studentId: student.id, groupId: group.id } } }),
        tx.enrollmentPeriod.findFirst({ where: { studentId: student.id, groupId: group.id, status: 'active' } }),
    ]);
    if (existing || active) {
        // Idempotent: allaqachon a'zo (eski yozuv davrsiz bo'lsa ham) — yangi hech narsa yaratilmaydi.
        const enrollment = existing ?? await tx.enrollment.create({ data: { studentId: student.id, groupId: group.id, userId: actorId ?? null } });
        return { enrollment, period: active, alreadyEnrolled: true as const };
    }
    const lastEnded = await tx.enrollmentPeriod.findFirst({ where: { studentId: student.id, groupId: group.id, status: 'ended' }, orderBy: { endDate: 'desc' } });
    if (lastEnded?.endDate && lastEnded.endDate >= startDate) {
        throw new EnrollmentError(400, `Oldingi a'zolik ${lastEnded.endDate} da tugagan — yangisi undan keyin boshlanishi kerak`, 'OVERLAP');
    }

    // Sig'im: avval guruh qatorini qulflaymiz, keyin sanaymiz (QT-62)
    await tx.group.update({ where: { id: group.id }, data: { updatedAt: new Date() } });
    const count = await currentMemberCount(tx, group.id);
    if (group.maxSize > 0 && count >= group.maxSize) throw new EnrollmentError(409, "Guruhda bo'sh o'rin qolmagan — boshqa guruhni tanlang", 'GROUP_FULL');

    const enrollment = await tx.enrollment.create({ data: { studentId: student.id, groupId: group.id, userId: actorId ?? null } });
    const period = await tx.enrollmentPeriod.create({
        data: {
            studentId: student.id, groupId: group.id, startDate,
            startSource: input.source ?? 'manual', transferFromId: input.transferFromId ?? null,
            note: input.note ?? null, createdById: actorId ?? null,
        },
    });
    await refreshStudentCache(tx, student.id);
    return { enrollment, period, alreadyEnrolled: false as const };
}

export async function enrollStudent(input: EnrollInput, actor: Actor) {
    const result = await prisma.$transaction(tx => enrollInTx(tx, input, actor.id));
    if (!result.alreadyEnrolled) {
        await ensureStudentIdentitySafe(prisma, input.studentId);
        await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll', resource: 'enrollmentPeriod', resourceId: result.period!.id, after: result.period });
    }
    return result;
}

// ─── Yakunlash ───────────────────────────────────────────────────────────────

export interface EndInput { periodId: string; endDate: string; reason: string; note?: string | null; source?: string }

export async function endInTx(tx: Prisma.TransactionClient, input: EndInput) {
    const period = await tx.enrollmentPeriod.findUnique({ where: { id: input.periodId } });
    if (!period) throw new EnrollmentError(404, "A'zolik davri topilmadi", 'NOT_FOUND');
    if (period.status !== 'active') throw new EnrollmentError(409, "Bu a'zolik allaqachon yakunlangan", 'NOT_ACTIVE');
    if (!(END_REASONS as readonly string[]).includes(input.reason)) throw new EnrollmentError(400, 'Yakunlash sababi noto\'g\'ri', 'BAD_REASON');
    const endDate = assertDate(input.endDate, 'Tugash sanasi');
    if (endDate > todayDateStr()) throw new EnrollmentError(400, "Tugash sanasi kelajakda bo'lishi mumkin emas", 'FUTURE_END');

    if (input.reason === 'admin_fix') {
        // Xato qo'shilgan: davr butunlay olib tashlanadi — faqat davomat bo'lmasa
        if (await hasAttendanceFrom(tx, period.studentId, period.groupId, period.startDate)) {
            throw new EnrollmentError(409, "Bu a'zolikda davomat bor — \"ketdi\" sababi bilan yakunlang", 'HAS_ATTENDANCE');
        }
        await tx.enrollmentPeriod.delete({ where: { id: period.id } });
    } else {
        if (endDate < period.startDate) throw new EnrollmentError(400, `Tugash sanasi boshlanishdan (${period.startDate}) oldin bo'lmaydi`, 'END_BEFORE_START');
        await tx.enrollmentPeriod.update({
            where: { id: period.id },
            data: { status: 'ended', endDate, endReason: input.reason, endSource: input.source ?? 'manual', note: input.note ?? period.note },
        });
        await tx.enrollmentPause.updateMany({ where: { periodId: period.id, status: 'active', fromDate: { gt: endDate } }, data: { status: 'cancelled' } });
        await tx.enrollmentPause.updateMany({ where: { periodId: period.id, status: 'active', toDate: { gt: endDate } }, data: { toDate: endDate } });
    }
    await tx.enrollment.deleteMany({ where: { studentId: period.studentId, groupId: period.groupId } });
    await refreshStudentCache(tx, period.studentId);
    return { period, removed: input.reason === 'admin_fix' };
}

export async function endPeriod(input: EndInput, actor: Actor) {
    const r = await prisma.$transaction(tx => endInTx(tx, input));
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: r.removed ? 'enroll_void' : 'enroll_end', resource: 'enrollmentPeriod', resourceId: input.periodId, before: r.period, after: { endDate: input.endDate, reason: input.reason } });
    return r;
}

// ─── Transfer (QT-61) ────────────────────────────────────────────────────────

export async function transferPeriod(input: { periodId: string; toGroupId: string; date: string }, actor: Actor) {
    const date = assertDate(input.date, 'Transfer sanasi');
    if (date > todayDateStr()) throw new EnrollmentError(400, "Transfer sanasi kelajakda bo'lishi mumkin emas", 'FUTURE_DATE');
    const result = await prisma.$transaction(async tx => {
        const period = await tx.enrollmentPeriod.findUnique({ where: { id: input.periodId } });
        if (!period) throw new EnrollmentError(404, "A'zolik davri topilmadi", 'NOT_FOUND');
        if (period.status !== 'active') throw new EnrollmentError(409, "Bu a'zolik allaqachon yakunlangan", 'NOT_ACTIVE');
        if (period.groupId === input.toGroupId) throw new EnrollmentError(400, "O'quvchi allaqachon shu guruhda", 'SAME_GROUP');
        // Eski guruhda: transfer kunidan bir kun oldin tugaydi. Davr shu kuni
        // yoki keyin boshlangan bo'lsa (hali dars o'tmagan) — xato yozuv sifatida olib tashlanadi.
        const oldEnd = addDays(date, -1);
        const ended = await endInTx(tx, oldEnd >= period.startDate
            ? { periodId: period.id, endDate: oldEnd, reason: 'transfer', source: 'transfer' }
            : { periodId: period.id, endDate: date, reason: 'admin_fix', source: 'transfer' });
        const next = await enrollInTx(tx, {
            studentId: period.studentId, groupId: input.toGroupId, startDate: date, source: 'transfer',
            transferFromId: ended.removed ? null : period.id,
        }, actor.id);
        if (next.alreadyEnrolled) throw new EnrollmentError(409, "O'quvchi yangi guruhda allaqachon bor", 'ALREADY_IN_TARGET');
        return { from: ended, to: next };
    });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll_transfer', resource: 'enrollmentPeriod', resourceId: input.periodId, after: { toGroupId: input.toGroupId, date, newPeriodId: result.to.period?.id } });
    return result;
}

// ─── Pauza (OQ-06) ───────────────────────────────────────────────────────────

export async function pausePeriod(input: { periodId: string; fromDate: string; toDate: string; reason: string }, actor: Actor) {
    const fromDate = assertDate(input.fromDate, 'Pauza boshlanishi');
    const toDate = assertDate(input.toDate, 'Pauza tugashi');
    const reason = String(input.reason || '').trim();
    if (reason.length < 3) throw new EnrollmentError(400, 'Pauza sababini yozing', 'NO_REASON');
    if (toDate < fromDate) throw new EnrollmentError(400, "Pauza tugashi boshlanishidan oldin bo'lmaydi", 'BAD_RANGE');
    const { min, max } = await pauseSettings();
    const days = daysBetween(fromDate, toDate) + 1;
    if (days < min || days > max) throw new EnrollmentError(400, `Pauza ${min} kundan ${max} kungacha bo'lishi mumkin (hozir ${days} kun)`, 'BAD_LENGTH');
    if (fromDate < firstOfMonth(todayDateStr())) throw new EnrollmentError(400, "O'tgan oylarga pauza qo'yib bo'lmaydi", 'RETROACTIVE');
    const pause = await prisma.$transaction(async tx => {
        const period = await tx.enrollmentPeriod.findUnique({ where: { id: input.periodId }, include: { pauses: { where: { status: 'active' } } } });
        if (!period) throw new EnrollmentError(404, "A'zolik davri topilmadi", 'NOT_FOUND');
        if (period.status !== 'active') throw new EnrollmentError(409, "Yakunlangan a'zolikka pauza qo'yib bo'lmaydi", 'NOT_ACTIVE');
        if (fromDate < period.startDate) throw new EnrollmentError(400, `Pauza a'zolik boshlanishidan (${period.startDate}) oldin bo'lmaydi`, 'BEFORE_START');
        if (period.pauses.some(p => p.fromDate <= toDate && p.toDate >= fromDate)) throw new EnrollmentError(409, "Bu oraliqda pauza allaqachon bor", 'OVERLAP');
        return tx.enrollmentPause.create({ data: { periodId: period.id, fromDate, toDate, reason, createdById: actor.id ?? null } });
    });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll_pause', resource: 'enrollmentPause', resourceId: pause.id, after: pause });
    return pause;
}

/** Pauzani to'xtatish: hali boshlanmagan — bekor; boshlangan — kechagi kun bilan yopiladi. */
export async function stopPause(pauseId: string, actor: Actor) {
    const today = todayDateStr();
    const pause = await prisma.enrollmentPause.findUnique({ where: { id: pauseId } });
    if (!pause) throw new EnrollmentError(404, 'Pauza topilmadi', 'NOT_FOUND');
    if (pause.status !== 'active') throw new EnrollmentError(409, 'Pauza allaqachon bekor qilingan', 'NOT_ACTIVE');
    if (pause.toDate < today) throw new EnrollmentError(409, 'Pauza allaqachon tugagan', 'FINISHED');
    const yesterday = addDays(today, -1);
    const updated = pause.fromDate > yesterday
        ? await prisma.enrollmentPause.update({ where: { id: pauseId }, data: { status: 'cancelled' } })
        : await prisma.enrollmentPause.update({ where: { id: pauseId }, data: { toDate: yesterday } });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll_pause_stop', resource: 'enrollmentPause', resourceId: pauseId, before: pause, after: updated });
    return updated;
}

// ─── Eski API bilan moslik: DELETE /enrollments/remove ──────────────────────

/**
 * Eski "guruhdan chiqarish". Faol davr bo'lsa — bugun bilan yakunlanadi (bugun
 * yoki keyin boshlangan va davomatsiz bo'lsa — xato yozuv sifatida olib
 * tashlanadi). Davrsiz eski a'zolik — tarix yo'qolmasligi uchun dalildan
 * tiklangan va yakunlangan davr yoziladi.
 */
export async function legacyRemove(input: { studentId: string; groupId: string }, actor: Actor) {
    const today = todayDateStr();
    const r = await prisma.$transaction(async tx => {
        const active = await tx.enrollmentPeriod.findFirst({ where: { studentId: input.studentId, groupId: input.groupId, status: 'active' } });
        if (active) {
            const fresh = active.startDate >= today && !(await hasAttendanceFrom(tx, active.studentId, active.groupId, active.startDate));
            return endInTx(tx, { periodId: active.id, endDate: today, reason: fresh ? 'admin_fix' : 'left', source: 'legacy_api' });
        }
        const enrollment = await tx.enrollment.findUnique({ where: { studentId_groupId: input } });
        if (!enrollment) throw new EnrollmentError(404, "O'quvchi bu guruhda emas", 'NOT_MEMBER');
        const first = await tx.attendanceRecord.findFirst({ where: input, orderBy: { date: 'asc' }, select: { date: true } });
        const created = todayDateStr(enrollment.createdAt);
        const startDate = first && first.date < created ? first.date : created;
        const period = await tx.enrollmentPeriod.create({
            data: {
                ...input, startDate, endDate: today, status: 'ended', endReason: 'left', endSource: 'legacy_api',
                startSource: first && first.date < created ? 'backfill_attendance' : 'backfill_created', createdById: actor.id ?? null,
            },
        });
        await tx.enrollment.delete({ where: { id: enrollment.id } });
        await refreshStudentCache(tx, input.studentId);
        return { period, removed: false };
    });
    await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: r.removed ? 'enroll_void' : 'enroll_end', resource: 'enrollmentPeriod', resourceId: r.period.id, before: r.period, metadata: { via: 'legacy_remove' } });
    return r;
}

// ─── O'qish ──────────────────────────────────────────────────────────────────

export async function listPeriods(where: { studentId?: string; groupId?: string }) {
    return prisma.enrollmentPeriod.findMany({
        where,
        orderBy: [{ startDate: 'desc' }],
        include: { pauses: { orderBy: { fromDate: 'asc' } }, group: { select: { id: true, name: true } }, student: { select: { id: true, name: true, code: true } } },
    });
}

/** Guruhning joriy a'zolari uchun faol davr (boshlanish sanasi va pauzalar bilan). */
export async function activePeriodsByStudent(groupId: string) {
    const rows = await prisma.enrollmentPeriod.findMany({
        where: { groupId, status: 'active' },
        select: { id: true, studentId: true, startDate: true, pauses: { where: { status: 'active' }, select: { id: true, fromDate: true, toDate: true, reason: true } } },
    });
    return new Map(rows.map(r => [r.studentId, r]));
}

// ─── Boshlanish sanasini tahrirlash ──────────────────────────────────────────
// Guruh qachon boshlangani va o'quvchi qachon o'qishni boshlaganini adminlar
// belgilaydi (tizimga kiritilgan kun emas). Hisob-kitob shu sanalardan: oy
// o'rtasida qo'shilsa — qolgan darslar (TQ-A). Hisoblarni yangilash —
// chaqiruvchi (route) tomonida: chargeEngine.refreshMembershipCharges.

export interface StartChange { periodId: string; startDate: string }
export interface StartChangeResult { periodId: string; studentId: string; groupId: string; from: string; to: string }

async function startChangeProblem(
    db: Db,
    period: { id: string; studentId: string; groupId: string; startDate: string; endDate: string | null },
    group: { startDate: string | null; endDate: string | null },
    startDate: string,
): Promise<string | null> {
    if (group.startDate && startDate < group.startDate) return `Guruh ${group.startDate} dan boshlanadi — undan oldingi sana qo'yib bo'lmaydi`;
    if (group.endDate && startDate > group.endDate) return `Guruh ${group.endDate} da tugaydi`;
    if (period.endDate && startDate > period.endDate) return `A'zolik ${period.endDate} da tugagan — boshlanish undan keyin bo'lmaydi`;
    const prev = await db.enrollmentPeriod.findFirst({
        where: { studentId: period.studentId, groupId: period.groupId, id: { not: period.id }, startDate: { lte: period.startDate } },
        orderBy: { startDate: 'desc' },
    });
    if (prev && (!prev.endDate || prev.endDate >= startDate)) return `Oldingi a'zolik ${prev.endDate ?? '(ochiq)'} gacha — yangi sana undan keyin bo'lishi kerak`;
    const pause = await db.enrollmentPause.findFirst({ where: { periodId: period.id, status: 'active' }, orderBy: { fromDate: 'asc' } });
    if (pause && pause.fromDate < startDate) return `${pause.fromDate} dan pauza bor — boshlanish undan keyin bo'lmaydi`;
    if (startDate > period.startDate) {
        const att = await db.attendanceRecord.findFirst({
            where: { studentId: period.studentId, groupId: period.groupId, date: { gte: period.startDate, lt: startDate } },
            orderBy: { date: 'asc' }, select: { date: true },
        });
        if (att) return `${att.date} sanada davomat bor — boshlanishni undan keyinga surib bo'lmaydi`;
    }
    return null;
}

/** Bir guruhdagi bir yoki bir nechta a'zolikning boshlanish sanasini o'zgartirish (hammasi yoki hech biri). */
export async function changePeriodStarts(input: { groupId: string; items: StartChange[] }, actor: Actor): Promise<StartChangeResult[]> {
    if (!Array.isArray(input.items) || !input.items.length) throw new EnrollmentError(400, "O'zgartiriladigan a'zolik yo'q", 'EMPTY');
    if (input.items.length > 300) throw new EnrollmentError(400, "Bir martada ko'pi bilan 300 ta a'zolik", 'TOO_MANY');
    const changed = await prisma.$transaction(async tx => {
        const group = await loadGroup(tx, input.groupId);
        if (!group || group.deletedAt) throw new EnrollmentError(404, 'Guruh topilmadi', 'NOT_FOUND');
        const errors: Array<{ periodId: string; studentId?: string; message: string }> = [];
        const out: StartChangeResult[] = [];
        for (const it of input.items) {
            if (!isValidDate(it?.startDate)) { errors.push({ periodId: it?.periodId, message: "Sana YYYY-MM-DD formatida bo'lishi kerak" }); continue; }
            const p = await tx.enrollmentPeriod.findUnique({ where: { id: it.periodId } });
            if (!p || p.groupId !== group.id) { errors.push({ periodId: it.periodId, message: "A'zolik topilmadi" }); continue; }
            if (p.startDate === it.startDate) continue;
            const problem = await startChangeProblem(tx, p, group, it.startDate);
            if (problem) { errors.push({ periodId: p.id, studentId: p.studentId, message: problem }); continue; }
            await tx.enrollmentPeriod.update({ where: { id: p.id }, data: { startDate: it.startDate } });
            out.push({ periodId: p.id, studentId: p.studentId, groupId: p.groupId, from: p.startDate, to: it.startDate });
        }
        if (errors.length) {
            throw new EnrollmentError(400, errors.length === 1 ? errors[0].message : `${errors.length} ta sanada xato — belgilangan qatorlarni tuzating`, 'INVALID_DATES', errors);
        }
        return out;
    });
    for (const c of changed) {
        await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll_start_change', resource: 'enrollmentPeriod', resourceId: c.periodId, before: { startDate: c.from }, after: { startDate: c.to } });
    }
    return changed;
}

/**
 * Guruh boshlanish sanasi o'zgarishi rejasi: yangi sanadan oldin boshlangan a'zoliklar
 * yangi sanaga suriladi. Davomat, pauza yoki shu sanagacha tugagan a'zolik bo'lsa — rad.
 */
export async function planGroupStartChange(db: Db, groupId: string, newStart: string): Promise<{ error?: string; shifts: StartChangeResult[] }> {
    if (!isValidDate(newStart)) return { error: "Boshlanish sanasi YYYY-MM-DD formatida bo'lishi kerak", shifts: [] };
    const att = await db.attendanceRecord.findFirst({ where: { groupId, date: { lt: newStart } }, orderBy: { date: 'asc' }, select: { date: true } });
    if (att) return { error: `Guruhda ${att.date} sanada davomat bor — boshlanishni undan keyinga surib bo'lmaydi`, shifts: [] };
    const periods = await db.enrollmentPeriod.findMany({ where: { groupId, startDate: { lt: newStart } }, include: { pauses: { where: { status: 'active' } } } });
    const shifts: StartChangeResult[] = [];
    for (const p of periods) {
        if (p.endDate && p.endDate < newStart) return { error: `Bir a'zolik ${p.endDate} da tugagan — guruh boshlanishini undan keyinga surib bo'lmaydi`, shifts: [] };
        if (p.pauses.some(x => x.fromDate < newStart)) return { error: `Bir a'zolikda ${newStart} dan oldin pauza bor — avval pauzani o'zgartiring`, shifts: [] };
        shifts.push({ periodId: p.id, studentId: p.studentId, groupId, from: p.startDate, to: newStart });
    }
    return { shifts };
}

/** Rejani qo'llash: a'zoliklar suriladi, birinchi tarif/ustoz versiyasi yangi boshlanishga moslanadi. */
export async function applyGroupStartChange(groupId: string, newStart: string, shifts: StartChangeResult[], actor: Actor) {
    await prisma.$transaction(async tx => {
        for (const sh of shifts) await tx.enrollmentPeriod.update({ where: { id: sh.periodId }, data: { startDate: newStart } });
        const firstTariff = await tx.tariffVersion.findFirst({ where: { groupId }, orderBy: { effectiveFrom: 'asc' } });
        if (firstTariff && firstTariff.effectiveFrom > newStart) await tx.tariffVersion.update({ where: { id: firstTariff.id }, data: { effectiveFrom: newStart } });
        const firstAssign = await tx.groupTeacherAssignment.findFirst({ where: { groupId }, orderBy: { fromDate: 'asc' } });
        if (firstAssign && firstAssign.fromDate > newStart) await tx.groupTeacherAssignment.update({ where: { id: firstAssign.id }, data: { fromDate: newStart } });
    });
    for (const sh of shifts) {
        await logAudit({ userId: actor.id, userName: actor.name || 'tizim', action: 'enroll_start_change', resource: 'enrollmentPeriod', resourceId: sh.periodId, before: { startDate: sh.from }, after: { startDate: sh.to, reason: 'group_start_change' } });
    }
}
