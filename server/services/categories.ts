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

// ─── IP-23: kategoriya ID, tizim kategoriyalari, nomni o'zgartirish ──────────

export class CategoryError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

/**
 * Tizim kategoriyalari — kod ularni NOM emas, kalit (systemKey) bo'yicha topadi. Nomini
 * o'zgartirish mumkin ("Kurs to'lovi" → "O'quvchi to'lovi"): formalar, hisobotlar va avtomatik
 * yozuvlar buzilmaydi. O'chirish, nofaol qilish va turini o'zgartirish mumkin emas.
 */
export const SYSTEM_CATEGORY_DEFS = {
    tuition: { name: "Kurs to'lovi", type: 'income', kind: 'TUITION' },
    refund: { name: "To'lov qaytarish", type: 'income', kind: 'REFUND' },
    payroll: { name: 'Oylik', type: 'expense', kind: 'PAYROLL_PAYOUT' },
    advance: { name: 'Avans', type: 'expense', kind: 'STAFF_ADVANCE' },
    cash_diff_in: { name: 'Kassa farqi', type: 'income', kind: 'OTHER_INCOME' },
    cash_diff_out: { name: 'Kassa farqi', type: 'expense', kind: 'OPERATING_EXPENSE' },
    bank_fee: { name: 'Bank komissiyasi', type: 'expense', kind: 'OPERATING_EXPENSE' },
} as const satisfies Record<string, { name: string; type: 'income' | 'expense'; kind: CategoryKind }>;
export type SystemCategoryKey = keyof typeof SYSTEM_CATEGORY_DEFS;

/**
 * Tizim kategoriyasi: avval kalit bo'yicha; bo'lmasa standart nom+tur bo'yicha mavjud qatorni
 * "egallaydi" (kalit va tur belgilanadi); u ham bo'lmasa yaratadi. Qaytaradi: Transaction'ga
 * yoziladigan { category: joriy nom, categoryId }.
 */
export async function systemCategory(db: Db, key: SystemCategoryKey): Promise<{ category: string; categoryId: string }> {
    const def = SYSTEM_CATEGORY_DEFS[key];
    const byKey = await db.transactionCategory.findFirst({ where: { systemKey: key }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
    if (byKey) return { category: byKey.name, categoryId: byKey.id };
    const existing = await db.transactionCategory.findUnique({ where: { name_type: { name: def.name, type: def.type } } });
    if (existing) {
        await db.transactionCategory.update({ where: { id: existing.id }, data: { systemKey: key, isSystem: true, kind: def.kind, isActive: true } });
        return { category: existing.name, categoryId: existing.id };
    }
    try {
        const created = await db.transactionCategory.create({ data: { name: def.name, type: def.type, kind: def.kind, isSystem: true, systemKey: key, isActive: true } });
        return { category: created.name, categoryId: created.id };
    } catch {
        // parallel so'rov yaratib qo'ygan
        const again = await db.transactionCategory.findUnique({ where: { name_type: { name: def.name, type: def.type } } });
        if (!again) throw new CategoryError(500, "Tizim kategoriyasini yaratib bo'lmadi", 'SYSTEM_CATEGORY');
        return { category: again.name, categoryId: again.id };
    }
}

/** Server ishga tushganda: barcha tizim kategoriyalari mavjud va belgilangan bo'lsin (idempotent). */
export async function ensureSystemCategories(db: Db) {
    for (const key of Object.keys(SYSTEM_CATEGORY_DEFS) as SystemCategoryKey[]) await systemCategory(db, key);
}

/** Formadan kelgan nom → { category, categoryId }; ro'yxatda yo'q (erkin matn) bo'lsa categoryId null. */
export async function resolveCategory(db: Db, name: string, type: string): Promise<{ category: string; categoryId: string | null }> {
    const row = name ? await db.transactionCategory.findUnique({ where: { name_type: { name, type } }, select: { id: true, name: true } }) : null;
    return { category: row?.name ?? name, categoryId: row?.id ?? null };
}

/**
 * Kategoriyani tahrirlash. Nom o'zgarsa — nom keshi hamma joyda yangilanadi: shu kategoriyadagi
 * kassa yozuvlari (ID bo'yicha; eski, ID'siz yozuvlar nom bo'yicha shu kategoriyaga bog'lanadi),
 * juft xarajatlar va byudjet qatorlari. Tizim kategoriyasining turi va holati o'zgarmaydi.
 */
export async function updateCategory(db: PrismaClient, id: string, input: { name?: string; kind?: string | null; isActive?: boolean; type?: string }) {
    return db.$transaction(async tx => {
        const cur = await tx.transactionCategory.findUnique({ where: { id } });
        if (!cur) throw new CategoryError(404, 'Kategoriya topilmadi', 'NOT_FOUND');
        const data: Prisma.TransactionCategoryUpdateInput = {};
        if (input.type !== undefined && input.type !== cur.type) {
            const used = await tx.transaction.count({ where: { OR: [{ categoryId: id }, { categoryId: null, category: cur.name, type: cur.type }] } });
            if (cur.systemKey || used) throw new CategoryError(409, "Ishlatilgan yoki tizim kategoriyasining kirim/chiqim turini o'zgartirib bo'lmaydi", 'TYPE_LOCKED');
            data.type = input.type;
        }
        if (input.kind !== undefined) {
            const kind = input.kind || null;
            if (cur.systemKey && kind !== cur.kind) throw new CategoryError(409, "Tizim kategoriyasining turini o'zgartirib bo'lmaydi (kurs to'lovi, oylik va h.k.)", 'SYSTEM');
            data.kind = kind;
        }
        if (input.isActive !== undefined) {
            if (cur.systemKey && !input.isActive) throw new CategoryError(409, "Tizim kategoriyasini nofaol qilib bo'lmaydi — formalar unga tayanadi", 'SYSTEM');
            data.isActive = !!input.isActive;
        }
        const newName = input.name !== undefined ? String(input.name).trim() : cur.name;
        if (!newName) throw new CategoryError(400, 'Kategoriya nomi kiritilishi shart', 'NAME');
        const newType = (data.type as string | undefined) ?? cur.type;
        if (newName !== cur.name) {
            const clash = await tx.transactionCategory.findUnique({ where: { name_type: { name: newName, type: newType } } });
            if (clash) throw new CategoryError(409, `«${newName}» nomli kategoriya allaqachon bor`, 'NAME_TAKEN');
            data.name = newName;
        }
        const updated = await tx.transactionCategory.update({ where: { id }, data });
        let transactions = 0, expenses = 0, budgets = 0;
        if (data.name) {
            // Eski (ID'siz) yozuvlar shu kategoriyaga bog'lanadi, keyin hammasida nom keshi yangilanadi
            await tx.transaction.updateMany({ where: { categoryId: null, category: cur.name, type: cur.type }, data: { categoryId: id } });
            transactions = (await tx.transaction.updateMany({ where: { categoryId: id }, data: { category: newName } })).count;
            if (cur.type === 'expense') {
                const exp = await tx.transaction.findMany({ where: { categoryId: id, sourceType: 'expense', sourceId: { not: null } }, select: { sourceId: true } });
                const ids = exp.map(e => e.sourceId!).filter(Boolean);
                expenses = ids.length ? (await tx.expense.updateMany({ where: { id: { in: ids } }, data: { category: newName } })).count : 0;
            }
            if (await tx.budget.findFirst({ where: { category: newName } })) {
                throw new CategoryError(409, `Byudjetda «${newName}» nomli qator bor — avval uni o'zgartiring`, 'BUDGET_NAME_TAKEN');
            }
            budgets = (await tx.budget.updateMany({ where: { category: cur.name }, data: { category: newName } })).count;
        }
        return { category: updated, renamed: { transactions, expenses, budgets } };
    });
}

/** O'chirish: tizim kategoriyasi — yo'q; ishlatilgan bo'lsa arxivlanadi (tarix saqlanadi); aks holda o'chiriladi. */
export async function deleteCategory(db: PrismaClient, id: string) {
    const cur = await db.transactionCategory.findUnique({ where: { id } });
    if (!cur) throw new CategoryError(404, 'Kategoriya topilmadi', 'NOT_FOUND');
    if (cur.systemKey || cur.isSystem) throw new CategoryError(409, "Tizim kategoriyasini o'chirib bo'lmaydi (kurs to'lovi, oylik, avans va h.k.) — faqat nomini o'zgartirish mumkin", 'SYSTEM');
    const used = await db.transaction.count({ where: { OR: [{ categoryId: id }, { categoryId: null, category: cur.name, type: cur.type }] } });
    if (used) {
        await db.transactionCategory.update({ where: { id }, data: { isActive: false } });
        return { archived: true, used };
    }
    await db.transactionCategory.delete({ where: { id } });
    return { deleted: true };
}

/**
 * Hech bir kategoriyaga mos kelmaydigan (erkin matnli) kassa yozuvlari nomlari — "noaniqlar ro'yxati".
 * Shunday nom bilan kategoriya yaratilsa, yozuvlar unga nom bo'yicha tegishli bo'ladi.
 */
export async function orphanCategoryNames(db: Db) {
    const [rows, cats] = await Promise.all([
        db.transaction.groupBy({ by: ['type', 'category'], where: { categoryId: null }, _count: { _all: true }, _sum: { amount: true } }),
        db.transactionCategory.findMany({ select: { name: true, type: true } }),
    ]);
    const known = new Set(cats.map(c => `${c.type}|${c.name}`));
    return rows.filter(r => !known.has(`${r.type}|${r.category}`))
        .map(r => ({ name: r.category, type: r.type, count: r._count._all, amount: Math.round(r._sum.amount ?? 0), guessedKind: guessCategoryKind(r.category, r.type) }))
        .sort((a, b) => b.count - a.count);
}
