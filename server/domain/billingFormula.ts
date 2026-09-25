/**
 * Hisob formulalari — SOF funksiyalar (baza, tarmoq, vaqt yo'q).
 *
 * Manba: docs/CRM_YAGONA_AUDIT_VA_RIVOJLANTIRISH_REJASI_2026-09-25.md, G.3 va
 * G.4 bo'limlari; tasdiqlangan qoidalar TQ-A (oy o'rtasida qo'shilish — qolgan
 * rejadagi darslar bo'yicha) va TQ-B (o'qituvchi maoshi hisoblangan summadan).
 * Hisob dvigateli (IP-11) va testlar (IP-06) shu funksiyalardan foydalanadi —
 * formula bitta joyda.
 *
 * Pul — butun so'm. Yaxlitlash: 0,5 yuqoriga (half-up). Bir summani bir necha
 * qismga bo'lishda — eng katta qoldiq usuli (qismlar jami doim aniq teng).
 */

/** Butun so'mga yaxlitlash (0,5 — yuqoriga, manfiy sonlar uchun ham nosimmetrik). */
export function roundSom(x: number): number {
    if (!Number.isFinite(x)) throw new Error(`Noto'g'ri summa: ${x}`);
    return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

/**
 * `total`ni `weights` nisbatida butun qismlarga bo'lish — eng katta qoldiq usuli.
 * Qismlar yig'indisi har doim aynan `total`ga teng (masalan 100 → 34/33/33).
 * Og'irliklar yig'indisi 0 bo'lsa — hammasi 0.
 */
export function allocateLargestRemainder(total: number, weights: number[]): number[] {
    if (!Number.isInteger(total)) throw new Error('total butun son bo\'lishi kerak');
    const sumW = weights.reduce((a, w) => a + Math.max(0, w), 0);
    if (sumW <= 0 || weights.length === 0) return weights.map(() => 0);
    const sign = total < 0 ? -1 : 1;
    const abs = Math.abs(total);
    const raw = weights.map(w => (abs * Math.max(0, w)) / sumW);
    const floors = raw.map(Math.floor);
    let rest = abs - floors.reduce((a, b) => a + b, 0);
    const order = raw
        .map((r, i) => ({ i, frac: r - Math.floor(r) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k].i] += 1;
    return floors.map(v => v * sign);
}

export interface BaseInput {
    /** Oylik narx (shu oyga amal qilgan tarif). */
    price: number;
    /** Maxraj — paketdagi darslar soni (OQ-01, standart 12). */
    lessonsPerPackage: number;
    /** O'quvchining shu oydagi billable darslari (a'zolik davri ichida). */
    billableLessons: number;
    /** Davr butun oyni qoplaydimi (birinchi billable darsdan oldin boshlangan va oxirgisidan keyin tugagan). */
    fullMonth: boolean;
}

/** TQ-A: to'liq oyda P; qisman oyda round(P × min(R, N) / N). N ≤ 0 — xato (avtomatik hisob chiqmaydi). */
export function computeBase({ price, lessonsPerPackage: N, billableLessons: R, fullMonth }: BaseInput): number {
    if (!(N > 0)) throw new Error('Maxraj (oyiga darslar soni) musbat bo\'lishi kerak — hisob avtomatik chiqarilmaydi');
    if (price < 0 || R < 0) throw new Error('Narx va darslar soni manfiy bo\'lmaydi');
    if (fullMonth) return roundSom(price);
    return roundSom((price * Math.min(R, N)) / N);
}

export interface AbsenceInput {
    price: number;
    lessonsPerPackage: number;
    /** Chegirma hisobiga olinadigan qoldirishlar (davr ichidagi `absent`). */
    absences: number;
    /** Chegara M (`absence_discount_threshold`). */
    threshold: number;
    /** Baza — chegirma undan oshmaydi. */
    base: number;
}

/** Joriy qoida (RF-01): A ≥ M va A > 0 bo'lsa round(P × A / N), aks holda 0; bazadan oshmaydi. */
export function computeAbsenceDiscount({ price, lessonsPerPackage: N, absences: A, threshold: M, base }: AbsenceInput): number {
    if (!(N > 0)) throw new Error('Maxraj musbat bo\'lishi kerak');
    if (!(A > 0) || A < M) return 0;
    return Math.min(base, roundSom((price * A) / N));
}

export type DiscountKind = 'promo' | 'sibling' | 'social' | 'manual' | 'cancel_credit';

export interface ChargeLineCalc {
    kind: 'base' | 'extra_lesson' | 'absence_discount' | DiscountKind;
    amount: number; // ishorali: baza musbat, chegirma manfiy
    description: string;
    /** Manba yozuvi (StudentDiscount, LessonSession...) — izohlash uchun. */
    sourceId?: string;
}

/**
 * OQ-05: marketing chegirmalari (promo, aka-uka, ijtimoiy) markaz hisobidan —
 * ustoz maosh bazasini kamaytirmaydi. Davomat chegirmasi va tuzatmalar
 * (markaz bekor qilgan dars krediti, qo'lda tuzatma) — kamaytiradi.
 */
export const MARKETING_DISCOUNT_KINDS: ReadonlySet<ChargeLineCalc['kind']> = new Set(['promo', 'sibling', 'social']);

export interface DiscountInput {
    kind: DiscountKind;
    /** Qat'iy summa (so'm). */
    amount?: number;
    /** Foiz, basis point'da (1000 = 10%) — qolgan summaga nisbatan. */
    percentBp?: number;
    description: string;
    sourceId?: string;
}

export interface ChargeInput extends BaseInput {
    absences: number;
    threshold: number;
    /** Qo'shimcha pullik darslar (OQ-03) — alohida musbat qator. */
    extraLessons?: Array<{ amount: number; description: string; sourceId?: string }>;
    otherDiscounts?: DiscountInput[];
}

export interface ChargeResult {
    lines: ChargeLineCalc[];
    /** Baza + qo'shimcha darslar. */
    gross: number;
    net: number;
    /** Ustoz maosh bazasi (OQ-05): marketing chegirmalaridan oldingi summa. */
    teacherBase: number;
}

/**
 * Hisob qatorlari (OQ-05 tartibi): baza (prorata) → qo'shimcha darslar →
 * davomat chegirmasi (bazadan oshmaydi) → tuzatmalar (bekor qilingan dars
 * krediti, qo'lda) → foizli marketing chegirmalari qolgan summaga → qat'iy
 * marketing chegirmalari → min 0. Har guruh ichida kiritilgan tartib saqlanadi.
 */
export function computeCharge(input: ChargeInput): ChargeResult {
    const base = computeBase(input);
    const lines: ChargeLineCalc[] = [{
        kind: 'base', amount: base,
        description: input.fullMonth
            ? `Oylik narx (to'liq oy)`
            : `${input.price} × ${Math.min(input.billableLessons, input.lessonsPerPackage)}/${input.lessonsPerPackage} dars`,
    }];
    let gross = base;
    for (const x of input.extraLessons || []) {
        const amt = Math.max(0, roundSom(x.amount));
        if (amt > 0) { lines.push({ kind: 'extra_lesson', amount: amt, description: x.description, ...(x.sourceId && { sourceId: x.sourceId }) }); gross += amt; }
    }
    let remaining = gross;
    const abs = computeAbsenceDiscount({ price: input.price, lessonsPerPackage: input.lessonsPerPackage, absences: input.absences, threshold: input.threshold, base });
    if (abs > 0) {
        lines.push({ kind: 'absence_discount', amount: -abs, description: `${input.absences} ta qoldirilgan dars (chegara ${input.threshold})` });
        remaining -= abs;
    }
    const discounts = input.otherDiscounts || [];
    const apply = (d: DiscountInput) => {
        const raw = d.percentBp != null ? (remaining * d.percentBp) / 10000 : (d.amount ?? 0);
        const amt = Math.min(remaining, Math.max(0, roundSom(raw)));
        if (amt > 0) {
            lines.push({ kind: d.kind, amount: -amt, description: d.description, ...(d.sourceId && { sourceId: d.sourceId }) });
            remaining -= amt;
        }
    };
    discounts.filter(d => !MARKETING_DISCOUNT_KINDS.has(d.kind)).forEach(apply);
    const teacherBase = remaining;
    discounts.filter(d => MARKETING_DISCOUNT_KINDS.has(d.kind) && d.percentBp != null).forEach(apply);
    discounts.filter(d => MARKETING_DISCOUNT_KINDS.has(d.kind) && d.percentBp == null).forEach(apply);
    return { lines, gross, net: Math.max(0, remaining), teacherBase: Math.max(0, teacherBase) };
}

/**
 * TQ-B: o'qituvchi ulushi darslar bo'yicha (Misol 6). `lessonsByTeacher` —
 * har ustoz o'tgan billable darslar; natija — har ustozning maosh bazasi
 * (net × ulush), eng katta qoldiq bilan (jami = net).
 */
export function splitNetByTeachers(net: number, lessonsByTeacher: Record<string, number>): Record<string, number> {
    const ids = Object.keys(lessonsByTeacher);
    const parts = allocateLargestRemainder(roundSom(net), ids.map(id => lessonsByTeacher[id]));
    return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
}

/** Foiz basis point'da (4000 = 40,00%). */
export function salaryFromBase(base: number, rateBp: number): number {
    return roundSom((base * rateBp) / 10000);
}

/** Maosh qoldig'i = hisoblangan − avansdan qoplangan − berilgan (min 0). */
export function payrollRemaining(accrued: number, advanceApplied: number, paid: number): number {
    return Math.max(0, roundSom(accrued - advanceApplied - paid));
}

// ─── To'lov taqsimoti, qarz va avans (G.3 §5, TQ-C/TQ-D/TQ-F) ─────────────────

export interface ChargeState { net: number; allocated: number }

/**
 * To'lovni hisoblarga taqsimlash. Har taqsimot hisobning qolgan qarzidan,
 * jami esa to'lov summasidan oshmaydi (aks holda xato — qisman yozilmaydi).
 * Qolgani — o'quvchi avansi (kredit).
 */
export function applyPayment(
    amount: number,
    allocations: Array<{ chargeId: string; amount: number }>,
    charges: Record<string, ChargeState>,
): { charges: Record<string, ChargeState>; credit: number } {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("To'lov summasi musbat butun son bo'lishi kerak");
    const next: Record<string, ChargeState> = Object.fromEntries(Object.entries(charges).map(([k, v]) => [k, { ...v }]));
    let used = 0;
    for (const a of allocations) {
        const c = next[a.chargeId];
        if (!c) throw new Error(`Hisob topilmadi: ${a.chargeId}`);
        if (!Number.isInteger(a.amount) || a.amount <= 0) throw new Error("Taqsimot summasi musbat butun son bo'lishi kerak");
        if (a.amount > c.net - c.allocated) throw new Error(`Taqsimot hisob qarzidan oshadi: ${a.chargeId}`);
        c.allocated += a.amount;
        used += a.amount;
    }
    if (used > amount) throw new Error("Taqsimotlar jami to'lovdan oshadi");
    return { charges: next, credit: amount - used };
}

/** Hisob qarzi (≥ 0). */
export function chargeDebt(c: ChargeState): number {
    return Math.max(0, c.net - c.allocated);
}

/**
 * O'quvchi holati: qarz — hisoblar bo'yicha (guruh×oy), avans — taqsimlanmagan
 * pul. `balance` — eski `Student.balance` bilan mos kesh (avans − qarz).
 */
export function studentPosition(charges: ChargeState[], paymentsTotal: number, refundsTotal = 0): { debt: number; credit: number; balance: number } {
    const debt = charges.reduce((s, c) => s + chargeDebt(c), 0);
    const allocated = charges.reduce((s, c) => s + c.allocated, 0);
    const credit = paymentsTotal - allocated - refundsTotal;
    if (credit < 0) throw new Error("Taqsimotlar va qaytarishlar to'lovlardan oshib ketgan");
    return { debt, credit, balance: credit - debt };
}

/** OQ-08: avans yangi hisob e'lon qilinganda avtomatik (shu guruh) — qancha qoplanadi. */
export function autoApplyCredit(credit: number, debt: number): number {
    return Math.max(0, Math.min(credit, debt));
}

// ─── To'lov muddati (OQ-09) ───────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Hisob muddati: to'liq oyda — oyning `dueDay`-sanasi (standart 10); qisman
 * oyda — yozilgandan `graceDays` (standart 7) kun, lekin `dueDay`dan oldin emas
 * (oy boshida qo'shilganlar to'liq oydagilardan erta muddat olmasin).
 */
export function chargeDueDate(p: { year: number; month: number; fullMonth: boolean; startDate?: string; dueDay?: number; graceDays?: number }): string {
    const dueDay = p.dueDay ?? 10;
    const regular = `${p.year}-${String(p.month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    if (p.fullMonth || !p.startDate) return regular;
    const partial = addDays(p.startDate, p.graceDays ?? 7);
    return partial > regular ? partial : regular;
}

/** Muddati o'tganmi: bugun muddatdan keyin va qarz bor. */
export function isOverdue(dueDate: string, today: string, debt: number): boolean {
    return debt > 0 && today > dueDate;
}

// ─── Yopilgan davrga tuzatma (OQ-10, OQ-07) ──────────────────────────────────

/**
 * Yopilgan oy hisobi o'zgarmaydi — farq keyingi ochiq oyda tuzatma qatori
 * bo'lib tushadi (Misol 8, Misol 10). Manfiy — o'quvchiga kredit.
 */
export function correctionDelta(original: ChargeInput, corrected: ChargeInput): { studentDelta: number; teacherBaseDelta: number } {
    const a = computeCharge(original);
    const b = computeCharge(corrected);
    return { studentDelta: b.net - a.net, teacherBaseDelta: b.teacherBase - a.teacherBase };
}
