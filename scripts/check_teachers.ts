import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.user.count({where: { role: 'TEACHER' }});
  console.log('Prisma Teachers (User mode):', c);
}

run().finally(() => prisma.$disconnect());
