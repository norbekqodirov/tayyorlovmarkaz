import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { invalidate, NS } from '../services/cache.js';
import { emitToAdmins } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();

// Finance-audit (2026-09-16), F13 tuzatish: bu fayldagi barcha route'lar
// ilgari faqat requireMinRole('MANAGER')ga tayanardi — /finance/* va
// /finance/teacher-payroll/* esa xuddi shu maosh/moliya ma'lumoti uchun
// QO'SHIMCHA `requirePermission('finance')`ni talab qiladi. Amalda bu
// MANAGER darajasidagi, lekin DB Role/Permission tizimida 'finance'
// ruxsati BERILMAGAN foydalanuvchi uchun izchilsizlik edi — /finance/*'da
// 403 olsa-da, /salary/*'da ochiq qolardi. Endi har bir route'da ham
// requireMinRole('MANAGER') YONIDA requirePermission('finance') talab
// qilinadi (ADMIN/SUPER_ADMIN har doim FULL_ACCESS_ROLES orqali o'tadi —
// authorize.ts'ga q. — shuning uchun bu qo'shimcha tekshiruv ADMIN-only
// CrmStaffDetail.tsx oqimini buzmaydi).

// GET /api/salary?month=YYYY-MM
// SEC-04 tuzatish: ilgari faqat requireAuth bor edi — istalgan login qilgan
// TEACHER butun markazdagi HAMMA xodimning oyligini (asosiy/bonus/total)
// ko'ra olardi. Maosh ma'lumoti HR-maxfiy, MANAGER+ talab qilinadi.
router.get('/', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
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
// SEC-04 tuzatish: xuddi shu sabab bilan MANAGER+.
router.get('/staff/:staffId', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
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
// RF-05 tuzatish: ilgari `upsert` allaqachon `paid:true` bo'lgan yozuvni ham
// so'rovdagi `paid` qiymati bilan (hatto false'ga!) cheklovsiz qayta yozardi —
// to'langan oylikni "to'lanmagan" deb ko'rsatib, keyin PUT /:id/pay orqali
// IKKINCHI marta xarajat yozib bo'lardi. Endi to'langan yozuv shu yo'l orqali
// UMUMAN o'zgartirilmaydi — tuzatish kerak bo'lsa alohida jarayon (hozircha
// mavjud emas) kerak bo'ladi.
router.post('/', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const { staffId, month, baseSalary = 0, bonus = 0, deduction = 0, notes, paid = false } = req.body;
        if (!staffId || !month) {
            return res.status(400).json({ message: 'staffId va month kiritilishi shart' });
        }

        const existing = await prisma.salary.findUnique({ where: { staffId_month: { staffId, month } } });
        if (existing?.paid) {
            return res.status(400).json({ message: "To'langan oylik yozuvini bu yo'l orqali o'zgartirib bo'lmaydi" });
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
// RF-04 tuzatish: ilgari holat o'zgarishi va xarajat yozuvi IKKI ALOHIDA amal
// edi (tranzaksiyasiz), va xarajat yozuvi xatosi `catch {/* silent */}` bilan
// yutilardi — natijada "to'landi" deb belgilangan oylikning moliyaviy
// xarajat yozuvi umuman bo'lmasligi mumkin edi, hech qanday xato ko'rinmasdan.
// Parallel ikki so'rov ham ikkalasi `salary.paid===false`ni ko'rib, ikkalasi
// ham davom etishi mumkin edi (oddiy o'qi-tekshir-yoz poygasi). Endi holat
// o'tishi `updateMany({paid:false})` sharti bilan va xarajat yozuvi BITTA
// $transaction ichida — yoki ikkalasi ham muvaffaqiyatli, yoki hech biri.
router.put('/:id/pay', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const salary = await prisma.salary.findUnique({
            where: { id: req.params.id },
            include: { staff: true },
        });
        if (!salary) return res.status(404).json({ message: 'Topilmadi' });
        if (salary.paid) return res.status(400).json({ message: "Allaqachon to'langan" });

        const todayStr = todayDateStr();
        const result = await prisma.$transaction(async (tx) => {
            const { count } = await tx.salary.updateMany({
                where: { id: req.params.id, paid: false },
                data: { paid: true, paidAt: new Date() },
            });
            if (count === 0) return { applied: false };

            await tx.transaction.create({
                data: {
                    type: 'expense',
                    amount: salary.total,
                    category: 'Oylik',
                    description: `${salary.staff.name} - ${salary.month} oyligi`,
                    date: todayStr,
                    method: req.body.method || 'Bank',
                    staffId: salary.staffId,
                    staffName: salary.staff.name,
                },
            });
            const updated = await tx.salary.findUnique({ where: { id: req.params.id } });
            return { applied: true, updated };
        });

        if (!result.applied) return res.status(400).json({ message: "Allaqachon to'langan" });

        invalidate(NS.FINANCE);
        invalidate(NS.ANALYTICS);
        emitToAdmins('salary:paid', result.updated);

        res.json(result.updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/salary/:id
// RF-05 tuzatish: to'langan oylik yozuvini o'chirishga hech qanday cheklov
// yo'q edi — real xarajat yozuvi (Transaction) qolgan holda payroll yozuvi
// yo'qolib, tarixiy hisobot manbasiz qolib ketardi.
router.delete('/:id', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
    try {
        const salary = await prisma.salary.findUnique({ where: { id: req.params.id }, select: { paid: true } });
        if (!salary) return res.status(404).json({ message: 'Topilmadi' });
        if (salary.paid) {
            return res.status(400).json({ message: "To'langan oylik yozuvini o'chirib bo'lmaydi — moliyaviy tarix saqlanishi shart" });
        }
        await prisma.salary.delete({ where: { id: req.params.id } });
        invalidate(NS.FINANCE);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/salary/generate-month — bulk generate salaries for all staff for given month
router.post('/generate-month', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
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
// RS-03 tuzatish: yonidagi GET / va GET /staff/:staffId SEC-04'da MANAGER+ga
// cheklangan edi, lekin bu endpoint (butun markaz xodimlarining kelish-ketish
// vaqtlari) o'sha safar unutilgan — faqat requireAuth bilan qolgan edi.
router.get('/attendance', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
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

// Qo'lda tuzatish — HR/menejer vakolati talab qiladi (Face ID check-in/out
// staffPortal.ts orqali o'tadi, bu yerga tegishli emas).
router.post('/attendance', requireAuth, requireMinRole('MANAGER'), requirePermission('finance'), async (req, res) => {
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
