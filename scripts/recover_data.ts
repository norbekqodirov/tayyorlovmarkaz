import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('--- Checking for orphaned Prisma data ---');
  
  const models = [
    { name: 'Group', get: prisma.group.findMany, type: 'groups' },
    { name: 'Student', get: prisma.student.findMany, type: 'students' },
    { name: 'Room', get: prisma.room.findMany, type: 'rooms' },
    { name: 'Lead', get: prisma.lead.findMany, type: 'leads' }
  ];

  for (const model of models) {
    const items = await model.get();
    console.log(`Found ${items.length} ${model.name}s in Prisma tables.`);
    
    for (const item of items) {
      const { id, createdAt, updatedAt, ...data } = item as any;
      
      // Upsert into generic document
      const existing = await prisma.genericDocument.findFirst({
        where: { id: id }
      });
      
      if (!existing) {
        await prisma.genericDocument.create({
          data: {
            id,
            collection: model.type,
            data: JSON.stringify(data)
          }
        });
        console.log(`Migrated ${model.name} -> GenericDocument`);
      } else {
        console.log(`Skipped ${model.name} (already in GenericDocument)`);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
