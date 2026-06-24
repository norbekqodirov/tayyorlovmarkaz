import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Native Table Counts ---');
  try {
    const studentCount = await prisma.student.count();
    console.log(`Student: ${studentCount}`);
  } catch (e: any) { console.error('Student count error:', e.message); }

  try {
    const groupCount = await prisma.group.count();
    console.log(`Group: ${groupCount}`);
  } catch (e: any) { console.error('Group count error:', e.message); }

  try {
    const leadCount = await prisma.lead.count();
    console.log(`Lead: ${leadCount}`);
  } catch (e: any) { console.error('Lead count error:', e.message); }

  try {
    const transactionCount = await prisma.transaction.count();
    console.log(`Transaction (Finance): ${transactionCount}`);
  } catch (e: any) { console.error('Transaction count error:', e.message); }

  try {
    const userCount = await prisma.user.count();
    console.log(`User: ${userCount}`);
  } catch (e: any) { console.error('User count error:', e.message); }

  try {
    const genericCount = await prisma.genericDocument.count();
    console.log(`GenericDocument: ${genericCount}`);

    const grouped = await prisma.genericDocument.groupBy({
      by: ['collection'],
      _count: {
        id: true,
      },
    });
    console.log('--- GenericDocument Grouped Counts ---');
    console.log(grouped);
  } catch (e: any) { console.error('GenericDocument count error:', e.message); }
}

main().catch(console.error).finally(() => prisma.$disconnect());
