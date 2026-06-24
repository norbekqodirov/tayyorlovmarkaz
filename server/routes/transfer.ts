import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();

// POST /api/transfer/student — o'quvchini filialga o'tkazish
router.post('/student', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { studentId, toBranchId, notes } = req.body;
        if (!studentId || !toBranchId) {
            return res.status(400).json({ message: 'studentId va toBranchId kerak' });
        }

        const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
        if (!student) return res.status(404).json({ message: "O'quvchi topilmadi" });

        const branch = await prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!branch) return res.status(404).json({ message: 'Filial topilmadi' });

        const updated = await prisma.student.update({
            where: { id: studentId },
            data: {
                branchId: toBranchId,
                notes: notes ? `${student.notes ? student.notes + '\n' : ''}Transfer: ${branch.name}` : student.notes,
            },
        });

        res.json({ message: `${student.name} ${branch.name} filialiga o'tkazildi`, student: updated });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/transfer/staff — xodimni filialga o'tkazish
router.post('/staff', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { staffId, toBranchId } = req.body;
        if (!staffId || !toBranchId) {
            return res.status(400).json({ message: 'staffId va toBranchId kerak' });
        }

        const staff = await prisma.staffMember.findFirst({ where: { id: staffId, deletedAt: null } });
        if (!staff) return res.status(404).json({ message: 'Xodim topilmadi' });

        const branch = await prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!branch) return res.status(404).json({ message: 'Filial topilmadi' });

        const updated = await prisma.staffMember.update({
            where: { id: staffId },
            data: { branchId: toBranchId },
        });

        res.json({ message: `${staff.name} ${branch.name} filialiga o'tkazildi`, staff: updated });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/transfer/group — guruhni filialga o'tkazish
router.post('/group', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { groupId, toBranchId } = req.body;
        if (!groupId || !toBranchId) {
            return res.status(400).json({ message: 'groupId va toBranchId kerak' });
        }

        const group = await prisma.group.findFirst({ where: { id: groupId, deletedAt: null } });
        if (!group) return res.status(404).json({ message: 'Guruh topilmadi' });

        const branch = await prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!branch) return res.status(404).json({ message: 'Filial topilmadi' });

        const updated = await prisma.group.update({
            where: { id: groupId },
            data: { branchId: toBranchId },
        });

        res.json({ message: `${group.name} ${branch.name} filialiga o'tkazildi`, group: updated });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
