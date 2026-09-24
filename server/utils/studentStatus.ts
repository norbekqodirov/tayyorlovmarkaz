/**
 * IP-04 (TL-13, FA:EDU-04) — o'quvchi holatining yagona lug'ati.
 *
 * Bazada faqat 4 ta kanonik qiymat saqlanadi: active | frozen | left | graduated.
 * Ilgari yaratishda "Muzlatilgan" XATO ravishda 'graduated'ga aylantirilardi,
 * tahrirda esa o'zbekcha matn ("Faol", "Tark etgan"...) o'zgarishsiz yozilardi —
 * natijada bot, hisobotlar va statistikada (`status: 'active'`) tahrirlangan
 * o'quvchilar ko'rinmay qolardi.
 */
export const STUDENT_STATUSES = ['active', 'frozen', 'left', 'graduated'] as const;
export type StudentStatus = typeof STUDENT_STATUSES[number];

const MAP: Record<string, StudentStatus> = {
    active: 'active', Active: 'active', faol: 'active', Faol: 'active',
    frozen: 'frozen', paused: 'frozen', Muzlatilgan: 'frozen', muzlatilgan: 'frozen',
    left: 'left', 'Tark etgan': 'left', 'tark etgan': 'left', Ketgan: 'left',
    graduated: 'graduated', Bitiruvchi: 'graduated', bitiruvchi: 'graduated', Yakunlagan: 'graduated',
};

/** Istalgan (o'zbekcha yoki eski) holat qiymatini kanonik qiymatga aylantiradi; noma'lumini o'zgarishsiz qaytaradi. */
export function normalizeStudentStatus(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const s = String(value).trim();
    return MAP[s] ?? s;
}
