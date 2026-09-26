/**
 * server/routes/students.ts
 * Student profile endpoint with full relational data
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { withAudit, logAudit } from '../middleware/audit.js';
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import { normalizeStudentStatus } from '../utils/studentStatus.js';
import { ensureStudentIdentitySafe } from '../services/studentIdentity.js';
import { getLedgerMode } from '../services/ledgerMode.js';
import { syncStudentBalance } from '../services/balanceCache.js';
import { todayDateStr } from '../utils/timezone.js';
import { projectStudentForTeacher } from '../domain/studentProjection.js';

const router = express.Router();

// GET /api/students/:id — full profile with relations
// SEC-04 tuzatish: ilgari faqat requireAuth bor edi — HAR QANDAY login
// qilgan TEACHER istalgan o'quvchining to'liq profilini (to'lovlar,
// invoice'lar, davomat tarixi jumladan) ko'ra olardi, o'ziga tegishli
// guruhdan qat'i nazar. Endi TEACHER faqat o'z guruhidagi o'quvchini
// ko'ra oladi; MANAGER+ cheklovsiz (mavjud xatti-harakat saqlanadi).
// IP-03 (RX-04): `students` ruxsati talab qilinadi. O'qituvchi uchun javob
// toraytiriladi — faqat o'z guruhlari a'zoligi, davomati va baholari; to'lov,
// invoice va balans umuman qaytarilmaydi (OQ-13 tavsiyasi). Ilgari ikki
// guruhli o'quvchining boshqa guruhdagi baholari va to'lovlari ham chiqardi.
// ─── GET /api/students/search?q= — TQ-D: ism, telefon yoki kod bo'yicha aniq tanlash ──
// Kassir/administrator uchun (MANAGER+, "students" yoki "finance"). SQLite'da
// case-insensitive "contains" yo'q — ro'yxat qisqa proyeksiya bilan olinib,
// normallashtirilgan holda filtrlanadi.
const normName = (s: string) => s.toLowerCase().replace(/[ʻʼ‘’`']/g, "'").replace(/\s+/g, ' ').trim();
router.get('/search', requireAuth, requireMinRole('MANAGER'), requireAnyPermission(['students', 'finance']), async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json([]);
        const nq = normName(q);
        const digits = q.replace(/\D/g, '');
        const codeQ = /^s-?\d+$/i.test(q) ? `S-${q.replace(/\D/g, '').padStart(6, '0')}` : null;
        const rows = await prisma.student.findMany({
            where: { deletedAt: null },
            select: {
                id: true, name: true, phone: true, parentPhone: true, code: true, phoneNorm: true, status: true, balance: true,
                enrollments: { select: { group: { select: { id: true, name: true } } } },
            },
        });
        const matches = rows.filter(s =>
            (codeQ && s.code === codeQ)
            || normName(s.name).includes(nq)
            // phoneNorm backfill'dan keyin to'ladi — unga qadar xom telefon raqamlari ham solishtiriladi
            || (digits.length >= 4 && [s.phoneNorm, s.phone, s.parentPhone].some(p => (p || '').replace(/\D/g, '').includes(digits.slice(-9))))
            || (s.code || '').toLowerCase() === nq);
        res.json(matches.slice(0, 20).map(s => ({
            id: s.id, name: s.name, code: s.code, phone: s.phone, status: s.status, balance: s.balance,
            groups: s.enrollments.map(e => e.group),
        })));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', requireAuth, requirePermission('students'), async (req, res) => {
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
            const ownGroupIds = new Set(student.enrollments.filter((e: any) => e.group?.teacherId === requester.id).map((e: any) => e.groupId));
            if (!ownGroupIds.size) return res.status(403).json({ error: "Bu o'quvchiga tegishli emassiz" });
            const { payments: _p, invoices: _i, ...rest } = student as any;
            return res.json({
                ...projectStudentForTeacher(rest), // IP-26 (OQ-13): telefon, manzil, balans va h.k. yo'q
                enrollments: student.enrollments.filter((e: any) => ownGroupIds.has(e.groupId)),
                attendanceRecords: student.attendanceRecords.filter((a: any) => ownGroupIds.has(a.groupId)),
                assessments: student.assessments.filter((a: any) => a.groupId && ownGroupIds.has(a.groupId)),
                payments: [],
                invoices: [],
            });
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
        // IP-04 (TL-13): holat har doim kanonik qiymatda saqlanadi.
        if (data.status !== undefined) data.status = normalizeStudentStatus(data.status);
        const student = await prisma.student.update({ where: { id: req.params.id }, data });
        // IP-09: telefon o'zgarsa — phoneNorm (qidiruv/dublikat); kod yo'q bo'lsa — beriladi
        if (data.phone !== undefined || !(student as any).code) await ensureStudentIdentitySafe(prisma, student.id);
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
        // IP-14: live rejimda balans — hisoblar va to'lovlardan hosila (kesh). Qarz qo'shish
        // e'lon qilingan "other_fee" hisobi bo'ladi; avans faqat haqiqiy to'lov (kvitansiya) orqali.
        if (await getLedgerMode() === 'live') {
            if (amount > 0) {
                return res.status(409).json({ message: "Jonli rejimda avans faqat to'lov (kvitansiya) orqali; hisobni kamaytirish — hisob tuzatmasi orqali (Oylik hisoblar)", code: 'LIVE_MODE' });
            }
            if (reason.length < 3) return res.status(400).json({ message: "Tuzatish sababini yozing (kamida 3 belgi)" });
            const student = await prisma.student.findUnique({ where: { id: req.params.id }, select: { id: true, deletedAt: true } });
            if (!student) return res.status(404).json({ message: "O'quvchi topilmadi" });
            const actorUser = (req as any).user;
            const month = todayDateStr().slice(0, 7);
            const charge = await prisma.$transaction(async tx => {
                const c = await tx.charge.create({
                    data: {
                        chargeKey: `F:${student.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, studentId: student.id, month,
                        type: 'other_fee', status: 'posted', gross: -amount, net: -amount, teacherBase: 0, reason,
                        calc: JSON.stringify({ manual: true, via: 'balance_adjustment' }), postedAt: new Date(), postedById: actorUser?.id ?? null, createdById: actorUser?.id ?? null,
                        lines: { create: [{ kind: 'manual', amount: -amount, description: reason }] },
                    },
                });
                await syncStudentBalance(tx, student.id, 'live');
                return c;
            });
            await logAudit({ userId: actorUser?.id, userName: actorUser?.name || 'system', action: 'balance_adjustment', resource: 'charge', resourceId: charge.id, after: { amount, reason, mode: 'live' } });
            const s = await prisma.student.findUnique({ where: { id: student.id }, select: { id: true, balance: true, paymentStatus: true } });
            return res.json(s);
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
