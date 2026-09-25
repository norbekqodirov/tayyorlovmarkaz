import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import { idempotent } from '../middleware/idempotency.js';
import { invalidate, NS } from '../services/cache.js';
import { emitToAdmins } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';
import { todayDateStr } from '../utils/timezone.js';
import { applyOutstandingAdvances, getOutstandingAdvanceTotal } from '../services/staffAdvance.js';
import { payrollDeleteBlock, releaseAdvanceApplications } from '../services/moneyReversal.js';

const router = express.Router();

// Finance-audit (2026-09-16), F13 tuzatish: bu fayldagi barcha route'lar
// ilgari faqat requireMinRole('MANAGER')ga tayanardi — /finance/* va
// /finance/teacher-payroll/* esa xuddi shu maosh/moliya ma'lumoti uchun
// QO'SHIMCHA `requirePermission('finance')`ni talab qiladi. Amalda bu
// MANAGER darajasidagi, lekin DB Role/Permission tizimida 'finance'
// ruxsati BERILMAGAN foydalanuvchi uchun izchilsizlik edi — /finance/*'da
// 403 olsa-da, /salary/*'da ochiq qolardi.
//
// Payroll-avans (2026-09-17): ko'rish/hisoblash (GET, oylik loyihasini
// saqlash) endi 'finance' YOKI 'payroll_review' (HR) bilan yetarli —
// tasdiqlash tushunchasi Salary'da yo'q, lekin pul chiqadigan yagona amal
// (to'lov) hamon FAQAT 'finance' bilan cheklangan (ADMIN/SUPER_ADMIN har
// doim FULL_ACCESS_ROLES orqali o'tadi — bu CrmStaffDetail.tsx oqimini
// buzmaydi).
const canReview = requireAnyPermission(['finance', 'payroll_review']);
const canManageMoney = requirePermission('finance');

function remainingOf(row: { total: number; paidAmount: number; advanceApplied: number }): number {
    return Math.max(0, row.total - row.paidAmount - row.advanceApplied);
}

// GET /api/salary?month=YYYY-MM
// SEC-04 tuzatish: ilgari faqat requireAuth bor edi — istalgan login qilgan
// TEACHER butun markazdagi HAMMA xodimning oyligini (asosiy/bonus/total)
// ko'ra olardi. Maosh ma'lumoti HR-maxfiy, MANAGER+ talab qilinadi.
router.get('/', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
    try {
        const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
        const salaries = await prisma.salary.findMany({
            where: { month },
            include: { staff: { select: { id: true, name: true, role: true, salary: true, photo: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(salaries.map(s => ({ ...s, remaining: remainingOf(s) })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/salary/staff/:staffId  — staff's full salary history
// SEC-04 tuzatish: xuddi shu sabab bilan MANAGER+.
router.get('/staff/:staffId', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
    try {
        const salaries = await prisma.salary.findMany({
            where: { staffId: req.params.staffId },
            orderBy: { month: 'desc' },
            take: 24,
        });
        res.json(salaries.map(s => ({ ...s, remaining: remainingOf(s) })));
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
router.post('/', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
    try {
        const { staffId, month, baseSalary = 0, bonus = 0, deduction = 0, notes } = req.body;
        if (!staffId || !month) {
            return res.status(400).json({ message: 'staffId va month kiritilishi shart' });
        }

        const existing = await prisma.salary.findUnique({ where: { staffId_month: { staffId, month } } });
        if (existing?.paid) {
            return res.status(400).json({ message: "To'langan oylik yozuvini bu yo'l orqali o'zgartirib bo'lmaydi" });
        }
        // Payroll-avans (2026-09-17): birinchi to'lov (yoki avans qoplash)
        // sodir bo'lgandan keyin ham baseSalary/bonus/deduction'ni "Saqlash"
        // orqali o'zgartirish paidAmount/advanceApplied bilan mos kelmay
        // qolishi mumkin (masalan jami kamaytirilsa, allaqachon to'langan
        // summadan kam bo'lib qoladi) — shuning uchun qisman to'lovdan
        // keyin ham bu yo'l orqali tuzatish endi bloklanadi.
        if (existing && (existing.paidAmount > 0 || existing.advanceApplied > 0)) {
            return res.status(400).json({ message: "Bu oylikka allaqachon to'lov/avans qo'llanilgan — endi tarkibini o'zgartirib bo'lmaydi" });
        }

        const total = Number(baseSalary) + Number(bonus) - Number(deduction);
        // Finance-audit (2026-09-16), O07 tuzatish: `paid` ilgari request
        // body'dan olinardi — chaqiruvchi `paid:true`ni to'g'ridan-to'g'ri
        // yuborsa, hech qanday xarajat (Transaction) yozuvisiz "to'landi" deb
        // belgilash mumkin edi. Joriy UI hech qachon `paid` yubormaydi, lekin
        // API darajasida bu teshik ochiq edi. Endi bu yo'l orqali yaratilgan/
        // yangilangan yozuv HAR DOIM `paid:false` bilan boshlanadi — "to'landi"
        // holatiga o'tish FAQAT `PUT /:id/pay` orqali (u yerda xarajat yozuvi
        // bilan bitta $transaction ichida atomar).
        const data = {
            staffId,
            month,
            baseSalary: Number(baseSalary),
            bonus: Number(bonus),
            deduction: Number(deduction),
            total,
            paid: false,
            paidAt: null,
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

        const outstandingAdvance = await getOutstandingAdvanceTotal(prisma, 'staff', staffId);
        res.json({ ...salary, remaining: remainingOf(salary), outstandingAdvance });
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
// PUT /api/salary/:id/pay — qisman/to'liq to'lov qayd etish.
// Payroll-avans (2026-09-17): ilgari bu yo'l FAQAT to'liq to'lov edi
// (`paid:true` bittada). Endi TeacherPayroll bilan bir xil qisman to'lov
// naqshi — `amount` berilmasa (eski chaqiruvlar bilan moslik uchun) hozirgi
// qoldiqning HAMMASI to'lanadi. BIRINCHI to'lov chaqiruvida (hali hech
// qanday to'lov/avans qo'llanilmagan bo'lsa) shu xodimning oldindan
// berilgan (StaffAdvance) qoldig'i avtomatik shu oylikka hisobga olinadi —
// "hisoblanishi to'lanishi degani emas, lekin avans yo'qolib ketmaydi"
// talabi shu yerda ham bajariladi.
router.put('/:id/pay', requireAuth, requireMinRole('MANAGER'), canManageMoney, idempotent('salary_pay'), async (req, res) => {
    try {
        const salary = await prisma.salary.findUnique({
            where: { id: req.params.id },
            include: { staff: true },
        });
        if (!salary) return res.status(404).json({ message: 'Topilmadi' });
        if (salary.paid) return res.status(400).json({ message: "Allaqachon to'langan" });

        const isFirstPayout = salary.paidAmount === 0 && salary.advanceApplied === 0;
        // Birinchi chaqiruvda avans qoplanishi mumkinligi uchun, "qoldiq"ni
        // hisoblashdan oldin qancha avans qoplanishi mumkinligini bilib olamiz.
        const potentialAdvance = isFirstPayout
            ? Math.min(await getOutstandingAdvanceTotal(prisma, 'staff', salary.staffId), salary.total)
            : 0;
        const remainingAfterAdvance = Math.max(0, salary.total - salary.paidAmount - salary.advanceApplied - potentialAdvance);

        const requestedAmount = req.body.amount !== undefined ? Number(req.body.amount) : remainingAfterAdvance;
        if (!Number.isFinite(requestedAmount) || requestedAmount < 0) {
            return res.status(400).json({ message: "Summa manfiy bo'lmagan son bo'lishi kerak" });
        }
        if (requestedAmount > remainingAfterAdvance) {
            return res.status(400).json({ message: `Qoldiqdan (${remainingAfterAdvance}) ortiq summa to'lanmaydi` });
        }
        if (requestedAmount === 0 && potentialAdvance === 0) {
            return res.status(400).json({ message: "To'lov summasi 0 bo'lishi mumkin emas" });
        }

        const todayStr = todayDateStr();
        const result = await prisma.$transaction(async (tx) => {
            // Guard-only yozuv (real qiymatni o'ziga qaytarib qo'yadi) — bu
            // shu $transaction ichidagi BIRINCHI yozuv bo'lgani uchun,
            // muvaffaqiyatsiz bo'lsa (count===0) hali hech narsa
            // o'zgartirilmagan, oddiy `return` bilan xavfsiz chiqish mumkin.
            const { count } = await tx.salary.updateMany({
                where: { id: req.params.id, paidAmount: salary.paidAmount, advanceApplied: salary.advanceApplied },
                data: { paidAmount: salary.paidAmount },
            });
            if (count === 0) return { applied: false };

            const advanceApplied = isFirstPayout
                ? await applyOutstandingAdvances(tx, 'staff', salary.staffId, salary.total, 'salary', salary.id)
                : 0;

            const newPaidAmount = salary.paidAmount + requestedAmount;
            const willBeFullyPaid = newPaidAmount + salary.advanceApplied + advanceApplied >= salary.total;

            await tx.salary.update({
                where: { id: req.params.id },
                data: {
                    paidAmount: newPaidAmount,
                    advanceApplied: salary.advanceApplied + advanceApplied,
                    paid: willBeFullyPaid,
                    paidAt: willBeFullyPaid ? new Date() : null,
                },
            });

            if (requestedAmount > 0) {
                await tx.transaction.create({
                    data: {
                        type: 'expense',
                        amount: requestedAmount,
                        category: 'Oylik',
                        description: `${salary.staff.name} - ${salary.month} oyligi`,
                        date: todayStr,
                        method: req.body.method || 'Bank',
                        staffId: salary.staffId,
                        staffName: salary.staff.name,
                        sourceType: 'salary',
                        sourceId: salary.id,
                    },
                });
            }
            const updated = await tx.salary.findUnique({ where: { id: req.params.id } });
            return { applied: true, updated };
        });

        if (!result.applied) {
            return res.status(409).json({ message: "Boshqa so'rov shu vaqtda to'lov qildi — qoldiqni yangilab qayta urinib ko'ring" });
        }

        invalidate(NS.FINANCE);
        invalidate(NS.ANALYTICS);
        emitToAdmins('salary:paid', result.updated);

        // F22 tuzatish: real naqd/bank to'lov — Audit Jurnali'ga yoziladi.
        const payer = (req as any).user;
        await logAudit({
            userId: payer?.id, userName: payer?.name || 'system',
            action: 'update', resource: 'salary', resourceId: req.params.id,
            after: { paidAmount: requestedAmount, method: req.body.method || 'Bank', newStatus: result.updated!.paid ? 'paid' : 'partial' },
        });

        res.json({ ...result.updated, remaining: remainingOf(result.updated!) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/salary/:id/payouts — O12 tuzatish (2026-09-16 audit): TeacherPayroll
// bilan bir xil — har bir alohida to'lov/avans-qoplash hodisasini xronologik
// ko'rsatadi, faqat davr darajasidagi jami emas.
router.get('/:id/payouts', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
    try {
        const [transactions, advanceApplications] = await Promise.all([
            prisma.transaction.findMany({
                where: { sourceType: 'salary', sourceId: req.params.id, voidedAt: null }, // IP-17: bekor qilinganlar — kassa tarixida
                orderBy: { createdAt: 'desc' },
            }),
            prisma.staffAdvanceApplication.findMany({
                where: { appliedToType: 'salary', appliedToId: req.params.id },
                include: { advance: { select: { date: true, method: true } } },
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        const events = [
            ...transactions.map(t => ({
                kind: 'payout' as const, id: t.id, date: t.date, amount: t.amount,
                method: t.method, createdAt: t.createdAt,
            })),
            ...advanceApplications.map(a => ({
                kind: 'advance' as const, id: a.id, date: a.advance.date, amount: a.amount,
                method: a.advance.method, createdAt: a.createdAt,
            })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/salary/:id
// RF-05 tuzatish: to'langan oylik yozuvini o'chirishga hech qanday cheklov
// yo'q edi — real xarajat yozuvi (Transaction) qolgan holda payroll yozuvi
// yo'qolib, tarixiy hisobot manbasiz qolib ketardi.
// Moliya-audit (2026-09-22, foydalanuvchi so'rovi): ilgari to'langan
// (paid=true) yozuvni o'chirib bo'lmasdi — xato yaratilgan yoki test uchun
// ishlatilgan yozuvni tozalashning yo'li yo'q edi. Endi teacherPayroll.ts
// bilan bir xil naqsh: har qanday holatdagi yozuv o'chiriladi, lekin bog'liq
// Transaction'lar ham o'chiriladi va qo'llanilgan StaffAdvance(lar)ning
// `remaining`i orqaga qaytariladi — hech narsa jimgina yo'qolib qolmaydi.
router.delete('/:id', requireAuth, requireMinRole('MANAGER'), canManageMoney, async (req, res) => {
    try {
        const salary = await prisma.salary.findUnique({ where: { id: req.params.id } });
        if (!salary) return res.status(404).json({ message: 'Topilmadi' });
        // IP-17 (OQ-12): to'lov berilgan yoki oyi yopilgan oylik o'chirilmaydi — avval
        // to'lovlar Tranzaksiyalar'da «Bekor qilish» orqali qaytariladi (kassa izi qoladi).
        const block = await payrollDeleteBlock(prisma, 'salary', salary.id, salary.month, salary.paidAmount);
        if (block) return res.status(block.status).json({ message: block.message, error: block.message, code: block.code });

        await prisma.$transaction(async (tx) => {
            await releaseAdvanceApplications(tx, 'salary', salary.id);
            await tx.salary.delete({ where: { id: salary.id } });
        });

        invalidate(NS.FINANCE);
        const remover = (req as any).user;
        await logAudit({
            userId: remover?.id, userName: remover?.name || 'system',
            action: 'delete', resource: 'salary', resourceId: salary.id,
            before: { staffId: salary.staffId, month: salary.month, paid: salary.paid, total: salary.total, paidAmount: salary.paidAmount, advanceApplied: salary.advanceApplied },
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/salary/generate-month — bulk generate salaries for all staff for given month
router.post('/generate-month', requireAuth, requireMinRole('MANAGER'), canManageMoney, async (req, res) => {
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
router.get('/attendance', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
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
// staffPortal.ts orqali o'tadi, bu yerga tegishli emas). Payroll-avans
// (2026-09-17): bu tabel/hisoblashga tegishli tuzatish, shuning uchun
// 'payroll_review' (HR) bilan ham ochiq.
router.post('/attendance', requireAuth, requireMinRole('MANAGER'), canReview, async (req, res) => {
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
