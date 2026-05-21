import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { gradeSubmission } from '../services/gradingService.js';
import { emitToAdmins, emitToUser } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// ─── Tests ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
    try {
        const { courseId, groupId, status, page = '1', limit = '20' } = req.query as Record<string, string>;
        const user = (req as any).user;
        const where: any = { deletedAt: null };
        if (courseId) where.courseId = courseId;
        if (groupId) where.groupId = groupId;
        if (status) where.status = status;

        // Teachers only see their own
        if (user?.role === 'TEACHER') {
            where.createdBy = user.id;
        }

        const pageN = parseInt(page) || 1;
        const limitN = Math.min(parseInt(limit) || 20, 100);

        const [total, data] = await Promise.all([
            prisma.test.count({ where }),
            prisma.test.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (pageN - 1) * limitN,
                take: limitN,
                include: {
                    _count: { select: { questions: true, submissions: true } },
                    course: { select: { id: true, name: true } },
                    group: { select: { id: true, name: true } },
                },
            }),
        ]);
        res.json({ total, page: pageN, limit: limitN, data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    try {
        const test = await prisma.test.findUnique({
            where: { id: req.params.id },
            include: {
                questions: { orderBy: { order: 'asc' } },
                course: { select: { id: true, name: true } },
                group: { select: { id: true, name: true } },
            },
        });
        if (!test) return res.status(404).json({ message: 'Topilmadi' });
        res.json(test);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        const test = await prisma.test.create({
            data: {
                ...req.body,
                createdBy: user?.id,
            },
        });
        await logAudit({
            userId: user?.id, userName: user?.name || 'system',
            action: 'create', resource: 'test', resourceId: test.id, after: test,
        });
        res.json(test);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const test = await prisma.test.update({ where: { id: req.params.id }, data: req.body });
        res.json(test);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await prisma.test.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/publish', requireAuth, async (req, res) => {
    try {
        const test = await prisma.test.update({
            where: { id: req.params.id },
            data: { status: 'published' },
        });
        emitToAdmins('test:published', test);
        res.json(test);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Questions ────────────────────────────────────────────────────────────────

router.get('/:testId/questions', requireAuth, async (req, res) => {
    try {
        const questions = await prisma.question.findMany({
            where: { testId: req.params.testId },
            orderBy: { order: 'asc' },
        });
        res.json(questions);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:testId/questions', requireAuth, async (req, res) => {
    try {
        const { type, text, options, correctAnswer, score, order, imageUrl, explanation } = req.body;
        const question = await prisma.question.create({
            data: {
                testId: req.params.testId,
                type,
                text,
                options: typeof options === 'string' ? options : JSON.stringify(options || []),
                correctAnswer: correctAnswer || null,
                score: Number(score) || 1,
                order: Number(order) || 0,
                imageUrl: imageUrl || null,
                explanation: explanation || null,
            },
        });
        res.json(question);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:testId/questions/bulk', requireAuth, async (req, res) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions)) return res.status(400).json({ message: 'questions massiv bo\'lishi kerak' });

        // Delete existing questions and recreate (simpler than upsert for arbitrary IDs)
        await prisma.question.deleteMany({ where: { testId: req.params.testId } });
        const created = await Promise.all(questions.map((q: any, i: number) =>
            prisma.question.create({
                data: {
                    testId: req.params.testId,
                    type: q.type,
                    text: q.text,
                    options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
                    correctAnswer: q.correctAnswer || null,
                    score: Number(q.score) || 1,
                    order: q.order ?? i,
                    imageUrl: q.imageUrl || null,
                    explanation: q.explanation || null,
                },
            })
        ));
        res.json({ count: created.length, questions: created });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/questions/:id', requireAuth, async (req, res) => {
    try {
        const { options, ...rest } = req.body;
        const data: any = { ...rest };
        if (options !== undefined) {
            data.options = typeof options === 'string' ? options : JSON.stringify(options);
        }
        const q = await prisma.question.update({ where: { id: req.params.id }, data });
        res.json(q);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/questions/:id', requireAuth, async (req, res) => {
    try {
        await prisma.question.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Test taking flow ─────────────────────────────────────────────────────────

router.post('/:id/start', requireAuth, async (req, res) => {
    try {
        const { studentId } = req.body;
        if (!studentId) return res.status(400).json({ message: 'studentId kerak' });

        const test = await prisma.test.findUnique({ where: { id: req.params.id } });
        if (!test) return res.status(404).json({ message: 'Test topilmadi' });
        if (test.status !== 'published') return res.status(400).json({ message: 'Test hali ochilmagan' });

        const existing = await prisma.testSubmission.findUnique({
            where: { testId_studentId: { testId: req.params.id, studentId } },
        });
        if (existing) {
            if (existing.status === 'submitted' || existing.status === 'graded') {
                return res.status(400).json({ message: 'Test allaqachon topshirilgan' });
            }
            return res.json(existing);
        }

        const submission = await prisma.testSubmission.create({
            data: {
                testId: req.params.id,
                studentId,
                status: 'in_progress',
            },
        });
        res.json(submission);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/submissions/:id/answer', requireAuth, async (req, res) => {
    try {
        const { questionId, value } = req.body;
        if (!questionId) return res.status(400).json({ message: 'questionId kerak' });

        const answer = await prisma.answer.upsert({
            where: { submissionId_questionId: { submissionId: req.params.id, questionId } },
            create: {
                submissionId: req.params.id,
                questionId,
                value: typeof value === 'string' ? value : JSON.stringify(value),
            },
            update: {
                value: typeof value === 'string' ? value : JSON.stringify(value),
            },
        });
        res.json(answer);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/submissions/:id/submit', requireAuth, async (req, res) => {
    try {
        const submission = await prisma.testSubmission.findUnique({
            where: { id: req.params.id },
            include: {
                test: { include: { questions: true } },
                answers: true,
            },
        });
        if (!submission) return res.status(404).json({ message: 'Topilmadi' });
        if (submission.status !== 'in_progress') return res.status(400).json({ message: 'Allaqachon topshirilgan' });

        // Auto-grade
        const result = gradeSubmission(
            submission.test.questions,
            submission.answers.map(a => ({ questionId: a.questionId, value: a.value }))
        );

        // Update each answer with isCorrect/score
        await Promise.all(result.perQuestion.map(pq =>
            prisma.answer.update({
                where: { id: submission.answers.find(a => a.questionId === pq.questionId)!.id },
                data: { isCorrect: pq.isCorrect, score: pq.score },
            }).catch(() => null)
        ));

        const updated = await prisma.testSubmission.update({
            where: { id: req.params.id },
            data: {
                submittedAt: new Date(),
                score: result.percent,
                status: result.needsManualReview ? 'submitted' : 'graded',
                metadata: JSON.stringify({ ...result, ip: req.ip }),
            },
        });

        // Notify teacher
        try {
            if (submission.test.createdBy) {
                emitToUser(submission.test.createdBy, 'test:submitted', {
                    testId: submission.testId,
                    submissionId: updated.id,
                    score: result.percent,
                });
            }
        } catch {}

        res.json({ submission: updated, result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/answers/:id/grade', requireAuth, async (req, res) => {
    try {
        const { score, feedback, isCorrect } = req.body;
        const answer = await prisma.answer.update({
            where: { id: req.params.id },
            data: {
                score: Number(score) || 0,
                feedback: feedback || null,
                isCorrect: typeof isCorrect === 'boolean' ? isCorrect : (Number(score) > 0),
            },
            include: { submission: { include: { answers: true, test: true } } },
        });

        // Recalculate total submission score
        const sub = answer.submission;
        const totalScore = sub.answers.reduce((a: number, an: any) => a + (an.score || 0), 0);
        const maxScore = sub.test.totalScore || 100;
        const percent = Math.round((totalScore / maxScore) * 100);
        const allGraded = sub.answers.every((an: any) => an.score !== null);

        await prisma.testSubmission.update({
            where: { id: sub.id },
            data: {
                score: percent,
                status: allGraded ? 'graded' : 'submitted',
            },
        });

        res.json(answer);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/results', requireAuth, async (req, res) => {
    try {
        const submissions = await prisma.testSubmission.findMany({
            where: { testId: req.params.id },
            include: {
                student: { select: { id: true, name: true, photo: true } },
                answers: true,
            },
            orderBy: { submittedAt: 'desc' },
        });

        const stats = {
            total: submissions.length,
            avg: submissions.reduce((a, s) => a + (s.score || 0), 0) / (submissions.length || 1),
            passed: submissions.filter(s => (s.score || 0) >= 60).length,
            failed: submissions.filter(s => (s.score || 0) < 60).length,
            inProgress: submissions.filter(s => s.status === 'in_progress').length,
            needsReview: submissions.filter(s => s.status === 'submitted').length,
        };

        res.json({ submissions, stats });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
