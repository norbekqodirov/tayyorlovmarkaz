import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.course.count();
  console.log('Prisma Courses:', c);
  const gc = await prisma.genericDocument.count({where:{collection: 'courses'}});
  console.log('GC Courses:', gc);
}

run().finally(() => prisma.$disconnect());
