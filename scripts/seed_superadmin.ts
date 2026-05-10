/**
 * Seed script: Creates the first SUPER_ADMIN user.
 * Run: npx ts-node scripts/seed_superadmin.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const phone = '+998937525592';
  const password = 'nn1122';
  const name = 'Bosh Administrator';

  // Check if already exists
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    console.log(`✅ Super admin already exists: ${existing.name} (${existing.phone})`);
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
      permissions: JSON.stringify([
        'dashboard', 'students', 'groups', 'courses', 'schedule', 'journal',
        'leads', 'finance', 'staff', 'marketing', 'analytics', 'settings',
        'users', 'backup', 'rooms', 'inventory', 'content', 'target_forms'
      ]),
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
