import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-local';

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
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
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

        res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (e) {
        res.status(401).json({ message: "Noto'g'ri token" });
    }
});

export default router;
