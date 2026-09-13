/**
 * Bosqich 2 jonli tekshiruvi: leads.ts'ga qo'shilgan MANAGER egalik scope'i
 * (GET /, GET /:id, PUT /:id). Vaqtinchalik test foydalanuvchilari va
 * lidlar yaratadi, ssenariylarni tekshiradi, keyin hammasini o'chiradi.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../server/config/jwtSecret.js';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

function mint(id: string, role: string, phone: string) {
    return jwt.sign({ id, role, phone }, JWT_SECRET, { expiresIn: '1h' });
}

async function req(method: string, path: string, token: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* jim */ }
    return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    // RBAC Bosqich 4: leads.ts endi requirePermission('leads') ham talab
    // qiladi (authorize.ts) — bu haqiqiy foydalanuvchida Role.roleId FK
    // orqali hisoblanadi (User.role string emas). Test fixture'lari ham
    // haqiqiy MANAGER Role'ga bog'lanishi shart, aks holda samarali
    // ruxsatlar bo'sh chiqib, hamma narsa noto'g'ri 403 qaytaradi.
    const managerRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    if (!managerRole) throw new Error('MANAGER roli topilmadi — Bosqich 1 migratsiyasi ishga tushirilganmi?');

    const managerA = await prisma.user.create({
        data: { name: 'Test Manager A', phone: '+998900000201', password: 'x', role: 'MANAGER', roleId: managerRole.id },
    });
    const managerB = await prisma.user.create({
        data: { name: 'Test Manager B', phone: '+998900000202', password: 'x', role: 'MANAGER', roleId: managerRole.id },
    });
    const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
    if (!admin) throw new Error('ADMIN/SUPER_ADMIN topilmadi — test to\'xtatildi');

    const leadA = await prisma.lead.create({
        data: { name: 'Test Lid A (managerA niki)', phone: '+998900000301', assignedToId: managerA.id, stage: 'new', source: 'test' },
    });
    const leadB = await prisma.lead.create({
        data: { name: 'Test Lid B (managerB niki)', phone: '+998900000302', assignedToId: managerB.id, stage: 'new', source: 'test' },
    });
    const leadUnassigned = await prisma.lead.create({
        data: { name: 'Test Lid C (hech kimga biriktirilmagan)', phone: '+998900000303', stage: 'new', source: 'test' },
    });

    const tokenA = mint(managerA.id, 'MANAGER', managerA.phone);
    const tokenB = mint(managerB.id, 'MANAGER', managerB.phone);
    const tokenAdmin = mint(admin.id, admin.role, admin.phone);

    try {
        // GET / — managerA ro'yxatida faqat o'zi + unassigned bo'lishi kerak, managerB'niki yo'q
        const listA = await req('GET', '/leads?limit=200', tokenA);
        const idsA: string[] = (listA.json?.data ?? []).map((l: any) => l.id);
        check('GET / (managerA) — o\'z lidi ro\'yxatda', idsA.includes(leadA.id), idsA);
        check('GET / (managerA) — unassigned lid ro\'yxatda', idsA.includes(leadUnassigned.id), idsA);
        check('GET / (managerA) — managerB lidi YO\'Q', !idsA.includes(leadB.id), idsA);

        // GET /:id — managerA o'z lidini ko'ra oladi
        const getOwn = await req('GET', `/leads/${leadA.id}`, tokenA);
        check('GET /:id (managerA -> o\'z lidi) 200', getOwn.status === 200, getOwn.status);

        // GET /:id — managerA unassigned lidni ko'ra oladi
        const getUnassigned = await req('GET', `/leads/${leadUnassigned.id}`, tokenA);
        check('GET /:id (managerA -> unassigned) 200', getUnassigned.status === 200, getUnassigned.status);

        // GET /:id — managerA managerB lidini ko'RA OLMAYDI (403)
        const getOther = await req('GET', `/leads/${leadB.id}`, tokenA);
        check('GET /:id (managerA -> managerB lidi) 403', getOther.status === 403, getOther.status);

        // PUT /:id — managerA managerB lidini tahrirLAY OLMAYDI (403)
        const putOther = await req('PUT', `/leads/${leadB.id}`, tokenA, { notes: 'ruxsatsiz urinish' });
        check('PUT /:id (managerA -> managerB lidi) 403', putOther.status === 403, putOther.status);

        // PUT /:id — managerA o'z lidini tahrirlay oladi
        const putOwn = await req('PUT', `/leads/${leadA.id}`, tokenA, { notes: 'ruxsatli yangilanish' });
        check('PUT /:id (managerA -> o\'z lidi) 200', putOwn.status === 200, putOwn.status);

        // ADMIN — cheklovsiz hammasini ko'ra oladi
        const getByAdmin = await req('GET', `/leads/${leadB.id}`, tokenAdmin);
        check('GET /:id (ADMIN -> managerB lidi) 200', getByAdmin.status === 200, getByAdmin.status);
        const listAdmin = await req('GET', '/leads?limit=200', tokenAdmin);
        const idsAdmin: string[] = (listAdmin.json?.data ?? []).map((l: any) => l.id);
        check('GET / (ADMIN) — barcha 3 test lid ko\'rinadi', [leadA.id, leadB.id, leadUnassigned.id].every(id => idsAdmin.includes(id)));

    } finally {
        await prisma.lead.deleteMany({ where: { id: { in: [leadA.id, leadB.id, leadUnassigned.id] } } });
        await prisma.user.deleteMany({ where: { id: { in: [managerA.id, managerB.id] } } });
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
