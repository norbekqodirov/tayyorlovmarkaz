import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Map frontend collection names to Prisma model names
const MODEL_MAP: Record<string, string> = {
    // Direct mappings
    'leads': 'lead',
    'courses': 'course',
    'enrollments': 'enrollment',
    'schedules': 'schedule',
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
    'students': 'student',
    'groups': 'group',
    'rooms': 'room',
    'tasks': 'task',
    // Fallback collections: schedule
};

// Collections that should always use GenericDocument fallback
const FALLBACK_COLLECTIONS = new Set([]);

// Input validation rules per collection
const VALIDATION_RULES: Record<string, { required: string[], messages: Record<string, string> }> = {
    lead: {
        required: ['name', 'phone'],
        messages: { name: 'Ism kiritilishi shart', phone: 'Telefon raqam kiritilishi shart' }
    },
    student: {
        required: ['name'],
        messages: { name: "O'quvchi ismi kiritilishi shart" }
    },
    group: {
        required: ['name', 'courseId'],
        messages: { name: 'Guruh nomi kiritilishi shart', courseId: 'Kurs tanlanishi shart' }
    },
    course: {
        required: ['title'],
        messages: { title: 'Kurs nomi kiritilishi shart' }
    },
    staffMember: {
        required: ['name', 'role'],
        messages: { name: 'Xodim ismi kiritilishi shart', role: 'Lavozim kiritilishi shart' }
    },
    transaction: {
        required: ['type', 'amount', 'date'],
        messages: { type: 'Tur kiritilishi shart', amount: 'Summa kiritilishi shart', date: 'Sana kiritilishi shart' }
    },
    payment: {
        required: ['studentId', 'amount', 'date'],
        messages: { studentId: "O'quvchi tanlanishi shart", amount: 'Summa kiritilishi shart', date: 'Sana kiritilishi shart' }
    },
    post: {
        required: ['title'],
        messages: { title: 'Sarlavha kiritilishi shart' }
    },
};

function validateInput(modelName: string, data: any): string | null {
    const rules = VALIDATION_RULES[modelName];
    if (!rules) return null;
    for (const field of rules.required) {
        if (!data[field] && data[field] !== 0) {
            return rules.messages[field] || `${field} maydoni to'ldirilishi shart`;
        }
    }
    return null;
}


router.use('/:collection', requireAuth, requireRole, async (req, res, next) => {
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

// GET all (with optional pagination: ?page=1&limit=20)
router.get('/:collection', async (req, res) => {
    const { collection } = req.params;
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 0;
    const search = (req.query.search as string) || '';

    try {
        if ((req as any).useFallback) {
            const docs = await prisma.genericDocument.findMany({ where: { collection } });
            const mapped = docs.map((d: any) => {
                try { return { id: d.id, ...JSON.parse(d.data) }; }
                catch { return { id: d.id, _raw: d.data }; }
            });
            if (page > 0 && limit > 0) {
                const start = (page - 1) * limit;
                return res.json({ data: mapped.slice(start, start + limit), total: mapped.length, page, limit });
            }
            return res.json(mapped);
        }

        if (page > 0 && limit > 0) {
            // Paginated response
            // @ts-ignore
            const total = await prisma[(req as any).modelName].count();
            // @ts-ignore
            const data = await prisma[(req as any).modelName].findMany({
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            });
            return res.json({ data, total, page, limit });
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
        // Input validation
        if (!(req as any).useFallback) {
            const validationError = validateInput((req as any).modelName, req.body);
            if (validationError) return res.status(400).json({ message: validationError });
        }

        let finalData;
        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.create({
                data: { collection, data: JSON.stringify(req.body) }
            });
            try { finalData = { id: doc.id, ...JSON.parse(doc.data) }; }
            catch { finalData = { id: doc.id, _raw: doc.data }; }
        } else {
            // @ts-ignore
            finalData = await prisma[(req as any).modelName].create({ data: req.body });
        }

        // ---------------------------------------------------------
        // AUTOMATIC USER CREATION FOR RBAC (Role-Based Access Control)
        // ---------------------------------------------------------
        if (collection === 'teachers' || collection === 'students') {
            try {
                const role = collection === 'teachers' ? 'TEACHER' : 'STUDENT';
                // students/teachers only have phone, so we construct a pseudo-email for login
                const cleanPhone = (req.body.phone || '').replace(/\D/g, '');
                const loginEmail = req.body.email || (cleanPhone ? `${cleanPhone}@tayyorlov.uz` : `${Date.now()}@tayyorlov.uz`);
                const rawPassword = cleanPhone || crypto.randomBytes(8).toString('hex');

                const existingUser = await prisma.user.findUnique({ where: { email: loginEmail } });

                if (!existingUser) {
                    const hashedPassword = await bcrypt.hash(rawPassword, 10);
                    await prisma.user.create({
                        data: {
                            email: loginEmail,
                            password: hashedPassword,
                            name: req.body.name || `${role} User`,
                            role: role
                        }
                    });
                    console.log(`[RBAC] Created User account for ${role}: ${loginEmail}`);
                }
            } catch (authErr) {
                console.error("[RBAC] Failed to create user account during teacher/student creation:", authErr);
            }
        }

        // ---------------------------------------------------------
        // AUTOMATIC SYSTEM NOTIFICATIONS
        // ---------------------------------------------------------
        try {
            let notifType = '';
            let notifTitle = '';
            let notifMessage = '';

            if (collection === 'leads') {
                notifType = 'info';
                notifTitle = 'Yangi Lid';
                notifMessage = `Qiziquvchi qo'shildi: ${req.body.name}`;
            } else if (collection === 'finance' && req.body.type === 'income') {
                notifType = 'success';
                notifTitle = 'To\'lov Qabul Qilindi';
                notifMessage = `${req.body.amount} so'm miqdorida to'lov qabul qilindi.`;
            } else if (collection === 'students') {
                notifType = 'success';
                notifTitle = 'Yangi O\'quvchi';
                notifMessage = `Tizimga yangi o'quvchi qo'shildi: ${req.body.name}`;
            } else if (collection === 'groups') {
                notifType = 'info';
                notifTitle = 'Yangi Guruh';
                notifMessage = `Tizimda yangi guruh ochildi: ${req.body.name || 'Nomsiz'}`;
            }

            if (notifType) {
                await prisma.genericDocument.create({
                    data: {
                        collection: 'notifications',
                        data: JSON.stringify({
                            type: notifType,
                            title: notifTitle,
                            message: notifMessage,
                            time: new Date().toISOString(),
                            isRead: false
                        })
                    }
                });
            }
        } catch (notifErr) {
            console.error("[NOTIFICATIONS] Failed to create system notification:", notifErr);
        }

        res.json(finalData);
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
            try { return res.json({ id: doc.id, ...JSON.parse(doc.data) }); }
            catch { return res.json({ id: doc.id, _raw: doc.data }); }
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
