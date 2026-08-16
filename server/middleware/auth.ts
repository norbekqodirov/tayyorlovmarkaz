import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwtSecret.js';

// Role hierarchy levels
const ROLE_LEVEL: Record<string, number> = {
    TEACHER:     1,
    MANAGER:     2,
    ADMIN:       3,
    SUPER_ADMIN: 4,
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Avtorizatsiya tokeni topilmadi" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        (req as any).user = payload;
        next();
    } catch {
        return res.status(401).json({ message: "Token yaroqsiz yoki muddati tugagan" });
    }
};

// Collection → minimum role level required to write
const COLLECTION_WRITE_LEVEL: Record<string, number> = {
    leads:         2, // MANAGER+
    students:      2,
    groups:        2,
    courses:       2,
    schedule:      2,
    schedules:     2,
    attendance:    1, // TEACHER+
    assessments:   1,
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
    // ── TEACHER (1) — core academic data + the dropdowns those pages share ──
    courses:       1,
    courseTiers:   1,
    groups:        1,
    students:      1,
    rooms:         1,
    schedule:      1,
    schedules:     1,
    attendance:    1,
    assessment:    1,
    assessments:   1,
    exams:         1,
    notes:         1,
    journal:       1,
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
