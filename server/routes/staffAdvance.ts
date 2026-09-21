/**
 * server/routes/staffAdvance.ts
 *
 * Payroll-avans (2026-09-17, foydalanuvchi so'rovi): xodimga (o'qituvchi
 * yoki boshqa xodim) oylik hisoblanishidan OLDIN berilgan pulni qayd etish.
 * `server/services/staffAdvance.ts`'dagi `applyOutstandingAdvances()` bu
 * yerda YARATILGAN yozuvlarni keyinchalik TeacherPayroll tasdiqlanganda
 * yoki Salary birinchi to'lovida avtomatik (FIFO) qoplaydi.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { getOutstandingAdvanceTotal } from '../services/staffAdvance.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// Avans berish/ko'rish — real pul chiqimi yaratadigan amal, shuning uchun
// (payroll HISOBLASH'dan farqli) faqat to'liq 'finance' ruxsati bilan.
router.use(requireAuth, requireMinRole('MANAGER'), requirePermission('finance'));

function isValidPersonType(v: any): v is 'teacher' | 'staff' {
    return v === 'teacher' || v === 'staff';
}

// GET /api/finance/advances?personType=&personId= — tarix + qoldiq
router.get('/', async (req, res) => {
    try {
        const { personType, personId } = req.query as Record<string, string>;
        const where: any = {};
        if (personType) where.personType = personType;
        if (personId) where.personId = personId;

        const advances = await prisma.staffAdvance.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { applications: { orderBy: { createdAt: 'desc' } } },
        });
        res.json(advances);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/advances/outstanding?personType=&personId= — tor, tez qoldiq so'rovi
router.get('/outstanding', async (req, res) => {
    try {
        const { personType, personId } = req.query as Record<string, string>;
        if (!isValidPersonType(personType) || !personId) {
            return res.status(400).json({ message: 'personType (teacher|staff) va personId talab qilinadi' });
        }
        const outstanding = await getOutstandingAdvanceTotal(prisma, personType, personId);
        res.json({ outstanding });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/advances — avans berish
router.post('/', async (req, res) => {
    try {
        const { personType, personId, amount, method, date, notes } = req.body as {
            personType: string; personId: string; amount: number; method?: string; date: string; notes?: string;
        };
        if (!isValidPersonType(personType) || !personId || !date) {
            return res.status(400).json({ message: 'personType (teacher|staff), personId va date talab qilinadi' });
        }
        const numAmount = Number(amount);
        if (!Number.isFinite(numAmount) || numAmount <= 0) {
            return res.status(400).json({ message: "Summa musbat son bo'lishi kerak" });
        }

        let personName = '';
        if (personType === 'teacher') {
            const teacher = await prisma.user.findUnique({ where: { id: personId }, select: { name: true, role: true } });
            if (!teacher || teacher.role !== 'TEACHER') return res.status(400).json({ message: "Ko'rsatilgan o'qituvchi topilmadi" });
            personName = teacher.name;
        } else {
            const staff = await prisma.staffMember.findUnique({ where: { id: personId }, select: { name: true } });
            if (!staff) return res.status(400).json({ message: "Ko'rsatilgan xodim topilmadi" });
            personName = staff.name;
        }

        const result = await prisma.$transaction(async (tx) => {
            const advance = await tx.staffAdvance.create({
                data: {
                    personType, personId, amount: numAmount, remaining: numAmount,
                    date, method: method || 'Naqd', notes,
                    createdById: (req as any).user?.id || null,
                },
            });
            await tx.transaction.create({
                data: {
                    type: 'expense',
                    amount: numAmount,
                    category: 'Avans',
                    description: `${personName} — oldindan avans`,
                    date,
                    method: method || 'Naqd',
                    staffId: personId,
                    staffName: personName,
                    sourceType: 'staff_advance',
                    sourceId: advance.id,
                },
            });
            return advance;
        });

        // F22 tuzatish: avans berish real xarajat — Audit Jurnali'ga yoziladi.
        const giver = (req as any).user;
        await logAudit({
            userId: giver?.id, userName: giver?.name || 'system',
            action: 'create', resource: 'staffAdvance', resourceId: result.id,
            after: { personType, personId, personName, amount: numAmount, method: method || 'Naqd' },
        });

        res.status(201).json(result);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
