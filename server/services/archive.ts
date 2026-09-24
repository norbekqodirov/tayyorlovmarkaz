/**
 * IP-01 — "O'chirish" o'rniga arxivlash (TL-14, FA:DATA-01).
 *
 * Ilgari CRM'dagi "O'chirish" tugmasi generic DELETE orqali yozuvni bazadan
 * jismonan o'chirardi va sxemadagi `onDelete: Cascade` bog'lanishlar tufayli
 * o'quvchining to'lovlari (Payment), invoice'lari, davomati, baholari,
 * sertifikatlari; guruhning davomati va darslari; kursning BARCHA guruhlari;
 * xodimning oyliklari ham izsiz yo'qolardi.
 *
 * Endi qoida:
 *  - Yozuvda tarix bo'lsa (yoki u 7 kundan eski bo'lsa) — faqat ARXIVLANADI
 *    (`deletedAt`, kurs uchun `status='Archived'`), hech narsa o'chmaydi, keyin
 *    tiklash mumkin.
 *  - Faqat yangi (7 kun ichida yaratilgan) va hech qanday bog'liq tarixi yo'q
 *    yozuv (xato kiritilgan/test) haqiqatan o'chiriladi.
 */
import prisma from '../db.js';

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type ArchivableModel = 'student' | 'group' | 'course' | 'staffMember';

export const ARCHIVABLE_MODELS = new Set<ArchivableModel>(['student', 'group', 'course', 'staffMember']);

export interface ArchiveResult {
    archived: boolean;   // true — arxivlandi (tarix saqlandi); false — jismonan o'chirildi
    reasons: string[];   // nega arxivlandi (qanday tarix bor)
}

async function studentHistory(id: string): Promise<string[]> {
    const [payments, invoices, attendance, lessonAtt, assessments, exams, certificates, submissions, transactions, enrollments, notes] = await Promise.all([
        prisma.payment.count({ where: { studentId: id } }),
        prisma.invoice.count({ where: { studentId: id } }),
        prisma.attendanceRecord.count({ where: { studentId: id } }),
        prisma.lessonAttendance.count({ where: { studentId: id } }),
        prisma.assessment.count({ where: { studentId: id } }),
        prisma.exam.count({ where: { studentId: id } }),
        prisma.certificate.count({ where: { studentId: id } }),
        prisma.testSubmission.count({ where: { studentId: id } }),
        prisma.transaction.count({ where: { studentId: id } }),
        prisma.enrollment.count({ where: { studentId: id } }),
        prisma.groupStudentNote.count({ where: { studentId: id } }),
    ]);
    const r: string[] = [];
    if (payments) r.push(`${payments} ta to'lov`);
    if (invoices) r.push(`${invoices} ta invoice`);
    if (transactions) r.push(`${transactions} ta kassa yozuvi`);
    if (attendance + lessonAtt) r.push(`${attendance + lessonAtt} ta davomat yozuvi`);
    if (assessments + exams + submissions) r.push(`${assessments + exams + submissions} ta baho/imtihon`);
    if (certificates) r.push(`${certificates} ta sertifikat`);
    if (enrollments) r.push(`${enrollments} ta guruh a'zoligi`);
    if (notes) r.push(`${notes} ta eslatma`);
    return r;
}

async function groupHistory(id: string): Promise<string[]> {
    const [enrollments, attendance, sessions, assessments, exams, groupExams, notes, legacyAtt, tests] = await Promise.all([
        prisma.enrollment.count({ where: { groupId: id } }),
        prisma.attendanceRecord.count({ where: { groupId: id } }),
        prisma.lessonSession.count({ where: { groupId: id } }),
        prisma.assessment.count({ where: { groupId: id } }),
        prisma.exam.count({ where: { groupId: id } }),
        prisma.groupExam.count({ where: { groupId: id } }),
        prisma.groupStudentNote.count({ where: { groupId: id } }),
        prisma.attendance.count({ where: { groupId: id } }),
        prisma.test.count({ where: { groupId: id } }),
    ]);
    const r: string[] = [];
    if (enrollments) r.push(`${enrollments} ta o'quvchi a'zoligi`);
    if (attendance + legacyAtt) r.push(`${attendance + legacyAtt} ta davomat yozuvi`);
    if (sessions) r.push(`${sessions} ta qo'shimcha dars`);
    if (assessments + exams + groupExams) r.push(`${assessments + exams + groupExams} ta baho/imtihon`);
    if (notes) r.push(`${notes} ta eslatma`);
    if (tests) r.push(`${tests} ta test`);
    return r;
}

async function courseHistory(id: string): Promise<string[]> {
    const [groups, certificates, tests] = await Promise.all([
        prisma.group.count({ where: { courseId: id } }),
        prisma.certificate.count({ where: { courseId: id } }),
        prisma.test.count({ where: { courseId: id } }),
    ]);
    const r: string[] = [];
    if (groups) r.push(`${groups} ta guruh`);
    if (certificates) r.push(`${certificates} ta sertifikat`);
    if (tests) r.push(`${tests} ta test`);
    return r;
}

async function staffHistory(id: string): Promise<string[]> {
    const [salaries, attendance, leaves, documents, reviews, tasks, advances, face] = await Promise.all([
        prisma.salary.count({ where: { staffId: id } }),
        prisma.staffAttendance.count({ where: { staffId: id } }),
        prisma.leaveRequest.count({ where: { staffId: id } }),
        prisma.staffDocument.count({ where: { staffId: id } }),
        prisma.performanceReview.count({ where: { staffId: id } }),
        prisma.task.count({ where: { staffId: id } }),
        prisma.staffAdvance.count({ where: { personType: 'staff', personId: id } }),
        prisma.staffFaceProfile.count({ where: { staffId: id } }),
    ]);
    const r: string[] = [];
    if (salaries) r.push(`${salaries} ta oylik yozuvi`);
    if (advances) r.push(`${advances} ta avans`);
    if (attendance) r.push(`${attendance} ta davomat (tabel) yozuvi`);
    if (leaves) r.push(`${leaves} ta ta'til so'rovi`);
    if (documents + reviews + tasks) r.push(`${documents + reviews + tasks} ta hujjat/baho/vazifa`);
    if (face) r.push('Face ID profili');
    return r;
}

/**
 * Yozuvni arxivlaydi yoki (faqat yangi va tarixsiz bo'lsa) o'chiradi.
 * Topilmasa `null` qaytaradi.
 */
export async function archiveOrDelete(model: ArchivableModel, id: string): Promise<ArchiveResult | null> {
    const now = new Date();
    if (model === 'student') {
        const row = await prisma.student.findUnique({ where: { id }, select: { id: true, createdAt: true, deletedAt: true } });
        if (!row) return null;
        if (row.deletedAt) return { archived: true, reasons: [] };
        const reasons = await studentHistory(id);
        const fresh = now.getTime() - row.createdAt.getTime() < FRESH_MS;
        if (!reasons.length && fresh) {
            await prisma.student.delete({ where: { id } });
            return { archived: false, reasons };
        }
        await prisma.student.update({ where: { id }, data: { deletedAt: now } });
        return { archived: true, reasons: reasons.length ? reasons : ['7 kundan eski yozuv'] };
    }
    if (model === 'group') {
        const row = await prisma.group.findUnique({ where: { id }, select: { id: true, createdAt: true, deletedAt: true } });
        if (!row) return null;
        if (row.deletedAt) return { archived: true, reasons: [] };
        const reasons = await groupHistory(id);
        const fresh = now.getTime() - row.createdAt.getTime() < FRESH_MS;
        if (!reasons.length && fresh) {
            await prisma.$transaction([
                prisma.groupSchedule.deleteMany({ where: { groupId: id } }),
                prisma.group.delete({ where: { id } }),
            ]);
            return { archived: false, reasons };
        }
        await prisma.group.update({ where: { id }, data: { deletedAt: now } });
        return { archived: true, reasons: reasons.length ? reasons : ['7 kundan eski yozuv'] };
    }
    if (model === 'course') {
        const row = await prisma.course.findUnique({ where: { id }, select: { id: true, createdAt: true, status: true } });
        if (!row) return null;
        const reasons = await courseHistory(id);
        const fresh = now.getTime() - row.createdAt.getTime() < FRESH_MS;
        if (!reasons.length && fresh) {
            await prisma.course.delete({ where: { id } });
            return { archived: false, reasons };
        }
        await prisma.course.update({ where: { id }, data: { status: 'Archived' } });
        return { archived: true, reasons: reasons.length ? reasons : ['7 kundan eski yozuv'] };
    }
    // staffMember
    const row = await prisma.staffMember.findUnique({ where: { id }, select: { id: true, createdAt: true, deletedAt: true } });
    if (!row) return null;
    if (row.deletedAt) return { archived: true, reasons: [] };
    const reasons = await staffHistory(id);
    const fresh = now.getTime() - row.createdAt.getTime() < FRESH_MS;
    if (!reasons.length && fresh) {
        await prisma.staffMember.delete({ where: { id } });
        return { archived: false, reasons };
    }
    await prisma.staffMember.update({ where: { id }, data: { deletedAt: now, status: "Ishdan bo'shagan" } });
    return { archived: true, reasons: reasons.length ? reasons : ['7 kundan eski yozuv'] };
}

/** Arxivdan tiklash. Topilmasa `false`. */
export async function restoreArchived(model: ArchivableModel, id: string): Promise<boolean> {
    if (model === 'student') {
        const r = await prisma.student.updateMany({ where: { id }, data: { deletedAt: null } });
        return r.count > 0;
    }
    if (model === 'group') {
        const r = await prisma.group.updateMany({ where: { id }, data: { deletedAt: null } });
        return r.count > 0;
    }
    if (model === 'course') {
        const r = await prisma.course.updateMany({ where: { id, status: 'Archived' }, data: { status: 'Active' } });
        return r.count > 0;
    }
    const r = await prisma.staffMember.updateMany({ where: { id }, data: { deletedAt: null, status: 'Faol' } });
    return r.count > 0;
}
