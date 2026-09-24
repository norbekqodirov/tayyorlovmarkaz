/**
 * Arxivlangan (deletedAt o'rnatilgan) o'quvchi/guruhlarni "joriy" ro'yxatlardan
 * chiqarish uchun umumiy filtrlar — IP-01 (docs/CRM_YAGONA_AUDIT_VA_RIVOJLANTIRISH_REJASI_2026-09-25.md).
 *
 * O'quvchi, guruh, xodimni "o'chirish" endi jismoniy o'chirish emas, arxivlash:
 * tarix (to'lovlar, davomat, baholar, oyliklar) saqlanadi, lekin arxivlangan
 * yozuv joriy a'zolar ro'yxatlarida, davomat varag'ida, ommaviy xabarlarda
 * ko'rinmasligi kerak. Hisob-kitob (billing/payroll) uchun esa sana muhim:
 * o'quvchi 20-sentabrda arxivlangan bo'lsa, sentabr hisobida hali qatnashadi,
 * oktyabrda — yo'q. Shuning uchun ikki xil filtr bor.
 */
import { tashkentMidnightInstant } from './timezone.js';

/** Hozirgi (arxivlanmagan) o'quvchi va guruhdagi a'zolik — ro'yxatlar, davomat, xabarlar uchun. */
export const CURRENT_ENROLLMENT_WHERE = {
    student: { deletedAt: null },
    group: { deletedAt: null },
} as const;

/** "YYYY-MM" oyi boshining Toshkent vaqtidagi aniq oni. */
export function monthStartInstant(year: number, month: number): Date {
    return tashkentMidnightInstant(`${year}-${String(month).padStart(2, '0')}-01`);
}

/**
 * Shu oy hisobida qatnashadigan a'zolik: o'quvchi ham, guruh ham yo arxivlanmagan,
 * yo shu oy boshlanganidan KEYIN arxivlangan (ya'ni oyning bir qismida faol bo'lgan).
 */
export function enrollmentActiveInMonthWhere(year: number, month: number) {
    const start = monthStartInstant(year, month);
    return {
        student: { OR: [{ deletedAt: null }, { deletedAt: { gte: start } }] },
        group: { OR: [{ deletedAt: null }, { deletedAt: { gte: start } }] },
    };
}

/** Shu oyda faol bo'lgan guruh (arxivlanmagan yoki oy boshidan keyin arxivlangan). */
export function groupActiveInMonthWhere(year: number, month: number) {
    const start = monthStartInstant(year, month);
    return { OR: [{ deletedAt: null }, { deletedAt: { gte: start } }] };
}
