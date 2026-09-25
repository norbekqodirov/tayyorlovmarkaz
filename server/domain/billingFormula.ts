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

export interface ChargeLineCalc {
    kind: 'base' | 'absence_discount' | 'promo' | 'sibling' | 'social' | 'manual';
    amount: number; // ishorali: baza musbat, chegirma manfiy
    description: string;
}

/** Hisob qatorlari va net (min 0). Boshqa chegirmalar tartib bilan qo'llanadi (OQ-05). */
export function computeCharge(input: BaseInput & { absences: number; threshold: number; otherDiscounts?: Array<{ kind: ChargeLineCalc['kind']; amount: number; description: string }> }): { lines: ChargeLineCalc[]; gross: number; net: number } {
    const base = computeBase(input);
    const lines: ChargeLineCalc[] = [{
        kind: 'base', amount: base,
        description: input.fullMonth
            ? `Oylik narx (to'liq oy)`
            : `${input.price} × ${Math.min(input.billableLessons, input.lessonsPerPackage)}/${input.lessonsPerPackage} dars`,
    }];
    let remaining = base;
    const abs = computeAbsenceDiscount({ price: input.price, lessonsPerPackage: input.lessonsPerPackage, absences: input.absences, threshold: input.threshold, base });
    if (abs > 0) {
        lines.push({ kind: 'absence_discount', amount: -abs, description: `${input.absences} ta qoldirilgan dars (chegara ${input.threshold})` });
        remaining -= abs;
    }
    for (const d of input.otherDiscounts || []) {
        const amt = Math.min(remaining, Math.max(0, roundSom(d.amount)));
        if (amt > 0) {
            lines.push({ kind: d.kind, amount: -amt, description: d.description });
            remaining -= amt;
        }
    }
    return { lines, gross: base, net: Math.max(0, remaining) };
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
