/**
 * server/routes/students.ts
 * Student profile endpoint with full relational data
 */

import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/students/:id — full profile with relations
router.get('/:id', requireAuth, async (req, res) => {
    try {
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
        res.json(student);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/students/:id — update student
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const allowed = ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone',
            'source', 'status', 'notes', 'photo', 'course', 'group', 'paymentStatus', 'joinedDate'];
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
