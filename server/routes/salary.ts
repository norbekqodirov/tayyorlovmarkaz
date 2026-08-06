import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { invalidate, NS } from '../services/cache.js';
import { emitToAdmins } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();

// GET /api/salary?month=YYYY-MM
router.get('/', requireAuth, async (req, res) => {
    try {
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        const salaries = await prisma.salary.findMany({
            where: { month },
            include: { staff: { select: { id: true, name: true, role: true, salary: true, photo: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(salaries);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/salary/staff/:staffId  — staff's full salary history
router.get('/staff/:staffId', requireAuth, async (req, res) => {
    try {
        const salaries = await prisma.salary.findMany({
            where: { staffId: req.params.staffId },
            orderBy: { month: 'desc' },
            take: 24,
        });
        res.json(salaries);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/salary — create or update salary for a staff/month
router.post('/', requireAuth, requireRole, async (req, res) => {
    try {
        const { staffId, month, baseSalary = 0, bonus = 0, deduction = 0, notes, paid = false } = req.body;
        if (!staffId || !month) {
            return res.status(400).json({ message: 'staffId va month kiritilishi shart' });
        }
        const total = Number(baseSalary) + Number(bonus) - Number(deduction);
        const data = {
            staffId,
            month,
            baseSalary: Number(baseSalary),
            bonus: Number(bonus),
            deduction: Number(deduction),
            total,
            paid,
            paidAt: paid ? new Date() : null,
            notes,
        };
        const salary = await prisma.salary.upsert({
            where: { staffId_month: { staffId, month } },
            create: data,
            update: data,
        });

        invalidate(NS.FINANCE);
        invalidate(NS.ANALYTICS);
        emitToAdmins('salary:updated', salary);

        await logAudit({
            userId: (req as any).user?.id,
            userName: (req as any).user?.name || 'system',
            action: 'create',
            resource: 'salary',
            resourceId: salary.id,
            after: salary,
        });

        res.json(salary);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/salary/:id/pay — mark salary as paid + create expense transaction
router.put('/:id/pay', requireAuth, requireRole, async (req, res) => {
    try {
        const salary = await prisma.salary.findUnique({
            where: { id: req.params.id },
            include: { staff: true },
        });
        if (!salary) return res.status(404).json({ message: 'Topilmadi' });
        if (salary.paid) return res.status(400).json({ message: "Allaqachon to'langan" });

        const updated = await prisma.salary.update({
            where: { id: req.params.id },
            data: { paid: true, paidAt: new Date() },
        });

        // Create matching expense transaction in finance
        try {
            await prisma.transaction.create({
                data: {
                    type: 'expense',
                    amount: salary.total,
                    category: 'Oylik',
                    description: `${salary.staff.name} - ${salary.month} oyligi`,
                    date: todayDateStr(),
                    method: req.body.method || 'Bank',
                    staffId: salary.staffId,
                    staffName: salary.staff.name,
                },
            });
        } catch {/* silent */}

        invalidate(NS.FINANCE);
        invalidate(NS.ANALYTICS);
        emitToAdmins('salary:paid', updated);

        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/salary/:id
router.delete('/:id', requireAuth, requireRole, async (req, res) => {
    try {
        await prisma.salary.delete({ where: { id: req.params.id } });
        invalidate(NS.FINANCE);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/salary/generate-month — bulk generate salaries for all staff for given month
router.post('/generate-month', requireAuth, requireRole, async (req, res) => {
    try {
        const { month } = req.body;
        if (!month) return res.status(400).json({ message: 'month kiritilishi shart' });

        const staff = await prisma.staffMember.findMany({ where: { status: 'Faol', deletedAt: null } });
        const results = [];
        for (const s of staff) {
            try {
                const existing = await prisma.salary.findUnique({ where: { staffId_month: { staffId: s.id, month } } });
                if (existing) {
                    results.push({ staffId: s.id, skipped: true });
                    continue;
                }
                const created = await prisma.salary.create({
                    data: {
                        staffId: s.id,
                        month,
                        baseSalary: s.salary,
                        total: s.salary,
                        bonus: 0,
                        deduction: 0,
                        paid: false,
                    },
                });
                results.push({ staffId: s.id, id: created.id, total: created.total });
            } catch {/* silent */}
        }
        invalidate(NS.FINANCE);
        res.json({ generated: results.length, results });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Staff attendance ─────────────────────────────────────────────────────────
router.get('/attendance', requireAuth, async (req, res) => {
    try {
        const { staffId, from, to } = req.query as Record<string, string>;
        const where: any = {};
        if (staffId) where.staffId = staffId;
        if (from || to) {
            where.date = {};
            if (from) where.date.gte = from;
            if (to) where.date.lte = to;
        }
        const data = await prisma.staffAttendance.findMany({
            where,
            include: { staff: { select: { name: true } } },
            orderBy: { date: 'desc' },
            take: 200,
        });
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/attendance', requireAuth, async (req, res) => {
    try {
        const { staffId, date, checkIn, checkOut, status = 'present', notes } = req.body;
        if (!staffId || !date) return res.status(400).json({ message: 'staffId va date kerak' });
        const data = { staffId, date, checkIn, checkOut, status, notes };
        const att = await prisma.staffAttendance.upsert({
            where: { staffId_date: { staffId, date } },
            create: data,
            update: data,
        });
        res.json(att);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
