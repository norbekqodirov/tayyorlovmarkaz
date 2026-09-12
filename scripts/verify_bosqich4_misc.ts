/**
 * Bosqich 4 jonli tekshiruvi: qolgan kichik tuzatishlar —
 * (1) Position CRUD endi audit qilinadi (boshqa umumiy kolleksiyalar
 *     ataylab audit qilinmaydi — scope tekshiriladi),
 * (2) login token endi `name` maydonini o'z ichiga oladi.
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
    if (!admin) throw new Error('ADMIN topilmadi');
    const token = mint(admin.id, admin.role, admin.phone!);

    let positionId = '';
    let courseId = '';
    try {
        const auditCountBefore = await prisma.auditLog.count({ where: { resource: 'position' } });
        const created = await req('POST', '/positions', token, { name: 'Test Lavozim Bosqich4' });
        check('POST /positions 200', created.status === 200, created);
        positionId = created.json?.id;

        // withAudit() res.json()ni qaytargandan KEYIN, kutmasdan (fire-and-
        // forget) auditLog.create() chaqiradi — javob kelgach yozuv hali
        // tugamagan bo'lishi mumkin, shuning uchun qisqa kutish kerak.
        await new Promise(r => setTimeout(r, 600));
        const auditCountAfter = await prisma.auditLog.count({ where: { resource: 'position' } });
        check('Position yaratilganda AuditLog yozildi', auditCountAfter === auditCountBefore + 1, { auditCountBefore, auditCountAfter });

        const auditRow = await prisma.auditLog.findFirst({ where: { resource: 'position', resourceId: positionId }, orderBy: { createdAt: 'desc' } });
        check('AuditLog action=create', auditRow?.action === 'create', auditRow?.action);
        check('AuditLog userId to\'g\'ri', auditRow?.userId === admin.id);

        await req('PUT', `/positions/${positionId}`, token, { name: 'Test Lavozim Yangilangan' });
        const auditCountAfterUpdate = await prisma.auditLog.count({ where: { resource: 'position', resourceId: positionId } });
        check('Position yangilanganda ham AuditLog qo\'shildi (2 ta)', auditCountAfterUpdate === 2, auditCountAfterUpdate);

        // Boshqa umumiy kolleksiya (courses) audit qilinMAYDI — ataylab scope
        const courseAuditBefore = await prisma.auditLog.count({ where: { resource: 'course' } });
        const courseCreated = await req('POST', '/courses', token, { name: 'Test Kurs Bosqich4' });
        courseId = courseCreated.json?.id;
        const courseAuditAfter = await prisma.auditLog.count({ where: { resource: 'course' } });
        check('Course yaratish audit qilinMAYDI (ataylab)', courseAuditAfter === courseAuditBefore, { courseAuditBefore, courseAuditAfter });

        // JWT payload endi `name` bor — haqiqiy login orqali tekshiriladi
        // (ma'lum parol bilan yangi test foydalanuvchi yaratib).
        const newUser = await req('POST', '/auth/users', token, {
            name: 'Test JWT Name User', phone: '+998900000901', password: 'test123456', role: 'TEACHER',
        });
        check('Test foydalanuvchi yaratildi', newUser.status === 200, newUser);
        const login = await req('POST', '/auth/login', '', { phone: '+998900000901', password: 'test123456' });
        check('Login 200', login.status === 200, login);
        const decoded: any = login.json?.token ? jwt.decode(login.json.token) : null;
        check("JWT payload'da name bor", decoded?.name === 'Test JWT Name User', decoded);
        await prisma.user.delete({ where: { id: newUser.json.id } }).catch(() => {});
    } finally {
        if (positionId) await prisma.position.delete({ where: { id: positionId } }).catch(() => {});
        if (courseId) await prisma.course.delete({ where: { id: courseId } }).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { resource: 'position', resourceId: positionId } }).catch(() => {});
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
