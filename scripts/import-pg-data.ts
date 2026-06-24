/**
 * PostgreSQL Data Import Script
 * ==============================
 * Run AFTER:
 *   1. prisma/schema.prisma provider changed to "postgresql"
 *   2. DATABASE_URL updated to PostgreSQL connection string
 *   3. `npx prisma db push` has been run successfully
 *
 * Usage:
 *   npx ts-node scripts/import-pg-data.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMPORT_DIR = path.join(__dirname, '../prisma/migration-data');

function loadJson<T>(name: string): T[] {
  const filePath = path.join(IMPORT_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  ${name}.json not found — skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
}

async function importTable<T extends object>(
  name: string,
  data: T[],
  createFn: (row: T) => Promise<any>
) {
  if (!data.length) { console.log(`⏭️  ${name}: empty — skipping`); return; }
  let ok = 0, fail = 0;
  for (const row of data) {
    try {
      await createFn(row);
      ok++;
    } catch (e: any) {
      // Skip duplicate key violations (idempotent re-run support)
      if (e.code === 'P2002') { ok++; continue; }
      console.error(`  ❌ ${name} row failed:`, e.message, row);
      fail++;
    }
  }
  console.log(`✅ ${name}: ${ok} inserted${fail ? `, ${fail} failed` : ''}`);
}

async function main() {
  console.log('🚀 Starting PostgreSQL data import...\n');

  // ── Independent tables first ──────────────────────────────────────────────

  await importTable('User', loadJson<any>('User'), (r) =>
    prisma.user.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Course', loadJson<any>('Course'), (r) =>
    prisma.course.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Room', loadJson<any>('Room'), (r) =>
    prisma.room.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Student', loadJson<any>('Student'), (r) =>
    prisma.student.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('StaffMember', loadJson<any>('StaffMember'), (r) =>
    prisma.staffMember.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Lead', loadJson<any>('Lead'), (r) =>
    prisma.lead.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('InventoryItem', loadJson<any>('InventoryItem'), (r) =>
    prisma.inventoryItem.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Campaign', loadJson<any>('Campaign'), (r) =>
    prisma.campaign.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Post', loadJson<any>('Post'), (r) =>
    prisma.post.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('TargetForm', loadJson<any>('TargetForm'), (r) =>
    prisma.targetForm.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Setting', loadJson<any>('Setting'), (r) =>
    prisma.setting.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('GalleryItem', loadJson<any>('GalleryItem'), (r) =>
    prisma.galleryItem.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('PageContent', loadJson<any>('PageContent'), (r) =>
    prisma.pageContent.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('GenericDocument', loadJson<any>('GenericDocument'), (r) =>
    prisma.genericDocument.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Task', loadJson<any>('Task'), (r) =>
    prisma.task.upsert({ where: { id: r.id }, create: r, update: r })
  );

  // ── Tables with FK dependencies ────────────────────────────────────────────

  await importTable('Group', loadJson<any>('Group'), (r) =>
    prisma.group.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Notification', loadJson<any>('Notification'), (r) =>
    prisma.notification.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Enrollment', loadJson<any>('Enrollment'), (r) =>
    prisma.enrollment.upsert({
      where: { studentId_groupId: { studentId: r.studentId, groupId: r.groupId } },
      create: r,
      update: r,
    })
  );

  await importTable('Schedule', loadJson<any>('Schedule'), (r) =>
    prisma.schedule.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('AttendanceRecord', loadJson<any>('AttendanceRecord'), (r) =>
    prisma.attendanceRecord.upsert({
      where: { studentId_groupId_date: { studentId: r.studentId, groupId: r.groupId, date: r.date } },
      create: r,
      update: r,
    })
  );

  await importTable('JournalEntry', loadJson<any>('JournalEntry'), (r) =>
    prisma.journalEntry.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Assessment', loadJson<any>('Assessment'), (r) =>
    prisma.assessment.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Transaction', loadJson<any>('Transaction'), (r) =>
    prisma.transaction.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('Payment', loadJson<any>('Payment'), (r) =>
    prisma.payment.upsert({ where: { id: r.id }, create: r, update: r })
  );

  await importTable('LeadActivity', loadJson<any>('LeadActivity'), (r) =>
    prisma.leadActivity.upsert({ where: { id: r.id }, create: r, update: r })
  );

  console.log('\n🎉 Import complete!');
  console.log('\nVerification: Run `npx prisma studio` to inspect the database.');
}

main()
  .catch(e => { console.error('❌ Import failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
