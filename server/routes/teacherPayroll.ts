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
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import { idempotent } from '../middleware/idempotency.js';
import { todayDateStr } from '../utils/timezone.js';
import { calculateTeacherPayroll, PayrollBasis } from '../services/teacherPayroll.js';
import { applyOutstandingAdvances, getOutstandingAdvanceTotal } from '../services/staffAdvance.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// Payroll-avans partiyasi (2026-09-17): ilgari HAMMA route 'finance'ni
// talab qilardi. Foydalanuvchi so'rovi — oylik HISOBLASH (davomat/tabelni
// ko'rib chiqish) HR'ga tegishli bo'lishi mumkin, TASDIQLASH/TO'LOV esa
// pul harakati yaratadigan, moliyaviy vakolat talab qiladigan amal. Endi:
// - ko'rish/hisoblash (preview, list, draft yaratish/qayta hisoblash) —
//   'finance' YOKI 'payroll_review' (HR) yetarli;
// - tasdiqlash/to'lov/o'chirish — FAQAT 'finance'.
router.use(requireAuth, requireMinRole('MANAGER'));
const canReview = requireAnyPermission(['finance', 'payroll_review']);
const canManageMoney = requirePermission('finance');

function parseBasis(raw: any): PayrollBasis {
    return raw === 'cash' ? 'cash' : 'accrual';
}

function remainingOf(row: { accruedAmount: number; paidAmount: number; advanceApplied: number }): number {
    return Math.max(0, row.accruedAmount - row.paidAmount - row.advanceApplied);
}

// GET /api/finance/teacher-payroll/teachers-list — Finance-audit (2026-09-16),
// O01 tuzatish. CrmTeacherPayroll.tsx ilgari `/auth/users`ni chaqirardi —
// bu endpoint ADMIN+ talab qiladi (server/routes/auth.ts), MANAGER esa 403
// olib, `.catch(() => {})` uni jimgina yutar edi — natijada MANAGER uchun
// o'qituvchilar ro'yxati doim BO'SH ko'rinardi (xatosiz, tushunarsiz holda).
// Bu yerda 'finance' ruxsati allaqachon yuqorida tekshirilgan (router.use),
// shuning uchun tor, faqat kerakli maydonlarni qaytaruvchi maxsus endpoint —
// email/telefon/permissions kabi HR-maxfiy ma'lumotlarsiz.
router.get('/teachers-list', canReview, async (_req, res) => {
    try {
        const teachers = await prisma.user.findMany({
            where: { role: 'TEACHER', isActive: true },
            select: { id: true, name: true, subject: true, salaryPercent: true },
            orderBy: { name: 'asc' },
        });
        res.json(teachers);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-payroll/preview?teacherId=&year=&month=&basis=
// Faqat hisoblash — hech narsa yozilmaydi (draft ham yaratilmaydi).
router.get('/preview', canReview, async (req, res) => {
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
router.get('/:teacherId/staff-attendance', canReview, async (req, res) => {
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

// GET /api/finance/teacher-payroll/group/:groupId/attendance-matrix?month=YYYY-MM
// O13 tuzatish (2026-09-16 audit, dizayn namunasi): guruh tabelida ilgari
// faqat har o'quvchining OYLIK QOLDIRGAN DARSLAR SONI ko'rinardi (masalan
// "3 kun") — HR aynan QAYSI sanalarda kelmagani/kelganini ko'ra olmasdi.
// Endi sana x o'quvchi matritsasi — har katakcha shu kundagi holat (yoki
// yozuv umuman yo'q bo'lsa `null`, "avtomatik kelmadi" deb taxmin
// QILINMAYDI).
router.get('/group/:groupId/attendance-matrix', canReview, async (req, res) => {
    try {
        const { month } = req.query as { month?: string };
        if (!month) return res.status(400).json({ message: 'month talab qilinadi' });

        const group = await prisma.group.findUnique({
            where: { id: req.params.groupId },
            select: {
                name: true,
                enrollments: { select: { student: { select: { id: true, name: true } } } },
            },
        });
        if (!group) return res.status(404).json({ message: 'Guruh topilmadi' });

        const records = await prisma.attendanceRecord.findMany({
            where: { groupId: req.params.groupId, date: { startsWith: month } },
            select: { studentId: true, date: true, status: true },
        });

        const dates = Array.from(new Set(records.map(r => r.date))).sort();
        const cellsByStudent = new Map<string, Map<string, string>>();
        for (const r of records) {
            if (!cellsByStudent.has(r.studentId)) cellsByStudent.set(r.studentId, new Map());
            cellsByStudent.get(r.studentId)!.set(r.date, r.status);
        }

        const students = group.enrollments.map(e => ({
            studentId: e.student.id,
            studentName: e.student.name,
            cells: dates.map(d => cellsByStudent.get(e.student.id)?.get(d) ?? null),
        }));

        res.json({ groupName: group.name, dates, students });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-payroll?teacherId=&month=
router.get('/', canReview, async (req, res) => {
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
        // UI moliyaviy formulani mustaqil takrorlamasin — server har doim
        // authoritative `remaining`ni ham qaytaradi.
        res.json(rows.map(r => ({ ...r, remaining: remainingOf(r) })));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll — draft yaratish/qayta hisoblash
// Faqat hali DRAFT bo'lgan (yoki mavjud bo'lmagan) yozuv uchun ishlaydi —
// tasdiqlangan/to'langan yozuv bu yo'l orqali umuman o'zgartirilmaydi.
router.post('/', canReview, async (req, res) => {
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

        // Finance-audit (2026-09-16), O02 tuzatish: unikallik teacherId+month+
        // basis bo'yicha edi — accrual VA cash uchun bitta davrda ikkita
        // MUSTAQIL, ikkalasi ham to'lanadigan yozuv yaratish mumkin edi (ikki
        // barobar to'lov xavfi). Bitta davr uchun faqat BITTA usul (basis)
        // tasdiqlanishi/to'lanishi mumkin — boshqa usul allaqachon
        // tasdiqlangan/to'langan bo'lsa, bu usulda draft yaratish ham
        // bloklanadi (foydalanuvchi avval qaysi usul ishlatilishini tanlashi
        // kerak).
        const otherBasis: PayrollBasis = basis === 'cash' ? 'accrual' : 'cash';
        const otherBasisRow = await prisma.teacherPayroll.findUnique({
            where: { teacherId_month_basis: { teacherId, month: monthStr, basis: otherBasis } },
        });
        if (otherBasisRow && otherBasisRow.status !== 'draft') {
            return res.status(400).json({
                message: `Bu davr uchun boshqa usul (${otherBasis === 'cash' ? "tushgan to'lovdan" : 'hisoblangan'}) bo'yicha oylik allaqachon tasdiqlangan — bitta davr uchun faqat bitta usul ishlatiladi`,
            });
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
        const outstandingAdvance = await getOutstandingAdvanceTotal(prisma, 'teacher', teacherId);
        res.json({ ...payroll, remaining: remainingOf(payroll), outstandingAdvance });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll/:id/approve — draft -> approved, summa muzlaydi.
// Payroll-avans (2026-09-17): shu daqiqada xodimning HALI qoplanmagan
// avanslari (agar bo'lsa) yangi tasdiqlangan summadan avtomatik qoplanadi —
// "hisoblanishi to'lanishi degani emas, lekin oldindan berilgan pul ham
// yo'qolib ketmasin, shu davrga hisobga olinsin" talabi shu yerda bajariladi.
router.post('/:id/approve', canManageMoney, async (req, res) => {
    try {
        const draft = await prisma.teacherPayroll.findUnique({ where: { id: req.params.id } });
        if (!draft) return res.status(404).json({ message: 'Topilmadi' });

        // O08 tuzatish (2026-09-16 audit): HR bir summani ko'rib turgan
        // paytda (masalan sahifa ochilgandan beri) boshqa foydalanuvchi
        // "Qayta hisoblash" bosib, tasdiqlanmagan draftni YANGI summaga
        // o'zgartirgan bo'lishi mumkin — HR keyin "Tasdiqlash"ni bossa,
        // aslida hech qachon ko'rmagan (yangilangan) summani tasdiqlab
        // qo'yadi. `expectedAmount` frontend HR ekranida ko'rgan summani
        // yuboradi; agar draft'ning joriy holati bilan mos kelmasa,
        // tasdiqlash rad etiladi va sahifani yangilash so'raladi.
        const { expectedAmount } = req.body as { expectedAmount?: number };
        if (expectedAmount !== undefined && Math.round(expectedAmount) !== Math.round(draft.accruedAmount)) {
            return res.status(409).json({
                message: `Bu davr allaqachon qayta hisoblangan — ko'rgan summangiz (${expectedAmount}) joriy hisobdan (${draft.accruedAmount}) farq qiladi. Sahifani yangilab, qayta ko'rib chiqing.`,
            });
        }

        // O02 tuzatish: draft yaratishda tekshirilgan bo'lsa ham, orada boshqa
        // usul bo'yicha alohida draft tasdiqlangan/to'langan bo'lib qolishi
        // mumkin (poyga holati) — tasdiqlashdan oldin YANA tekshiriladi.
        const otherBasis: PayrollBasis = draft.basis === 'cash' ? 'accrual' : 'cash';
        const otherBasisRow = await prisma.teacherPayroll.findUnique({
            where: { teacherId_month_basis: { teacherId: draft.teacherId, month: draft.month, basis: otherBasis } },
        });
        if (otherBasisRow && otherBasisRow.status !== 'draft') {
            return res.status(400).json({
                message: `Bu davr uchun boshqa usul (${otherBasis === 'cash' ? "tushgan to'lovdan" : 'hisoblangan'}) bo'yicha oylik allaqachon tasdiqlangan — bitta davr uchun faqat bitta usul ishlatiladi`,
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const { count } = await tx.teacherPayroll.updateMany({
                where: { id: req.params.id, status: 'draft' },
                data: { status: 'approved', approvedAt: new Date() },
            });
            if (count === 0) return { applied: false };

            const advanceApplied = await applyOutstandingAdvances(
                tx, 'teacher', draft.teacherId, draft.accruedAmount, 'teacher_payroll', draft.id,
            );
            const willBeFullyCovered = advanceApplied >= draft.accruedAmount;
            const updated = await tx.teacherPayroll.update({
                where: { id: req.params.id },
                data: {
                    advanceApplied,
                    status: willBeFullyCovered ? 'paid' : 'approved',
                },
            });
            return { applied: true, updated };
        });

        if (!result.applied) {
            return res.status(400).json({ message: "Faqat 'draft' holatidagi yozuv tasdiqlanishi mumkin" });
        }

        // F22 tuzatish: tasdiqlash (summa muzlashi) real moliyaviy hodisa —
        // markazlashgan Audit Jurnali'ga yoziladi.
        const approver = (req as any).user;
        await logAudit({
            userId: approver?.id, userName: approver?.name || 'system',
            action: 'update', resource: 'teacherPayroll', resourceId: req.params.id,
            after: { status: result.updated!.status, accruedAmount: result.updated!.accruedAmount, advanceApplied: result.updated!.advanceApplied },
        });

        res.json({ ...result.updated, remaining: remainingOf(result.updated!) });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/finance/teacher-payroll/:id/pay — qisman/to'liq to'lov qayd etish
// RF-03/RF-04 bilan bir xil atomar naqsh: holat/qoldiq tekshiruvi va
// Transaction yozuvi BITTA $transaction ichida.
router.post('/:id/pay', canManageMoney, idempotent('teacher_payroll_pay'), async (req, res) => {
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
        const remaining = remainingOf(payroll);
        if (numAmount > remaining) {
            return res.status(400).json({ message: `Qoldiqdan (${remaining}) ortiq summa to'lanmaydi` });
        }

        const todayStr = todayDateStr();
        const result = await prisma.$transaction(async (tx) => {
            const newPaidAmount = payroll.paidAmount + numAmount;
            const willBeFullyPaid = newPaidAmount + payroll.advanceApplied >= payroll.accruedAmount;

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

        // F22 tuzatish: real naqd/bank to'lov — Audit Jurnali'ga yoziladi.
        const payer = (req as any).user;
        await logAudit({
            userId: payer?.id, userName: payer?.name || 'system',
            action: 'update', resource: 'teacherPayroll', resourceId: req.params.id,
            after: { paidAmount: numAmount, method: method || 'Bank', newStatus: result.updated!.status },
        });

        res.json({ ...result.updated, remaining: remainingOf(result.updated!) });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/finance/teacher-payroll/:id/payouts — O12 tuzatish (2026-09-16
// audit): "Tarix" ilgari faqat davr darajasidagi jami holatni ko'rsatardi —
// har bir ALOHIDA to'lov hodisasi (sana/summa/usul) ko'rinmasdi. Endi
// naqd/bank to'lovlar (Transaction) va avtomatik avans qoplashlar
// (StaffAdvanceApplication) bitta xronologik ro'yxatga birlashtiriladi.
router.get('/:id/payouts', canReview, async (req, res) => {
    try {
        const [transactions, advanceApplications] = await Promise.all([
            prisma.transaction.findMany({
                where: { sourceType: 'teacher_payroll', sourceId: req.params.id },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.staffAdvanceApplication.findMany({
                where: { appliedToType: 'teacher_payroll', appliedToId: req.params.id },
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
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/finance/teacher-payroll/:id — Moliya-audit (2026-09-22,
// foydalanuvchi so'rovi): ilgari FAQAT 'draft' holatidagi yozuvni o'chirish
// mumkin edi — tasdiqlangan/to'langan (xato yaratilgan yoki test uchun
// ishlatilgan) yozuvni tozalashning umuman yo'li yo'q edi. Endi har qanday
// holatdagi yozuv o'chirilishi mumkin, LEKIN to'liq, atomar qaytarish bilan:
// unga bog'langan har bir to'lov Transaction'i o'chiriladi, va agar shu
// davrga biror StaffAdvance qisman/to'liq QO'LLANILGAN bo'lsa (advanceApplied),
// o'sha avansning `remaining`i ORQAGA qaytariladi (aks holda avans "berilgan
// va sarflangan" bo'lib qolib, hech qayerda ko'rinmay qolardi).
router.delete('/:id', canManageMoney, async (req, res) => {
    try {
        const payroll = await prisma.teacherPayroll.findUnique({ where: { id: req.params.id } });
        if (!payroll) return res.status(404).json({ message: 'Topilmadi' });

        await prisma.$transaction(async (tx) => {
            await tx.transaction.deleteMany({ where: { sourceType: 'teacher_payroll', sourceId: payroll.id } });
            const applications = await tx.staffAdvanceApplication.findMany({ where: { appliedToType: 'teacher_payroll', appliedToId: payroll.id } });
            for (const app of applications) {
                await tx.staffAdvance.update({ where: { id: app.advanceId }, data: { remaining: { increment: app.amount } } });
            }
            await tx.staffAdvanceApplication.deleteMany({ where: { appliedToType: 'teacher_payroll', appliedToId: payroll.id } });
            await tx.teacherPayroll.delete({ where: { id: payroll.id } });
        });

        const remover = (req as any).user;
        await logAudit({
            userId: remover?.id, userName: remover?.name || 'system',
            action: 'delete', resource: 'teacherPayroll', resourceId: payroll.id,
            before: { teacherId: payroll.teacherId, month: payroll.month, status: payroll.status, accruedAmount: payroll.accruedAmount, paidAmount: payroll.paidAmount, advanceApplied: payroll.advanceApplied },
        });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
