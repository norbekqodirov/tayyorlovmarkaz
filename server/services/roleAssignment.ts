import prisma from '../db.js';

// ─── RBAC Bosqich 3: DB'dagi Role'ni role/permissions'ga aylantirish ─────────
// Avval faqat auth.ts'da (CrmUsers.tsx'ning "Maxsus Rol" tanlovi uchun)
// yozilgan edi. 2026-09-14'da Position ham haqiqiy Role'ga bog'lanadigan
// bo'lgani uchun (server/routes/crud.ts'dagi ensureStaffLoginAccount())
// umumiy joyga ko'chirildi — ikkalasi ham Role'dan HOSILA qiymat oladi,
// mos kelmaslik imkonsiz.
export async function resolveRoleAssignment(roleId: string) {
    const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: { permissions: { include: { permission: true } } },
    });
    if (!role) return null;
    return {
        role,
        baseRoleLevel: role.baseRoleLevel,
        permissionKeys: role.permissions.map(rp => rp.permission.key),
    };
}
