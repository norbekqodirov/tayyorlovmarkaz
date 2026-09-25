/**
 * IP-09 (TQ-D): o'quvchi kodi va normallashgan telefon.
 *
 * Kod — "S-000123" ko'rinishida, yaratilish tartibida. Noyoblik DB unique
 * cheklovi bilan emas (mavjud jadvalga unique qo'shish production'da
 * `db push`ni to'xtatardi — docs/ADR, J.6), balki atomar hisoblagich bilan
 * ta'minlanadi: `Setting('student_code_seq')` shartli yangilanadi
 * (`updateMany where value = eski`) — parallel so'rovlar bir xil raqam olmaydi.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const SEQ_KEY = 'student_code_seq';

/** Qidiruv va dublikat tekshiruvi uchun: oxirgi 9 raqam (+998 va formatlashsiz). */
export function normalizePhone(phone?: string | null): string | null {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : null;
}

export function formatStudentCode(n: number): string {
    return `S-${String(n).padStart(6, '0')}`;
}

export function parseStudentCode(code?: string | null): number | null {
    const m = /^S-(\d+)$/.exec(code || '');
    return m ? Number(m[1]) : null;
}

async function currentMaxCode(db: Db): Promise<number> {
    const rows = await db.student.findMany({ where: { code: { not: null } }, select: { code: true } });
    return rows.reduce((max, r) => Math.max(max, parseStudentCode(r.code) ?? 0), 0);
}

/** Keyingi noyob kod raqamini band qiladi. */
export async function reserveStudentCode(db: Db): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
        const row = await db.setting.findUnique({ where: { key: SEQ_KEY } });
        if (!row) {
            const start = await currentMaxCode(db);
            try {
                await db.setting.create({ data: { key: SEQ_KEY, value: String(start + 1) } });
                return formatStudentCode(start + 1);
            } catch {
                continue; // boshqa so'rov yaratib ulgurdi — qayta o'qiymiz
            }
        }
        const next = Number(row.value) + 1;
        const claimed = await db.setting.updateMany({ where: { key: SEQ_KEY, value: row.value }, data: { value: String(next) } });
        if (claimed.count === 1) return formatStudentCode(next);
    }
    throw new Error("O'quvchi kodini band qilib bo'lmadi — qayta urinib ko'ring");
}

/**
 * Yangi yoki telefoni o'zgargan o'quvchi uchun kod (yo'q bo'lsa) va phoneNorm'ni
 * yangilaydi. Xato bo'lsa asosiy amalni to'xtatmaydi — qiymatlar backfill
 * skripti bilan ham to'ldiriladi.
 */
export async function ensureStudentIdentity(db: Db, studentId: string): Promise<void> {
    const s = await db.student.findUnique({ where: { id: studentId }, select: { code: true, phone: true, phoneNorm: true } });
    if (!s) return;
    const data: { code?: string; phoneNorm?: string | null } = {};
    if (!s.code) data.code = await reserveStudentCode(db);
    const norm = normalizePhone(s.phone);
    if (norm !== s.phoneNorm) data.phoneNorm = norm;
    if (Object.keys(data).length) await db.student.update({ where: { id: studentId }, data });
}

export async function ensureStudentIdentitySafe(db: Db, studentId: string): Promise<void> {
    try { await ensureStudentIdentity(db, studentId); }
    catch (e: any) { console.error('[studentIdentity]', studentId, e?.message); }
}
