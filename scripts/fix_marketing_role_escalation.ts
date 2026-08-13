/**
 * Bir martalik tuzatish: CrmUsers.tsx'dagi "Marketing Xodimi" andozasi avval
 * (xato bilan) haqiqiy User.role'ni 'ADMIN' deb saqlardi (faqat permissions
 * massivini cheklab, rol darajasini emas). ProtectedRoute.tsx va
 * server/middleware/auth.ts ADMIN/SUPER_ADMIN'ni har doim "to'liq ruxsat"
 * deb maxsus holat sifatida ko'radi — demak bu andoza orqali yaratilgan har
 * bir "Marketing Xodimi" aslida cheklovsiz to'liq administrator bo'lib
 * qolgan (Moliya, Xodimlar, Sozlamalar va h.k.ga ham kira olgan).
 *
 * Bu skript: role='ADMIN' bo'lgan har bir userni tekshiradi, agar uning
 * permissions massivi aynan Marketing Xodimi andozasi bilan bir xil bo'lsa
 * (['dashboard','leads','marketing','target_forms']) — role'ni 'MANAGER'ga
 * tushiradi (bu andozaga kerak bo'lgan barcha backend yo'llar — leads/
 * marketing/forms — MANAGER+ darajasida ochiq, lekin endi permissions
 * massivi haqiqatan ham cheklaydi).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MARKETING_PERMS = ['dashboard', 'leads', 'marketing', 'target_forms'];
const MARKETING_SIGNATURE = [...MARKETING_PERMS].sort().join(',');

async function run() {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    console.log(`Tekshirilmoqda: ${admins.length} ta ADMIN foydalanuvchi`);

    let fixed = 0;
    for (const u of admins) {
        let perms: any;
        try { perms = JSON.parse(u.permissions || '[]'); } catch { continue; }
        if (!Array.isArray(perms) || !perms.every((p: any) => typeof p === 'string')) continue;

        const signature = [...perms].sort().join(',');
        if (signature !== MARKETING_SIGNATURE) continue;

        await prisma.user.update({ where: { id: u.id }, data: { role: 'MANAGER' } });
        fixed++;
        console.log(`Tuzatildi: ${u.name} (${u.id}, ${u.phone}) — ADMIN → MANAGER`);
    }

    console.log(`\nJami tuzatildi: ${fixed} / ${admins.length} ta`);
}

run().finally(() => prisma.$disconnect());
