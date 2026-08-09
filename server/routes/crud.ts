import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// ─── Model Map: frontend collection → Prisma model name ──────────────────────
// Collections NOT listed here will fallback to GenericDocument (JSON store)
const MODEL_MAP: Record<string, string> = {
    // ── Core entities ────────────────────────────────────────────────────────
    'courses':        'course',
    'courseTiers':    'courseTier',
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
    'performanceReviews': 'performanceReview',
    'staffDocuments':     'staffDocument',
    'notifications':  'notification',
    'settings':       'setting',
    'pageContent':    'pageContent',
    'gallery':        'galleryItem',
    'forms':          'targetForm',
    // ── Academic (Faza 0.2 — migrated from GenericDocument) ─────────────────
    'schedule':       'groupSchedule',
    'attendance':     'attendance',
    'assessment':     'assessment',
    'assessments':    'assessment',
    'exams':          'exam',
    'notes':          'groupStudentNote',
    'campaigns':      'campaign',
    'leadActivities': 'leadActivity',
    'lead_activities':'leadActivity',
};

// Collections still stored as GenericDocument (truly schema-less or rarely used)
const FORCE_GENERIC: Set<string> = new Set([
    'automations',
    'enrollments_extra',
    'journal', // JournalEntry model has different structure; migrated via journalEntries endpoint
]);

// SCHEMA_FIELDS: whitelist for Prisma writes to avoid "Unknown field" errors
const SCHEMA_FIELDS: Record<string, string[]> = {
    // ── Core entities ────────────────────────────────────────────────────────
    'lead': ['name', 'phone', 'email', 'stage', 'source', 'course', 'score', 'status', 'date', 'notes', 'extraField'],
    'student': ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone', 'source', 'status', 'notes', 'photo', 'course', 'group', 'paymentStatus', 'balance', 'joinedDate'],
    'group': ['name', 'courseId', 'teacherId', 'status', 'startDate', 'endDate', 'maxSize', 'price'],
    'room': ['name', 'capacity', 'color'],
    'course': ['name', 'title', 'category', 'description', 'price', 'duration', 'lessonDuration', 'lessonsPerWeek', 'status', 'image'],
    'courseTier': ['courseId', 'name', 'price'],
    'transaction': ['type', 'amount', 'category', 'description', 'date', 'method', 'studentId', 'studentName', 'staffId', 'staffName'],
    'payment': ['studentId', 'amount', 'method', 'date', 'month', 'dueDate', 'status', 'notes'],
    'staffMember': ['name', 'role', 'email', 'phone', 'salary', 'joinedDate', 'status', 'department', 'address', 'passport', 'education', 'experience', 'photo'],
    'post': ['title', 'content', 'excerpt', 'imageUrl', 'author', 'status', 'category', 'date'],
    'inventoryItem': ['name', 'category', 'quantity', 'price', 'location', 'condition', 'purchaseDate', 'notes'],
    'task': ['title', 'completed', 'userId', 'staffId', 'priority', 'deadline'],
    'performanceReview': ['staffId', 'date', 'reviewer', 'feedback', 'rating'],
    'staffDocument': ['staffId', 'name', 'type', 'uploadDate'],
    'targetForm': ['title', 'description', 'course', 'url', 'isActive', 'submissions'],
    // ── Academic (Faza 0.2) ──────────────────────────────────────────────────
    'groupSchedule':   ['groupId', 'groupName', 'teacher', 'room', 'startTime', 'endTime', 'days', 'color'],
    'attendance':      ['groupId', 'date', 'records'],
    'assessment':      ['studentId', 'groupId', 'title', 'type', 'score', 'maxScore', 'date', 'subject', 'notes'],
    'exam':            ['groupId', 'studentId', 'examName', 'score'],
    'groupStudentNote':['groupId', 'studentId', 'note'],
    'campaign':        ['name', 'platform', 'budget', 'spent', 'leads', 'startDate', 'endDate', 'status', 'notes'],
    'leadActivity':    ['leadId', 'type', 'content', 'date', 'user'],
};

// Fields stored as JSON-in-Text columns (Prisma schema comment: "JSON representation").
// The frontend sends/expects real arrays — these must be stringified before writing to
// Prisma and parsed back after reading, or Prisma throws (String column, Array value).
const JSON_TEXT_FIELDS: Record<string, string[]> = {
    'attendance':    ['records'],
    'groupSchedule': ['days'],
};

function stringifyJsonFields(modelName: string, data: any): any {
    const fields = JSON_TEXT_FIELDS[modelName];
    if (!fields) return data;
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(data, field) && typeof data[field] !== 'string') {
            data[field] = JSON.stringify(data[field] ?? []);
        }
    }
    return data;
}

// Ba'zi modellar frontend uchun bog'liq nom/hisoblarni ham qaytarishi kerak
// (masalan guruh ro'yxatida kurs nomi, o'qituvchi ismi, o'quvchilar soni).
// Generic CRUD hech qanday include ishlatmagani uchun bular avval UI'da bo'sh
// ko'rinardi (CrmGroups.tsx jadvali courseId/teacherId'ni ko'rsata olmasdi).
const RELATION_INCLUDES: Record<string, any> = {
    'group': {
        course: { select: { id: true, name: true, price: true, lessonDuration: true, duration: true, tiers: true } },
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
    },
    'lead': {
        activities: { orderBy: { date: 'desc' } },
    },
    'course': {
        tiers: { orderBy: { price: 'asc' } },
    },
};

function parseJsonFields(modelName: string, row: any): any {
    const fields = JSON_TEXT_FIELDS[modelName];
    if (!fields || !row) return row;
    const parsed = { ...row };
    for (const field of fields) {
        if (typeof parsed[field] === 'string') {
            try { parsed[field] = JSON.parse(parsed[field]); }
            catch { parsed[field] = []; }
        }
    }
    return parsed;
}

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
    if (modelName === 'transaction') {
        if (data.amount !== undefined) data.amount = Number(data.amount) || 0;
    }
    if (modelName === 'payment') {
        if (data.amount !== undefined) data.amount = Number(data.amount) || 0;
    }
    if (modelName === 'student') {
        if (data.balance !== undefined) data.balance = Number(data.balance) || 0;
    }
    return data;
}

// Validation rules
const VALIDATION_RULES: Record<string, { required: string[]; messages: Record<string, string> }> = {
    lead: { required: ['name', 'phone'], messages: { name: 'Ism kiritilishi shart', phone: 'Telefon raqam kiritilishi shart' } },
    student: { required: ['name'], messages: { name: "O'quvchi ismi kiritilishi shart" } },
    group: { required: ['name', 'courseId'], messages: { name: 'Guruh nomi kiritilishi shart', courseId: 'Kurs tanlanishi shart' } },
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

// ─── Staff → User (login akkaunt) ─────────────────────────────────────────────
// Xodim lavozimini CRM User roliga moslashtirish (ruxsat lavozimdan keladi)
function mapStaffRoleToUserRole(position: string): string {
    const p = (position || '').toLowerCase();
    if (p.includes('direktor') || p.includes('director')) return 'ADMIN';
    if (p.includes('admin')) return 'ADMIN';
    if (p.includes('menejer') || p.includes('manager') || p.includes('hr')) return 'MANAGER';
    if (p.includes("o'qituvchi") || p.includes('oqituvchi') || p.includes("o'qutuvchi") ||
        p.includes('ustoz') || p.includes('teacher')) return 'TEACHER';
    return 'TEACHER'; // eng past ruxsat — default
}

function normalizePhone(raw: string): string {
    return String(raw || '').replace(/\s/g, '').trim();
}

// Xodim uchun login (User) hisobini yaratadi. Telefon ikkala jadvalni bog'laydi.
// Mavjud User bo'lsa — TEGILMAYDI (admin parolini tasodifan o'zgartirmaslik uchun).
async function ensureStaffLoginAccount(staff: any, rawPassword?: string) {
    const phone = normalizePhone(staff.phone);
    if (!phone) return null;

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return existing; // allaqachon mavjud — o'zgartirmaymiz

    const role = mapStaffRoleToUserRole(staff.role);
    const hashed = await bcrypt.hash(rawPassword || '123456', 12);
    return await prisma.user.create({
        data: {
            phone,
            name: staff.name || 'Xodim',
            password: hashed,
            role,
            isActive: true,
            permissions: '[]',
        } as any,
    });
}

// ─── Teachers (public directory) — haqiqiy manba User modeli (role=TEACHER) ──
// 'teachers' kolleksiyasiga hech qachon hech narsa yozilmaydi (haqiqiy ustozlar
// CrmTeachers.tsx orqali /auth/users'da saqlanadi) — shuning uchun GenericDocument
// fallback doim bo'sh qaytaradi va ommaviy sayt, qidiruv, dashboard, BI ustozlar
// ro'yxatini hech qachon ko'rmaydi. Shu yerda User'dan jonli, xavfsiz (parol/
// telefon/emailsiz) proyeksiya hisoblab qaytaramiz.
async function getPublicTeachersList() {
    const users = await prisma.user.findMany({ where: { role: 'TEACHER' }, orderBy: { createdAt: 'desc' } });
    return users.map((u: any) => {
        let meta: any = {};
        try {
            const perms = JSON.parse(u.permissions || '[]');
            const metaObj = perms.find((p: any) => p.meta);
            if (metaObj) meta = metaObj.meta;
        } catch { /* ignore */ }
        return {
            id: u.id,
            name: u.name,
            role: meta.subject || '',
            exp: meta.exp || '',
            desc: meta.desc || '',
            img: u.avatar || '',
        };
    });
}

// Ommaviy sayt (Home/About/Blog/Teachers) shu kolleksiyalarni O'QISH uchun login
// talab qilmasligi kerak — aks holda haqiqiy (login qilmagan) tashrif buyuruvchi
// uchun bosh sahifa matni, galereya, yangiliklar va ustozlar ro'yxati HECH QACHON
// yuklanmaydi (401). Faqat GET uchun; yozish (POST/PUT/DELETE) hamon requireAuth talab qiladi.
const PUBLIC_READ_COLLECTIONS = new Set(['pageContent', 'gallery', 'news', 'teachers']);

function authForCollection(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.method === 'GET' && PUBLIC_READ_COLLECTIONS.has(req.params.collection)) {
        return next();
    }
    requireAuth(req, res, (err?: any) => {
        if (err) return next(err);
        requireRole(req, res, next);
    });
}

// ─── Collection Middleware ────────────────────────────────────────────────────
router.use('/:collection', authForCollection, async (req, res, next) => {
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
    if (req.method === 'POST' || req.method === 'PUT') {
        // Staff uchun login ma'lumotini saqlab qolamiz (sanitize uni o'chiradi)
        if (modelName === 'staffMember') {
            (req as any).staffLoginPassword = req.body.password;
            (req as any).staffCreateLogin = req.body.createLogin !== false; // default true
        }
        req.body = sanitizeForPrisma(modelName, req.body);
        req.body = normalizeData(modelName, req.body);
        req.body = stringifyJsonFields(modelName, req.body);
    }

    next();
});

// ─── GET /:collection ─────────────────────────────────────────────────────────
router.get('/:collection', async (req, res) => {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 0;

    if (req.params.collection === 'teachers') {
        try {
            return res.json(await getPublicTeachersList());
        } catch (error) {
            return res.status(500).json({ error: String(error) });
        }
    }

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
        const include = RELATION_INCLUDES[modelName];
        // Lead uchun soft-delete filtri — deletedAt bulk.ts orqali qo'yiladi, lekin
        // shu vaqtgacha hech bir o'qish yo'li uni hisobga olmagan edi (o'chirilgan
        // lidlar Kanban/statistikada ko'rinaverardi).
        const where = modelName === 'lead' ? { deletedAt: null } : undefined;
        if (page > 0 && limit > 0) {
            // @ts-ignore
            const [total, data] = await Promise.all([
                // @ts-ignore
                prisma[modelName].count({ where }),
                // @ts-ignore
                prisma[modelName].findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, ...(include && { include }) }),
            ]);
            return res.json({ data: data.map((row: any) => parseJsonFields(modelName, row)), total, page, limit });
        }

        try {
            // @ts-ignore
            const data = await prisma[modelName].findMany({ where, orderBy: { createdAt: 'desc' }, ...(include && { include }) });
            res.json(data.map((row: any) => parseJsonFields(modelName, row)));
        } catch {
            // Some models don't have createdAt, try without
            // @ts-ignore
            const data = await prisma[modelName].findMany({ where, ...(include && { include }) });
            res.json(data.map((row: any) => parseJsonFields(modelName, row)));
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
        const modelName = (req as any).modelName;
        const include = RELATION_INCLUDES[modelName];
        // @ts-ignore
        const data = await prisma[modelName].findUnique({ where: { id: req.params.id }, ...(include && { include }) });
        if (!data || (modelName === 'lead' && data.deletedAt)) return res.status(404).json({ message: 'Topilmadi' });
        res.json(parseJsonFields(modelName, data));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── POST /:collection ────────────────────────────────────────────────────────
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
            const modelName = (req as any).modelName;
            const include = RELATION_INCLUDES[modelName];
            // @ts-ignore
            finalData = await prisma[modelName].create({ data: req.body, ...(include && { include }) });
            finalData = parseJsonFields(modelName, finalData);
        }

        // ─── Staff → login (User) hisobi ──────────────────────────────
        // Xodim telefon bilan qo'shilsa, botga kirish uchun User yaratiladi
        if ((req as any).modelName === 'staffMember' && (req as any).staffCreateLogin && finalData?.phone) {
            try {
                const loginUser = await ensureStaffLoginAccount(finalData, (req as any).staffLoginPassword);
                if (loginUser) {
                    finalData.loginCreated = true;
                    finalData.loginRole = loginUser.role;
                }
            } catch (e) {
                console.error('[CRUD] Staff login account error:', e);
                // Xodim yaratildi — login xatosi jim o'tkaziladi
            }
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
                await prisma.notification.create({
                    data: { title: notifTitle, message: notifMessage, type: 'info', isRead: false }
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
        const modelName = (req as any).modelName;
        const include = RELATION_INCLUDES[modelName];
        // @ts-ignore
        const data = await prisma[modelName].update({ where: { id: req.params.id }, data: req.body, ...(include && { include }) });
        res.json(parseJsonFields(modelName, data));
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

        // Native Prisma models — Faza 0.2: academic/marketing collections are now
        // native tables with onDelete: Cascade in schema, so no manual cleanup needed.
        // Only clean up truly-generic (FORCE_GENERIC) related docs.
        if (collection === 'students') {
            // journal still in FORCE_GENERIC
            await prisma.genericDocument.deleteMany({
                where: { collection: 'journal', data: { contains: `"studentId":"${id}"` } }
            });
        }
        if (collection === 'groups') {
            await prisma.genericDocument.deleteMany({
                where: { collection: 'journal', data: { contains: `"groupId":"${id}"` } }
            });
        }
        // leads: leadActivities now native — cascade handles it

        // Lid — soft delete (o'chirilgan lid statistikadan yashirinadi, lekin
        // ma'lumot yo'qolmaydi; hard-delete keyingi bosqichda faqat ADMIN uchun
        // alohida yo'l bilan qo'shiladi).
        if ((req as any).modelName === 'lead') {
            await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
            return res.json({ success: true });
        }

        // @ts-ignore
        await prisma[(req as any).modelName].delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── Special: Enroll student into group ───────────────────────────────────────
router.post('/enrollments', requireAuth, async (req, res) => {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) return res.status(400).json({ message: "studentId va groupId kiritilishi shart" });
    try {
        // Upsert — ignore if already enrolled
        const existing = await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
        if (existing) return res.json({ id: existing.id, studentId, groupId, alreadyEnrolled: true });
        const enrollment = await prisma.enrollment.create({ data: { studentId, groupId } });
        res.json(enrollment);
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

// ─── Special: Remove student from group ───────────────────────────────────────
router.delete('/enrollments/remove', requireAuth, async (req, res) => {
    const { studentId, groupId } = req.body;
    try {
        await prisma.enrollment.delete({ where: { studentId_groupId: { studentId, groupId } } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

export default router;
