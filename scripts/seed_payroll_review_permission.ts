/**
 * Bir martalik, xavfsiz qo'shimcha: yangi 'payroll_review' permission
 * kalitini `Permission` jadvaliga qo'shadi (idempotent upsert). Mavjud
 * Role/RolePermission/PermissionOverride yozuvlariga TEGILMAYDI —
 * migrate_rbac_schema.ts'ni to'liq qayta ishga tushirish (u foydalanuvchi
 * permissions'ining JORIY, ehtimol eskirgan JSON snapshotidan qayta o'qiydi)
 * xavfli bo'lar edi, shu sabab shu tor skript ishlatiladi. Admin keyin
 * "Rollar va Ruxsatlar" sahifasida bu kalitni istagan (masalan HR) rolga
 * qo'lda biriktirishi mumkin.
 */
import prisma from '../server/db.js';

async function main() {
    const perm = await prisma.permission.upsert({
        where: { key: 'payroll_review' },
        update: { label: 'Oylik hisoblash va tabel (HR)', group: 'HR' },
        create: { key: 'payroll_review', label: 'Oylik hisoblash va tabel (HR)', group: 'HR' },
    });
    console.log('Permission seed qilindi:', perm.key);
    await prisma.$disconnect();
}

main();
