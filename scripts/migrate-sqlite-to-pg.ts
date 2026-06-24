/**
 * SQLite → PostgreSQL Migration Script
 * =====================================
 * Step 1: Run this script while still on SQLite to export ALL data to JSON files.
 * Step 2: Switch DATABASE_URL to PostgreSQL connection string.
 * Step 3: Update schema.prisma datasource to postgresql.
 * Step 4: Run `npx prisma db push` to create PG tables.
 * Step 5: Run `npx ts-node scripts/import-pg-data.ts` to import from JSON files.
 *
 * Usage:
 *   npx ts-node scripts/migrate-sqlite-to-pg.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, '../prisma/migration-data');

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  console.log('🚀 Starting SQLite data export...\n');

  const exportTable = async <T>(name: string, data: T[]) => {
    const filePath = path.join(EXPORT_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ ${name}: ${data.length} rows → ${filePath}`);
  };

  // Core tables
  await exportTable('User', await prisma.user.findMany());
  await exportTable('Student', await prisma.student.findMany());
  await exportTable('Course', await prisma.course.findMany());
  await exportTable('Group', await prisma.group.findMany());
  await exportTable('Enrollment', await prisma.enrollment.findMany());
  await exportTable('Schedule', await prisma.schedule.findMany());
  await exportTable('Room', await prisma.room.findMany());

  // Academic
  await exportTable('AttendanceRecord', await prisma.attendanceRecord.findMany());
  await exportTable('JournalEntry', await prisma.journalEntry.findMany());
  await exportTable('Assessment', await prisma.assessment.findMany());

  // Finance
  await exportTable('Transaction', await prisma.transaction.findMany());
  await exportTable('Payment', await prisma.payment.findMany());

  // HR / CRM
  await exportTable('StaffMember', await prisma.staffMember.findMany());
  await exportTable('Lead', await prisma.lead.findMany());
  await exportTable('LeadActivity', await prisma.leadActivity.findMany());

  // Marketing / Content
  await exportTable('Campaign', await prisma.campaign.findMany());
  await exportTable('Post', await prisma.post.findMany());
  await exportTable('TargetForm', await prisma.targetForm.findMany());
  await exportTable('InventoryItem', await prisma.inventoryItem.findMany());

  // Settings / Infra
  await exportTable('Setting', await prisma.setting.findMany());
  await exportTable('Notification', await prisma.notification.findMany());
  await exportTable('GalleryItem', await prisma.galleryItem.findMany());
  await exportTable('PageContent', await prisma.pageContent.findMany());
  await exportTable('GenericDocument', await prisma.genericDocument.findMany());
  await exportTable('Task', await prisma.task.findMany());

  console.log('\n🎉 Export complete! Files saved to:', EXPORT_DIR);
  console.log('\nNext steps:');
  console.log('  1. Set DATABASE_URL to PostgreSQL connection string in .env');
  console.log('  2. Update prisma/schema.prisma provider to "postgresql"');
  console.log('  3. Run: npx prisma db push');
  console.log('  4. Run: npx ts-node scripts/import-pg-data.ts');
}

main()
  .catch(e => { console.error('❌ Export failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
