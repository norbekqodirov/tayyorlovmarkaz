/**
 * Bosqich 3 jonli tekshiruvi: /api/roles CRUD + foydalanuvchiga Role
 * biriktirish (roleId -> User.role/permissions sinxronlashuvi) + Effective
 * Access Viewer endpointi.
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
    const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
    if (!admin) throw new Error('ADMIN/SUPER_ADMIN topilmadi');
    const tokenAdmin = mint(admin.id, admin.role, admin.phone!);

    const testUser = await prisma.user.create({
        data: { name: 'Test Role Assignee', phone: '+998900000401', password: 'x', role: 'TEACHER', permissions: '[]' },
    });
    const tokenTestUser = mint(testUser.id, 'TEACHER', testUser.phone!);

    let customRoleId = '';
    try {
        // MANAGER emas TEACHER foydalanuvchi /api/roles'ga kira olmasligi kerak
        const forbidden = await req('GET', '/roles', tokenTestUser);
        check('GET /roles (TEACHER) 403', forbidden.status === 403, forbidden.status);

        // ADMIN ro'yxatni ko'ra oladi, 5 ta seed qilingan tizim roli bor
        const list1 = await req('GET', '/roles', tokenAdmin);
        check('GET /roles (ADMIN) 200', list1.status === 200, list1.status);
        check('GET /roles — kamida 5 ta tizim roli', (list1.json ?? []).filter((r: any) => r.isSystem).length >= 5);

        // Permissions ro'yxati DB'dan keladi
        const perms = await req('GET', '/roles/permissions', tokenAdmin);
        check('GET /roles/permissions 200, >=25 ta', perms.status === 200 && (perms.json ?? []).length >= 25, perms.json?.length);

        // Custom rol yaratish: faqat "students" + "groups" ruxsati bilan, baseRoleLevel=TEACHER
        const created = await req('POST', '/roles', tokenAdmin, {
            label: 'Test Maxsus Rol', description: 'Tekshiruv uchun', baseRoleLevel: 'TEACHER',
            permissions: ['students', 'groups'],
        });
        check('POST /roles 201', created.status === 201, created);
        customRoleId = created.json?.id;

        const detail = await req('GET', `/roles/${customRoleId}`, tokenAdmin);
        check('GET /roles/:id — 2 ta ruxsat', detail.json?.permissionKeys?.length === 2, detail.json);
        check('GET /roles/:id — isSystem=false', detail.json?.isSystem === false);

        // Rolni tahrirlash: ruxsat qo'shish
        const updated = await req('PUT', `/roles/${customRoleId}`, tokenAdmin, { permissions: ['students', 'groups', 'schedule'] });
        check('PUT /roles/:id 200', updated.status === 200, updated);
        const detail2 = await req('GET', `/roles/${customRoleId}`, tokenAdmin);
        check('PUT /roles/:id keyin — 3 ta ruxsat', detail2.json?.permissionKeys?.length === 3, detail2.json);

        // Testuser'ga shu rolni biriktirish
        const assign = await req('PUT', `/auth/users/${testUser.id}`, tokenAdmin, { roleId: customRoleId });
        check('PUT /auth/users/:id (roleId biriktirish) 200', assign.status === 200, assign);

        const afterAssign = await prisma.user.findUnique({ where: { id: testUser.id } });
        check('User.role = baseRoleLevel (TEACHER)', afterAssign?.role === 'TEACHER', afterAssign?.role);
        check('User.roleId to\'g\'ri', (afterAssign as any)?.roleId === customRoleId);
        const permArr = JSON.parse(afterAssign?.permissions || '[]');
        check('User.permissions sinxron (3 ta)', permArr.length === 3 && permArr.includes('schedule'), permArr);

        // Effective Access Viewer
        const access = await req('GET', `/auth/users/${testUser.id}/access`, tokenAdmin);
        check('GET /auth/users/:id/access 200', access.status === 200, access);
        check('access.effectivePermissionCount === 3', access.json?.effectivePermissionCount === 3, access.json);
        check('access.roleRef.id to\'g\'ri', access.json?.roleRef?.id === customRoleId);

        // Foydalanuvchi biriktirilgan holda rolni o'chirib bo'lmaydi (409)
        const delWithUser = await req('DELETE', `/roles/${customRoleId}`, tokenAdmin);
        check('DELETE /roles/:id (userCount>0) 409', delWithUser.status === 409, delWithUser);

        // Tizim rolini o'chirib bo'lmaydi
        const teacherSysRole = (list1.json ?? []).find((r: any) => r.name === 'TEACHER');
        const delSystem = await req('DELETE', `/roles/${teacherSysRole.id}`, tokenAdmin);
        check('DELETE /roles/:id (system) 400', delSystem.status === 400, delSystem);

        // Nusxalash
        const dup = await req('POST', `/roles/${customRoleId}/duplicate`, tokenAdmin);
        check('POST /roles/:id/duplicate 201', dup.status === 201, dup);
        const dupDetail = await req('GET', `/roles/${dup.json?.id}`, tokenAdmin);
        check('Nusxa — bir xil 3 ta ruxsat', dupDetail.json?.permissionKeys?.length === 3);

        // Testuser'dan rolni ajratib, o'chirish endi ishlashi kerak
        await req('PUT', `/auth/users/${testUser.id}`, tokenAdmin, { roleId: null, role: 'TEACHER', permissions: [] });
        const delNow = await req('DELETE', `/roles/${customRoleId}`, tokenAdmin);
        check('DELETE /roles/:id (userCount=0) 200', delNow.status === 200, delNow);
        if (dup.json?.id) await req('DELETE', `/roles/${dup.json.id}`, tokenAdmin);

    } finally {
        await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
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
