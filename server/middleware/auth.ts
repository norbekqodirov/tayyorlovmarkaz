import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('XATO: JWT_SECRET muhit o\'zgaruvchisi o\'rnatilmagan! .env faylini tekshiring.');
}

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
    } catch (err) {
        return res.status(401).json({ message: "Token yaroqsiz yoki eskirgan" });
    }
};

// Role-based authorization middleware
const COLLECTION_ROLES: Record<string, string[]> = {
    leads: ['ADMIN', 'MANAGER'],
    students: ['ADMIN', 'TEACHER', 'MANAGER'],
    groups: ['ADMIN', 'TEACHER', 'MANAGER'],
    courses: ['ADMIN', 'MANAGER'],
    schedule: ['ADMIN', 'TEACHER', 'MANAGER'],
    schedules: ['ADMIN', 'TEACHER', 'MANAGER'],
    attendance: ['ADMIN', 'TEACHER'],
    assessments: ['ADMIN', 'TEACHER'],
    journal: ['ADMIN', 'TEACHER'],
    finance: ['ADMIN'],
    transactions: ['ADMIN'],
    payments: ['ADMIN'],
    staff: ['ADMIN'],
    inventory: ['ADMIN'],
    rooms: ['ADMIN'],
    campaigns: ['ADMIN', 'MANAGER'],
    marketing: ['ADMIN', 'MANAGER'],
    forms: ['ADMIN'],
    content: ['ADMIN'],
    news: ['ADMIN'],
    posts: ['ADMIN'],
    settings: ['ADMIN'],
    notifications: ['ADMIN', 'TEACHER', 'MANAGER', 'STUDENT'],
    gallery: ['ADMIN'],
    pageContent: ['ADMIN'],
    tasks: ['ADMIN', 'TEACHER', 'MANAGER'],
    users: ['ADMIN'],
    enrollments: ['ADMIN', 'TEACHER', 'MANAGER'],
    leadActivities: ['ADMIN', 'MANAGER'],
};

export const requireRole = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });

    // ADMIN always has access
    if (user.role === 'ADMIN') return next();

    const collection = req.params.collection;
    const allowedRoles = COLLECTION_ROLES[collection];

    // GET requests are more permissive
    if (req.method === 'GET') return next();

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
    }

    next();
};
