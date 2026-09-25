import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../db.js';
import { requireAuth, requireRole, requireMinRole, ROLE_LEVEL } from '../middleware/auth.js';
import { withAudit, logAudit } from '../middleware/audit.js';
import { requirePermission } from '../middleware/authorize.js';
import { resolveRoleAssignment } from '../services/roleAssignment.js';
import { archiveOrDelete, restoreArchived, ARCHIVABLE_MODELS, ArchivableModel } from '../services/archive.js';
import { CURRENT_ENROLLMENT_WHERE } from '../utils/activeFilters.js';
import { normalizeStudentStatus } from '../utils/studentStatus.js';
import { recordGroupCreate, recordLegacyGroupEdit, safeHistory } from '../services/groupHistory.js';
import { ensureStudentIdentitySafe } from '../services/studentIdentity.js';
import { deleteTransaction, ReversalError } from '../services/moneyReversal.js';

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
    // Finance-audit (2026-09-16), F06 (qisman): 'balance' bu yerdan ataylab
    // olib tashlangan — bu generic /:collection/:id yo'liga qo'shimcha
    // himoya (agar kelajakda server/routes/students.ts o'chirilsa/o'zgarsa
    // ham, generic yo'l balansni bevosita yozishga ruxsat bermaydi). DIQQAT:
    // haqiqiy, hozir ishlatiladigan PUT /api/students/:id YO'LI bu generic
    // route emas — students.ts o'zining ALOHIDA router'i (crud.ts'dan OLDIN
    // mount qilingan) va u o'z whitelist'ida 'balance'ni ATAYLAB saqlaydi,
    // chunki CrmStudents.tsx'da yangi o'quvchi yaratishda "boshlang'ich
    // qoldiq" (masalan kurs narxidan boshlanadigan qarz) shu maydon orqali
    // belgilanadi — bu haqiqiy, keng ishlatiladigan funksiya, tasodifiy teshik
    // emas. To'liq tuzatish (sababli/auditli alohida "balans tuzatish"
    // hodisasi, moliyaviy ledger bilan bog'langan) kelgusi bosqichga
    // qoldirilgan — hozircha faqat mavjud withAudit('student') orqali
    // eski/yangi qiymat jurnalga yoziladi.
    'student': ['name', 'phone', 'email', 'address', 'birthDate', 'parentName', 'parentPhone', 'source', 'status', 'notes', 'photo', 'course', 'group', 'paymentStatus', 'joinedDate'],
    'group': ['name', 'courseId', 'teacherId', 'status', 'startDate', 'endDate', 'maxSize', 'price'],
    'room': ['name', 'capacity', 'color'],
    'course': ['name', 'title', 'category', 'description', 'price', 'duration', 'lessonDuration', 'lessonsPerWeek', 'status', 'image'],
    'courseTier': ['courseId', 'name', 'price'],
    'transaction': ['type', 'amount', 'category', 'description', 'date', 'method', 'studentId', 'studentName', 'staffId', 'staffName'],
    'payment': ['studentId', 'amount', 'method', 'date', 'month', 'dueDate', 'status', 'notes'],
    'staffMember': ['name', 'role', 'positionId', 'email', 'phone', 'salary', 'joinedDate', 'status', 'department', 'address', 'passport', 'education', 'experience', 'photo'],
    'position': ['name', 'description', 'responsibilities', 'suggestedRole', 'defaultPermissions', 'roleId', 'isActive'],
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
        // IP-01: arxivlangan o'quvchilar guruh to'liqligiga kirmaydi.
        _count: { select: { enrollments: { where: { student: { deletedAt: null } } } } },
    },
    'course': {
        tiers: { orderBy: { price: 'asc' } },
    },
    // 2026-09-14 — Position endi Sozlamalar > Rollar va Ruxsatlar'dagi
    // haqiqiy Role'ga bog'lanishi mumkin (roleId); ro'yxat/forma buni
    // ko'rsatishi uchun label + ruxsatlar soni birga qaytariladi.
    'position': {
        roleRef: { select: { id: true, label: true, baseRoleLevel: true, _count: { select: { permissions: true } } } },
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


function normalizeData(modelName: string, data: any): any {
    if (modelName === 'course' && data.status) {
        data.status = COURSE_STATUS_MAP[data.status] || data.status;
    }
    if (modelName === 'student' && data.status) {
        // IP-04 (TL-13): "Muzlatilgan" endi 'frozen' (ilgari xato ravishda 'graduated').
        data.status = normalizeStudentStatus(data.status);
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
    let roleId: string | null = null;
    if (staff.positionId) {
        const position = await prisma.position.findUnique({ where: { id: staff.positionId } });
        if (position) {
            // 2026-09-14: Lavozim endi Sozlamalar > Rollar va Ruxsatlar
            // sahifasidagi haqiqiy Role'ga bog'langan bo'lishi mumkin
            // (roleId) — o'rnatilgan bo'lsa, shu Role'ning baseRoleLevel'i
            // va RolePermission to'plami ishlatiladi (auth.ts'dagi
            // resolveRoleAssignment bilan bir xil, endi umumiy joyda).
            // Aks holda eski suggestedRole/defaultPermissions'ga qaytiladi
            // — hali biror Role'ga bog'lanmagan mavjud lavozimlar uchun.
            const resolved = position.roleId ? await resolveRoleAssignment(position.roleId) : null;
            if (resolved) {
                role = resolved.baseRoleLevel;
                permissions = JSON.stringify(resolved.permissionKeys);
                roleId = position.roleId;
            } else {
                role = position.suggestedRole;
                permissions = position.defaultPermissions ?? '[]';
            }
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
        roleId = null;
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
            roleId,
        } as any,
    });
}

// ─── Teachers (public directory) — haqiqiy manba User modeli (role=TEACHER) ──
// 'teachers' kolleksiyasiga hech qachon hech narsa yozilmaydi (haqiqiy ustozlar
// CrmTeachers.tsx orqali /auth/users'da saqlanadi) — shuning uchun GenericDocument
// fallback doim bo'sh qaytaradi va ommaviy sayt, qidiruv, dashboard, BI ustozlar
// ro'yxatini hech qachon ko'rmaydi. Shu yerda User'dan jonli, xavfsiz (parol/
// telefon/emailsiz) proyeksiya hisoblab qaytaramiz.
// IP-04 (SY-01): CRM ustoz ma'lumotlarini User.subject/experience/bio
// ustunlariga yozadi (CrmTeachers.tsx) — ilgari bu ro'yxat eski
// `permissions` ichidagi `meta` obyektidan o'qirdi va saytdagi kartalarda
// fan/tajriba/tavsif bo'sh chiqardi. Nofaol (ishdan ketgan) ustozlar
// ommaviy saytda ko'rsatilmaydi. Eski yozuvlar uchun meta zaxira sifatida.
async function getPublicTeachersList() {
    const users = await prisma.user.findMany({
        where: { role: 'TEACHER', isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, avatar: true, subject: true, experience: true, bio: true, permissions: true },
    });
    return users.map((u: any) => {
        let meta: any = {};
        try {
            const perms = JSON.parse(u.permissions || '[]');
            const metaObj = Array.isArray(perms) ? perms.find((p: any) => p && typeof p === 'object' && p.meta) : null;
            if (metaObj) meta = metaObj.meta;
        } catch { /* ignore */ }
        return {
            id: u.id,
            name: u.name,
            role: u.subject || meta.subject || '',
            exp: u.experience || meta.exp || '',
            desc: u.bio || meta.desc || '',
            img: u.avatar || '',
        };
    });
}

// Ommaviy sayt (Home/About/Blog/Teachers) shu kolleksiyalarni O'QISH uchun login
// talab qilmasligi kerak — aks holda haqiqiy (login qilmagan) tashrif buyuruvchi
// uchun bosh sahifa matni, galereya, yangiliklar va ustozlar ro'yxati HECH QACHON
// yuklanmaydi (401). Faqat GET uchun; yozish (POST/PUT/DELETE) hamon requireAuth talab qiladi.
const PUBLIC_READ_COLLECTIONS = new Set(['pageContent', 'gallery', 'news', 'teachers']);

// IP-01: `deletedAt` ustuni arxiv belgisi bo'lgan modellar (generic ro'yxatda filtrlanadi).
const SOFT_DELETE_MODELS = new Set(['student', 'group', 'staffMember']);

// RBAC qayta qurish — Bosqich 4 (authorize.ts'ni router'larga ulash).
// Xarita avval ATAYLAB tor qoldirilgan edi: kengroq (students/groups/
// courses/finance/transactions) qilib sinalganda CrmDashboard.tsx (har bir
// rolga ochiq, faqat 'dashboard' ruxsati bilan ishlaydi) va GlobalSearch.tsx
// (butun CRM'da doim ko'rinadigan qidiruv) aynan shu kolleksiyalarni HAR
// QANDAY foydalanuvchi ruxsatidan qat'i nazar umumiy o'qishi kerakligi
// aniqlanib, ular 403 bilan sinib qolgan edi.
//
// 2026-09-15: shu ikkala consumer endi 403'ni oqilona boshqaradi —
// CrmDashboard.tsx har bir vidjetni WIDGET_REGISTRY'dagi `permission`
// maydoniga qarab, mos kolleksiya 403 qaytarganda JIM yashiradi (butun
// sahifani "singan" ko'rsatuvchi umumiy xato o'rniga), GlobalSearch.tsx esa
// useFirestore'ning o'zi 403'da `data`ni bo'sh massiv sifatida qoldirgani
// (throw qilmaydi) tufayli allaqachon xavfsiz edi — 403'langan kategoriya
// natijalarda shunchaki ko'rinmaydi, sahifa buzilmaydi. Shu sabab quyidagi
// to'rtta asosiy kolleksiya endi granular ruxsat talab qiladi:
//   - students/groups: Dashboard + CrmStudents/CrmGroups sahifalari bilan
//     bir xil 'students'/'groups' kalitlari (App.tsx'dagi requiredPermission
//     bilan mos).
//   - transactions (Dashboard'ning kolleksiya nomi) VA finance (CrmFinance.tsx
//     hamda CrmDashboard'dagi boshqa joylar ishlatadigan nom) — ikkalasi ham
//     bitta Prisma modeliga (`transaction`) tushadi, lekin URL segmenti
//     boshqa-boshqa bo'lgani uchun ikkalasi ham xaritada bo'lishi shart,
//     aks holda faqat bittasi yopiladi.
//   - courses: faqat GlobalSearch o'qiydi (Dashboard'da courses vidjeti yo'q);
//     GlobalSearch 403'ni yuqoridagi sabab bilan allaqachon jim yutadi.
//
// 'leads' ATAYLAB bu yerda YO'Q — server/routes/leads.ts allaqachon
// crud.ts'dan OLDIN mount qilingan va requireMinRole('MANAGER') +
// requirePermission('leads')'ni o'zi qo'llaydi (bu yerga qo'shish o'lik kod
// bo'lardi, chunki so'rov bu faylga hech qachon yetib kelmaydi). 'teachers'
// ham YO'Q — GET har doim PUBLIC_READ_COLLECTIONS orqali autentifikatsiyasiz
// o'tadi (ommaviy sayt uchun), shuning uchun bu yerga ruxsat qo'shish GET
// uchun hech narsani o'zgartirmaydi.
//
// Qolganlari (schedule/rooms/forms/campaigns) hamon ATAYLAB QOLDIRILMAGAN —
// ular hali faqat rol darajasi (COLLECTION_READ/WRITE_LEVEL) bilan
// himoyalanadi, chunki ularni o'qiydigan umumiy joylar (WeeklySchedule
// vidjeti, LeadFilters.tsx) hali granular 403'ni xuddi shu tarzda
// tekshirilmagan/qayta ko'rilmagan.
const COLLECTION_PERMISSION_MAP: Record<string, string> = {
    courseTiers:            'courses',   // faqat CrmCourses.tsx o'qiydi
    courses:                 'courses',   // CrmCourses.tsx + GlobalSearch.tsx (403'ni jim yutadi)
    students:                'students',  // CrmStudents.tsx + CrmDashboard.tsx (403'da vidjet yashiriladi)
    groups:                  'groups',    // CrmGroups.tsx + CrmDashboard.tsx (403'da vidjet yashiriladi)
    finance:                 'finance',   // CrmFinance.tsx (App.tsx'da allaqachon requiredPermission="finance")
    transactions:            'finance',   // CrmDashboard.tsx'ning 'finance' uchun ishlatadigan kolleksiya nomi
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

// ─── A'zolik yo'llari ───────────────────────────────────────────────────────
// IP-09: POST /enrollments, GET /enrollments/group/:groupId va DELETE
// /enrollments/remove server/routes/enrollments.ts ga ko'chirildi (a'zolik
// davrlari xizmati orqali). U index.ts'da /api/enrollments sifatida crud'dan
// OLDIN ulanadi — generic /:collection bu yo'llarni soyalay olmaydi.

// RX-04: ustoz o'quvchi moliyasini (balans, to'lov holati) ko'rmaydi —
// GET /students/:id proyeksiyasi (students.ts) bilan bir xil qoida ro'yxatlarda ham.
const STUDENT_FINANCE_FIELDS = ['balance', 'paymentStatus'];
function hideStudentFinance<T>(row: T): T {
    if (!row || typeof row !== 'object') return row;
    const copy: any = { ...row };
    for (const f of STUDENT_FINANCE_FIELDS) delete copy[f];
    return copy;
}
function projectRowForRequester(modelName: string, row: any, requester: any) {
    if (requester?.role !== 'TEACHER') return row;
    if (modelName === 'student') return hideStudentFinance(row);
    return row;
}

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

// ─── POST /:collection/:id/restore — IP-01: arxivdan tiklash ─────────────────
// Yozish darajasi (COLLECTION_WRITE_LEVEL) va modul ruxsati authForCollection
// orqali allaqachon tekshirilgan (POST metodi).
router.post('/:collection/:id/restore', async (req, res) => {
    const modelName = (req as any).modelName;
    if ((req as any).useFallback || !ARCHIVABLE_MODELS.has(modelName as ArchivableModel)) {
        return res.status(400).json({ message: "Bu turdagi yozuvni arxivdan tiklab bo'lmaydi" });
    }
    try {
        const ok = await restoreArchived(modelName as ArchivableModel, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Arxivda topilmadi' });
        const actor = (req as any).user;
        await logAudit({ userId: actor?.id, userName: actor?.name || 'system', action: 'restore', resource: modelName, resourceId: req.params.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
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
        // IP-01: arxivlangan o'quvchi/guruh/xodim standart ro'yxatda ko'rinmaydi.
        // `?archived=1` — faqat arxiv (tiklash oynasi uchun), `?archived=all` — hammasi.
        let scopeWhere = (req as any).teacherScopeWhere;
        if (SOFT_DELETE_MODELS.has(modelName)) {
            const mode = String(req.query.archived || '');
            const archiveWhere = mode === '1' ? { deletedAt: { not: null } } : mode === 'all' ? undefined : { deletedAt: null };
            if (archiveWhere) scopeWhere = scopeWhere ? { AND: [scopeWhere, archiveWhere] } : archiveWhere;
        }
        if (page > 0 && limit > 0) {
            // @ts-ignore
            const [total, data] = await Promise.all([
                // @ts-ignore
                prisma[modelName].count({ ...(scopeWhere && { where: scopeWhere }) }),
                // @ts-ignore
                prisma[modelName].findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) }),
            ]);
            return res.json({ data: data.map((row: any) => projectRowForRequester(modelName, parseJsonFields(modelName, row), (req as any).user)), total, page, limit });
        }

        try {
            // @ts-ignore
            const data = await prisma[modelName].findMany({ orderBy: { createdAt: 'desc' }, ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) });
            res.json(data.map((row: any) => projectRowForRequester(modelName, parseJsonFields(modelName, row), (req as any).user)));
        } catch {
            // Some models don't have createdAt, try without
            // @ts-ignore
            const data = await prisma[modelName].findMany({ ...(scopeWhere && { where: scopeWhere }), ...(include && { include }) });
            res.json(data.map((row: any) => projectRowForRequester(modelName, parseJsonFields(modelName, row), (req as any).user)));
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
        res.json(projectRowForRequester(modelName, parseJsonFields(modelName, data), (req as any).user));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ─── POST /:collection ────────────────────────────────────────────────────────
router.post('/:collection', auditPositionsOnly, async (req, res) => {
    const { collection } = req.params;
    try {
        // Finance-audit (2026-09-16), F06 tuzatish: generic POST orqali
        // istalgan `Payment` yozuvini (status='paid' bilan ham) Transaction/
        // balansdan mustaqil ravishda yaratish mumkin edi — bu haqiqiy pul
        // harakatisiz "to'lov" ko'rsatishning ochiq yo'li edi. Haqiqiy to'lov
        // yo'llari (POST /finance/transactions, invoice paid, Payme/Click
        // callback) Payment'ni o'zi, tegishli balans/Transaction bilan birga
        // atomar yaratadi — bu yerdan yaratishga ehtiyoj yo'q.
        if ((req as any).modelName === 'payment') {
            return res.status(400).json({ message: "To'lov yozuvini bu yo'l orqali yaratib bo'lmaydi — /api/finance/transactions yoki tegishli to'lov oqimidan foydalaning" });
        }
        // IP-03 (ML-07): `finance`/`transactions` generic POST'i Transaction'ni
        // Payment/balans/audit'siz yaratardi — maxsus moliyaviy oqimni chetlab
        // o'tish yo'li. Hech bir sahifa bu yo'lni ishlatmaydi.
        if ((req as any).modelName === 'transaction') {
            return res.status(400).json({ message: "Kirim/chiqim faqat Moliya bo'limi orqali kiritiladi (/api/finance/transactions)" });
        }

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
            // IP-09: yangi guruh — boshlang'ich tarif/ustoz tarixi; yangi o'quvchi — kod va phoneNorm
            if (modelName === 'group') await safeHistory('group_create', () => recordGroupCreate(finalData, (req as any).user?.id));
            if (modelName === 'student') await ensureStudentIdentitySafe(prisma, finalData.id);
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
        // Finance-audit (2026-09-16), F05/F06 tuzatish: generic PUT orqali
        // `payment` (summasi/holati Transaction/balansdan mustaqil o'zgarardi)
        // va `transaction` (amount/type/studentId o'zgarsa ham balans qayta
        // moslashtirilmasdi) yozuvlarini tahrirlash moliyaviy yozuvlarni
        // ularning balans proyeksiyasidan uzib qo'yishi mumkin edi. Hozircha
        // bu ikkalasi uchun ham hech qanday UI generic PUT'ni ishlatmaydi
        // (Transaction faqat maxsus /finance/* endpointlar orqali yaratiladi/
        // o'chiriladi, Payment esa umuman generic yo'ldan yaratilmaydi) —
        // shuning uchun bu yo'l butunlay yopiladi.
        if ((req as any).modelName === 'payment' || (req as any).modelName === 'transaction') {
            return res.status(400).json({ message: "Bu yozuvni umumiy tahrirlash yo'li orqali o'zgartirib bo'lmaydi — moliyaviy yaxlitlik uchun maxsus jarayon talab qilinadi" });
        }
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

        // IP-09: guruh narxi/ustozi o'zgarsa — sana bilan tarix versiyasi (QT-21)
        const groupBefore = modelName === 'group' && ('price' in req.body || 'teacherId' in req.body)
            ? await prisma.group.findUnique({ where: { id: req.params.id }, select: { id: true, price: true, teacherId: true, startDate: true, courseId: true, createdAt: true } })
            : null;
        // @ts-ignore
        const data = await prisma[modelName].update({ where: { id: req.params.id }, data: req.body, ...(include && { include }) });
        if (groupBefore) await safeHistory('legacy_group_edit', () => recordLegacyGroupEdit(groupBefore, { price: (data as any).price ?? null, teacherId: (data as any).teacherId ?? null }, requester?.id));
        res.json(parseJsonFields(modelName, data));
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// Avans/oylik/maosh to'lovini bekor qilish qoidalari — services/moneyReversal.ts (IP-17, OQ-12).

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

        const modelName = (req as any).modelName;

        // RF-11 tuzatish: `payment` yozuvlari hech qanday UI'dan o'chirilmaydi
        // (faqat o'qish uchun) — generic yo'l orqali o'chirishga umuman ehtiyoj
        // yo'q, shuning uchun butunlay yopiladi (balans bilan bog'liqligini
        // buzish xavfini oldindan yo'q qiladi).
        if (modelName === 'payment') {
            return res.status(400).json({
                message: "To'lov yozuvini bu yo'l orqali o'chirib bo'lmaydi",
            });
        }
        // IP-17 (OQ-12): kassa yozuvi faqat bog'liqliksiz va ochiq oyda bo'lsa jismonan
        // o'chiriladi (test/xato yozuvlar). Kvitansiya, maosh/oylik to'lovi, avans,
        // qaytarish yoki yopilgan oy yozuvi — 409 VOID_REQUIRED: UI sabab so'raydi va
        // POST /api/finance/transactions/:id/void chaqiradi (ta'sir qaytariladi + qarshi
        // yozuv, tarix saqlanadi). Invoice va Payme/Click yozuvlari — 400 (o'z jarayoni).
        if (modelName === 'transaction') {
            try {
                const tx = await deleteTransaction(id);
                const remover = (req as any).user;
                await logAudit({
                    userId: remover?.id, userName: remover?.name || 'system',
                    action: 'delete', resource: 'transaction', resourceId: id,
                    before: { type: tx.type, amount: tx.amount, category: tx.category, date: tx.date, sourceType: tx.sourceType, sourceId: tx.sourceId },
                });
                return res.json({ success: true });
            } catch (e: any) {
                if (e instanceof ReversalError) return res.status(e.status).json({ message: e.message, error: e.message, code: e.code });
                throw e;
            }
        }

        // SEC-06 tuzatish: POST/PUT'da TEACHER guruh egaligi tekshirilardi,
        // DELETE'da esa UMUMAN yo'q edi — TEACHER boshqa ustozning guruhiga
        // tegishli davomat/baho/imtihon/eslatma yozuvini (ID'sini bilsa yoki
        // taxmin qilsa) hech qanday tekshiruvsiz o'chira olardi.
        const requester = (req as any).user;
        if (requester?.role === 'TEACHER' && TEACHER_WRITE_SCOPE_MODELS.has(modelName)) {
            // @ts-ignore
            const existing = await prisma[modelName].findUnique({ where: { id }, select: { groupId: true } });
            if (!existing || !(await teacherOwnsGroup((existing as any).groupId, requester.id))) {
                return res.status(403).json({ message: 'Bu guruhga tegishli emassiz' });
            }
        }

        // IP-01 (TL-14): o'quvchi/guruh/kurs/xodim — jismoniy o'chirish emas,
        // arxivlash. Kaskad (Payment, AttendanceRecord, Salary...) endi hech qachon
        // shu yo'l orqali ishga tushmaydi. Faqat 7 kun ichida yaratilgan va hech
        // qanday tarixi yo'q yozuv haqiqatan o'chiriladi (services/archive.ts).
        if (ARCHIVABLE_MODELS.has(modelName as ArchivableModel)) {
            const result = await archiveOrDelete(modelName as ArchivableModel, id);
            if (!result) return res.status(404).json({ message: 'Topilmadi' });
            const actor = (req as any).user;
            await logAudit({
                userId: actor?.id, userName: actor?.name || 'system',
                action: result.archived ? 'archive' : 'delete', resource: modelName, resourceId: id,
                metadata: { reasons: result.reasons },
            });
            return res.json({ success: true, archived: result.archived, reasons: result.reasons });
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
