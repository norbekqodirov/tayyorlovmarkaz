import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/branches
router.get('/', requireAuth, async (_req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { createdAt: 'asc' },
        });

        // Har bir filial uchun statistika
        const enriched = await Promise.all(branches.map(async (b) => {
            const [studentCount, staffCount, groupCount] = await Promise.all([
                prisma.student.count({ where: { branchId: b.id, deletedAt: null } }),
                prisma.staffMember.count({ where: { branchId: b.id, deletedAt: null } }),
                prisma.group.count({ where: { branchId: b.id, deletedAt: null } }),
            ]);
            return { ...b, studentCount, staffCount, groupCount };
        }));

        res.json(enriched);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/branches/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
        if (!branch) return res.status(404).json({ message: 'Filial topilmadi' });
        res.json(branch);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/branches
router.post('/', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { name, address, phone, status, managerId } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Filial nomi kiritilishi shart' });

        const branch = await prisma.branch.create({
            data: {
                name: name.trim(),
                address: address || null,
                phone: phone || null,
                status: status || 'active',
                managerId: managerId || null,
            },
        });
        res.status(201).json(branch);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/branches/:id  (frontend PUT ham qabul qiladi)
router.put('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { name, address, phone, status, managerId } = req.body;
        const branch = await prisma.branch.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(address !== undefined && { address: address || null }),
                ...(phone !== undefined && { phone: phone || null }),
                ...(status !== undefined && { status }),
                ...(managerId !== undefined && { managerId: managerId || null }),
            },
        });
        res.json(branch);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.patch('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { name, address, phone, status, managerId } = req.body;
        const branch = await prisma.branch.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(address !== undefined && { address: address || null }),
                ...(phone !== undefined && { phone: phone || null }),
                ...(status !== undefined && { status }),
                ...(managerId !== undefined && { managerId: managerId || null }),
            },
        });
        res.json(branch);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/branches/:id
router.delete('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        // Bog'liq student/staff/group larni uzib olish
        await Promise.all([
            prisma.student.updateMany({ where: { branchId: req.params.id }, data: { branchId: null } }),
            prisma.staffMember.updateMany({ where: { branchId: req.params.id }, data: { branchId: null } }),
            prisma.group.updateMany({ where: { branchId: req.params.id }, data: { branchId: null } }),
        ]);
        await prisma.branch.delete({ where: { id: req.params.id } });
        res.json({ message: "Filial o'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
