import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function migrateLeads() {
  console.log('Migrating 2 leads from Prisma Lead table to GenericDocument...');
  const leads = await prisma.lead.findMany();
  for (const lead of leads) {
    const { id, createdAt, updatedAt, ...data } = lead;
    await prisma.genericDocument.create({
      data: {
        id,
        collection: 'leads',
        data: JSON.stringify(data)
      }
    });
    console.log(`Migrated lead: ${lead.name}`);
  }
  
  // Optionally clear the lead table to avoid confusion later
  await prisma.lead.deleteMany();
  console.log('Migration complete.');
}

migrateLeads().catch(console.error).finally(() => prisma.$disconnect());
