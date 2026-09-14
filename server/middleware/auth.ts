import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwtSecret.js';
import prisma from '../db.js';

// Role hierarchy levels
export const ROLE_LEVEL: Record<string, number> = {
    TEACHER:     1,
    MANAGER:     2,
    ADMIN:       3,
    SUPER_ADMIN: 4,
};

// ─── JWT eskirish tuzatishi (RBAC qayta qurish rejasi, Bosqich 2/4) ─────────
// Audit topilmasi: JWT 30 kunlik va requireAuth ILGARI hech qachon bazadan
// qayta tekshirmasdi — admin bir foydalanuvchini bloklasa (isActive=false)
// yoki rolini pasaytirsa, allaqachon chiqarilgan token 30 kungacha eski
// huquq bilan ishlashda davom etardi. Endi har so'rovda EMAS (bu 30 kunlik
// tokenlar bilan haddan tashqari ko'p bazaga murojaat bo'lardi), balki qisqa
// (60s) TTL bilan keshlangan holda role/isActive DB'dan tasdiqlanadi —
// eng yomon holatda eskirish endi soniyalar-daqiqalar ichida, 30 kun emas.
// Yagona jarayon (`ecosystem.config.cjs`: instances:1) uchun xotiradagi
// Map yetarli — klasterlangan bo'lganda bu boshqacha yechim talab qilardi.
const ROLE_CACHE_TTL_MS = 60_000;
interface CachedIdentity { role: string; isActive: boolean; expiresAt: number }
const roleCache = new Map<string, CachedIdentity>();

async function verifyCurrentIdentity(userId: string, jwtRole: string): Promise<{ role: string; isActive: boolean } | null> {
    const cached = roleCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached;
    }
    try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
        if (!user) return null;
        const fresh: CachedIdentity = { role: user.role, isActive: user.isActive !== false, expiresAt: Date.now() + ROLE_CACHE_TTL_MS };
        roleCache.set(userId, fresh);
        return fresh;
    } catch (err) {
        // Baza vaqtincha ishlamasa — butun tizimni to'xtatib qo'ymaslik uchun
        // JWT'dagi eski rolga ishoniladi (avvalgi xatti-harakat), faqat
        // shu holatda; xato konsolga chiqariladi, jim qoldirilmaydi.
        console.error('[AUTH] verifyCurrentIdentity DB xatosi, JWT roliga ishoniladi:', (err as any)?.message);
        return { role: jwtRole, isActive: true };
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Avtorizatsiya tokeni topilmadi" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload: any = jwt.verify(token, JWT_SECRET);
        const current = await verifyCurrentIdentity(payload.id, payload.role);
        if (!current) {
            return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
        }
        if (!current.isActive) {
            return res.status(403).json({ message: "Hisobingiz bloklangan. Administrator bilan bog'laning." });
        }
        // Token'dagi rol o'zgargan bo'lishi mumkin — so'rov davomida HAR DOIM
        // bazadagi joriy rol ishlatiladi, JWT payload'dagi eski qiymat emas.
        (req as any).user = { ...payload, role: current.role };
        next();
    } catch {
        return res.status(401).json({ message: "Token yaroqsiz yoki muddati tugagan" });
    }
};

// Collection → minimum role level required to write
const COLLECTION_WRITE_LEVEL: Record<string, number> = {
    positions:     3, // ADMIN+
    transactionCategories: 2, // MANAGER+
    leads:         2, // MANAGER+
    students:      2,
    groups:        2,
    courses:       2,
    schedule:      2,
    schedules:     2,
    attendance:    1, // TEACHER+
    attendanceRecords: 1, // TEACHER+ (haqiqiy jadval — server/routes/studentAttendance.ts'ga q.)
    assessments:   1,
    exams:         1, // TEACHER+, o'z guruhi doirasida — crud.ts TEACHER_WRITE_SCOPE_MODELS'ga q.
    groupExams:    1, // TEACHER+, o'z guruhi doirasida — crud.ts TEACHER_WRITE_SCOPE_MODELS'ga q.
    notes:         1, // TEACHER+, o'z guruhi doirasida — crud.ts TEACHER_WRITE_SCOPE_MODELS'ga q.
    journal:       1,
    finance:       2,
    transactions:  2,
    payments:      2,
    staff:         2,
    staffMembers:  2,
    inventory:     3, // ADMIN+
    rooms:         2,
    campaigns:     2,
    marketing:     2,
    forms:         2, // MANAGER+ — Marketing Xodimi andozasi ham forma yarata olishi kerak
    content:       3,
    news:          3,
    posts:         3,
    settings:      4, // SUPER_ADMIN only
    notifications: 1,
    gallery:       3,
    pageContent:   3,
    tasks:         1,
    users:         3,
    enrollments:   2,
    leadActivities:2,
    bi:            2,
};

// Collection → minimum role level required to READ (GET). Anything not listed
// here defaults to ADMIN (3) — fail-closed, mirroring COLLECTION_WRITE_LEVEL's
// own `|| 3` default. Only collections confirmed (by checking every
// useFirestore()/api.get() call site in src/) to be needed by a TEACHER- or
// MANAGER-reachable page are opened up below. Previously GET had NO gating at
// all (any authenticated role, including TEACHER, could read every
// collection — finance ledger, staff salaries/passports, bot tokens in
// `settings`, etc.) — see the notifications-leak audit that led here.
const COLLECTION_READ_LEVEL: Record<string, number> = {
    positions:     2, // MANAGER+
    transactionCategories: 2, // MANAGER+
    // ── TEACHER (1) — core academic data + the dropdowns those pages share ──
    courses:       1,
    courseTiers:   1,
    groups:        1,
    students:      1,
    rooms:         1,
    schedule:      1,
    schedules:     1,
    attendance:    1,
    attendanceRecords: 1, // TEACHER+ (haqiqiy jadval — server/routes/studentAttendance.ts'ga q.)
    assessment:    1,
    assessments:   1,
    exams:         1,
    groupExams:    1,
    notes:         1,
    journal:       1,
    enrollments:   1, // guruh a'zolari ro'yxati — /enrollments/group/:id shu yerdan o'tadi
    // ── MANAGER (2) — finance/marketing permission holders ──────────────────
    finance:        2,
    transactions:   2,
    payments:       2,
    staff:          2, // CrmFinance.tsx'dagi to'lov qabul qiluvchi dropdown uchun kerak
    staffMembers:   2,
    campaigns:      2,
    leadActivities: 2,
    forms:          2,
    // ── ADMIN (3) — HR-sensitive or system-config data; no lower-role page
    //    reads these (verified against src/hooks/useFirestore.ts call sites) ─
    inventory:          3,
    tasks:              3, // faqat CrmStaffDetail.tsx (ADMIN-only /staff:id) o'qiydi
    performanceReviews: 3,
    staffDocuments:     3,
    posts:              3, // 'news' (alias, PUBLIC_READ_COLLECTIONS) bilan aralashtirmaslik
    news:               3, // GET bu yerga PUBLIC_READ_COLLECTIONS orqali umuman yetib kelmaydi
    pageContent:        3, // — public bypass authForCollection() darajasida ishlaydi —
    gallery:            3, // shuning uchun bu qatorlar faqat hujjatlashtirish/himoya zaxirasi
    settings:           3, // ADMIN ko'ra oladi, faqat SUPER_ADMIN yoza oladi (write=4)
    notifications:      3, // amaldagi yo'l /api/communication/notifications — bu yerga hech kim o'qimaydi
};

export const requireMinRole = (minRole: string) => (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
    const userLevel = ROLE_LEVEL[user.role] || 0;
    const minLevel  = ROLE_LEVEL[minRole]   || 0;
    if (userLevel < minLevel) {
        return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
    }
    next();
};

export const requireRole = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });

    // SUPER_ADMIN always has access to everything
    if (user.role === 'SUPER_ADMIN') return next();

    const collection = req.params.collection;
    const userLevel = ROLE_LEVEL[user.role] || 0;

    if (req.method === 'GET') {
        const requiredReadLevel = COLLECTION_READ_LEVEL[collection] ?? 3;
        if (userLevel < requiredReadLevel) {
            return res.status(403).json({ message: "Sizda bu ma'lumotni ko'rish uchun ruxsat yo'q" });
        }
        return next();
    }

    const requiredLevel = COLLECTION_WRITE_LEVEL[collection] || 3;
    if (userLevel < requiredLevel) {
        return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
    }

    next();
};
