/**
 * server/routes/quiz.ts
 * Faza 3 — Test Tizimi API
 *
 * GET    /api/quiz                        — barcha quizlar
 * POST   /api/quiz                        — yangi quiz yaratish
 * GET    /api/quiz/:id                    — quiz + savollari
 * PUT    /api/quiz/:id                    — quiz yangilash
 * DELETE /api/quiz/:id                    — quiz o'chirish
 *
 * POST   /api/quiz/:id/questions          — savol qo'shish
 * PUT    /api/quiz/:id/questions/:qid     — savolni yangilash
 * DELETE /api/quiz/:id/questions/:qid     — savolni o'chirish
 *
 * POST   /api/quiz/:id/start              — urinish boshlash (student yoki anonim)
 * POST   /api/quiz/attempts/:aid/answer   — javob saqlash
 * POST   /api/quiz/attempts/:aid/finish   — testni yakunlash + baholash
 * GET    /api/quiz/:id/attempts           — quiz urinishlari (admin)
 * GET    /api/quiz/public/:slug           — ommaviy test olish (slug bo'yicha)
 */

import express from 'express';
import prisma from '../db.js';

const router = express.Router();

// ─── Quiz CRUD ────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const quizzes = await prisma.quiz.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { questions: true, attempts: true } }
            }
        });
        res.json({ data: quizzes });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    const { title, description, courseId, groupId, duration, maxScore, passingScore, isPublic, publicSlug, status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    try {
        const quiz = await prisma.quiz.create({
            data: {
                title,
                description,
                courseId: courseId || null,
                groupId: groupId || null,
                duration: duration ?? 30,
                maxScore: maxScore ?? 100,
                passingScore: passingScore ?? 60,
                isPublic: isPublic ?? false,
                publicSlug: publicSlug || null,
                status: status || 'draft',
                createdById: (req as any).user?.id
            }
        });
        res.status(201).json({ data: quiz });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/public/:slug', async (req, res) => {
    try {
        const quiz = await prisma.quiz.findUnique({
            where: { publicSlug: req.params.slug },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                    include: {
                        options: { orderBy: { order: 'asc' }, select: { id: true, text: true, order: true } }
                    }
                }
            }
        });
        if (!quiz || !quiz.isPublic || quiz.status !== 'active') {
            return res.status(404).json({ error: 'Test topilmadi yoki faol emas' });
        }
        res.json({ data: quiz });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: req.params.id },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                    include: { options: { orderBy: { order: 'asc' } } }
                },
                _count: { select: { attempts: true } }
            }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz topilmadi' });
        res.json({ data: quiz });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req, res) => {
    const { title, description, courseId, groupId, duration, maxScore, passingScore, isPublic, publicSlug, status } = req.body;
    try {
        const quiz = await prisma.quiz.update({
            where: { id: req.params.id },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(courseId !== undefined && { courseId: courseId || null }),
                ...(groupId !== undefined && { groupId: groupId || null }),
                ...(duration !== undefined && { duration }),
                ...(maxScore !== undefined && { maxScore }),
                ...(passingScore !== undefined && { passingScore }),
                ...(isPublic !== undefined && { isPublic }),
                ...(publicSlug !== undefined && { publicSlug: publicSlug || null }),
                ...(status && { status }),
            }
        });
        res.json({ data: quiz });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.quiz.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Questions ────────────────────────────────────────────────────────────────

router.post('/:id/questions', async (req, res) => {
    const { text, type, order, points, imageUrl, options } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    try {
        const count = await prisma.quizQuestion.count({ where: { quizId: req.params.id } });
        const question = await prisma.quizQuestion.create({
            data: {
                quizId: req.params.id,
                text,
                type: type || 'single',
                order: order ?? count,
                points: points ?? 1,
                imageUrl: imageUrl || null,
                options: options?.length ? {
                    create: options.map((opt: { text: string; isCorrect: boolean }, i: number) => ({
                        text: opt.text,
                        isCorrect: opt.isCorrect ?? false,
                        order: i
                    }))
                } : undefined
            },
            include: { options: true }
        });
        res.status(201).json({ data: question });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id/questions/:qid', async (req, res) => {
    const { text, type, order, points, imageUrl, options } = req.body;
    try {
        // Delete old options and recreate
        if (options) {
            await prisma.quizOption.deleteMany({ where: { questionId: req.params.qid } });
        }

        const question = await prisma.quizQuestion.update({
            where: { id: req.params.qid },
            data: {
                ...(text && { text }),
                ...(type && { type }),
                ...(order !== undefined && { order }),
                ...(points !== undefined && { points }),
                ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
                ...(options && {
                    options: {
                        create: options.map((opt: { text: string; isCorrect: boolean }, i: number) => ({
                            text: opt.text,
                            isCorrect: opt.isCorrect ?? false,
                            order: i
                        }))
                    }
                })
            },
            include: { options: true }
        });
        res.json({ data: question });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id/questions/:qid', async (req, res) => {
    try {
        await prisma.quizQuestion.delete({ where: { id: req.params.qid } });
        res.json({ ok: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Attempts ─────────────────────────────────────────────────────────────────

router.post('/:id/start', async (req, res) => {
    const { studentId, studentName, studentPhone } = req.body;
    try {
        const quiz = await prisma.quiz.findUnique({
            where: { id: req.params.id },
            include: { questions: { include: { options: true } } }
        });
        if (!quiz) return res.status(404).json({ error: 'Quiz topilmadi' });

        const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);

        const attempt = await prisma.quizAttempt.create({
            data: {
                quizId: req.params.id,
                studentId: studentId || null,
                studentName: studentName || null,
                studentPhone: studentPhone || null,
                maxScore,
                startedAt: new Date()
            }
        });

        // Return quiz without correct answers
        const sanitized = {
            ...quiz,
            questions: quiz.questions.map(q => ({
                ...q,
                options: q.options.map(o => ({ id: o.id, text: o.text, order: o.order }))
            }))
        };

        res.status(201).json({ data: { attempt, quiz: sanitized } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/attempts/:aid/answer', async (req, res) => {
    const { questionId, selectedOptions, textAnswer } = req.body;
    if (!questionId) return res.status(400).json({ error: 'questionId required' });

    try {
        const question = await prisma.quizQuestion.findUnique({
            where: { id: questionId },
            include: { options: true }
        });
        if (!question) return res.status(404).json({ error: 'Savol topilmadi' });

        let isCorrect = false;
        let points = 0;

        if (question.type === 'text') {
            // Text answers need manual grading — skip auto-grade
            isCorrect = false;
        } else {
            const correctIds = question.options.filter(o => o.isCorrect).map(o => o.id).sort();
            const selected = Array.isArray(selectedOptions) ? [...selectedOptions].sort() : [];
            isCorrect = JSON.stringify(correctIds) === JSON.stringify(selected);
            if (isCorrect) points = question.points;
        }

        // Upsert — bir savol uchun bir javob
        const existing = await prisma.quizAnswer.findFirst({
            where: { attemptId: req.params.aid, questionId }
        });

        let answer;
        if (existing) {
            answer = await prisma.quizAnswer.update({
                where: { id: existing.id },
                data: {
                    selectedOptions: JSON.stringify(selectedOptions || []),
                    textAnswer: textAnswer || null,
                    isCorrect,
                    points
                }
            });
        } else {
            answer = await prisma.quizAnswer.create({
                data: {
                    attemptId: req.params.aid,
                    questionId,
                    selectedOptions: JSON.stringify(selectedOptions || []),
                    textAnswer: textAnswer || null,
                    isCorrect,
                    points
                }
            });
        }

        res.json({ data: answer });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/attempts/:aid/finish', async (req, res) => {
    try {
        const attempt = await prisma.quizAttempt.findUnique({
            where: { id: req.params.aid },
            include: { answers: true, quiz: true }
        });
        if (!attempt) return res.status(404).json({ error: 'Urinish topilmadi' });

        const score = attempt.answers.reduce((sum, a) => sum + a.points, 0);
        const passed = score >= (attempt.quiz.passingScore / 100) * attempt.maxScore;
        const finishedAt = new Date();
        const timeSpent = Math.round((finishedAt.getTime() - attempt.startedAt.getTime()) / 1000);

        const updated = await prisma.quizAttempt.update({
            where: { id: req.params.aid },
            data: { score, passed, finishedAt, timeSpent },
            include: {
                answers: {
                    include: {
                        question: {
                            include: { options: true }
                        }
                    }
                }
            }
        });

        // If student is linked, create an Assessment record
        if (attempt.studentId) {
            await prisma.assessment.create({
                data: {
                    studentId: attempt.studentId,
                    title: attempt.quiz.title,
                    type: 'test',
                    score,
                    maxScore: attempt.maxScore,
                    date: new Date().toISOString().split('T')[0],
                    notes: `Quiz ID: ${attempt.quiz.id}`
                }
            }).catch(() => {}); // Non-critical
        }

        res.json({ data: updated });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/attempts', async (req, res) => {
    try {
        const attempts = await prisma.quizAttempt.findMany({
            where: { quizId: req.params.id },
            orderBy: { startedAt: 'desc' },
            include: {
                answers: { select: { isCorrect: true, points: true } }
            }
        });
        res.json({ data: attempts });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
