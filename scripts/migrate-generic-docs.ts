/**
 * migrate-generic-docs.ts
 * ────────────────────────────────────────────────────────────────────────────
 * One-time migration: move GenericDocument rows for now-native collections
 * into proper PostgreSQL tables.
 *
 * Collections migrated:
 *   schedule       → GroupSchedule
 *   attendance     → Attendance
 *   assessments    → Assessment
 *   exams          → Exam
 *   notes          → GroupStudentNote
 *   campaigns      → Campaign
 *   leadActivities → LeadActivity
 *   lead_activities→ LeadActivity (alias)
 *
 * Run:
 *   npx tsx scripts/migrate-generic-docs.ts
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJson(raw: string): any {
    try { return JSON.parse(raw); } catch { return {}; }
}

function logBatch(label: string, count: number) {
    console.log(`  ✔  ${label}: ${count} records migrated`);
}

// ─── GroupSchedule ───────────────────────────────────────────────────────────
async function migrateSchedule() {
    const docs = await prisma.genericDocument.findMany({
        where: { collection: 'schedule' },
    });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        try {
            await prisma.groupSchedule.upsert({
                where: { id: d.id || doc.id },
                create: {
                    id: d.id || doc.id,
                    groupId:   d.groupId   || '',
                    groupName: d.groupName || d.name || '',
                    teacher:   d.teacher   || '',
                    room:      d.room      || '',
                    startTime: d.startTime || d.start || '',
                    endTime:   d.endTime   || d.end   || '',
                    days:      typeof d.days === 'string' ? d.days : JSON.stringify(d.days ?? []),
                    color:     d.color,
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Schedule skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('GroupSchedule', count);
}

// ─── Attendance ───────────────────────────────────────────────────────────────
async function migrateAttendance() {
    const docs = await prisma.genericDocument.findMany({
        where: { collection: 'attendance' },
    });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        if (!d.groupId) { console.warn(`  ⚠  Attendance skip (no groupId): ${doc.id}`); continue; }
        // Check if the group actually exists
        const groupExists = await prisma.group.findUnique({ where: { id: d.groupId } });
        if (!groupExists) { console.warn(`  ⚠  Attendance skip (group not found ${d.groupId})`); continue; }
        try {
            const date = d.date || new Date().toISOString().slice(0, 10);
            await prisma.attendance.upsert({
                where: { groupId_date: { groupId: d.groupId, date } },
                create: {
                    id:       d.id || doc.id,
                    groupId:  d.groupId,
                    date,
                    records:  typeof d.records === 'string' ? d.records : JSON.stringify(d.records ?? []),
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Attendance skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('Attendance', count);
}

// ─── Assessment ───────────────────────────────────────────────────────────────
async function migrateAssessments() {
    const docs = await prisma.genericDocument.findMany({
        where: { collection: { in: ['assessments', 'assessment'] } },
    });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        if (!d.studentId) { console.warn(`  ⚠  Assessment skip (no studentId): ${doc.id}`); continue; }
        const studentExists = await prisma.student.findUnique({ where: { id: d.studentId } });
        if (!studentExists) { console.warn(`  ⚠  Assessment skip (student not found ${d.studentId})`); continue; }
        try {
            await prisma.assessment.upsert({
                where: { id: d.id || doc.id },
                create: {
                    id:        d.id || doc.id,
                    studentId: d.studentId,
                    groupId:   d.groupId,
                    title:     d.title     || 'Baholash',
                    type:      d.type      || 'homework',
                    score:     Number(d.score)    || 0,
                    maxScore:  Number(d.maxScore) || 100,
                    date:      d.date      || new Date().toISOString().slice(0, 10),
                    subject:   d.subject,
                    notes:     d.notes,
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Assessment skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('Assessment', count);
}

// ─── Exam ─────────────────────────────────────────────────────────────────────
async function migrateExams() {
    const docs = await prisma.genericDocument.findMany({ where: { collection: 'exams' } });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        if (!d.groupId || !d.studentId) { console.warn(`  ⚠  Exam skip (missing ids): ${doc.id}`); continue; }
        const [gOk, sOk] = await Promise.all([
            prisma.group.findUnique({ where: { id: d.groupId } }),
            prisma.student.findUnique({ where: { id: d.studentId } }),
        ]);
        if (!gOk || !sOk) { console.warn(`  ⚠  Exam skip (ref not found): ${doc.id}`); continue; }
        try {
            const examName = d.examName || d.name || 'Imtihon';
            await prisma.exam.upsert({
                where: { groupId_studentId_examName: { groupId: d.groupId, studentId: d.studentId, examName } },
                create: {
                    id:        d.id || doc.id,
                    groupId:   d.groupId,
                    studentId: d.studentId,
                    examName,
                    score:     Number(d.score) || 0,
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Exam skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('Exam', count);
}

// ─── GroupStudentNote ─────────────────────────────────────────────────────────
async function migrateNotes() {
    const docs = await prisma.genericDocument.findMany({ where: { collection: 'notes' } });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        if (!d.groupId || !d.studentId) { console.warn(`  ⚠  Note skip (missing ids): ${doc.id}`); continue; }
        const [gOk, sOk] = await Promise.all([
            prisma.group.findUnique({ where: { id: d.groupId } }),
            prisma.student.findUnique({ where: { id: d.studentId } }),
        ]);
        if (!gOk || !sOk) { console.warn(`  ⚠  Note skip (ref not found): ${doc.id}`); continue; }
        try {
            await prisma.groupStudentNote.upsert({
                where: { groupId_studentId: { groupId: d.groupId, studentId: d.studentId } },
                create: {
                    id:        d.id || doc.id,
                    groupId:   d.groupId,
                    studentId: d.studentId,
                    note:      d.note || d.content || '',
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Note skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('GroupStudentNote', count);
}

// ─── Campaign ─────────────────────────────────────────────────────────────────
async function migrateCampaigns() {
    const docs = await prisma.genericDocument.findMany({ where: { collection: 'campaigns' } });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        try {
            await prisma.campaign.upsert({
                where: { id: d.id || doc.id },
                create: {
                    id:        d.id || doc.id,
                    name:      d.name     || 'Kampaniya',
                    platform:  d.platform || 'Instagram',
                    budget:    Number(d.budget) || 0,
                    spent:     Number(d.spent)  || 0,
                    leads:     Number(d.leads)  || 0,
                    startDate: d.startDate,
                    endDate:   d.endDate,
                    status:    d.status   || 'active',
                    notes:     d.notes,
                    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  Campaign skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('Campaign', count);
}

// ─── LeadActivity ─────────────────────────────────────────────────────────────
async function migrateLeadActivities() {
    const docs = await prisma.genericDocument.findMany({
        where: { collection: { in: ['leadActivities', 'lead_activities'] } },
    });
    let count = 0;
    for (const doc of docs) {
        const d = safeJson(doc.data);
        if (!d.leadId) { console.warn(`  ⚠  LeadActivity skip (no leadId): ${doc.id}`); continue; }
        const leadOk = await prisma.lead.findUnique({ where: { id: d.leadId } });
        if (!leadOk) { console.warn(`  ⚠  LeadActivity skip (lead not found ${d.leadId})`); continue; }
        try {
            await prisma.leadActivity.upsert({
                where: { id: d.id || doc.id },
                create: {
                    id:      d.id || doc.id,
                    leadId:  d.leadId,
                    type:    d.type    || 'note',
                    content: d.content || '',
                    date:    d.date    || new Date().toISOString().slice(0, 10),
                    user:    d.user    || 'Admin',
                },
                update: {},
            });
            count++;
        } catch (e) {
            console.warn(`  ⚠  LeadActivity skip (${doc.id}):`, String(e).slice(0, 120));
        }
    }
    logBatch('LeadActivity', count);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🚀 GenericDocument → Native Tables migration started...\n');

    await migrateSchedule();
    await migrateAttendance();
    await migrateAssessments();
    await migrateExams();
    await migrateNotes();
    await migrateCampaigns();
    await migrateLeadActivities();

    console.log('\n✅ Migration complete!\n');

    // Summary
    const [sched, att, asmt, exam, note, camp, act] = await Promise.all([
        prisma.groupSchedule.count(),
        prisma.attendance.count(),
        prisma.assessment.count(),
        prisma.exam.count(),
        prisma.groupStudentNote.count(),
        prisma.campaign.count(),
        prisma.leadActivity.count(),
    ]);

    console.log('📊 Final counts in native tables:');
    console.log(`   GroupSchedule:    ${sched}`);
    console.log(`   Attendance:       ${att}`);
    console.log(`   Assessment:       ${asmt}`);
    console.log(`   Exam:             ${exam}`);
    console.log(`   GroupStudentNote: ${note}`);
    console.log(`   Campaign:         ${camp}`);
    console.log(`   LeadActivity:     ${act}`);
}

main()
    .catch(e => { console.error('\n❌ Migration failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
