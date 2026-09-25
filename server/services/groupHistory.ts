/**
 * IP-09: guruh tarifi, guruh ustozi va ustoz foizi tarixi.
 *
 * Har o'zgarish — sana bilan yangi versiya (`planVersionInsert`: bo'shliqsiz,
 * ustma-ust tushmasdan). Eski ustunlar (`Group.price`, `Group.teacherId`,
 * `User.salaryPercent`) — bugungi versiyaning KESHI: eski ekranlar va hozirgi
 * billing o'zgarishsiz ishlayveradi (expand/contract, H.1).
 *
 * QT-21: o'tgan oylarga ta'sir qiluvchi o'zgarish taqiqlanadi — mavjud tarixni
 * joriy oyning 1-sanasidan oldingi sanadan o'zgartirib bo'lmaydi (oy yopish,
 * IP-21, kelgach bu chegara yopilgan davrga bog'lanadi).
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { planVersionInsert, versionAt, firstOfMonth, isValidDate } from '../domain/lessonCalendar.js';
import { roundSom } from '../domain/billingFormula.js';
import { getBillingSettings } from './billing.js';

type Db = PrismaClient | Prisma.TransactionClient;

export class HistoryError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

function assertNotRetroactive(from: string, hasHistory: boolean) {
    const monthStart = firstOfMonth(todayDateStr());
    if (hasHistory && from < monthStart) {
        throw new HistoryError(400, `O'tgan oylar tarixini o'zgartirib bo'lmaydi — sana ${monthStart} yoki keyinroq bo'lishi kerak`);
    }
}

// ─── Tarif ────────────────────────────────────────────────────────────────────

export interface TariffInput { monthlyPrice: number; lessonsPerPackage?: number; effectiveFrom: string; source?: string }

export async function setGroupTariff(db: Db, groupId: string, input: TariffInput, actorId?: string | null) {
    const price = Number(input.monthlyPrice);
    if (!Number.isFinite(price) || price < 0 || price > 1e9) throw new HistoryError(400, "Narx 0 dan 1 000 000 000 gacha bo'lishi kerak");
    if (!isValidDate(input.effectiveFrom)) throw new HistoryError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak");
    const versions = await db.tariffVersion.findMany({ where: { groupId }, orderBy: { effectiveFrom: 'asc' } });
    const n = input.lessonsPerPackage ?? versionAt(versions, input.effectiveFrom)?.lessonsPerPackage ?? (await getBillingSettings()).lessonsPerMonth;
    if (!Number.isInteger(n) || n < 1 || n > 60) throw new HistoryError(400, "Oylik darslar soni 1 dan 60 gacha butun son bo'lishi kerak");
    assertNotRetroactive(input.effectiveFrom, versions.length > 0);
    const data = { monthlyPrice: roundSom(price), lessonsPerPackage: n, source: input.source ?? 'manual', createdById: actorId ?? null };
    const plan = planVersionInsert(versions.map(v => ({ id: v.id, from: v.effectiveFrom, to: v.effectiveTo })), input.effectiveFrom);
    let version;
    if (plan.kind === 'replace') {
        version = await db.tariffVersion.update({ where: { id: plan.id }, data });
    } else {
        if (plan.close) await db.tariffVersion.update({ where: { id: plan.close.id }, data: { effectiveTo: plan.close.to } });
        version = await db.tariffVersion.create({ data: { ...data, groupId, effectiveFrom: input.effectiveFrom, effectiveTo: plan.newTo } });
    }
    await syncGroupCache(db, groupId);
    return version;
}

// ─── Ustoz tayinlash ─────────────────────────────────────────────────────────

export async function assignGroupTeacher(db: Db, groupId: string, input: { teacherId: string | null; fromDate: string; source?: string }, actorId?: string | null) {
    if (!isValidDate(input.fromDate)) throw new HistoryError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak");
    if (input.teacherId) {
        const t = await db.user.findUnique({ where: { id: input.teacherId }, select: { role: true, isActive: true } });
        if (!t || !t.isActive || !['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(t.role)) throw new HistoryError(400, "Ustoz topilmadi yoki faol emas");
    }
    const rows = await db.groupTeacherAssignment.findMany({ where: { groupId, role: 'primary' }, orderBy: { fromDate: 'asc' } });
    assertNotRetroactive(input.fromDate, rows.length > 0);
    const segments = rows.map(r => ({ id: r.id, from: r.fromDate, to: r.toDate }));
    const plan = planVersionInsert(segments, input.fromDate);
    if (!input.teacherId) {
        // Ustozsiz qoldirish — joriy tayinlash shu sanadan oldin yopiladi
        if (plan.kind === 'replace') await db.groupTeacherAssignment.delete({ where: { id: plan.id } });
        else if (plan.close) await db.groupTeacherAssignment.update({ where: { id: plan.close.id }, data: { toDate: plan.close.to } });
        await syncGroupCache(db, groupId);
        return null;
    }
    const data = { teacherId: input.teacherId, source: input.source ?? 'manual', createdById: actorId ?? null };
    let row;
    if (plan.kind === 'replace') {
        row = await db.groupTeacherAssignment.update({ where: { id: plan.id }, data });
    } else {
        if (plan.close) await db.groupTeacherAssignment.update({ where: { id: plan.close.id }, data: { toDate: plan.close.to } });
        row = await db.groupTeacherAssignment.create({ data: { ...data, groupId, fromDate: input.fromDate, toDate: plan.newTo } });
    }
    await syncGroupCache(db, groupId);
    return row;
}

// ─── Ustoz foizi ─────────────────────────────────────────────────────────────

export async function setTeacherRate(db: Db, teacherId: string, input: { rateBp: number; effectiveFrom: string; source?: string }, actorId?: string | null) {
    const bp = Math.round(Number(input.rateBp));
    if (!Number.isFinite(bp) || bp < 0 || bp > 10000) throw new HistoryError(400, "Foiz 0 dan 100 gacha bo'lishi kerak");
    if (!isValidDate(input.effectiveFrom)) throw new HistoryError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak");
    const rows = await db.teacherRate.findMany({ where: { teacherId }, orderBy: { effectiveFrom: 'asc' } });
    assertNotRetroactive(input.effectiveFrom, rows.length > 0);
    const plan = planVersionInsert(rows.map(r => ({ id: r.id, from: r.effectiveFrom, to: r.effectiveTo })), input.effectiveFrom);
    const data = { rateBp: bp, source: input.source ?? 'manual', createdById: actorId ?? null };
    let row;
    if (plan.kind === 'replace') {
        row = await db.teacherRate.update({ where: { id: plan.id }, data });
    } else {
        if (plan.close) await db.teacherRate.update({ where: { id: plan.close.id }, data: { effectiveTo: plan.close.to } });
        row = await db.teacherRate.create({ data: { ...data, teacherId, effectiveFrom: input.effectiveFrom, effectiveTo: plan.newTo } });
    }
    await syncTeacherCache(db, teacherId);
    return row;
}

// ─── Keshlar ─────────────────────────────────────────────────────────────────

/** Group.price / Group.teacherId ni bugungi versiyaga moslaydi (versiya bo'lsa). */
export async function syncGroupCache(db: Db, groupId: string, today = todayDateStr()) {
    const [tariffs, assigns] = await Promise.all([
        db.tariffVersion.findMany({ where: { groupId } }),
        db.groupTeacherAssignment.findMany({ where: { groupId, role: 'primary' } }),
    ]);
    const data: { price?: number; teacherId?: string | null } = {};
    const t = versionAt(tariffs, today);
    if (t) data.price = t.monthlyPrice;
    if (assigns.length) {
        const a = versionAt(assigns.map(x => ({ ...x, effectiveFrom: x.fromDate, effectiveTo: x.toDate })), today);
        data.teacherId = a ? a.teacherId : null;
    }
    if (Object.keys(data).length) await db.group.update({ where: { id: groupId }, data });
}

export async function syncTeacherCache(db: Db, teacherId: string, today = todayDateStr()) {
    const rows = await db.teacherRate.findMany({ where: { teacherId } });
    const r = versionAt(rows, today);
    if (r) await db.user.update({ where: { id: teacherId }, data: { salaryPercent: r.rateBp / 100 } });
}

/** Kunlik: kelajak sanali versiyalar kuchga kirganda keshlarni yangilash. */
export async function syncAllHistoryCaches(today = todayDateStr()) {
    const [groupIds, teacherIds] = await Promise.all([
        prisma.tariffVersion.findMany({ where: { OR: [{ effectiveFrom: today }, { effectiveTo: { lt: today } }] }, select: { groupId: true }, distinct: ['groupId'] }),
        prisma.teacherRate.findMany({ where: { effectiveFrom: today }, select: { teacherId: true }, distinct: ['teacherId'] }),
    ]);
    const assignGroups = await prisma.groupTeacherAssignment.findMany({ where: { fromDate: today }, select: { groupId: true }, distinct: ['groupId'] });
    const groups = new Set([...groupIds.map(g => g.groupId), ...assignGroups.map(g => g.groupId)]);
    for (const g of groups) await syncGroupCache(prisma, g, today);
    for (const t of teacherIds) await syncTeacherCache(prisma, t.teacherId, today);
    return { groups: groups.size, teachers: teacherIds.length };
}

// ─── Eski yo'llardan kelgan o'zgarishlarni tarixga yozish ─────────────────────

/**
 * Generic `PUT /groups/:id` (CrmGroups formasi) narx yoki ustozni o'zgartirsa —
 * bugungi sanadan yangi versiya. Tarix hali bo'lmasa, avval eski holat
 * guruh boshlanish sanasidan boshlang'ich versiya sifatida yoziladi.
 */
export async function recordLegacyGroupEdit(
    before: { id: string; price: number | null; teacherId: string | null; startDate: string | null; courseId: string | null; createdAt: Date },
    after: { price: number | null; teacherId: string | null },
    actorId?: string | null,
) {
    const today = todayDateStr();
    const since = initialDate(before.startDate, before.createdAt);
    if (after.price !== before.price && after.price != null) {
        await prisma.$transaction(async tx => {
            const has = await tx.tariffVersion.count({ where: { groupId: before.id } });
            if (!has) {
                const prevPrice = before.price ?? (before.courseId ? (await tx.course.findUnique({ where: { id: before.courseId }, select: { price: true } }))?.price : null);
                if (prevPrice != null && since < today) await setGroupTariff(tx, before.id, { monthlyPrice: prevPrice, effectiveFrom: since, source: 'legacy_edit' }, actorId);
            }
            await setGroupTariff(tx, before.id, { monthlyPrice: after.price!, effectiveFrom: today, source: 'legacy_edit' }, actorId);
        });
    }
    if (after.teacherId !== before.teacherId) {
        await prisma.$transaction(async tx => {
            const has = await tx.groupTeacherAssignment.count({ where: { groupId: before.id } });
            if (!has && before.teacherId && since < today) {
                await assignGroupTeacher(tx, before.id, { teacherId: before.teacherId, fromDate: since, source: 'legacy_edit' }, actorId);
            }
            await assignGroupTeacher(tx, before.id, { teacherId: after.teacherId, fromDate: today, source: 'legacy_edit' }, actorId);
        });
    }
}

/** Yangi guruh: boshlang'ich tarif va ustoz tayinlash (guruh boshlanish sanasidan). */
export async function recordGroupCreate(group: { id: string; price: number | null; teacherId: string | null; startDate: string | null; courseId: string | null; createdAt: Date }, actorId?: string | null) {
    const from = initialDate(group.startDate, group.createdAt);
    await prisma.$transaction(async tx => {
        const price = group.price ?? (group.courseId ? (await tx.course.findUnique({ where: { id: group.courseId }, select: { price: true } }))?.price : null);
        if (price != null && !(await tx.tariffVersion.count({ where: { groupId: group.id } }))) {
            await setGroupTariff(tx, group.id, { monthlyPrice: price, effectiveFrom: from, source: 'group_create' }, actorId);
        }
        if (group.teacherId && !(await tx.groupTeacherAssignment.count({ where: { groupId: group.id } }))) {
            await assignGroupTeacher(tx, group.id, { teacherId: group.teacherId, fromDate: from, source: 'group_create' }, actorId);
        }
    });
}

/** Admin foydalanuvchi foizini o'zgartirsa (auth.ts) — bugundan yangi stavka. */
export async function recordLegacyRateEdit(userId: string, beforePercent: number | null, afterPercent: number | null, actorId?: string | null) {
    if (afterPercent == null || afterPercent === beforePercent) return;
    const today = todayDateStr();
    const monthStart = firstOfMonth(today);
    await prisma.$transaction(async tx => {
        const has = await tx.teacherRate.count({ where: { teacherId: userId } });
        // Tarix bo'lmasa, oy boshidan bugungacha eski stavka amal qilgan deb yoziladi
        // (joriy oy maoshi ikki stavka bo'yicha to'g'ri bo'linadi).
        if (!has && beforePercent != null && monthStart < today) {
            await setTeacherRate(tx, userId, { rateBp: beforePercent * 100, effectiveFrom: monthStart, source: 'legacy_edit' }, actorId);
        }
        await setTeacherRate(tx, userId, { rateBp: afterPercent * 100, effectiveFrom: today, source: 'legacy_edit' }, actorId);
    });
}

function initialDate(startDate: string | null, createdAt: Date): string {
    return startDate && isValidDate(startDate) ? startDate : todayDateStr(createdAt);
}

/** Tarix yozuvi asosiy amalni to'xtatmasin (eski yo'llar uchun) — xato logga. */
export async function safeHistory(label: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e: any) { console.error(`[groupHistory] ${label}:`, e?.message); }
}
