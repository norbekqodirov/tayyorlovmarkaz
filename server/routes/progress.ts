import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/progress/:studentId
router.get('/:studentId', requireAuth, async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await prisma.student.findFirst({
            where: { id: studentId, deletedAt: null },
            select: {
                id: true, name: true, phone: true, email: true,
                status: true, source: true, createdAt: true,
                group: true, course: true,
                enrollments: {
                    include: {
                        group: {
                            select: {
                                id: true, name: true,
                                course:  { select: { name: true } },
                                teacher: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!student) return res.status(404).json({ message: "O'quvchi topilmadi" });

        const attendanceRecords = await prisma.attendanceRecord.findMany({
            where: { studentId },
            orderBy: { date: 'asc' },
        });

        const totalClasses  = attendanceRecords.length;
        const presentCount  = attendanceRecords.filter(r => r.status === 'present').length;
        const absentCount   = attendanceRecords.filter(r => r.status === 'absent').length;
        const lateCount     = attendanceRecords.filter(r => r.status === 'late').length;
        const excusedCount  = attendanceRecords.filter(r => r.status === 'excused').length;
        const attendanceRate = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

        const assessments = await prisma.assessment.findMany({
            where: { studentId },
            orderBy: { date: 'asc' },
        });

        const avgScore = assessments.length > 0
            ? Math.round(assessments.reduce((sum, a) => sum + (a.score / a.maxScore * 100), 0) / assessments.length)
            : 0;

        // Quiz (test) natijalari — using D:\ Quiz/QuizAttempt schema
        const quizAttempts = await prisma.quizAttempt.findMany({
            where: { studentId },
            include: { quiz: { select: { title: true, maxScore: true, passingScore: true } } },
            orderBy: { startedAt: 'desc' },
        });

        const payments = await prisma.payment.findMany({
            where: { studentId, deletedAt: null },
            orderBy: { date: 'asc' },
        });

        const totalPaid     = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
        const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

        const certificates = await prisma.certificate.findMany({
            where: { studentId },
            include: { course: { select: { name: true } } },
        });

        const now = new Date();
        const monthlyTrend = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const monthRecords = attendanceRecords.filter(r => r.date.startsWith(monthStr));
            const present = monthRecords.filter(r => r.status === 'present').length;
            monthlyTrend.push({
                month: monthStr,
                total: monthRecords.length,
                present,
                rate: monthRecords.length > 0 ? Math.round((present / monthRecords.length) * 100) : 0,
            });
        }

        res.json({
            student,
            attendance: {
                total: totalClasses,
                present: presentCount,
                absent: absentCount,
                late: lateCount,
                excused: excusedCount,
                rate: attendanceRate,
                records: attendanceRecords.slice(-50),
                monthlyTrend,
            },
            assessments: {
                total: assessments.length,
                avgScore,
                items: assessments.slice(-20),
            },
            tests: {
                total: quizAttempts.length,
                passed: quizAttempts.filter(a => a.passed).length,
                items: quizAttempts.slice(0, 10),
            },
            payments: {
                totalPaid,
                pendingAmount,
                count: payments.length,
            },
            certificates,
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
