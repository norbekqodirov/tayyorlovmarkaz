import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/curriculum/:courseId — kurs darajalari va modullari
router.get('/:courseId', requireAuth, async (req, res) => {
    try {
        const levels = await prisma.courseLevel.findMany({
            where: { courseId: req.params.courseId },
            include: {
                modules: { orderBy: { order: 'asc' } },
            },
            orderBy: { order: 'asc' },
        });
        res.json(levels);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/curriculum/:courseId/levels — daraja yaratish
router.post('/:courseId/levels', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { name, description, order } = req.body;
        if (!name) return res.status(400).json({ message: 'name kerak' });

        // Tartib raqami aniqlash
        let levelOrder = order;
        if (levelOrder === undefined) {
            const last = await prisma.courseLevel.findFirst({
                where: { courseId: req.params.courseId },
                orderBy: { order: 'desc' },
            });
            levelOrder = (last?.order ?? -1) + 1;
        }

        const level = await prisma.courseLevel.create({
            data: {
                courseId: req.params.courseId,
                name,
                description,
                order: levelOrder,
            },
            include: { modules: true },
        });
        res.status(201).json(level);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/curriculum/levels/:levelId
router.patch('/levels/:levelId', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { name, description, order } = req.body;
        const level = await prisma.courseLevel.update({
            where: { id: req.params.levelId },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(order !== undefined && { order: Number(order) }),
            },
            include: { modules: { orderBy: { order: 'asc' } } },
        });
        res.json(level);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/curriculum/levels/:levelId
router.delete('/levels/:levelId', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        await prisma.courseLevel.delete({ where: { id: req.params.levelId } });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/curriculum/levels/:levelId/modules — modul yaratish
router.post('/levels/:levelId/modules', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { title, description, materials, duration, order } = req.body;
        if (!title) return res.status(400).json({ message: 'title kerak' });

        let moduleOrder = order;
        if (moduleOrder === undefined) {
            const last = await prisma.courseModule.findFirst({
                where: { levelId: req.params.levelId },
                orderBy: { order: 'desc' },
            });
            moduleOrder = (last?.order ?? -1) + 1;
        }

        const module = await prisma.courseModule.create({
            data: {
                levelId: req.params.levelId,
                title,
                description,
                materials: materials ? JSON.stringify(materials) : null,
                duration: duration ? Number(duration) : null,
                order: moduleOrder,
            },
        });
        res.status(201).json(module);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/curriculum/modules/:moduleId
router.patch('/modules/:moduleId', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { title, description, materials, duration, order } = req.body;
        const module = await prisma.courseModule.update({
            where: { id: req.params.moduleId },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(materials !== undefined && { materials: typeof materials === 'string' ? materials : JSON.stringify(materials) }),
                ...(duration !== undefined && { duration: duration ? Number(duration) : null }),
                ...(order !== undefined && { order: Number(order) }),
            },
        });
        res.json(module);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/curriculum/modules/:moduleId
router.delete('/modules/:moduleId', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        await prisma.courseModule.delete({ where: { id: req.params.moduleId } });
        res.json({ message: "O'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/curriculum/:courseId/clone — kursni nusxalash
router.post('/:courseId/clone', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { newName } = req.body;

        // Asl kursni olish
        const original = await prisma.course.findUnique({
            where: { id: req.params.courseId },
            include: {
                levels: {
                    include: { modules: true },
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!original) return res.status(404).json({ message: 'Kurs topilmadi' });

        // Yangi kurs yaratish
        const cloned = await prisma.course.create({
            data: {
                name: newName || `${original.name} (nusxa)`,
                title: original.title,
                category: original.category,
                description: original.description,
                price: original.price,
                duration: original.duration,
                lessonsPerWeek: original.lessonsPerWeek,
                lessonDuration: original.lessonDuration,
                status: 'Draft',
            },
        });

        // Darajalar va modullarni nusxalash
        for (const level of original.levels) {
            const newLevel = await prisma.courseLevel.create({
                data: {
                    courseId: cloned.id,
                    name: level.name,
                    description: level.description,
                    order: level.order,
                },
            });

            for (const mod of level.modules) {
                await prisma.courseModule.create({
                    data: {
                        levelId: newLevel.id,
                        title: mod.title,
                        description: mod.description,
                        materials: mod.materials,
                        duration: mod.duration,
                        order: mod.order,
                    },
                });
            }
        }

        res.status(201).json({ message: 'Kurs nusxalandi', courseId: cloned.id, name: cloned.name });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/curriculum/levels/reorder — darajalar tartibini saqlash
router.post('/levels/reorder', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { items } = req.body; // [{id, order}]
        await Promise.all(
            items.map((item: { id: string; order: number }) =>
                prisma.courseLevel.update({ where: { id: item.id }, data: { order: item.order } })
            )
        );
        res.json({ message: 'Tartib saqlandi' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/curriculum/modules/reorder — modullar tartibini saqlash
router.post('/modules/reorder', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { items } = req.body; // [{id, order}]
        await Promise.all(
            items.map((item: { id: string; order: number }) =>
                prisma.courseModule.update({ where: { id: item.id }, data: { order: item.order } })
            )
        );
        res.json({ message: 'Tartib saqlandi' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
