import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getDbConfig } from '../services/dbBackup.js';
import { JWT_SECRET } from '../config/jwtSecret.js';

const router = express.Router();

// ─── Role hierarchy (higher index = more powerful) ───────────────────────────
const ROLE_LEVEL: Record<string, number> = {
    TEACHER: 1,
    MANAGER: 2,
    ADMIN: 3,
    SUPER_ADMIN: 4,
};
const isSuperAdmin = (role: string) => role === 'SUPER_ADMIN';
const isAdminOrAbove = (role: string) => (ROLE_LEVEL[role] || 0) >= 3;

// ─── Normalize phone number ───────────────────────────────────────────────────
function normalizePhone(raw: string): string {
    return raw.replace(/\s/g, '').trim();
}

// ─── POST /auth/login  (phone + password) ────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ message: "Telefon raqam va parol kiritilishi shart" });
        }

        const normalizedPhone = normalizePhone(phone);

        // Try to find user by phone
        let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

        // Fallback: first-boot auto-create super admin if DB is empty
        if (!user) {
            const count = await prisma.user.count();
            if (count === 0 && normalizedPhone === '+998937525592' && password === 'nn1122') {
                const hashedPassword = await bcrypt.hash(password, 12);
                user = await prisma.user.create({
                    data: {
                        phone: normalizedPhone,
                        password: hashedPassword,
                        name: 'Bosh Administrator',
                        role: 'SUPER_ADMIN',
                        isActive: true,
                        permissions: JSON.stringify([
                            'dashboard', 'students', 'groups', 'courses', 'schedule', 'journal',
                            'leads', 'finance', 'staff', 'marketing', 'analytics', 'settings',
                            'users', 'backup', 'rooms', 'inventory', 'content', 'target_forms'
                        ]),
                    } as any,
                });
            }
        }

        if (!user) {
            return res.status(404).json({ message: "Bu telefon raqam tizimda ro'yxatdan o'tmagan" });
        }

        // Check active status
        if ((user as any).isActive === false) {
            return res.status(403).json({ message: "Hisobingiz bloklangan. Administrator bilan bog'laning." });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: "Parol noto'g'ri" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, phone: user.phone },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                name: user.name,
                role: user.role,
                avatar: user.avatar,
                permissions: (user as any).permissions,
            }
        });
    } catch (error) {
        console.error('[AUTH] Login error:', error);
        res.status(500).json({ message: "Server xatosi", error: String(error) });
    }
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Token topilmadi" });
    try {
        const token = authHeader.split(' ')[1];
        const payload: any = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
        res.json({
            id: user.id, phone: user.phone, email: user.email,
            name: user.name, role: user.role, avatar: user.avatar,
            permissions: (user as any).permissions
        });
    } catch {
        res.status(401).json({ message: "Token yaroqsiz" });
    }
});

// ─── PUT /auth/change-password ───────────────────────────────────────────────
router.put('/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = (req as any).user?.id;
        if (!currentPassword || !newPassword) return res.status(400).json({ message: "Joriy va yangi parol kiritilishi shart" });
        if (newPassword.length < 6) return res.status(400).json({ message: "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak" });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) return res.status(401).json({ message: "Joriy parol noto'g'ri" });

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
        res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
    } catch {
        res.status(500).json({ message: "Server xatosi" });
    }
});

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

// GET all users (admin+)
router.get('/users', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (!isAdminOrAbove(requester.role)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }
        const users = await prisma.user.findMany({
            select: {
                id: true, email: true, phone: true, name: true, role: true,
                avatar: true, permissions: true, isActive: true, createdAt: true,
                subject: true, experience: true, bio: true,
            } as any,
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// POST create user (admin+; only SUPER_ADMIN can create SUPER_ADMIN)
router.post('/users', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (!isAdminOrAbove(requester.role)) {
            return res.status(403).json({ message: "Foydalanuvchi yaratish uchun ruxsat yo'q" });
        }

        const { phone, email, password, name, role, permissions, avatar, subject, experience, bio } = req.body;

        if (!phone) return res.status(400).json({ message: "Telefon raqam kiritilishi shart" });
        if (!name)  return res.status(400).json({ message: "Ism kiritilishi shart" });

        const targetRole = role || 'MANAGER';

        // Only SUPER_ADMIN can create another SUPER_ADMIN
        if (targetRole === 'SUPER_ADMIN' && !isSuperAdmin(requester.role)) {
            return res.status(403).json({ message: "Faqat Super Admin boshqa Super Admin yarata oladi" });
        }

        const normalizedPhone = normalizePhone(phone);
        const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
        if (existing) return res.status(409).json({ message: "Bu telefon raqam allaqachon mavjud" });

        const hashedPassword = await bcrypt.hash(password || '123456', 12);
        const user = await prisma.user.create({
            data: {
                phone: normalizedPhone,
                email: email || null,
                password: hashedPassword,
                name,
                role: targetRole,
                isActive: true,
                permissions: JSON.stringify(permissions || []),
                avatar: avatar || null,
                subject: subject || null,
                experience: experience || null,
                bio: bio || null,
            } as any,
        });

        res.json({
            id: user.id, phone: user.phone, email: user.email,
            name: user.name, role: user.role,
            permissions: (user as any).permissions,
            avatar: (user as any).avatar,
            subject: (user as any).subject,
            experience: (user as any).experience,
            bio: (user as any).bio,
        });
    } catch (error) {
        console.error('[AUTH] Create user error:', error);
        res.status(500).json({ message: String(error) });
    }
});

// PUT update user
router.put('/users/:id', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (!isAdminOrAbove(requester.role)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        const { name, role, phone, email, permissions, password, isActive, avatar, subject, experience, bio } = req.body;
        const targetRole = role;

        // Only SUPER_ADMIN can assign SUPER_ADMIN role
        if (targetRole === 'SUPER_ADMIN' && !isSuperAdmin(requester.role)) {
            return res.status(403).json({ message: "Faqat Super Admin bu roʻlni berishi mumkin" });
        }

        const updateData: any = {
            name,
            role: targetRole,
            email: email || null,
            isActive: isActive !== undefined ? isActive : true,
        };
        // permissions faqat aniq yuborilganda yangilanadi — aks holda boshqa
        // forma (masalan CrmTeachers.tsx) saqlashda CrmUsers.tsx orqali
        // qo'yilgan ruxsatlarni bo'sh massivga aylantirib qo'yadi.
        if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);
        if (phone) updateData.phone = normalizePhone(phone);
        if (password) updateData.password = await bcrypt.hash(password, 12);
        if (avatar !== undefined) updateData.avatar = avatar || null;
        if (subject !== undefined) updateData.subject = subject || null;
        if (experience !== undefined) updateData.experience = experience || null;
        if (bio !== undefined) updateData.bio = bio || null;

        const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
        res.json({
            id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role,
            avatar: (user as any).avatar, subject: (user as any).subject,
            experience: (user as any).experience, bio: (user as any).bio,
        });
    } catch (error) {
        res.status(500).json({ message: String(error) });
    }
});

// DELETE user (cannot delete SUPER_ADMIN unless you are SUPER_ADMIN)
router.delete('/users/:id', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (!isAdminOrAbove(requester.role)) {
            return res.status(403).json({ message: "Ruxsat yo'q" });
        }

        const target = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!target) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

        // Cannot delete yourself
        if (target.id === requester.id) {
            return res.status(400).json({ message: "O'z hisobingizni o'chira olmaysiz" });
        }

        // Only SUPER_ADMIN can delete another SUPER_ADMIN
        if (isSuperAdmin(target.role) && !isSuperAdmin(requester.role)) {
            return res.status(403).json({ message: "Super Admin hisobini o'chirish uchun ruxsat yo'q" });
        }

        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── BACKUP (SUPER_ADMIN only) ────────────────────────────────────────────────
// DATABASE_URL orqali aniqlanadi — Postgres (lokal/ba'zi serverlar) da pg_dump
// oqimi to'g'ridan-to'g'ri javobga yuboriladi; SQLite (root'siz production) da
// haqiqiy baza fayli (DATABASE_URL dan, "dev.db" qattiq yozilmagan) ko'chiriladi.
router.get('/backup', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        if (!isSuperAdmin(user.role) && !isAdminOrAbove(user.role)) {
            return res.status(403).json({ message: "Faqat admin backup olishi mumkin" });
        }

        const db = getDbConfig();
        if (!db) return res.status(500).json({ message: "DATABASE_URL konfiguratsiya qilinmagan" });

        const dateStr = new Date().toISOString().slice(0, 10);

        if (db.type === 'sqlite') {
            if (!fs.existsSync(db.filePath)) return res.status(404).json({ message: "Ma'lumotlar bazasi fayli topilmadi" });
            const filename = `tayyorlov-backup-${dateStr}.db`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            fs.createReadStream(db.filePath).pipe(res);
            return;
        }

        // Postgres — pg_dump chiqishini to'g'ridan-to'g'ri javobga oqizamiz (vaqtinchalik fayl kerak emas)
        const filename = `tayyorlov-backup-${dateStr}.sql`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/sql');
        const child = spawn(
            'pg_dump',
            ['-h', db.host, '-p', db.port, '-U', db.user, '-F', 'p', db.database],
            { env: { ...process.env, PGPASSWORD: db.password } }
        );
        child.stdout.pipe(res);
        child.stderr.on('data', (d) => console.error('[Backup] pg_dump stderr:', d.toString()));
        child.on('error', (err) => {
            console.error('[Backup] pg_dump spawn error:', err);
            if (!res.headersSent) res.status(500).json({ message: "pg_dump ishga tushmadi (o'rnatilganmi tekshiring)" });
        });
    } catch (err) {
        console.error('[Backup] error:', err);
        if (!res.headersSent) res.status(500).json({ message: "Backup olishda xatolik" });
    }
});

// ─── SYSTEM STATS ─────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const [students, groups, leads, users, payments] = await Promise.all([
            prisma.student.count(),
            prisma.group.count(),
            prisma.lead.count(),
            prisma.user.count(),
            prisma.payment.count(),
        ]);

        let dbSize = 0;
        const db = getDbConfig();
        if (db?.type === 'sqlite') {
            dbSize = fs.existsSync(db.filePath) ? fs.statSync(db.filePath).size : 0;
        } else if (db?.type === 'postgres') {
            try {
                const rows = await prisma.$queryRawUnsafe<{ size: bigint }[]>('SELECT pg_database_size(current_database()) AS size');
                dbSize = Number(rows[0]?.size || 0);
            } catch { dbSize = 0; }
        }
        res.json({ students, groups, leads, users, payments, dbSize: (dbSize / 1024 / 1024).toFixed(2) + ' MB' });
    } catch {
        res.status(500).json({ message: "Statistika olishda xatolik" });
    }
});

export default router;
