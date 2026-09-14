import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../db.js';
import { requireAuth, requireRole, requireMinRole, ROLE_LEVEL } from '../middleware/auth.js';
import { withAudit } from '../middleware/audit.js';
import { requirePermission } from '../middleware/authorize.js';

const router = express.Router();

// Lavozim (Position) yozuvlari audit qilinadi — RBAC qayta qurish rejasi,
// Bosqich 4 topilmasi: bu yozuvlar (rol/ruxsat andozalarini belgilaydi)
// ilgari HECH QACHON audit qilinmasdi. Generic /:collection route'i o'nlab
// kolleksiyaga xizmat qilgani uchun audit HAMMASIGA emas, faqat Position'ga
// yoqiladi (boshqalar uchun ataylab yoqilmagan — kattaroq, alohida ko'rib
// chiqiladigan qaror).
const auditPosition = withAudit('position');
function auditPositionsOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.params.collection === 'positions') return auditPosition(req, res, next);
    next();
}

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
    'positions':      'position',
    'transactionCategories': 'transactionCategory',
    'finance':        'transaction',
    'transactions':   'transaction',
    'payments':       'payment',
    // 'leads' shu yerda YO'Q — server/routes/leads.ts (Faza 3) crud.ts'dan
    // OLDIN mount qilingan va /api/leads*ni to'liq soyalaydi (server/index.ts).
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
    'attendance':     'attendance', // eski JSON-blob (2026-09-13'dan yozilmaydi, faqat tarixiy o'qish) — server/routes/studentAttendance.ts'ga q.
    'attendanceRecords': 'attendanceRecord', // haqiqiy jadval — Dashboard/BI shundan o'qiydi (yozish uchun /api/attendance-records ishlatiladi)
    'assessment':     'assessment',
    'assessments':    'assessment',
    'exams':          'exam',
    'groupExams':     'groupExam',
    'notes':          'groupStudentNote',
    'campaigns':      'campaign',
    'leadActivities': 'leadActivity',
    'lead_activities':'leadActivity',
};

// ─── TEACHER ma'lumot ko'lami ──────────────────────────────────────────────────
// TEACHER GET orqali BUTUN jadvalni ko'rar edi (masalan /api/students —
// markazdagi HAR BIR o'quvchi, o'zining guruhlaridan qat'i nazar) va
// to'g'ridan-to'g'ri URL orqali (/groups/:boshqaUstozId) boshqa ustozning
// guruhini ochib, unga davomat/baho ham yoza olardi — hech qanday server
// tomonidan tekshiruv yo'q edi. Bu xarita shu modellar uchun TEACHER
// so'roviga qo'shimcha `where` filtri (yoki bitta yozuvni tekshirishda
// egalik) qo'shadi. Naqsh server/routes/staffPortal.ts'dan olingan (u
// yerda xuddi shunday `where.teacherId = userId` allaqachon ishlatiladi).
const TEACHER_SCOPE_MODELS: Record<string, (userId: string) => any> = {
    group: (userId) => ({ teacherId: userId }),
    student: (userId) => ({ enrollments: { some: { group: { teacherId: userId } } } }),
    attendance: (userId) => ({ group: { teacherId: userId } }),
    attendanceRecord: (userId) => ({ group: { teacherId: userId } }),
    assessment: (userId) => ({ group: { teacherId: userId } }),
    exam: (userId) => ({ group: { teacherId: userId } }),
    groupExam: (userId) => ({ group: { teacherId: userId } }),
    groupStudentNote: (userId) => ({ group: { teacherId: userId } }),
};

// Yozish (POST/PUT/DELETE) tomonida ham xuddi shu himoya kerak bo'lgan
// modellar — bularning har biri bitta guruhga tegishli (davomat/baho/
// imtihon/eslatma). Ro'yxatga OLINMAGAN: 'group'/'student' — ularga
// TEACHER yozish huquqi COLLECTION_WRITE_LEVEL orqali allaqachon yopiq
// (faqat MANAGER+).
// SEC-06 tuzatish: 'attendanceRecord' bu ro'yxatda YO'Q edi — generic
// POST/PUT /api/attendanceRecords (server/routes/studentAttendance.ts'ning
// maxsus, kuchliroq tekshiruvli /api/attendance-records'idan FARQLI, o'sha
// bilan bir Prisma modeliga yozadigan muqobil yo'l) orqali TEACHER
// ISTALGAN guruhga (o'ziniki bo'lmasa ham) davomat yoza olardi — hech
// qanday egalik tekshiruvisiz. Endi shu yerga ham qo'shildi.
const TEACHER_WRITE_SCOPE_MODELS = new Set(['attendance', 'attendanceRecord', 'assessment', 'exam', 'groupExam', 'groupStudentNote']);

async function teacherOwnsGroup(groupId: string | undefined | null, userId: string): Promise<boolean> {
    if (!groupId) return false;
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } });
    return !!group && group.teacherId === userId;
}

// SCHEMA_FIELDS: whitelist for Prisma writes to avoid "Unknown field" errors
const SCHEMA_FIELDS: Record<string, string[]> = {
    // ── Core entities ────────────────────────────────────────────────────────
    // 'lead' shu yerda YO'Q — server/routes/leads.ts (Faza 3) o'z whitelist'iga ega.
    'student': ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone', 'source', 'status', 'notes', 'photo', 'course', 'group', 'paymentStatus', 'balance', 'joinedDate'],
    'group': ['name', 'courseId', 'teacherId', 'status', 'startDate', 'endDate', 'maxSize', 'price'],
    'room': ['name', 'capacity', 'color'],
    'course': ['name', 'title', 'category', 'description', 'price', 'duration', 'lessonDuration', 'lessonsPerWeek', 'status', 'image'],
    'courseTier': ['courseId', 'name', 'price'],
    'transaction': ['type', 'amount', 'category', 'description', 'date', 'method', 'studentId', 'studentName', 'staffId', 'staffName'],
    'payment': ['studentId', 'amount', 'method', 'date', 'month', 'dueDate', 'status', 'notes'],
    'staffMember': ['name', 'role', 'positionId', 'email', 'phone', 'salary', 'joinedDate', 'status', 'department', 'address', 'passport', 'education', 'experience', 'photo'],
    'position': ['name', 'description', 'responsibilities', 'suggestedRole', 'defaultPermissions', 'isActive'],
    'transactionCategory': ['name', 'type', 'isActive'],
    'post': ['title', 'content', 'excerpt', 'imageUrl', 'author', 'status', 'category', 'date'],
    'inventoryItem': ['name', 'category', 'quantity', 'price', 'location', 'condition', 'purchaseDate', 'notes'],
    'task': ['title', 'completed', 'userId', 'staffId', 'priority', 'deadline'],
    'performanceReview': ['staffId', 'date', 'reviewer', 'feedback', 'rating'],
    'staffDocument': ['staffId', 'name', 'type', 'uploadDate'],
    'targetForm': ['title', 'description', 'course', 'url', 'isActive', 'submissions', 'campaignId', 'utmSource', 'utmCampaign', 'extraFieldType', 'showCourseField', 'successTitle', 'successMessage', 'successButtonText', 'successButtonUrl'],
    // ── Academic (Faza 0.2) ──────────────────────────────────────────────────
    'groupSchedule':   ['groupId', 'groupName', 'teacher', 'room', 'startTime', 'endTime', 'days', 'color'],
    'attendance':      ['groupId', 'date', 'records'],
    'attendanceRecord':['studentId', 'groupId', 'date', 'status', 'checkIn', 'checkOut', 'note'],
    'assessment':      ['studentId', 'groupId', 'title', 'type', 'score', 'maxScore', 'date', 'subject', 'notes'],
    'exam':            ['groupId', 'studentId', 'examName', 'score'],
    'groupExam':       ['groupId', 'name', 'date', 'maxScore'],
    'groupStudentNote':['groupId', 'studentId', 'note'],
    'campaign':        ['name', 'platform', 'budget', 'spent', 'leads', 'startDate', 'endDate', 'status', 'notes', 'impressions', 'clicks', 'utmSource', 'utmCampaign'],
    'leadActivity':    ['leadId', 'type', 'content', 'date', 'user', 'outcome', 'direction', 'durationSec'],
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
    position: { required: ['name'], messages: { name: 'Lavozim nomi kiritilishi shart' } },
    transactionCategory: { required: ['name', 'type'], messages: { name: 'Kategoriya nomi kiritilishi shart', type: 'Tur kiritilishi shart' } },
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

// ─── TargetForm qisqa ommaviy kod (/l/{shortCode}) ─────────────────────────────
// Avval /l/{TargetForm.id} to'liq UUID (36 belgi) havola sifatida ishlatilardi —
// reklama bio/linkda juda uzun bo'lardi. Endi CREATE vaqtida shu qisqa (6 belgi)
// kod generatsiya qilinadi; server/routes/public.ts uni id bilan bir qatorda
// qabul qiladi (eski to'liq-UUID havolalar ham ishlayveradi).
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomShortCode(len: number): string {
    const bytes = crypto.randomBytes(len);
    let code = '';
    for (let i = 0; i < len; i++) code += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
    return code;
}
async function generateUniqueShortCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const code = randomShortCode(6);
        const exists = await prisma.targetForm.findUnique({ where: { shortCode: code }, select: { id: true } });
        if (!exists) return code;
    }
    // 6 belgili kod 5 marta ketma-ket to'qnashishi amalda deyarli imkonsiz —
    // shunga qaramay, cheksiz tsiklga tushmaslik uchun uzunroq zaxira variant.
    return randomShortCode(10);
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
async function ensureStaffLoginAccount(staff: any, rawPassword?: string, requesterRole?: string) {
    const phone = normalizePhone(staff.phone);
    if (!phone) return null;

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return existing; // allaqachon mavjud — o'zgartirmaymiz

    let role = mapStaffRoleToUserRole(staff.role);
    let permissions = '[]';
    if (staff.positionId) {
        const position = await prisma.position.findUnique({ where: { id: staff.positionId } });
        if (position) {
            role = position.suggestedRole;
            permissions = position.defaultPermissions ?? '[]';
        }
    }
    // Lavozim matnidan avtomatik aniqlangan rol so'rov yuboruvchining o'z
    // rolidan HECH QACHON yuqori bo'lmasin — aks holda masalan MANAGER
    // lavozimga "Direktor" yozib, avtomatik ADMIN login ochilishiga
    // (o'zidan yuqori vakolat yaratishga) erisha olardi.
    const requesterLevel = ROLE_LEVEL[requesterRole || ''] || 0;
    if ((ROLE_LEVEL[role] || 0) > requesterLevel && requesterRole) {
        role = requesterRole;
        permissions = '[]';
    }
    const hashed = await bcrypt.hash(rawPassword || '123456', 12);
    return await prisma.user.create({
        data: {
            phone,
            name: staff.name || 'Xodim',
            password: hashed,
            role,
            isActive: true,
            permissions,
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

// RBAC qayta qurish — Bosqich 4 (authorize.ts'ni router'larga ulash).
// MUHIM — bu xarita ATAYLAB juda tor: dastlab kengroq (students/groups/
// courses/finance/transactions/schedule/rooms/forms/campaigns) qilib
// boshlangan edi, lekin jonli tekshiruv paytida bularning barchasi
// KO'P SAHIFA tomonidan (turli, ba'zan farqli ruxsatli rollar orqali)
// umumiy/ichki qidiruv yoki dashboard vidjeti sifatida o'qilishi
// aniqlandi — masalan CrmDashboard.tsx (har bir rolga ochiq, faqat
// 'dashboard' ruxsati bilan) 'students'/'groups'/'transactions'/
// 'schedule'/'attendance'/'teachers'/'leads' kolleksiyalarini
// TO'G'RIDAN-TO'G'RI o'qiydi, GlobalSearch.tsx (butun CRM'da doim
// ko'rinadigan qidiruv) 'students'/'courses'/'leads'/'teachers'ni,
// LeadFilters.tsx (Lidlar sahifasi, faqat 'leads' ruxsati kifoya)
// 'forms'/'campaigns'ni. Agar bu kolleksiyalar o'z sahifasining
// ruxsat kaliti bilan yopilsa — masalan 'schedule' ruxsati bilan —
// bu umumiy joylardan foydalanuvchi (masalan 'leads' ruxsatli, lekin
// 'schedule'siz MANAGER) haqiqatda ishlatayotgan funksiyasi (Dashboard,
// qidiruv) buzilib qolardi. Shuning uchun FAQAT tasdiqlangan — boshqa
// hech qanday sahifa tomonidan o'qilmaydigan — kolleksiyalar qoldirildi.
// Qolganlari (students/groups/courses/finance/transactions/schedule/
// rooms/forms/campaigns) ataylab QOLDIRILMAGAN — ular hali faqat rol
// darajasi (COLLECTION_READ/WRITE_LEVEL) bilan himoyalanadi. Granular
// kalit talab qilish ularga keyinroq, avval frontend'dagi umumiy
// joylar (Dashboard/GlobalSearch/LeadFilters) har bir vidjetni
// ruxsatsizlik xatosida oqilona (vidjetni yashirish/bo'sh ko'rsatish)
// boshqara oladigan qilib qayta ko'rilgandan keyin qo'shiladi.
const COLLECTION_PERMISSION_MAP: Record<string, string> = {
    courseTiers:            'courses',   // faqat CrmCourses.tsx o'qiydi
    inventory:               'inventory', // faqat CrmInventory.tsx (ADMIN+, allaqachon rol darajasi bilan yopiq)
    transactionCategories:   'transaction_categories', // CrmCategories.tsx + CrmFinance.tsx — ikkalasi ham 'finance' VA 'transaction_categories'ga ega MANAGER+ talab qiladi
    settings:                'settings',  // faqat CrmSettings.tsx (ADMIN+)
    news:                    'content',   // GET uchun PUBLIC_READ_COLLECTIONS orqali bypass; yozish faqat CrmContent.tsx (ADMIN+)
};

function authForCollection(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.method === 'GET' && PUBLIC_READ_COLLECTIONS.has(req.params.collection)) {
        return next();
    }
    requireAuth(req, res, (err?: any) => {
        if (err) return next(err);
        requireRole(req, res, (err2?: any) => {
            if (err2) return next(err2);
            const permissionKey = COLLECTION_PERMISSION_MAP[req.params.collection];
            if (!permissionKey) return next();
            requirePermission(permissionKey)(req, res, next);
        });
    });
}

// ─── Special: Enroll student into group ───────────────────────────────────────
// MUHIM: bu uchta /enrollments* route generic /:collection va /:collection/:id
// route'laridan OLDIN turishi SHART. Express bir xil method+router uchun
// route'larni ro'yxatdan o'tish tartibida moslashtiradi — /:collection ham
// /enrollments'ga (bitta segment) to'g'ri keladi, shuning uchun agar u birinchi
// bo'lsa, quyidagi maxsus handler'lar HECH QACHON chaqirilmaydi (2026-09-07'da
// aniqlangan va tasdiqlangan real bug — POST /api/enrollments 200 qaytarardi,
// lekin haqiqiy Enrollment o'rniga GenericDocument yozardi).
// SEC-04 tuzatish: uchala /enrollments* route ilgari faqat `requireAuth`
// bilan ochiq edi — generic /:collection middleware'ini chetlab o'tgani
// uchun COLLECTION_WRITE_LEVEL.enrollments=2 (MANAGER+) HECH QACHON
// tekshirilmasdi. Har qanday login qilgan TEACHER istalgan o'quvchini
// istalgan guruhga qo'sha/chiqara olardi — frontend esa (CrmGroupDetail.tsx
// canManage) bu tugmalarni allaqachon faqat MANAGER+'ga ko'rsatadi, ya'ni
// bu faqat backend-tomon yopiq bo'lmagan ruxsat edi.
router.post('/enrollments', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
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
// SEC-04 tuzatish: TEACHER endi faqat O'Z guruhining a'zolar ro'yxatini
// ko'ra oladi — ilgari guruhga tegishlilik umuman tekshirilmasdi.
router.get('/enrollments/group/:groupId', requireAuth, async (req, res) => {
    try {
        const requester = (req as any).user;
        if (requester.role === 'TEACHER' && !(await teacherOwnsGroup(req.params.groupId, requester.id))) {
            return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
        }
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
router.delete('/enrollments/remove', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    const { studentId, groupId } = req.body;
    try {
        await prisma.enrollment.delete({ where: { studentId_groupId: { studentId, groupId } } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── Collection Middleware ────────────────────────────────────────────────────
router.use('/:collection', authForCollection, async (req, res, next) => {
    const { collection } = req.params;
    // Faqat MODEL_MAP'da ro'yxatdan o'tgan nomlar haqiqiy Prisma modeliga
    // yo'naltiriladi — URL segmentini to'g'ridan-to'g'ri prisma[collection]
    // sifatida ishlatish XAVFLI edi: masalan /api/user (User.password hash),
    // /api/staffFaceProfile (biometrik), /api/auditLog, /api/leaveRequest kabi
    // MODEL_MAP'da yo'q, lekin haqiqiy Prisma modeli bo'lgan har qanday nom
    // whitelist'siz to'liq o'qilardi/yozilardi (SCHEMA_FIELDS ham bunday
    // modellar uchun aniqlanmagani sababli yozishda ham cheklovsiz edi).
    const modelName = MODEL_MAP[collection];

    // @ts-ignore
    if (!modelName || !prisma[modelName]) {
        (req as any).useFallback = true;
        (req as any).modelName = collection;
        return next();
    }

    (req as any).useFallback = false;
    (req as any).modelName = modelName;

    // TEACHER uchun ma'lumot ko'lami — pastdagi GET/POST/PUT handler'lari
    // buni o'qib, so'rovga qo'shimcha `where` filtri sifatida qo'shadi.
    const requester = (req as any).user;
    (req as any).teacherScopeWhere =
        requester?.role === 'TEACHER' ? TEACHER_SCOPE_MODELS[modelName]?.(requester.id) : undefined;

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

        // Faqat CREATE'da — tahrirlashda mavjud kod SAQLANIB QOLISHI kerak,
        // aks holda allaqachon ulashilgan qisqa havola buzilib qoladi.
        if (req.method === 'POST' && modelName === 'targetForm') {
            req.body.shortCode = await generateUniqueShortCode();
        }
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
        const scopeWhere = (req as any).teacherScopeWhere;
        if (page > 0 && limit > 0) {
            // @ts-ignore
            const [total, data] = await Promise.all([
                // @ts-ignore
                prisma[modelName].count({ ...(scopeWhere && { where: scopeWhere }) }),
                // @ts-ignore
                prisma[modelName].findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) }),
            ]);
            return res.json({ data: data.map((row: any) => parseJsonFields(modelName, row)), total, page, limit });
        }

        try {
            // @ts-ignore
            const data = await prisma[modelName].findMany({ orderBy: { createdAt: 'desc' }, ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) });
            res.json(data.map((row: any) => parseJsonFields(modelName, row)));
        } catch {
            // Some models don't have createdAt, try without
            // @ts-ignore
            const data = await prisma[modelName].findMany({ ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) });
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
            // SEC-06 tuzatish: ilgari faqat `id` bo'yicha (collection'siz)
            // qidirilardi — turli generic-fallback kolleksiyalar (masalan
            // ADMIN ruxsatiga ega bo'lgan ikkita nomlanmagan kolleksiya)
            // orasida ID orqali "chegaradan chiqib" boshqa kolleksiyaga
            // tegishli hujjatni o'qish mumkin edi.
            const doc = await prisma.genericDocument.findFirst({ where: { id: req.params.id, collection: req.params.collection } });
            if (!doc) return res.status(404).json({ message: 'Topilmadi' });
            try { return res.json({ id: doc.id, ...JSON.parse(doc.data) }); }
            catch { return res.json({ id: doc.id }); }
        }
        const modelName = (req as any).modelName;
        const include = RELATION_INCLUDES[modelName];
        const scopeWhere = (req as any).teacherScopeWhere;
        // findUnique faqat unique maydonni qabul qiladi — TEACHER ko'lami
        // qo'shilishi kerak bo'lganda findFirst({id, ...scopeWhere}) ishlatiladi,
        // aks holda bitta so'rovda ID va egalik birga tekshiriladi.
        // @ts-ignore
        const data = scopeWhere
            // @ts-ignore
            ? await prisma[modelName].findFirst({ where: { id: req.params.id, ...scopeWhere }, ...(include && { include }) })
            // @ts-ignore
            : await prisma[modelName].findUnique({ where: { id: req.params.id }, ...(include && { include }) });
        if (!data) return res.status(scopeWhere ? 403 : 404).json({ message: scopeWhere ? "Topilmadi yoki sizga tegishli emas" : 'Topilmadi' });
        res.json(parseJsonFields(modelName, data));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── POST /:collection ────────────────────────────────────────────────────────
router.post('/:collection', auditPositionsOnly, async (req, res) => {
    const { collection } = req.params;
    try {
        if (!(req as any).useFallback) {
            const validationError = validateInput((req as any).modelName, req.body);
            if (validationError) return res.status(400).json({ message: validationError });
        }

        const requester = (req as any).user;
        if (requester?.role === 'TEACHER' && TEACHER_WRITE_SCOPE_MODELS.has((req as any).modelName)) {
            if (!(await teacherOwnsGroup(req.body.groupId, requester.id))) {
                return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
            }
        }

        // EDU-01 tuzatish: generic yozish yo'lida ham (studentAttendance.ts'ning
        // maxsus /api/attendance-records'idagi kabi) studentId aynan shu
        // guruhga a'zo (Enrollment) ekani tekshiriladi — aks holda guruhga
        // tegishli bo'lmagan o'quvchi uchun davomat yozuvi yaratilib,
        // billing/hisobotlarni buzishi mumkin edi.
        if ((req as any).modelName === 'attendanceRecord' && req.body.studentId && req.body.groupId) {
            const enrolled = await prisma.enrollment.findUnique({
                where: { studentId_groupId: { studentId: req.body.studentId, groupId: req.body.groupId } },
            });
            if (!enrolled) {
                return res.status(400).json({ message: "Bu o'quvchi ko'rsatilgan guruhga a'zo emas" });
            }
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
                const loginUser = await ensureStaffLoginAccount(finalData, (req as any).staffLoginPassword, (req as any).user?.role);
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

            if (collection === 'students') {
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
router.put('/:collection/:id', auditPositionsOnly, async (req, res) => {
    try {
        if ((req as any).useFallback) {
            // SEC-06 tuzatish: avval `id` topilmasa ham (yoki boshqa
            // kolleksiyaga tegishli bo'lsa ham) `update()` baribir ishga
            // tushardi — collection tekshirilmagani uchun boshqa
            // kolleksiyadagi hujjat "yangilanardi" (aslida ustidan yozilardi).
            const existing = await prisma.genericDocument.findFirst({ where: { id: req.params.id, collection: req.params.collection } });
            if (!existing) return res.status(404).json({ message: 'Topilmadi' });
            const existingData = (() => { try { return JSON.parse(existing.data); } catch { return {}; } })();
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

        const requester = (req as any).user;
        if (requester?.role === 'TEACHER' && TEACHER_WRITE_SCOPE_MODELS.has(modelName)) {
            // @ts-ignore
            const existing = await prisma[modelName].findUnique({ where: { id: req.params.id }, select: { groupId: true } });
            const existingOwned = existing ? await teacherOwnsGroup((existing as any).groupId, requester.id) : false;
            const newGroupOwned = req.body.groupId ? await teacherOwnsGroup(req.body.groupId, requester.id) : true;
            if (!existingOwned || !newGroupOwned) {
                return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
            }
        }

        // @ts-ignore
        const data = await prisma[modelName].update({ where: { id: req.params.id }, data: req.body, ...(include && { include }) });
        res.json(parseJsonFields(modelName, data));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── DELETE /:collection/:id with Cascade Cleanup ─────────────────────────────
router.delete('/:collection/:id', auditPositionsOnly, async (req, res) => {
    const { collection, id } = req.params;
    try {
        if ((req as any).useFallback) {
            // SEC-06 tuzatish: collection tekshirilmasa, boshqa kolleksiyaga
            // tegishli hujjatni ID orqali o'chirish mumkin edi.
            const doc = await prisma.genericDocument.findFirst({ where: { id, collection } });
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
            await prisma.genericDocument.delete({ where: { id } });
            return res.json({ success: true });
        }

        // SEC-06 tuzatish: POST/PUT'da TEACHER guruh egaligi tekshirilardi,
        // DELETE'da esa UMUMAN yo'q edi — TEACHER boshqa ustozning guruhiga
        // tegishli davomat/baho/imtihon/eslatma yozuvini (ID'sini bilsa yoki
        // taxmin qilsa) hech qanday tekshiruvsiz o'chira olardi.
        const modelName = (req as any).modelName;
        const requester = (req as any).user;
        if (requester?.role === 'TEACHER' && TEACHER_WRITE_SCOPE_MODELS.has(modelName)) {
            // @ts-ignore
            const existing = await prisma[modelName].findUnique({ where: { id }, select: { groupId: true } });
            if (!existing || !(await teacherOwnsGroup((existing as any).groupId, requester.id))) {
                return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
            }
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
        // @ts-ignore
        await prisma[modelName].delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

export default router;
