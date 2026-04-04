import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Map frontend collection names to Prisma model names
const MODEL_MAP: Record<string, string> = {
    // Direct mappings
    'leads': 'lead',
    'students': 'student',
    'courses': 'course',
    'groups': 'group',
    'enrollments': 'enrollment',
    'schedules': 'schedule',
    'rooms': 'room',
    'staff': 'staffMember',
    'finance': 'transaction',
    'transactions': 'transaction',
    'attendance': 'attendanceRecord',
    'assessments': 'assessment',
    'journal': 'journalEntry',
    'inventory': 'inventoryItem',
    'campaigns': 'campaign',
    'marketing': 'campaign',
    'news': 'post',
    'posts': 'post',
    'content': 'post',
    'forms': 'targetForm',
    'settings': 'setting',
    'notifications': 'notification',
    'gallery': 'galleryItem',
    'pageContent': 'pageContent',
    'payments': 'payment',
    'leadActivities': 'leadActivity',
};

router.use('/:collection', requireAuth, async (req, res, next) => {
    const { collection } = req.params;
    const modelName = MODEL_MAP[collection];

    if (!modelName) {
        // Use GenericDocument fallback for unknown collections
        (req as any).useFallback = true;
        (req as any).modelName = collection;
        return next();
    }

    // @ts-ignore
    if (!prisma[modelName]) {
        (req as any).useFallback = true;
        (req as any).modelName = collection;
        return next();
    }

    (req as any).useFallback = false;
    (req as any).modelName = modelName;
    next();
});

// GET all
router.get('/:collection', async (req, res) => {
    const { collection } = req.params;
    try {
        if ((req as any).useFallback) {
            const docs = await prisma.genericDocument.findMany({ where: { collection } });
            return res.json(docs.map((d: any) => ({ id: d.id, ...JSON.parse(d.data) })));
        }
        // @ts-ignore
        const data = await prisma[(req as any).modelName].findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(data);
    } catch (error: any) {
        // If orderBy fails (model without createdAt), try without it
        try {
            // @ts-ignore
            const data = await prisma[(req as any).modelName].findMany();
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: String(error) });
        }
    }
});

// POST create
router.post('/:collection', async (req, res) => {
    const { collection } = req.params;
    try {
        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.create({
                data: { collection, data: JSON.stringify(req.body) }
            });
            return res.json({ id: doc.id, ...JSON.parse(doc.data) });
        }
        // @ts-ignore
        const data = await prisma[(req as any).modelName].create({ data: req.body });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// PUT update
router.put('/:collection/:id', async (req, res) => {
    try {
        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.update({
                where: { id: req.params.id },
                data: { data: JSON.stringify(req.body) }
            });
            return res.json({ id: doc.id, ...JSON.parse(doc.data) });
        }
        // @ts-ignore
        const data = await prisma[(req as any).modelName].update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// DELETE
router.delete('/:collection/:id', async (req, res) => {
    try {
        if ((req as any).useFallback) {
            await prisma.genericDocument.delete({ where: { id: req.params.id } });
            return res.json({ success: true });
        }
        // @ts-ignore
        await prisma[(req as any).modelName].delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

export default router;
