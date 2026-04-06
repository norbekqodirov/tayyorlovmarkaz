import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log("Deleting all Leads from GenericDocument...");
  
  const result = await prisma.genericDocument.deleteMany({
    where: { collection: 'leads' }
  });
  
  console.log(`Deleted ${result.count} leads.`);
  
  // Also clean up any lingering leads in the strict Prisma model just in case
  const prismaLeads = await prisma.lead.deleteMany();
  console.log(`Deleted ${prismaLeads.count} leads from strict table.`);
}

run().catch(console.error).finally(async () => { await prisma.$disconnect() });
