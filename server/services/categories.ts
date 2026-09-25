/**
 * IP-12 (TQ-E, ML-05/06): tranzaksiya kategoriyasi TURI — nom emas, tur qoidani belgilaydi.
 * TUITION (kurs to'lovi) — faqat o'quvchi bilan, qarz va tushumga ta'sir qiladi;
 * OTHER_INCOME — o'quvchiga bog'lanmaydi, qarz/maoshga ta'sir qilmaydi.
 * `TransactionCategory.kind` bo'lsa — undan; aks holda nom lug'ati (J.3).
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export const CATEGORY_KINDS = ['TUITION', 'OTHER_INCOME', 'PAYROLL_PAYOUT', 'STAFF_ADVANCE', 'OPERATING_EXPENSE', 'REFUND', 'TRANSFER'] as const;
export type CategoryKind = typeof CATEGORY_KINDS[number];

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ‘’`']/g, "'").replace(/\s+/g, ' ').trim();

/** Nom lug'ati (tur belgilanmagan eski kategoriyalar uchun). */
export function guessCategoryKind(name: string, type: string): CategoryKind {
    const n = norm(name || '');
    if (type === 'income') {
        // IP-17: o'quvchiga qaytarish kassada manfiy "kirim" sifatida yoziladi (sof tushum)
        if (/to'lov qaytar|tolov qaytar|pul qaytar|refund/.test(n)) return 'REFUND';
        // "O'quvchi kurs puli to'ladi" kabi nomlar ham kurs to'lovi (production'dagi haqiqiy kategoriya)
        if (/kurs to'lov|kurs tolov|kurs pul|o'qish to'lov|o'qish pul|tuition/.test(n)) return 'TUITION';
        return 'OTHER_INCOME';
    }
    if (/^oylik|maosh|ish haqi/.test(n)) return 'PAYROLL_PAYOUT';
    if (/^avans/.test(n)) return 'STAFF_ADVANCE';
    if (/qaytar|refund/.test(n)) return 'REFUND';
    if (/o'tkazma|transfer/.test(n)) return 'TRANSFER';
    return 'OPERATING_EXPENSE';
}

/** Sahifadan tanlanadigan turlar (bo'sh = nomdan avtomatik). Kirimdagi REFUND — faqat tizim yozuvi. */
export const CATEGORY_KINDS_BY_TYPE: Record<'income' | 'expense', CategoryKind[]> = {
    income: ['TUITION', 'OTHER_INCOME'],
    expense: ['PAYROLL_PAYOUT', 'STAFF_ADVANCE', 'OPERATING_EXPENSE', 'REFUND', 'TRANSFER'],
};

export async function categoryKind(db: Db, name: string, type: string): Promise<CategoryKind> {
    const row = await db.transactionCategory.findFirst({ where: { name, type }, select: { kind: true } });
    if (row?.kind && (CATEGORY_KINDS as readonly string[]).includes(row.kind)) return row.kind as CategoryKind;
    return guessCategoryKind(name, type);
}

/** Tizim kategoriyalari (backfill va birinchi ishga tushishda). Mavjudini o'zgartirmaydi, faqat kind bo'sh bo'lsa to'ldiradi. */
export const SYSTEM_CATEGORIES: Array<{ name: string; type: 'income' | 'expense'; kind: CategoryKind }> = [
    { name: "Kurs to'lovi", type: 'income', kind: 'TUITION' },
    { name: 'Oylik', type: 'expense', kind: 'PAYROLL_PAYOUT' },
    { name: 'Avans', type: 'expense', kind: 'STAFF_ADVANCE' },
    { name: "To'lov qaytarish", type: 'expense', kind: 'REFUND' },
];
