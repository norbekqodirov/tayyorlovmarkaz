import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  const genericTeachers = await prisma.genericDocument.findMany({
    where: { collection: 'teachers' }
  });
  
  console.log(`Found ${genericTeachers.length} generic teachers`);
  
  for (const t of genericTeachers) {
    try {
      const data = JSON.parse(t.data);
      const email = data.email || `${Date.now()}_${Math.random()}@tayyorlov.uz`;
      const exists = await prisma.user.findUnique({ where: { email } });
      
      if (!exists) {
        await prisma.user.create({
          data: {
            id: t.id,
            email,
            password: await bcrypt.hash('12345678', 10),
            name: data.name || 'Nomsiz Ustoz',
            role: 'TEACHER',
            phone: data.phone,
            permissions: JSON.stringify({
              subject: data.subject || '',
              experience: data.experience || '',
            })
          }
        });
        console.log(`Migrated generic teacher ${data.name} to User table.`);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

run().finally(async () => { await prisma.$disconnect(); });
