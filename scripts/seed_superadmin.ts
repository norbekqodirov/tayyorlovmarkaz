/**
 * Seed script: Creates the first SUPER_ADMIN user (faqat bo'sh bazada, bir marta).
 *
 * Kodda tayyor telefon/parol YO'Q — ular repozitoriyada ochiq qolib, keyin
 * xavfsizlik teshigiga aylanardi. Ma'lumotlar muhit o'zgaruvchilaridan olinadi:
 *
 *   SEED_ADMIN_PHONE=+998901234567 SEED_ADMIN_PASSWORD='kuchli-parol' SEED_ADMIN_NAME='Bosh Administrator' \
 *     npx tsx scripts/seed_superadmin.ts
 *
 * Kirgandan keyin parolni Sozlamalar → Xavfsizlik bo'limida almashtiring.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const phone = (process.env.SEED_ADMIN_PHONE || '').trim();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const name = (process.env.SEED_ADMIN_NAME || 'Bosh Administrator').trim();

  if (!/^\+998\d{9}$/.test(phone)) {
    console.error('❌ SEED_ADMIN_PHONE kerak (+998XXXXXXXXX ko\'rinishida).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ SEED_ADMIN_PASSWORD kerak (kamida 8 belgi).');
    process.exit(1);
  }

  // Bazada allaqachon Super Admin bo'lsa — hech narsa qilinmaydi
  const anySuper = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (anySuper) {
    console.log(`✅ Super admin allaqachon bor: ${anySuper.name} — hech narsa o'zgartirilmadi.`);
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`✅ Bu telefon bilan foydalanuvchi bor: ${existing.name} (${existing.phone}) — hech narsa o'zgartirilmadi.`);
    await prisma.$disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      phone,
      password: hashedPassword,
      name,
      role: 'SUPER_ADMIN',
      isActive: true,
      permissions: JSON.stringify([]),
    } as any,
  });

  console.log('✅ Super Admin yaratildi!');
  console.log(`   Ism: ${user.name}`);
  console.log(`   Telefon: ${user.phone}`);
  console.log(`   Role: ${user.role}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Xato:', e);
  process.exit(1);
});
