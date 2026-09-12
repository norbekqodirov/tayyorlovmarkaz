/**
 * Bosqich 1 migratsiyasi (2026-09-12 RBAC qayta qurish rejasi,
 * C:\Users\user\.claude\plans\cosmic-fluttering-quill.md).
 *
 * Yangi relatsion Department/Role/Permission/RolePermission jadvallarini
 * mavjud statik ro'yxatlardan (ALL_PERMISSIONS, ROLE_TEMPLATES) seed
 * qiladi, so'ng HAR BIR mavjud User/StaffMember yozuvini yangi FK'larga
 * bog'laydi. ESKI User.role/permissions va StaffMember.department
 * ustunlariga TEGILMAYDI (faqat o'qiydi) — eski kod ular orqali
 * ishlashda davom etadi.
 *
 * Xavfsizlik: agar foydalanuvchining haqiqiy permissions massivi mos
 * rol andozasidan farq qilsa (ortiqcha yoki kam ruxsat), farq
 * PermissionOverride sifatida saqlanadi — hech qanday mavjud ruxsat
 * jimgina yo'qolmaydi yoki qo'shilmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '../src/constants/permissions.js';

const prisma = new PrismaClient();

// CrmUsers.tsx'dagi ROLE_TEMPLATES bilan bir xil (u yerda import qilib
// bo'lmaydi — .tsx, JSX). Qo'lda sinxron saqlanadi.
const ROLE_TEMPLATES: { name: string; label: string; isSystem: boolean; baseRoleLevel: string; permissions: string[] }[] = [
    { name: 'SUPER_ADMIN', label: 'Super Admin', isSystem: true, baseRoleLevel: 'SUPER_ADMIN', permissions: ALL_PERMISSIONS.map(p => p.id) },
    { name: 'ADMIN', label: 'Administrator', isSystem: true, baseRoleLevel: 'ADMIN', permissions: ALL_PERMISSIONS.map(p => p.id) },
    { name: 'TEACHER', label: "Ustoz / O'qituvchi", isSystem: true, baseRoleLevel: 'TEACHER', permissions: ['dashboard', 'schedule', 'journal', 'students', 'groups', 'parent_chat'] },
    // MARKETING — haqiqiy User.role qiymati emas (faqat TEACHER/MANAGER/ADMIN/
    // SUPER_ADMIN mavjud), shuning uchun baseRoleLevel='MANAGER' (CrmUsers.tsx
    // bilan bir xil — bu andoza tanlanganda haqiqiy rol sifatida MANAGER
    // saqlanadi, permissions massivi cheklaydi).
    { name: 'MARKETING', label: 'Marketing Xodimi', isSystem: true, baseRoleLevel: 'MANAGER', permissions: ['dashboard', 'leads', 'marketing', 'ai_content', 'communication', 'target_forms'] },
    { name: 'MANAGER', label: 'Menejer', isSystem: true, baseRoleLevel: 'MANAGER', permissions: ['dashboard', 'students', 'groups', 'courses', 'finance', 'transaction_categories', 'discounts', 'bi', 'predictions', 'goals', 'reports', 'certificates', 'leads', 'teachers', 'leave_requests', 'staff_attendance', 'parent_chat'] },
];

const DEPARTMENTS = ["Ma'muriyat", "Ta'lim", 'Marketing', "Xizmat ko'rsatish"];

function isValidPermissionArray(v: any): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
}

async function seedPermissions() {
    let created = 0;
    for (const p of ALL_PERMISSIONS) {
        await prisma.permission.upsert({
            where: { key: p.id },
            update: { label: p.label, group: p.group },
            create: { key: p.id, label: p.label, group: p.group },
        });
        created++;
    }
    console.log(`Permission: ${created} ta seed qilindi/yangilandi`);
}

async function seedRoles() {
    const roleMap = new Map<string, string>(); // name -> roleId
    for (const t of ROLE_TEMPLATES) {
        const role = await prisma.role.upsert({
            where: { name: t.name },
            update: { label: t.label, isSystem: t.isSystem, baseRoleLevel: t.baseRoleLevel },
            create: { name: t.name, label: t.label, isSystem: t.isSystem, baseRoleLevel: t.baseRoleLevel },
        });
        roleMap.set(t.name, role.id);

        // RolePermission: shu rol uchun andozadagi ruxsatlarni bog'lash
        const permissions = await prisma.permission.findMany({ where: { key: { in: t.permissions } } });
        for (const perm of permissions) {
            await prisma.rolePermission.upsert({
                where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
                update: {},
                create: { roleId: role.id, permissionId: perm.id },
            });
        }
        console.log(`Role: ${t.name} -> ${permissions.length} ta ruxsat bog'landi`);
    }
    return roleMap;
}

async function seedDepartments() {
    const deptMap = new Map<string, string>(); // name -> departmentId
    for (const name of DEPARTMENTS) {
        const dept = await prisma.department.upsert({
            where: { name },
            update: {},
            create: { name },
        });
        deptMap.set(name, dept.id);
    }
    console.log(`Department: ${DEPARTMENTS.length} ta seed qilindi`);
    return deptMap;
}

async function migrateUsers(roleMap: Map<string, string>) {
    const users = await prisma.user.findMany();
    let linked = 0;
    let overridesCreated = 0;

    for (const u of users) {
        const roleId = roleMap.get(u.role);
        if (!roleId) {
            console.warn(`OGOHLANTIRISH: ${u.name} (${u.id}) noma'lum role="${u.role}" — roleId bog'lanmadi`);
            continue;
        }
        await prisma.user.update({ where: { id: u.id }, data: { roleId } });
        linked++;

        // ADMIN/SUPER_ADMIN uchun override YARATILMAYDI — bu ikki rol
        // ProtectedRoute.tsx/CrmLayout.tsx'da har doim maxsus holat sifatida
        // TO'LIQ ruxsatga ega (permissions massividan qat'i nazar). Ularning
        // saqlangan `permissions` massivi ko'pincha eski/to'liqsiz (masalan
        // birinchi-marta-ishga-tushirish seed'i kichikroq ro'yxat bilan
        // yaratgan) — shu farqni DENY override sifatida yozish ularni
        // haqiqatda ega bo'lgan ruxsatlardan MAHRUM qilib qo'yar edi,
        // Bosqich 2'da backend bu jadvalni tekshira boshlagach.
        if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') continue;

        // Farqni aniqlash: haqiqiy permissions massivi shu rol andozasidan farq qilsa,
        // farqni PermissionOverride sifatida saqlash (hech narsa yo'qolmasin/qo'shilmasin).
        let actual: any;
        try { actual = JSON.parse(u.permissions || '[]'); } catch { actual = null; }
        if (!isValidPermissionArray(actual)) continue; // buzuq/bo'sh — override yaratib bo'lmaydi, keyinroq qo'lda ko'rib chiqiladi

        const template = ROLE_TEMPLATES.find(t => t.name === u.role);
        if (!template) continue;
        const templateSet = new Set(template.permissions);
        const actualSet = new Set(actual);

        const extra = [...actualSet].filter(k => !templateSet.has(k)); // andozada yo'q, lekin userda bor -> ALLOW override
        const missing = [...templateSet].filter(k => !actualSet.has(k)); // andozada bor, lekin userda yo'q -> DENY override

        for (const key of extra) {
            const existsAsPermission = ALL_PERMISSIONS.some(p => p.id === key);
            if (!existsAsPermission) continue; // eski/o'chirilgan kalit — o'tkazib yuboriladi
            await prisma.permissionOverride.upsert({
                where: { userId_permissionKey: { userId: u.id, permissionKey: key } },
                update: { effect: 'ALLOW', reason: 'Migratsiya: andozadan tashqari mavjud ruxsat' },
                create: { userId: u.id, permissionKey: key, effect: 'ALLOW', reason: 'Migratsiya: andozadan tashqari mavjud ruxsat' },
            });
            overridesCreated++;
        }
        for (const key of missing) {
            await prisma.permissionOverride.upsert({
                where: { userId_permissionKey: { userId: u.id, permissionKey: key } },
                update: { effect: 'DENY', reason: 'Migratsiya: andozada bor, lekin foydalanuvchida yo\'q edi' },
                create: { userId: u.id, permissionKey: key, effect: 'DENY', reason: 'Migratsiya: andozada bor, lekin foydalanuvchida yo\'q edi' },
            });
            overridesCreated++;
        }
    }

    console.log(`User: ${linked}/${users.length} ta roleId bilan bog'landi, ${overridesCreated} ta PermissionOverride yaratildi`);
}

async function migrateStaffDepartments(deptMap: Map<string, string>) {
    const staff = await prisma.staffMember.findMany();
    let linked = 0;
    for (const s of staff) {
        const departmentId = deptMap.get(s.department);
        if (!departmentId) {
            console.warn(`OGOHLANTIRISH: ${s.name} (${s.id}) noma'lum department="${s.department}" — departmentId bog'lanmadi`);
            continue;
        }
        await prisma.staffMember.update({ where: { id: s.id }, data: { departmentId } });
        linked++;
    }
    console.log(`StaffMember: ${linked}/${staff.length} ta departmentId bilan bog'landi`);
}

async function run() {
    await seedPermissions();
    const roleMap = await seedRoles();
    const deptMap = await seedDepartments();
    await migrateUsers(roleMap);
    await migrateStaffDepartments(deptMap);
    console.log('\nMigratsiya tugadi.');
}

run().finally(() => prisma.$disconnect());
