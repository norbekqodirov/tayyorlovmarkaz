/**
 * server/routes/students.ts
 * Student profile endpoint with full relational data
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { withAudit, logAudit } from '../middleware/audit.js';
import { requirePermission } from '../middleware/authorize.js';

const router = express.Router();

// GET /api/students/:id — full profile with relations
// SEC-04 tuzatish: ilgari faqat requireAuth bor edi — HAR QANDAY login
// qilgan TEACHER istalgan o'quvchining to'liq profilini (to'lovlar,
// invoice'lar, davomat tarixi jumladan) ko'ra olardi, o'ziga tegishli
// guruhdan qat'i nazar. Endi TEACHER faqat o'z guruhidagi o'quvchini
// ko'ra oladi; MANAGER+ cheklovsiz (mavjud xatti-harakat saqlanadi).
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        const student = await prisma.student.findUnique({
            where: { id: req.params.id },
            include: {
                enrollments: {
                    include: {
                        group: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                teacherId: true,
                                course: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                payments: { orderBy: { date: 'desc' } },
                assessments: { orderBy: { date: 'desc' } },
                attendanceRecords: { orderBy: { date: 'desc' } },
                invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });

        if (!student) return res.status(404).json({ error: 'Talaba topilmadi' });

        if (requester.role === 'TEACHER') {
            const owns = student.enrollments.some((e: any) => e.group?.teacherId === requester.id);
            if (!owns) return res.status(403).json({ error: "Bu o'quvchiga tegishli emassiz" });
        }

        res.json(student);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/students/:id — o'quvchining SHAXSIY ma'lumotlarini yangilash.
// MANAGER+ va `students` ruxsati (RX-03). IP-02 (ML-03): `balance` va
// `paymentStatus` bu yerda ATAYLAB qabul qilinmaydi — ilgari tahrirlash
// formasi butun formData'ni (jumladan oynani ochgan paytdagi eski balansni)
// qayta yuborardi va shu orada kassir kiritgan to'lov balansdan "yo'qolardi";
// guruh almashtirilganda esa balans `-narx` bilan ustidan yozilardi. Balans
// endi faqat to'lov oqimlari va pastdagi sababli tuzatish orqali o'zgaradi.
router.put('/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('students'), withAudit('student'), async (req, res) => {
    try {
        const allowed = ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone',
            'source', 'status', 'notes', 'photo', 'course', 'group', 'joinedDate'];
        const data: Record<string, any> = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) data[key] = req.body[key];
        }
        const student = await prisma.student.update({ where: { id: req.params.id }, data });
        res.json(student);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/students/:id/balance-adjustments — IP-02: balansni SABABLI tuzatish.
// Boshlang'ich qoldiq (eski qarz/avans) yoki qo'lda tuzatish uchun yagona yo'l:
// atomar `increment` (poyga holatisiz), sabab majburiy, oldingi/keyingi qiymat
// audit jurnaliga yoziladi. Kassaga pul yozuvi YARATMAYDI — bu to'lov emas.
// Hisob tizimi (IP-11) joriy qilingach, bu "opening_balance/adjustment" hisobiga
// aylanadi.
router.post('/:id/balance-adjustments', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const amount = Number(req.body?.amount);
        const reason = String(req.body?.reason || '').trim();
        if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0) {
            return res.status(400).json({ message: "Summa noldan farqli butun son bo'lishi kerak (qarz uchun manfiy, avans uchun musbat)" });
        }
        if (Math.abs(amount) > 1_000_000_000) {
            return res.status(400).json({ message: "Summa juda katta — tekshirib qayta kiriting" });
        }
        if (reason.length < 3) {
            return res.status(400).json({ message: "Tuzatish sababini yozing (kamida 3 belgi)" });
        }
        const existing = await prisma.student.findUnique({ where: { id: req.params.id }, select: { id: true, balance: true } });
        if (!existing) return res.status(404).json({ message: "O'quvchi topilmadi" });

        const updated = await prisma.$transaction(async (tx) => {
            const s = await tx.student.update({ where: { id: existing.id }, data: { balance: { increment: amount } } });
            return tx.student.update({
                where: { id: existing.id },
                data: { paymentStatus: (s.balance ?? 0) < 0 ? 'Qarzdorlik' : 'Tolov qilingan' },
                select: { id: true, balance: true, paymentStatus: true },
            });
        });

        const actor = (req as any).user;
        await logAudit({
            userId: actor?.id, userName: actor?.name || 'system',
            action: 'balance_adjustment', resource: 'student', resourceId: existing.id,
            before: { balance: existing.balance ?? 0 },
            after: { balance: updated.balance },
            metadata: { amount, reason },
        });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
