/**
 * Bosqich 4 jonli tekshiruvi: authorize.ts'ning requirePermission()
 * router'larga ulanishi — eng KRITIK tekshiruv, chunki noto'g'ri
 * bog'lash haqiqiy foydalanuvchilarni bloklab qo'yishi mumkin edi.
 *
 * MUHIM TARIX: dastlab crud.ts'dagi COLLECTION_PERMISSION_MAP ancha
 * kengroq edi (students/groups/courses/finance/transactions/schedule/
 * rooms/forms/campaigns ham bor edi), lekin shu tekshiruvni yozish
 * paytida aniqlandiki — CrmDashboard.tsx (har bir rolga ochiq, faqat
 * 'dashboard' ruxsati bilan) va GlobalSearch.tsx (butun CRM'da doim
 * ko'rinadigan) aynan shu kolleksiyalarni umumiy/ichki tarzda o'qiydi.
 * Agar ular ham granular ruxsat bilan yopilsa, masalan 'schedule'
 * ruxsati bo'lmagan MANAGER Dashboard'ni ochganda xatoga uchrardi —
 * bu haqiqiy, jiddiy regressiya bo'lardi. Xarita shuning uchun juda
 * tor qilib qaytarildi (server/routes/crud.ts'dagi izohga qarang).
 * Bu skript endi ATAYLAB HAM pozitiv (bloklanmasligi kerak bo'lgan
 * joylar), HAM negativ (endi to'g'ri yopilgan bo'shliqlar) holatlarni
 * tekshiradi — kelajakda xarita yana kengaytirilsa, shu naqsh davom
 * ettirilishi kerak: avval frontend'dagi umumiy iste'molchilarni
 * (grep bilan) tekshirib, keyin xaritaga qo'shish.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../server/config/jwtSecret.js';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

function mint(id: string, role: string, phone: string) {
    return jwt.sign({ id, role, phone }, JWT_SECRET, { expiresIn: '1h' });
}

async function get(path: string, token: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    const roles = await prisma.role.findMany({ select: { id: true, name: true, baseRoleLevel: true } });
    const roleId = (name: string) => roles.find(r => r.name === name)!.id;

    const teacher = await prisma.user.create({
        data: { name: 'Test Wiring TEACHER', phone: '+998900001001', password: 'x', role: 'TEACHER', roleId: roleId('TEACHER') },
    });
    const manager = await prisma.user.create({
        data: { name: 'Test Wiring MANAGER', phone: '+998900001002', password: 'x', role: 'MANAGER', roleId: roleId('MANAGER') },
    });
    const marketer = await prisma.user.create({
        data: { name: 'Test Wiring MARKETING', phone: '+998900001003', password: 'x', role: 'MANAGER', roleId: roleId('MARKETING') },
    });
    const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
    if (!admin) throw new Error('ADMIN topilmadi');

    const tTeacher = mint(teacher.id, 'TEACHER', teacher.phone!);
    const tManager = mint(manager.id, 'MANAGER', manager.phone!);
    const tMarketer = mint(marketer.id, 'MANAGER', marketer.phone!);
    const tAdmin = mint(admin.id, admin.role, admin.phone!);

    try {
        // ── Dedicated router wiring — TEACHER: bor (dashboard/schedule/
        //    journal/students/groups/parent_chat) va yo'q holatlar ────────
        check('TEACHER -> GET /students (rol darajasi orqali, permission xaritasida yo\'q) 200', await get('/students', tTeacher) === 200);
        check('TEACHER -> GET /groups (rol darajasi orqali) 200', await get('/groups', tTeacher) === 200);
        check('TEACHER -> GET /parent-chat/threads (bor) 200', await get('/parent-chat/threads', tTeacher) === 200);
        check("TEACHER -> GET /finance/budget (yo'q) 403", await get('/finance/budget', tTeacher) === 403);
        check("TEACHER -> GET /leads (yo'q, requireMinRole MANAGER'da bloklanadi) 403", await get('/leads', tTeacher) === 403);
        check("TEACHER -> GET /quiz (yo'q) 403", await get('/quiz', tTeacher) === 403);
        check("TEACHER -> GET /tests (yo'q) 403", await get('/tests', tTeacher) === 403);
        check("TEACHER -> GET /certificates (yo'q) 403", await get('/certificates', tTeacher) === 403);
        check("TEACHER -> GET /marketing (yo'q) 403", await get('/marketing/overview', tTeacher) === 403);
        check("TEACHER -> GET /communication/templates (yo'q) 403", await get('/communication/templates', tTeacher) === 403);
        // Umumiy bildirishnoma qo'ng'irog'i — HAR BIR rolga ochiq bo'lishi shart (ataylab CHEKLANMAGAN)
        check('TEACHER -> GET /communication/notifications (umumiy, cheklanmagan) 200', await get('/communication/notifications', tTeacher) === 200);

        // ── MANAGER: students/groups/courses/finance/discounts/bi/
        //    predictions/goals/reports/certificates/leads/leave_requests/
        //    staff_attendance/parent_chat/transaction_categories ─────────
        check('MANAGER -> GET /finance/budget (bor) 200', await get('/finance/budget', tManager) === 200);
        check('MANAGER -> GET /leads (bor) 200', await get('/leads', tManager) === 200);
        check('MANAGER -> GET /certificates (bor) 200', await get('/certificates', tManager) === 200);
        check('MANAGER -> GET /reports/summary (bor) 200', await get('/reports/summary', tManager) === 200);
        check('MANAGER -> GET /discounts (bor) 200', await get('/discounts', tManager) === 200);
        check('MANAGER -> GET /leave (bor) 200', await get('/leave', tManager) === 200);
        check('MANAGER -> GET /staff-attendance (bor) 200', await get('/staff-attendance', tManager) === 200);
        check('MANAGER -> GET /goals (bor) 200', await get('/goals', tManager) === 200);
        check('MANAGER -> GET /predictions (bor) 200', await get('/predictions/dropout-risk', tManager) === 200);
        check("MANAGER -> GET /marketing (yo'q) 403", await get('/marketing/overview', tManager) === 403);
        check("MANAGER -> GET /communication/templates (yo'q) 403", await get('/communication/templates', tManager) === 403);
        check("MANAGER -> GET /quiz (yo'q) 403", await get('/quiz', tManager) === 403);

        // ── MARKETING (roleId=MARKETING, User.role=MANAGER): leads/
        //    marketing/ai_content/communication/target_forms ─────────────
        check('MARKETING -> GET /leads (bor) 200', await get('/leads', tMarketer) === 200);
        check('MARKETING -> GET /marketing/overview (bor) 200', await get('/marketing/overview', tMarketer) === 200);
        check('MARKETING -> GET /communication/templates (bor) 200', await get('/communication/templates', tMarketer) === 200);
        check("MARKETING -> GET /finance/budget (yo'q, MANAGER'dan farqli — roleId orqali MARKETING andozasi) 403", await get('/finance/budget', tMarketer) === 403);
        check("MARKETING -> GET /certificates (yo'q) 403", await get('/certificates', tMarketer) === 403);

        // ── ADMIN/SUPER_ADMIN — cheklovsiz (FULL_ACCESS_ROLES) ──────────
        check('ADMIN -> GET /finance/budget 200', await get('/finance/budget', tAdmin) === 200);
        check('ADMIN -> GET /marketing/overview 200', await get('/marketing/overview', tAdmin) === 200);
        check('ADMIN -> GET /quiz 200', await get('/quiz', tAdmin) === 200);
        check('ADMIN -> GET /leave 200', await get('/leave', tAdmin) === 200);

        // ── crud.ts — juda tor COLLECTION_PERMISSION_MAP (faqat
        //    boshqa hech qanday sahifa o'qimaydigan kolleksiyalar) ────────
        check('MANAGER -> GET /transactionCategories (bor) 200', await get('/transactionCategories', tManager) === 200);
        check("TEACHER -> GET /transactionCategories (yo'q) 403", await get('/transactionCategories', tTeacher) === 403);
        check("MANAGER -> GET /inventory (rol darajasi ADMIN+ talab qiladi, MANAGER hali ham 403) 403", await get('/inventory', tManager) === 403);
        check('ADMIN -> GET /inventory (bor, FULL_ACCESS) 200', await get('/inventory', tAdmin) === 200);
        // Ataylab GATE QILINMAGAN — Dashboard/GlobalSearch umumiy o'qiydi:
        check('TEACHER -> GET /courses (permission xaritasida yo\'q, rol darajasi TEACHER+) 200', await get('/courses', tTeacher) === 200);
        check('TEACHER -> GET /schedule (permission xaritasida yo\'q, rol darajasi TEACHER+) 200', await get('/schedule', tTeacher) === 200);
        check('TEACHER -> GET /rooms (permission xaritasida yo\'q, rol darajasi TEACHER+) 200', await get('/rooms', tTeacher) === 200);
    } finally {
        await prisma.user.deleteMany({ where: { id: { in: [teacher.id, manager.id, marketer.id] } } });
        await prisma.$disconnect();
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
