/**
 * server/routes/students.ts
 * Student profile endpoint with full relational data
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { withAudit } from '../middleware/audit.js';

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

// PUT /api/students/:id — update student
// MANAGER+ talab qilinadi (crud.ts'ning COLLECTION_WRITE_LEVEL.students=2 siyosati
// bilan mos) — bu maxsus router crud.ts'dan OLDIN mount qilingani uchun o'sha
// tekshiruvni chetlab o'tar edi. 'balance' whitelist'da yo'q edi — CrmStudents.tsx'da
// balans maydoni tahrirlansa jimgina saqlanmasdi; endi qo'shildi va withAudit orqali
// har bir o'zgarish (balans jumladan) audit jurnaliga yoziladi.
router.put('/:id', requireAuth, requireMinRole('MANAGER'), withAudit('student'), async (req, res) => {
    try {
        const allowed = ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone',
            'source', 'status', 'notes', 'photo', 'course', 'group', 'paymentStatus', 'joinedDate', 'balance'];
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

export default router;
