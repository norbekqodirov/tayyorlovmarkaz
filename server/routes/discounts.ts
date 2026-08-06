import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();

// GET /api/discounts
router.get('/', requireAuth, async (_req, res) => {
    try {
        const discounts = await prisma.discount.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(discounts);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/discounts/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const d = await prisma.discount.findUnique({ where: { id: req.params.id } });
        if (!d) return res.status(404).json({ message: 'Topilmadi' });
        res.json(d);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/discounts
router.post('/', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { code, name, type, value, maxUses, validFrom, validTo, courseId, groupId, minAmount, isActive } = req.body;
        if (!code || !type || !value) return res.status(400).json({ message: 'code, type, value kerak' });

        const d = await prisma.discount.create({
            data: {
                code: code.toUpperCase(),
                name,
                type,
                value: Number(value),
                maxUses: maxUses ? Number(maxUses) : null,
                validFrom,
                validTo,
                courseId: courseId || null,
                groupId: groupId || null,
                minAmount: minAmount ? Number(minAmount) : null,
                isActive: isActive !== false,
            },
        });
        res.status(201).json(d);
    } catch (err: any) {
        if (err.code === 'P2002') return res.status(409).json({ message: 'Bu kod allaqachon mavjud' });
        res.status(500).json({ message: err.message });
    }
});

// POST /api/discounts/validate — chegirmani tekshirish
router.post('/validate', requireAuth, async (req, res) => {
    try {
        const { code, amount } = req.body;
        if (!code) return res.status(400).json({ message: 'code kerak' });

        const discount = await prisma.discount.findUnique({ where: { code: code.toUpperCase() } });

        if (!discount) return res.status(404).json({ valid: false, message: 'Promo-kod topilmadi' });
        if (!discount.isActive) return res.status(400).json({ valid: false, message: 'Promo-kod faol emas' });

        const now = todayDateStr();
        if (discount.validFrom && discount.validFrom > now) {
            return res.status(400).json({ valid: false, message: 'Promo-kod hali amal qilmaydi' });
        }
        if (discount.validTo && discount.validTo < now) {
            return res.status(400).json({ valid: false, message: 'Promo-kod muddati tugagan' });
        }
        if (discount.maxUses && discount.usedCount >= discount.maxUses) {
            return res.status(400).json({ valid: false, message: 'Promo-kod ishlatish chegarasi tugagan' });
        }
        if (discount.minAmount && amount && Number(amount) < discount.minAmount) {
            return res.status(400).json({ valid: false, message: `Minimal miqdor: ${discount.minAmount.toLocaleString()} so'm` });
        }

        const totalAmount = Number(amount) || 0;
        let discountAmount = 0;
        if (discount.type === 'percent') {
            discountAmount = totalAmount * (discount.value / 100);
        } else {
            discountAmount = discount.value;
        }
        discountAmount = Math.min(discountAmount, totalAmount);

        res.json({
            valid: true,
            discount,
            discountAmount: Math.round(discountAmount),
            finalAmount: Math.round(totalAmount - discountAmount),
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/discounts/:id
router.patch('/:id', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { name, type, value, maxUses, validFrom, validTo, isActive, minAmount } = req.body;
        const d = await prisma.discount.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(type !== undefined && { type }),
                ...(value !== undefined && { value: Number(value) }),
                ...(maxUses !== undefined && { maxUses: maxUses ? Number(maxUses) : null }),
                ...(validFrom !== undefined && { validFrom }),
                ...(validTo !== undefined && { validTo }),
                ...(isActive !== undefined && { isActive: Boolean(isActive) }),
                ...(minAmount !== undefined && { minAmount: minAmount ? Number(minAmount) : null }),
            },
        });
        res.json(d);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/discounts/:id
router.delete('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        await prisma.discount.delete({ where: { id: req.params.id } });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
