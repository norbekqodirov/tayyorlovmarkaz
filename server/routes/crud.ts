import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ─── Model Map: frontend collection → Prisma model name ──────────────────────
// Collections NOT listed here will fallback to GenericDocument (JSON store)
const MODEL_MAP: Record<string, string> = {
    'courses':      'course',
    'groups':       'group',
    'students':     'student',
    'rooms':        'room',
    'staff':        'staffMember',
    'staffMembers': 'staffMember',
    'finance':      'transaction',
    'transactions': 'transaction',
    'payments':     'payment',
    'leads':        'lead',
    'posts':        'post',
    'news':         'post',
    'inventory':    'inventoryItem',
    'tasks':        'task',
    'notifications': 'notification',
    'settings':     'setting',
    'pageContent':  'pageContent',
    'gallery':      'galleryItem',
    'forms':        'targetForm',
};

// Always use GenericDocument for these (they have extra fields beyond Prisma schema)
const FORCE_GENERIC: Set<string> = new Set([
    'schedule', 'attendance', 'assessments', 'journal', 'exams', 'notes',
    'automations', 'campaigns', 'leadActivities', 'lead_activities',
    'enrollments_extra',
]);

// SCHEMA_FIELDS: whitelist for Prisma writes to avoid "Unknown field" errors
const SCHEMA_FIELDS: Record<string, string[]> = {
    'lead': ['name', 'phone', 'email', 'stage', 'source', 'course', 'score', 'status', 'date', 'notes'],
    'student': ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone', 'source', 'status', 'notes', 'photo'],
    'group': ['name', 'courseId', 'teacherId', 'status', 'startDate', 'endDate', 'maxSize', 'room', 'days', 'time', 'price', 'teacherName', 'subject'],
    'room': ['name', 'capacity', 'color'],
    'course': ['name', 'title', 'category', 'description', 'price', 'duration', 'lessonDuration', 'lessonsPerWeek', 'status'],
    'transaction': ['type', 'amount', 'category', 'description', 'date', 'method', 'studentId', 'studentName', 'staffId', 'staffName'],
    'payment': ['studentId', 'amount', 'method', 'date', 'month', 'dueDate', 'status', 'notes'],
    'staffMember': ['name', 'role', 'email', 'phone', 'salary', 'joinedDate', 'status', 'department', 'address', 'passport', 'education', 'experience', 'photo'],
    'post': ['title', 'content', 'excerpt', 'imageUrl', 'author', 'status', 'category', 'date'],
    'inventoryItem': ['name', 'category', 'quantity', 'price', 'location', 'condition', 'purchaseDate', 'notes'],
    'task': ['title', 'completed', 'userId'],
    'targetForm': ['title', 'name', 'description', 'course', 'url', 'isActive', 'status'],
};

// Status normalizers: convert Uzbek UI values to English DB values
const COURSE_STATUS_MAP: Record<string, string> = {
    'Faol': 'Active', 'faol': 'Active', 'Active': 'Active',
    'Qoralama': 'Draft', 'Draft': 'Draft',
    'Arxiv': 'Archived', 'Archived': 'Archived',
};

const STUDENT_STATUS_MAP: Record<string, string> = {
    'Faol': 'active', 'active': 'active',
    'Muzlatilgan': 'graduated', 'graduated': 'graduated',
    'Tark etgan': 'left', 'left': 'left',
    'Bitiruvchi': 'graduated',
};

function normalizeData(modelName: string, data: any): any {
    if (modelName === 'course' && data.status) {
        data.status = COURSE_STATUS_MAP[data.status] || data.status;
    }
    if (modelName === 'student' && data.status) {
        data.status = STUDENT_STATUS_MAP[data.status] || data.status;
    }
    // Number coercions
    if (modelName === 'course') {
        if (data.price !== undefined) data.price = Number(data.price) || 0;
        if (data.lessonsPerWeek !== undefined) data.lessonsPerWeek = Number(data.lessonsPerWeek) || 3;
        if (data.lessonDuration !== undefined) data.lessonDuration = Number(data.lessonDuration) || 90;
    }
    if (modelName === 'group') {
        // maxStudents (frontend) → maxSize (DB)
        if (data.maxStudents !== undefined && data.maxSize === undefined) {
            data.maxSize = Number(data.maxStudents) || 20;
        }
        delete data.maxStudents;
        // teacher name string → teacherName column (always overwrite so changes persist)
        if (data.teacher !== undefined) {
            data.teacherName = data.teacher;
        }
        delete data.teacher;
        // days: array → JSON string
        if (Array.isArray(data.days)) {
            data.days = JSON.stringify(data.days);
        }
        // students array belongs in Enrollment table, not here
        delete data.students;
        // ensure price is a number
        if (data.price !== undefined) data.price = Number(data.price) || 0;
        // empty courseId should become null
        if (data.courseId === '' || data.courseId === undefined) data.courseId = null;
    }
    if (modelName === 'targetForm') {
        if (data.name !== undefined && data.title === undefined) {
            data.title = data.name;
            delete data.name;
        }
        if (data.status !== undefined && data.isActive === undefined) {
            data.isActive = data.status === 'Faol';
            delete data.status;
        }
    }
    if (modelName === 'transaction') {
        if (data.amount !== undefined) data.amount = Number(data.amount) || 0;
    }
    if (modelName === 'payment') {
        if (data.amount !== undefined) data.amount = Number(data.amount) || 0;
    }
    return data;
}

// Validation rules
const VALIDATION_RULES: Record<string, { required: string[]; messages: Record<string, string> }> = {
    lead: { required: ['name', 'phone'], messages: { name: 'Ism kiritilishi shart', phone: 'Telefon raqam kiritilishi shart' } },
    student: { required: ['name'], messages: { name: "O'quvchi ismi kiritilishi shart" } },
    group: { required: ['name'], messages: { name: 'Guruh nomi kiritilishi shart' } },
    course: { required: ['name'], messages: { name: 'Kurs nomi kiritilishi shart' } },
    staffMember: { required: ['name', 'role'], messages: { name: 'Xodim ismi kiritilishi shart', role: 'Lavozim kiritilishi shart' } },
    transaction: { required: ['type', 'amount', 'date'], messages: { type: 'Tur kiritilishi shart', amount: 'Summa kiritilishi shart', date: 'Sana kiritilishi shart' } },
    payment: { required: ['studentId', 'amount', 'date'], messages: { studentId: "O'quvchi tanlanishi shart", amount: 'Summa kiritilishi shart', date: 'Sana kiritilishi shart' } },
    post: { required: ['title'], messages: { title: 'Sarlavha kiritilishi shart' } },
};

function validateInput(modelName: string, data: any): string | null {
    const rules = VALIDATION_RULES[modelName];
    if (!rules) return null;
    for (const field of rules.required) {
        if (!data[field] && data[field] !== 0) return rules.messages[field] || `${field} maydoni to'ldirilishi shart`;
    }
    return null;
}

function sanitizeForPrisma(modelName: string, data: any): any {
    const allowed = SCHEMA_FIELDS[modelName];
    if (!allowed) return data;
    const sanitized: any = {};
    allowed.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
            sanitized[field] = data[field];
        }
    });
    return sanitized;
}

// ─── Collection Middleware ────────────────────────────────────────────────────
router.use('/:collection', requireAuth, requireRole, async (req, res, next) => {
    const { collection } = req.params;
    let modelName = MODEL_MAP[collection];

    if (!modelName) {
        // Check if direct Prisma model exists
        // @ts-ignore
        if (!FORCE_GENERIC.has(collection) && prisma[collection]) {
            modelName = collection;
        } else {
            (req as any).useFallback = true;
            (req as any).modelName = collection;
            return next();
        }
    }

    // @ts-ignore
    if (!prisma[modelName]) {
        (req as any).useFallback = true;
        (req as any).modelName = collection;
        return next();
    }

    (req as any).useFallback = false;
    (req as any).modelName = modelName;

    // Global Sanitization + Normalization on writes
    // IMPORTANT: normalize must run BEFORE sanitize so field aliases
    // (teacher→teacherName, maxStudents→maxSize) are resolved first
    if (req.method === 'POST' || req.method === 'PUT') {
        req.body = normalizeData(modelName, req.body);
        req.body = sanitizeForPrisma(modelName, req.body);
    }

    next();
});

function transformForClient(modelName: string, data: any): any {
    if (modelName === 'group') {
        if (data.days && typeof data.days === 'string') {
            try { data.days = JSON.parse(data.days); } catch { data.days = []; }
        } else if (!data.days) {
            data.days = [];
        }
        // Restore teacher name and maxSize for frontend compatibility
        if (data.teacherName !== undefined) {
            data.teacher = data.teacherName;
        }
        if (data.maxSize !== undefined) {
            data.maxStudents = data.maxSize;
        }
    }
    return data;
}

// ─── GET /:collection ─────────────────────────────────────────────────────────
router.get('/:collection', async (req, res) => {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 0;

    try {
        if ((req as any).useFallback) {
            const collection = (req as any).modelName;
            const docs = await prisma.genericDocument.findMany({
                where: { collection },
                orderBy: { createdAt: 'desc' },
            });
            const mapped = docs.map((d: any) => {
                try { return { id: d.id, ...JSON.parse(d.data) }; }
                catch { return { id: d.id }; }
            });
            if (page > 0 && limit > 0) {
                const start = (page - 1) * limit;
                return res.json({ data: mapped.slice(start, start + limit), total: mapped.length, page, limit });
            }
            return res.json(mapped);
        }

        const modelName = (req as any).modelName;
        if (page > 0 && limit > 0) {
            // @ts-ignore
            const [total, data] = await Promise.all([
                // @ts-ignore
                prisma[modelName].count(),
                // @ts-ignore
                prisma[modelName].findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
            ]);
            return res.json({ data, total, page, limit });
        }

        try {
            // @ts-ignore
            const data = await prisma[modelName].findMany({ orderBy: { createdAt: 'desc' } });
            res.json(data.map((item: any) => transformForClient(modelName, item)));
        } catch {
            // Some models don't have createdAt, try without
            // @ts-ignore
            const data = await prisma[modelName].findMany();
            res.json(data.map((item: any) => transformForClient(modelName, item)));
        }
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── GET /:collection/:id ─────────────────────────────────────────────────────
router.get('/:collection/:id', async (req, res) => {
    try {
        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.findUnique({ where: { id: req.params.id } });
            if (!doc) return res.status(404).json({ message: 'Topilmadi' });
            try { return res.json({ id: doc.id, ...JSON.parse(doc.data) }); }
            catch { return res.json({ id: doc.id }); }
        }
        // @ts-ignore
        const data = await prisma[(req as any).modelName].findUnique({ where: { id: req.params.id } });
        if (!data) return res.status(404).json({ message: 'Topilmadi' });
        res.json(transformForClient((req as any).modelName, data));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── POST /:collection ────────────────────────────────────────────────────────
// ─── Special: Enroll student into group (must be before /:collection POST) ────
router.post('/enrollments', requireAuth, async (req, res) => {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) return res.status(400).json({ message: "studentId va groupId kiritilishi shart" });
    try {
        const existing = await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
        if (existing) return res.json({ id: existing.id, studentId, groupId, alreadyEnrolled: true });
        const enrollment = await prisma.enrollment.create({ data: { studentId, groupId } });
        res.json(enrollment);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── Special: Remove student from group (must be before /:collection/:id DELETE)
router.delete('/enrollments/remove', requireAuth, async (req, res) => {
    const { studentId, groupId } = req.body;
    try {
        await prisma.enrollment.delete({ where: { studentId_groupId: { studentId, groupId } } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

router.post('/:collection', async (req, res) => {
    const { collection } = req.params;
    try {
        if (!(req as any).useFallback) {
            const validationError = validateInput((req as any).modelName, req.body);
            if (validationError) return res.status(400).json({ message: validationError });
        }

        let finalData: any;

        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.create({
                data: { collection, data: JSON.stringify(req.body) }
            });
            try { finalData = { id: doc.id, ...JSON.parse(doc.data) }; }
            catch { finalData = { id: doc.id }; }
        } else {
            // @ts-ignore
            finalData = await prisma[(req as any).modelName].create({ data: req.body });
        }

        // ─── System Notifications ──────────────────────────────────────
        try {
            let notifTitle = '';
            let notifMessage = '';

            if (collection === 'leads') {
                notifTitle = 'Yangi Lid';
                notifMessage = `Qiziquvchi qo'shildi: ${req.body.name}`;
            } else if (collection === 'students') {
                notifTitle = "Yangi O'quvchi";
                notifMessage = `Tizimga yangi o'quvchi qo'shildi: ${req.body.name}`;
            } else if (collection === 'groups') {
                notifTitle = 'Yangi Guruh';
                notifMessage = `Tizimda yangi guruh ochildi: ${req.body.name || 'Nomsiz'}`;
            } else if ((collection === 'finance' || collection === 'transactions') && req.body.type === 'income') {
                notifTitle = "To'lov Qabul Qilindi";
                notifMessage = `${req.body.amount} so'm miqdorida to'lov qabul qilindi.`;
            }

            if (notifTitle) {
                await prisma.genericDocument.create({
                    data: {
                        collection: 'notifications',
                        data: JSON.stringify({ title: notifTitle, message: notifMessage, type: 'info', isRead: false, time: new Date().toISOString() })
                    }
                });
            }
        } catch { /* Notification errors are silent */ }

        res.json(finalData);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── PUT /:collection/:id ──────────────────────────────────────────────────────
router.put('/:collection/:id', async (req, res) => {
    try {
        if ((req as any).useFallback) {
            const existing = await prisma.genericDocument.findUnique({ where: { id: req.params.id } });
            const existingData = existing ? (() => { try { return JSON.parse(existing.data); } catch { return {}; } })() : {};
            const mergedData = { ...existingData, ...req.body };
            const doc = await prisma.genericDocument.update({
                where: { id: req.params.id },
                data: { data: JSON.stringify(mergedData) }
            });
            try { return res.json({ id: doc.id, ...JSON.parse(doc.data) }); }
            catch { return res.json({ id: doc.id }); }
        }
        // @ts-ignore
        const data = await prisma[(req as any).modelName].update({ where: { id: req.params.id }, data: req.body });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── DELETE /:collection/:id with Cascade Cleanup ─────────────────────────────
router.delete('/:collection/:id', async (req, res) => {
    const { collection, id } = req.params;
    try {
        if ((req as any).useFallback) {
            const doc = await prisma.genericDocument.findUnique({ where: { id } });
            if (!doc) return res.status(404).json({ message: 'Topilmadi' });

            if (collection === 'students') {
                await prisma.genericDocument.deleteMany({
                    where: { collection: { in: ['attendance', 'assessments', 'payments', 'journal', 'exams', 'notes'] }, data: { contains: `"studentId":"${id}"` } }
                });
            }
            if (collection === 'groups') {
                await prisma.genericDocument.deleteMany({
                    where: { collection: { in: ['schedule', 'attendance', 'assessments', 'journal', 'exams', 'notes'] }, data: { contains: `"groupId":"${id}"` } }
                });
            }
            if (collection === 'leads') {
                await prisma.genericDocument.deleteMany({
                    where: { collection: { in: ['leadActivities', 'lead_activities'] }, data: { contains: `"leadId":"${id}"` } }
                });
            }

            await prisma.genericDocument.delete({ where: { id } });
            return res.json({ success: true });
        }

        // Native Prisma models — schema cascades handle related Prisma records.
        // Also clean up any GenericDocument-stored related records.
        if (collection === 'students') {
            await prisma.genericDocument.deleteMany({
                where: { collection: { in: ['attendance', 'assessments', 'journal', 'exams', 'notes'] }, data: { contains: `"studentId":"${id}"` } }
            });
        }
        if (collection === 'groups') {
            await prisma.genericDocument.deleteMany({
                where: { collection: { in: ['schedule', 'attendance', 'assessments', 'journal', 'exams', 'notes'] }, data: { contains: `"groupId":"${id}"` } }
            });
        }
        if (collection === 'leads') {
            await prisma.genericDocument.deleteMany({
                where: { collection: { in: ['leadActivities'] }, data: { contains: `"leadId":"${id}"` } }
            });
        }

        // @ts-ignore
        await prisma[(req as any).modelName].delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── Special: Get enrollments for a group ─────────────────────────────────────
router.get('/enrollments/group/:groupId', requireAuth, async (req, res) => {
    try {
        const enrollments = await prisma.enrollment.findMany({
            where: { groupId: req.params.groupId },
            include: { student: true },
        });
        res.json(enrollments);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

export default router;
