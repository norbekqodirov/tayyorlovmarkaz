import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole, ROLE_LEVEL } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// IP-03 (RX-05). "Mehnat ta'tillari" sahifasi — HR vositasi (xodim tanlanib
// kiritiladi), shuning uchun ro'yxat `leave_requests` ruxsati bilan qoladi.
// Yopilgan teshiklar:
//  - tasdiqlangan ta'til endi O'CHIRILMAYDI (tabel/oylik uchun tarix) —
//    administrator uni "bekor qilingan" holatiga o'tkazadi;
//  - sana formati, boshlanish <= tugash, xodim mavjudligi (arxivlanmagan) va
//    shu xodimning boshqa kutilayotgan/tasdiqlangan ta'tili bilan ustma-ust
//    tushishi serverda tekshiriladi;
//  - tasdiqlash/rad etish faqat "pending" holatdagi so'rovga.
// Xodimning o'zi uchun so'rov (self-service) — staff portalda (IP-27).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE_TYPES = new Set(['annual', 'sick', 'personal', 'unpaid']);

// GET /api/leave — barcha ta'til so'rovlari
router.get('/', requireAuth, requirePermission('leave_requests'), async (req, res) => {
    try {
        const { staffId, status } = req.query;
        const where: any = {};
        if (staffId) where.staffId = staffId as string;
        if (status) where.status = status as string;

        const requests = await prisma.leaveRequest.findMany({
            where,
            include: {
                staff: { select: { id: true, name: true, role: true, photo: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/leave — yangi so'rov
router.post('/', requireAuth, requirePermission('leave_requests'), async (req, res) => {
    try {
        const { staffId, type, startDate, endDate, reason } = req.body;
        if (!staffId || !type || !startDate || !endDate) {
            return res.status(400).json({ message: "Xodim, ta'til turi va sanalarni kiriting" });
        }
        if (!LEAVE_TYPES.has(type)) {
            return res.status(400).json({ message: "Noma'lum ta'til turi" });
        }
        if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
            return res.status(400).json({ message: "Sana YYYY-MM-DD formatida bo'lishi kerak" });
        }
        if (startDate > endDate) {
            return res.status(400).json({ message: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas" });
        }
        const staff = await prisma.staffMember.findUnique({ where: { id: staffId }, select: { id: true, deletedAt: true } });
        if (!staff || staff.deletedAt) {
            return res.status(400).json({ message: 'Xodim topilmadi yoki arxivlangan' });
        }
        const overlap = await prisma.leaveRequest.findFirst({
            where: {
                staffId,
                status: { in: ['pending', 'approved'] },
                startDate: { lte: endDate },
                endDate: { gte: startDate },
            },
            select: { startDate: true, endDate: true, status: true },
        });
        if (overlap) {
            return res.status(409).json({ message: `Bu xodimning ${overlap.startDate} — ${overlap.endDate} oralig'ida ${overlap.status === 'approved' ? 'tasdiqlangan' : 'kutilayotgan'} ta'tili bor` });
        }

        const request = await prisma.leaveRequest.create({
            data: { staffId, type, startDate, endDate, reason, status: 'pending' },
            include: { staff: { select: { name: true } } },
        });
        res.status(201).json(request);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

async function decide(req: express.Request, res: express.Response, status: 'approved' | 'rejected') {
    try {
        const { notes } = req.body;
        const approvedBy = (req as any).user?.name || 'Admin';
        const result = await prisma.leaveRequest.updateMany({
            where: { id: req.params.id, status: 'pending' },
            data: { status, approvedBy, approvedAt: new Date(), ...(notes && { notes }) },
        });
        if (result.count === 0) {
            const exists = await prisma.leaveRequest.findUnique({ where: { id: req.params.id }, select: { status: true } });
            if (!exists) return res.status(404).json({ message: "So'rov topilmadi" });
            return res.status(409).json({ message: `So'rov allaqachon ko'rib chiqilgan (${exists.status})` });
        }
        const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id }, include: { staff: { select: { name: true } } } });
        const user = (req as any).user;
        await logAudit({ userId: user?.id, userName: user?.name || 'system', action: status === 'approved' ? 'approve' : 'reject', resource: 'leaveRequest', resourceId: req.params.id });
        res.json(request);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
}

// PATCH /api/leave/:id/approve — tasdiqlash (faqat kutilayotgan so'rov)
router.patch('/:id/approve', requireAuth, requireMinRole('ADMIN'), requirePermission('leave_requests'), (req, res) => decide(req, res, 'approved'));

// PATCH /api/leave/:id/reject — rad etish (faqat kutilayotgan so'rov)
router.patch('/:id/reject', requireAuth, requireMinRole('ADMIN'), requirePermission('leave_requests'), (req, res) => decide(req, res, 'rejected'));

// DELETE /api/leave/:id — kutilayotgan yoki rad etilgan so'rovni o'chirish.
// Tasdiqlangan ta'til o'chirilmaydi: administrator uni "cancelled" qiladi
// (tabel va oylik tarixi saqlanishi uchun).
router.delete('/:id', requireAuth, requirePermission('leave_requests'), async (req, res) => {
    try {
        const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id }, select: { status: true } });
        if (!request) return res.status(404).json({ message: "So'rov topilmadi" });
        const user = (req as any).user;
        if (request.status === 'approved') {
            if ((ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL.ADMIN) {
                return res.status(403).json({ message: "Tasdiqlangan ta'tilni faqat administrator bekor qila oladi" });
            }
            await prisma.leaveRequest.update({ where: { id: req.params.id }, data: { status: 'cancelled', notes: `Bekor qildi: ${user.name || 'Admin'}` } });
            await logAudit({ userId: user.id, userName: user.name || 'system', action: 'cancel', resource: 'leaveRequest', resourceId: req.params.id });
            return res.json({ message: "Tasdiqlangan ta'til bekor qilindi (yozuv saqlandi)", cancelled: true });
        }
        await prisma.leaveRequest.delete({ where: { id: req.params.id } });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
