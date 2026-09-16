/**
 * server/routes/teacherPayroll.ts
 *
 * Finance-audit (2026-09-15), F4 — o'qituvchi oyligi uchun draft→tasdiqlash→
 * to'lov (qisman/to'liq) jarayoni. `salary.ts` (StaffMember uchun) bilan bir
 * xil himoya naqshi: tasdiqlangan/to'langan yozuv qayta yozilmaydi/o'chirilmaydi,
 * har bir holat o'tishi shartli `updateMany` + `$transaction` bilan atomar.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { todayDateStr } from '../utils/timezone.js';
import { calculateTeacherPayroll, PayrollBasis } from '../services/teacherPayroll.js';

const router = express.Router();

router.use(requireAuth, requireMinRole('MANAGER'), requirePermission('finance'));

function parseBasis(raw: any): PayrollBasis {
    return raw === 'cash' ? 'cash' : 'accrual';
}

// GET /api/finance/teacher-payroll/preview?teacherId=&year=&month=&basis=
// Faqat hisoblash — hech narsa yozilmaydi (draft ham yaratilmaydi).
router.get('/preview', async (req, res) => {
    try {
        const { teacherId, year, month, basis } = req.query as Record<string, string>;
        if (!teacherId || !year || !month) {
            return res.status(400).json({ message: 'teacherId, year va month talab qilinadi' });
        }
        const result = await calculateTeacherPayroll(teacherId, Number(year), Number(month), parseBasis(basis));
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-payroll/:teacherId/staff-attendance?month=YYYY-MM
// O'qituvchining O'ZINING ishga kelish-ketish davomati (Face ID orqali,
// StaffAttendance). `User` va `StaffMember` orasida rasmiy FK yo'q — mavjud,
// allaqachon ishlaydigan bog'lanish naqshi (staffPortal.ts'dagi
// getOrCreateStaffMember() bilan bir xil): ikkalasi ham BIR XIL Telegram
// hisobiga ulangan bo'lsa, `telegramChatId` orqali moslashtiriladi.
router.get('/:teacherId/staff-attendance', async (req, res) => {
    try {
        const { month } = req.query as { month?: string };
        const teacher = await prisma.user.findUnique({
            where: { id: req.params.teacherId },
            select: { telegramChatId: true },
        });
        if (!teacher?.telegramChatId) {
            return res.json({ linked: false, records: [], summary: null });
        }
        const staffMember = await prisma.staffMember.findFirst({
            where: { telegramChatId: teacher.telegramChatId },
            select: { id: true, name: true, photo: true },
        });
        if (!staffMember) {
            return res.json({ linked: false, records: [], summary: null });
        }
        const where: any = { staffId: staffMember.id };
        if (month) where.date = { startsWith: month };
        const records = await prisma.staffAttendance.findMany({
            where,
            orderBy: { date: 'desc' },
            take: 60,
        });
        const summary = {
            present: records.filter(r => r.status === 'present').length,
            late: records.filter(r => r.status === 'late').length,
            absent: records.filter(r => r.status === 'absent').length,
            total: records.length,
        };
        res.json({ linked: true, staffMemberId: staffMember.id, records, summary });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-payroll?teacherId=&month=
router.get('/', async (req, res) => {
    try {
        const { teacherId, month } = req.query as Record<string, string>;
        const where: any = {};
        if (teacherId) where.teacherId = teacherId;
        if (month) where.month = month;
        const rows = await prisma.teacherPayroll.findMany({
            where,
            include: { teacher: { select: { id: true, name: true } } },
            orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(rows);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll — draft yaratish/qayta hisoblash
// Faqat hali DRAFT bo'lgan (yoki mavjud bo'lmagan) yozuv uchun ishlaydi —
// tasdiqlangan/to'langan yozuv bu yo'l orqali umuman o'zgartirilmaydi.
router.post('/', async (req, res) => {
    try {
        const { teacherId, year, month, basis: rawBasis } = req.body as { teacherId: string; year: number; month: number; basis?: string };
        if (!teacherId || !year || !month) {
            return res.status(400).json({ message: 'teacherId, year va month talab qilinadi' });
        }
        const basis = parseBasis(rawBasis);
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        const existing = await prisma.teacherPayroll.findUnique({
            where: { teacherId_month_basis: { teacherId, month: monthStr, basis } },
        });
        if (existing && existing.status !== 'draft') {
            return res.status(400).json({ message: "Bu davr uchun oylik allaqachon tasdiqlangan — qayta hisoblab bo'lmaydi" });
        }

        const breakdown = await calculateTeacherPayroll(teacherId, year, month, basis);
        const data = {
            teacherId,
            month: monthStr,
            basis,
            accruedAmount: breakdown.salary,
            sourceSnapshot: JSON.stringify(breakdown),
        };
        const payroll = await prisma.teacherPayroll.upsert({
            where: { teacherId_month_basis: { teacherId, month: monthStr, basis } },
            create: data,
            update: data,
        });
        res.json(payroll);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll/:id/approve — draft -> approved, summa muzlaydi
router.post('/:id/approve', async (req, res) => {
    try {
        const { count } = await prisma.teacherPayroll.updateMany({
            where: { id: req.params.id, status: 'draft' },
            data: { status: 'approved', approvedAt: new Date() },
        });
        if (count === 0) {
            const existing = await prisma.teacherPayroll.findUnique({ where: { id: req.params.id } });
            if (!existing) return res.status(404).json({ message: 'Topilmadi' });
            return res.status(400).json({ message: "Faqat 'draft' holatidagi yozuv tasdiqlanishi mumkin" });
        }
        const updated = await prisma.teacherPayroll.findUnique({ where: { id: req.params.id } });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll/:id/pay — qisman/to'liq to'lov qayd etish
// RF-03/RF-04 bilan bir xil atomar naqsh: holat/qoldiq tekshiruvi va
// Transaction yozuvi BITTA $transaction ichida.
router.post('/:id/pay', async (req, res) => {
    try {
        const { amount, method } = req.body as { amount: number; method?: string };
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: "Summa musbat son bo'lishi kerak" });
        }

        const payroll = await prisma.teacherPayroll.findUnique({
            where: { id: req.params.id },
            include: { teacher: { select: { name: true } } },
        });
        if (!payroll) return res.status(404).json({ message: 'Topilmadi' });
        if (payroll.status === 'draft') {
            return res.status(400).json({ message: "Avval oylik tasdiqlanishi kerak" });
        }
        const remaining = payroll.accruedAmount - payroll.paidAmount;
        if (numAmount > remaining) {
            return res.status(400).json({ message: `Qoldiqdan (${remaining}) ortiq summa to'lanmaydi` });
        }

        const todayStr = todayDateStr();
        const result = await prisma.$transaction(async (tx) => {
            const newPaidAmount = payroll.paidAmount + numAmount;
            const willBeFullyPaid = newPaidAmount >= payroll.accruedAmount;

            const { count } = await tx.teacherPayroll.updateMany({
                where: { id: req.params.id, paidAmount: payroll.paidAmount },
                data: {
                    paidAmount: newPaidAmount,
                    status: willBeFullyPaid ? 'paid' : payroll.status,
                },
            });
            if (count === 0) return { applied: false };

            const transaction = await tx.transaction.create({
                data: {
                    type: 'expense',
                    amount: numAmount,
                    category: 'Oylik',
                    description: `${payroll.teacher.name} — ${payroll.month} oyligi (${payroll.basis === 'cash' ? "tushgan to'lovdan" : 'hisoblangan'})`,
                    date: todayStr,
                    method: method || 'Bank',
                    staffId: payroll.teacherId,
                    staffName: payroll.teacher.name,
                    sourceType: 'teacher_payroll',
                    sourceId: payroll.id,
                },
            });

            const updated = await tx.teacherPayroll.findUnique({ where: { id: req.params.id } });
            return { applied: true, updated, transaction };
        });

        if (!result.applied) {
            return res.status(409).json({ message: "Boshqa so'rov shu vaqtda to'lov qildi — qoldiqni yangilab qayta urinib ko'ring" });
        }

        res.json(result.updated);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/finance/teacher-payroll/:id — faqat DRAFT holatidagi yozuvni olib tashlash
router.delete('/:id', async (req, res) => {
    try {
        const payroll = await prisma.teacherPayroll.findUnique({ where: { id: req.params.id }, select: { status: true } });
        if (!payroll) return res.status(404).json({ message: 'Topilmadi' });
        if (payroll.status !== 'draft') {
            return res.status(400).json({ message: "Faqat 'draft' holatidagi yozuvni o'chirish mumkin" });
        }
        await prisma.teacherPayroll.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
