import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[AUTH] ⚠ JWT_SECRET muhit o\'zgaruvchisi o\'rnatilmagan!');
}

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
        const secret = JWT_SECRET || 'fallback-secret-key-for-local';
        const payload = jwt.verify(token, secret);
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
    forms:         3,
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

export const requireRole = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });

    // SUPER_ADMIN always has access to everything
    if (user.role === 'SUPER_ADMIN') return next();

    // GET requests: only require authentication (already done), allow all roles
    if (req.method === 'GET') return next();

    const collection = req.params.collection;
    const requiredLevel = COLLECTION_WRITE_LEVEL[collection] || 3;
    const userLevel = ROLE_LEVEL[user.role] || 0;

    if (userLevel < requiredLevel) {
        return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
    }

    next();
};
