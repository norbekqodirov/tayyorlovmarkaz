/**
 * Dars kalendari va sana oraliqlari — SOF funksiyalar (IP-09, IP-10 poydevori).
 * Sanalar "YYYY-MM-DD" (Toshkent kalendari), hafta kunlari ISO: 1 = Dushanba … 7 = Yakshanba
 * (GroupSchedule.days konvensiyasi).
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: unknown): s is string {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Ikki sana orasidagi kunlar (b − a). */
export function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function isoWeekday(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return wd === 0 ? 7 : wd;
}

export function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function monthRange(month: string): { first: string; last: string } {
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { first, last };
}

export function firstOfMonth(date: string): string {
    return `${monthOf(date)}-01`;
}

/** `from`…`to` (ikkalasi ham kiradi) oralig'ida jadval kunlariga tushgan sanalar; bayramlar chiqariladi. */
export function scheduledDates(days: number[], from: string, to: string, holidays?: ReadonlySet<string>): string[] {
    const set = new Set(days.filter(d => Number.isInteger(d) && d >= 1 && d <= 7));
    const out: string[] = [];
    if (set.size === 0 || from > to) return out;
    for (let d = from; d <= to; d = addDays(d, 1)) {
        if (set.has(isoWeekday(d)) && !holidays?.has(d)) out.push(d);
    }
    return out;
}

export interface DateRange { from: string; to: string }

export function inRange(date: string, r: { from: string; to?: string | null }): boolean {
    return date >= r.from && (r.to == null || date <= r.to);
}

export interface MonthLessonsInput {
    month: string;
    /** Jadval kunlari (ISO). */
    days: number[];
    /** Guruh faoliyat oralig'i. */
    groupStart?: string | null;
    groupEnd?: string | null;
    /** A'zolik davri. */
    periodStart: string;
    periodEnd?: string | null;
    /** Faol pauzalar (OQ-06) — ichidagi darslar billable emas. */
    pauses?: DateRange[];
    holidays?: ReadonlySet<string>;
    /** Dars rejasi (IP-10) bor bo'lsa — jadval o'rniga shu billable sanalar ishlatiladi. */
    lessonDates?: string[];
}

export interface MonthLessons {
    /** Guruhning shu oydagi rejadagi darslari (guruh oralig'i ichida) — F. */
    groupLessons: string[];
    /** O'quvchining billable darslari — R. */
    billable: string[];
    /** Davr guruhning oydagi BARCHA darslarini qoplaydimi (G.3: to'liq oy → P). */
    fullMonth: boolean;
}

/**
 * Oy uchun F (guruh darslari) va R (o'quvchining billable darslari). To'liq oy —
 * guruhning oydagi har bir darsi a'zolik davri ichida va pauzaga tushmagan.
 * Guruhning shu oyda darsi bo'lmasa — R = 0, to'liq oy emas (hisob chiqmaydi).
 */
export function monthLessons(i: MonthLessonsInput): MonthLessons {
    const { first, last } = monthRange(i.month);
    const from = i.groupStart && i.groupStart > first ? i.groupStart : first;
    const to = i.groupEnd && i.groupEnd < last ? i.groupEnd : last;
    const groupLessons = i.lessonDates
        ? [...new Set(i.lessonDates)].filter(d => d >= from && d <= to && !i.holidays?.has(d)).sort()
        : scheduledDates(i.days, from, to, i.holidays);
    const billable = groupLessons.filter(d =>
        d >= i.periodStart && (i.periodEnd == null || d <= i.periodEnd) &&
        !(i.pauses || []).some(p => d >= p.from && d <= p.to));
    return { groupLessons, billable, fullMonth: groupLessons.length > 0 && billable.length === groupLessons.length };
}

// ─── Versiyalangan tarix (tarif, ustoz, foiz) ────────────────────────────────

export interface VersionSegment { id: string; from: string; to: string | null }

export type VersionPlan =
    | { kind: 'replace'; id: string }
    | { kind: 'insert'; newTo: string | null; close?: { id: string; to: string } };

/**
 * Yangi versiyani `from` sanasidan kiritish rejasi. Shu sanadan boshlanadigan
 * versiya bo'lsa — almashtiriladi; aks holda oldingi versiya `from − 1` da
 * yopiladi, yangisi keyingi versiya boshlanishidan bir kun oldin tugaydi
 * (keyingisi bo'lmasa — ochiq). Oraliqlar ustma-ust tushmaydi va bo'shliq qolmaydi.
 */
export function planVersionInsert(existing: VersionSegment[], from: string): VersionPlan {
    const sorted = [...existing].sort((a, b) => a.from.localeCompare(b.from));
    const same = sorted.find(v => v.from === from);
    if (same) return { kind: 'replace', id: same.id };
    const prev = [...sorted].reverse().find(v => v.from < from);
    const next = sorted.find(v => v.from > from);
    const plan: VersionPlan = { kind: 'insert', newTo: next ? addDays(next.from, -1) : null };
    if (prev && (prev.to == null || prev.to >= from)) plan.close = { id: prev.id, to: addDays(from, -1) };
    return plan;
}

/** Berilgan sanada amal qiladigan versiya. */
export function versionAt<T extends { effectiveFrom: string; effectiveTo: string | null }>(versions: T[], date: string): T | undefined {
    return [...versions]
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
        .find(v => v.effectiveFrom <= date && (v.effectiveTo == null || v.effectiveTo >= date));
}
