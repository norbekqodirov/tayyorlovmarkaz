import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-local';
if (!process.env.JWT_SECRET) {
    console.warn('[AUTH] OGOHLANTIRISH: JWT_SECRET muhit o\'zgaruvchisi o\'rnatilmagan!');
}

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Asosiy adminni tekshirish
        let user = await prisma.user.findUnique({ where: { email } });

        // Agar umuman admin bo'lmasa, uni yaratamiz (Faqatgina admin@tayyorlovmarkaz.uz uchun)
        if (!user && email === 'admin@tayyorlovmarkaz.uz' && password === 'Admin2026!') {
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: 'Bosh Administrator',
                    role: 'ADMIN'
                }
            });
        }

        if (!user) {
            return res.status(404).json({ message: "Bunday foydalanuvchi topilmadi" });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: "Parol noto'g'ri" });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: (user as any).permissions }
        });
    } catch (error) {
        res.status(500).json({ message: "Server xatosi", error: String(error) });
    }
});

// User profiling get info
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "To'liq emas!" });
    try {
        const token = authHeader.split(" ")[1];
        const payload: any = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) return res.status(404).json({ message: "Topilmadi" });

        res.json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, permissions: (user as any).permissions });
    } catch (e) {
        res.status(401).json({ message: "Noto'g'ri token" });
    }
});

// Change password
router.put('/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
        if (!currentPassword || !newPassword) return res.status(400).json({ message: "Joriy va yangi parol kiritilishi shart" });
        if (newPassword.length < 6) return res.status(400).json({ message: "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak" });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) return res.status(401).json({ message: "Joriy parol noto'g'ri" });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });

        res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
    } catch (error) {
        res.status(500).json({ message: "Server xatosi" });
    }
});

// ------------------------------------------
// USER MANAGEMENT (Admin only)
// ------------------------------------------

// GET all users
router.get('/users', requireAuth, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, phone: true, avatar: true, permissions: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// POST create user
router.post('/users', requireAuth, async (req, res) => {
    try {
        const { email, password, name, role, phone, permissions } = req.body;
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(409).json({ message: "Bu email allaqachon mavjud" });
        const hashedPassword = await bcrypt.hash(password || '123456', 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: role || 'ADMIN',
                phone,
                permissions: JSON.stringify(permissions || [])
            } as any
        });
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, permissions: (user as any).permissions });
    } catch (error) {
        console.error("User creation error:", error);
        res.status(500).json({ message: String(error) });
    }
});

// PUT update user
router.put('/users/:id', requireAuth, async (req, res) => {
    try {
        const { name, role, phone, permissions, password } = req.body;
        const updateData: any = { name, role, phone, permissions: JSON.stringify(permissions || []) };
        if (password) updateData.password = await bcrypt.hash(password, 10);
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, permissions: (user as any).permissions });
    } catch (error) {
        console.error("User update error:", error);
        res.status(500).json({ message: String(error) });
    }
});

// DELETE user
router.delete('/users/:id', requireAuth, async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ------------------------------------------
// BACKUP (Admin only)
// ------------------------------------------

// GET backup - download database file
router.get('/backup', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        if (user.role !== 'ADMIN') return res.status(403).json({ message: "Faqat admin backup olishi mumkin" });

        const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ message: "Ma'lumotlar bazasi topilmadi" });
        }

        const filename = `tayyorlov-backup-${new Date().toISOString().slice(0, 10)}.db`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');

        const readStream = fs.createReadStream(dbPath);
        readStream.pipe(res);
    } catch (error) {
        res.status(500).json({ message: "Backup olishda xatolik yuz berdi" });
    }
});

// GET stats - system statistics
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const [students, groups, leads, users, payments] = await Promise.all([
            prisma.student.count(),
            prisma.group.count(),
            prisma.lead.count(),
            prisma.user.count(),
            prisma.payment.count(),
        ]);

        const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
        const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

        res.json({
            students, groups, leads, users, payments,
            dbSize: (dbSize / 1024 / 1024).toFixed(2) + ' MB',
        });
    } catch (error) {
        res.status(500).json({ message: "Statistika olishda xatolik" });
    }
});

export default router;
