import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { invalidate, NS } from '../services/cache.js';
import { emitToAdmins, emitToAll, emitToUser } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// ─── Server-side search/filter/sort config ────────────────────────────────────
// Maps model name → fields searchable by text "search" query param
const SEARCH_FIELDS: Record<string, string[]> = {
    student: ['name', 'phone', 'email', 'parentName', 'parentPhone'],
    lead: ['name', 'phone', 'email', 'course', 'source'],
    course: ['name', 'title', 'category', 'description'],
    group: ['name', 'subject', 'teacherName'],
    staffMember: ['name', 'role', 'phone', 'email', 'department'],
    user: ['name', 'phone', 'email'],
    inventoryItem: ['name', 'category', 'location'],
    post: ['title', 'excerpt', 'category'],
    transaction: ['category', 'description', 'studentName', 'staffName'],
};

// Soft-delete-aware models — auto-add { deletedAt: null } to where clause
const SOFT_DELETE_MODELS = new Set([
    'student', 'lead', 'course', 'group', 'user', 'transaction', 'payment',
    'staffMember', 'inventoryItem', 'test',
]);

/**
 * Parse query params for server-side filter/sort/pagination.
 * Supports:
 *   ?page=1&limit=20
 *   ?search=foo
 *   ?sort=createdAt:desc,name:asc
 *   ?filter[status]=active&filter[stage][in]=new,contacted
 *   ?filter[createdAt][gte]=2026-01-01
 */
function parseQueryFilters(query: any, modelName: string): {
    where: any;
    orderBy: any;
    skip: number;
    take: number | undefined;
    hasFilter: boolean;
} {
    const where: any = {};
    let hasFilter = false;

    // Soft delete default
    if (SOFT_DELETE_MODELS.has(modelName) && query.includeDeleted !== 'true') {
        where.deletedAt = null;
    }

    // Text search across multiple fields (SQLite case-sensitive limitation noted)
    const search = (query.search || '').trim();
    if (search && SEARCH_FIELDS[modelName]) {
        where.OR = SEARCH_FIELDS[modelName].map(field => ({
            [field]: { contains: search },
        }));
        hasFilter = true;
    }

    // filter[key]=value or filter[key][op]=value
    Object.entries(query).forEach(([key, value]) => {
        if (!key.startsWith('filter[')) return;
        // filter[status] -> ['status']
        // filter[createdAt][gte] -> ['createdAt', 'gte']
        const m = key.match(/^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/);
        if (!m) return;
        const field = m[1];
        const op = m[2];
        let v: any = value;
        if (op === 'in' && typeof v === 'string') v = v.split(',');
        if (op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') {
            where[field] = { ...where[field], [op]: v };
        } else if (op === 'in') {
            where[field] = { in: Array.isArray(v) ? v : [v] };
        } else if (op === 'not') {
            where[field] = { not: v };
        } else {
            where[field] = v;
        }
        hasFilter = true;
    });

    // Sort: createdAt:desc,name:asc
    const sortRaw = (query.sort || '').toString();
    let orderBy: any = { createdAt: 'desc' };
    if (sortRaw) {
        const parts = sortRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (parts.length === 1) {
            const [field, dir] = parts[0].split(':');
            orderBy = { [field]: (dir === 'asc' ? 'asc' : 'desc') };
        } else if (parts.length > 1) {
            orderBy = parts.map((p: string) => {
                const [field, dir] = p.split(':');
                return { [field]: (dir === 'asc' ? 'asc' : 'desc') };
            });
        }
    }

    const page = parseInt(query.page) || 0;
    const limit = parseInt(query.limit) || 0;
    const skip = page > 0 && limit > 0 ? (page - 1) * limit : 0;
    const take = limit > 0 ? limit : undefined;

    return { where, orderBy, skip, take, hasFilter };
}

// Cache namespaces affected by collection mutations
function cacheNamespacesFor(collection: string): string[] {
    const namespaces = [NS.ANALYTICS, NS.DASHBOARD];
    if (collection === 'transactions' || collection === 'finance' || collection === 'payments') {
        namespaces.push(NS.FINANCE, NS.REPORTS);
    }
    if (collection === 'students' || collection === 'leads' || collection === 'groups') {
        namespaces.push(NS.REPORTS);
    }
    return namespaces;
}

// ─── Model Map: frontend collection → Prisma model name ──────────────────────
// Collections NOT listed here will fallback to GenericDocument (JSON store)
const MODEL_MAP: Record<string, string> = {
    'courses':        'course',
    'groups':         'group',
    'students':       'student',
    'rooms':          'room',
    'staff':          'staffMember',
    'staffMembers':   'staffMember',
    'finance':        'transaction',
    'transactions':   'transaction',
    'payments':       'payment',
    'leads':          'lead',
    'posts':          'post',
    'news':           'post',
    'inventory':      'inventoryItem',
    'tasks':          'task',
    'notifications':  'notification',
    'settings':       'setting',
    'pageContent':    'pageContent',
    'gallery':        'galleryItem',
    'forms':          'targetForm',
    'campaigns':      'campaign',
    'leadActivities': 'leadActivity',
    'lead_activities':'leadActivity',
    'assessments':    'assessment',
    'journal':        'journalEntry',
    'attendance':     'attendanceRecord',
    'workflows':      'workflow',
    'workflowLogs':   'workflowLog',
};

// Always use GenericDocument for these (only truly unstructured / extra data)
const FORCE_GENERIC: Set<string> = new Set([
    'schedule', 'exams', 'notes', 'automations', 'enrollments_extra',
]);

// SCHEMA_FIELDS: whitelist for Prisma writes to avoid "Unknown field" errors
const SCHEMA_FIELDS: Record<string, string[]> = {
    'lead': ['name', 'phone', 'email', 'stage', 'source', 'course', 'score', 'status', 'date', 'notes'],
    'student': ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone', 'source', 'status', 'notes', 'photo', 'telegramChatId', 'parentTelegramId'],
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
    'campaign': ['name', 'platform', 'budget', 'spent', 'leads', 'startDate', 'endDate', 'status', 'notes'],
    'leadActivity': ['leadId', 'type', 'content', 'date', 'user'],
    'assessment': ['studentId', 'title', 'type', 'score', 'maxScore', 'date', 'subject', 'notes'],
    'journalEntry': ['groupId', 'studentId', 'teacherId', 'date', 'topic', 'homework', 'grade', 'comment'],
    'attendanceRecord': ['studentId', 'groupId', 'date', 'status', 'checkIn', 'checkOut', 'note'],
    'workflow': ['name', 'trigger', 'isActive', 'config', 'lastRun', 'runCount'],
    'notification': ['userId', 'title', 'message', 'type', 'isRead'],
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
            let mapped = docs.map((d: any) => {
                try { return { id: d.id, ...JSON.parse(d.data) }; }
                catch { return { id: d.id }; }
            });

            // Client-side text search for GenericDocument fallback
            const search = (req.query.search as string)?.trim().toLowerCase();
            if (search) {
                mapped = mapped.filter((item: any) =>
                    Object.values(item).some(v =>
                        typeof v === 'string' && v.toLowerCase().includes(search)
                    )
                );
            }

            if (page > 0 && limit > 0) {
                const start = (page - 1) * limit;
                return res.json({ data: mapped.slice(start, start + limit), total: mapped.length, page, limit });
            }
            return res.json(mapped);
        }

        const modelName = (req as any).modelName;
        const { where, orderBy, skip, take, hasFilter } = parseQueryFilters(req.query, modelName);

        // Paginated response (when ?page= and ?limit= are present, OR filter is used)
        if ((page > 0 && limit > 0) || hasFilter) {
            // @ts-ignore
            const [total, data] = await Promise.all([
                // @ts-ignore
                prisma[modelName].count({ where }),
                // @ts-ignore
                prisma[modelName].findMany({
                    where,
                    orderBy,
                    skip,
                    take,
                    ...(modelName === 'group' ? { include: { _count: { select: { enrollments: true } } } } : {}),
                }),
            ]);

            const mapped = data.map((item: any) => {
                if (modelName === 'group' && item._count) {
                    const { _count, ...rest } = item;
                    return transformForClient('group', {
                        ...rest,
                        studentCount: _count?.enrollments || 0,
                        students: Array(_count?.enrollments || 0).fill(null),
                    });
                }
                return transformForClient(modelName, item);
            });

            if (page > 0 && limit > 0) {
                return res.json({ data: mapped, total, page, limit });
            }
            return res.json(mapped);
        }

        // No pagination/filter — fetch everything (legacy fast path)
        try {
            // Guruhlar uchun enrollment count ni qo'shamiz
            if (modelName === 'group') {
                const data = await prisma.group.findMany({
                    where,
                    orderBy,
                    include: { _count: { select: { enrollments: true } } },
                });
                return res.json(data.map((item: any) => {
                    const { _count, ...rest } = item;
                    return transformForClient('group', {
                        ...rest,
                        studentCount: _count?.enrollments || 0,
                        students: Array(_count?.enrollments || 0).fill(null),
                    });
                }));
            }

            // @ts-ignore
            const data = await prisma[modelName].findMany({ where, orderBy });
            res.json(data.map((item: any) => transformForClient(modelName, item)));
        } catch {
            // Some models don't have createdAt, try without
            // @ts-ignore
            const data = await prisma[modelName].findMany({ where });
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
    const { studentId, groupId, startDate } = req.body;
    if (!studentId || !groupId) return res.status(400).json({ message: "studentId va groupId kiritilishi shart" });
    try {
        const existing = await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
        if (existing) return res.json({ id: existing.id, studentId, groupId, alreadyEnrolled: true });
        const enrollment = await prisma.enrollment.create({
            data: { studentId, groupId, startDate: startDate || new Date().toISOString().split('T')[0] } as any
        });
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

        // ─── System Notifications → Prisma Notification model ──────────
        try {
            let notifTitle = '';
            let notifMessage = '';
            let notifType = 'info';

            if (collection === 'leads') {
                notifTitle = 'Yangi Lid';
                notifMessage = `Qiziquvchi qo'shildi: ${req.body.name}`;
                notifType = 'info';
            } else if (collection === 'students') {
                notifTitle = "Yangi O'quvchi";
                notifMessage = `Tizimga yangi o'quvchi qo'shildi: ${req.body.name}`;
                notifType = 'success';
            } else if (collection === 'groups') {
                notifTitle = 'Yangi Guruh';
                notifMessage = `Tizimda yangi guruh ochildi: ${req.body.name || 'Nomsiz'}`;
                notifType = 'info';
            } else if ((collection === 'finance' || collection === 'transactions') && req.body.type === 'income') {
                notifTitle = "To'lov Qabul Qilindi";
                notifMessage = `${Number(req.body.amount).toLocaleString('uz-UZ')} so'm to'lov qabul qilindi.`;
                notifType = 'success';
            } else if (collection === 'payments') {
                notifTitle = "To'lov Ro'yxatga Olindi";
                notifMessage = `${Number(req.body.amount).toLocaleString('uz-UZ')} so'm — ${req.body.method || 'Naqd'}`;
                notifType = 'success';
            }

            if (notifTitle) {
                // Barcha adminlarga bildirishnoma yuborish
                const admins = await prisma.user.findMany({
                    where: { role: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] }, isActive: true },
                    select: { id: true },
                });
                const notifs = admins.map(admin => ({
                    userId: admin.id,
                    title: notifTitle,
                    message: notifMessage,
                    type: notifType,
                    isRead: false,
                }));
                await prisma.notification.createMany({ data: notifs });

                // Real-time push to each admin
                try {
                    admins.forEach(admin => {
                        emitToUser(admin.id, 'notification:new', {
                            title: notifTitle,
                            message: notifMessage,
                            type: notifType,
                            createdAt: new Date().toISOString(),
                        });
                    });
                } catch {/* silent */}
            }
        } catch { /* Notification errors are silent */ }

        // Invalidate analytics/cache for this collection
        try {
            cacheNamespacesFor(collection).forEach(ns => invalidate(ns));
        } catch { /* silent */ }

        // Real-time event for this collection
        try {
            const event = `${collection}:created`;
            emitToAll(event, finalData);
        } catch {/* silent */}

        // Audit log
        try {
            const user = (req as any).user;
            await logAudit({
                userId: user?.id,
                userName: user?.name || 'system',
                action: 'create',
                resource: (req as any).modelName || collection,
                resourceId: finalData?.id,
                after: finalData,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']?.toString(),
            });
        } catch {/* silent */}

        res.json(finalData);
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── PUT /:collection/:id ──────────────────────────────────────────────────────
router.put('/:collection/:id', async (req, res) => {
    const { collection } = req.params;
    try {
        // Capture before for audit log
        let before: any = null;
        if (!(req as any).useFallback) {
            try {
                // @ts-ignore
                before = await prisma[(req as any).modelName].findUnique({ where: { id: req.params.id } });
            } catch {}
        }

        let result: any;
        if ((req as any).useFallback) {
            const existing = await prisma.genericDocument.findUnique({ where: { id: req.params.id } });
            const existingData = existing ? (() => { try { return JSON.parse(existing.data); } catch { return {}; } })() : {};
            const mergedData = { ...existingData, ...req.body };
            const doc = await prisma.genericDocument.update({
                where: { id: req.params.id },
                data: { data: JSON.stringify(mergedData) }
            });
            try { result = { id: doc.id, ...JSON.parse(doc.data) }; }
            catch { result = { id: doc.id }; }
        } else {
            // @ts-ignore
            result = await prisma[(req as any).modelName].update({ where: { id: req.params.id }, data: req.body });
        }

        // Invalidate cache
        try { cacheNamespacesFor(collection).forEach(ns => invalidate(ns)); } catch {}

        // Real-time update event
        try { emitToAll(`${collection}:updated`, result); } catch {}

        // Audit
        try {
            const user = (req as any).user;
            await logAudit({
                userId: user?.id,
                userName: user?.name || 'system',
                action: 'update',
                resource: (req as any).modelName || collection,
                resourceId: req.params.id,
                before, after: result,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']?.toString(),
            });
        } catch {}

        res.json(result);
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

        // Soft delete for supported models
        const modelName = (req as any).modelName;
        // Capture before for audit
        let before: any = null;
        try {
            // @ts-ignore
            before = await prisma[modelName].findUnique({ where: { id } });
        } catch {}

        if (SOFT_DELETE_MODELS.has(modelName) && req.query.hard !== 'true') {
            try {
                // @ts-ignore
                await prisma[modelName].update({ where: { id }, data: { deletedAt: new Date() } });
                cacheNamespacesFor(collection).forEach(ns => invalidate(ns));
                try { emitToAll(`${collection}:deleted`, { id }); } catch {}
                try {
                    const user = (req as any).user;
                    await logAudit({
                        userId: user?.id,
                        userName: user?.name || 'system',
                        action: 'delete',
                        resource: modelName,
                        resourceId: id,
                        before,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']?.toString(),
                        metadata: { softDelete: true },
                    });
                } catch {}
                return res.json({ success: true, softDelete: true });
            } catch (err) {
                // Fall through to hard delete
            }
        }

        // @ts-ignore
        await prisma[modelName].delete({ where: { id } });

        // Invalidate cache
        try { cacheNamespacesFor(collection).forEach(ns => invalidate(ns)); } catch {}

        // Real-time delete event
        try { emitToAll(`${collection}:deleted`, { id }); } catch {}

        // Audit (hard delete)
        try {
            const user = (req as any).user;
            await logAudit({
                userId: user?.id,
                userName: user?.name || 'system',
                action: 'delete',
                resource: modelName,
                resourceId: id,
                before,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']?.toString(),
            });
        } catch {}

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── POST /:collection/:id/restore — Restore soft-deleted record ──────────────
router.post('/:collection/:id/restore', async (req, res) => {
    const { collection, id } = req.params;
    try {
        if ((req as any).useFallback) return res.status(400).json({ message: 'Restore not supported for this collection' });
        const modelName = (req as any).modelName;
        if (!SOFT_DELETE_MODELS.has(modelName)) {
            return res.status(400).json({ message: "Bu turdagi yozuvni qayta tiklab bo'lmaydi" });
        }
        // @ts-ignore
        const restored = await prisma[modelName].update({ where: { id }, data: { deletedAt: null } });
        cacheNamespacesFor(collection).forEach(ns => invalidate(ns));
        res.json(restored);
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
