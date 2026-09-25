/**
 * IP-10 — yagona davomat xizmati (TL-07, TL-08). CRM (`studentAttendance.ts`) va
 * Telegram Staff Mini App (`staffPortal.ts`) bir xil qoidalardan o'tadi.
 *
 * Tekshiruvlar:
 * - holat qiymati, sana formati, kelajak sanasi emas;
 * - ustoz faqat o'z guruhi (joriy yoki shu sanadagi tayinlash bo'yicha);
 * - o'quvchi shu sanada guruh a'zosi (a'zolik davri ichida) va pauzada emas (QT-63);
 *   davri hali yo'q eski a'zolik — joriy Enrollment bo'lsa qabul qilinadi (backfill'gacha);
 * - bekor qilingan yoki ko'chirilgan dars kuniga davomat yozilmaydi;
 * - tuzatish oynasi (OQ-16): N kundan eski sanani ustoz o'zgartira olmaydi,
 *   administrator — faqat sabab bilan (`attendance_edit_window_days`, standart 3).
 * Yozuvlar bitta tranzaksiyada, muallif va vaqt bilan (markedById/markedAt).
 */
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { daysBetween, isValidDate, monthOf } from '../domain/lessonCalendar.js';
import { teacherAt } from './lessonPlan.js';
import { isMonthClosed } from './moneyReversal.js';

export class AttendanceError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const ATTENDANCE_STATUSES = new Set(['present', 'absent', 'late', 'excused']);

export interface AttendanceActor { id: string; role: string }

async function editWindowDays(): Promise<number> {
    const row = await prisma.setting.findUnique({ where: { key: 'attendance_edit_window_days' } });
    const n = row ? Number(row.value) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 3;
}

async function checkAccessAndWindow(groupId: string, date: string, actor: AttendanceActor, reason?: string | null) {
    if (!isValidDate(date)) throw new AttendanceError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    const today = todayDateStr();
    if (date > today) throw new AttendanceError(400, "Kelajak sanasiga davomat belgilab bo'lmaydi", 'FUTURE');
    // IP-21: yopilgan oy davomati o'zgarmaydi (hisob-kitob va maosh yakunlangan)
    if (await isMonthClosed(prisma, date)) throw new AttendanceError(409, `${date.slice(0, 7)} oyi yopilgan — davomat o'zgartirilmaydi`, 'PERIOD_CLOSED');
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, teacherId: true, deletedAt: true } });
    if (!group) throw new AttendanceError(404, 'Guruh topilmadi', 'NOT_FOUND');
    if (actor.role === 'TEACHER' && group.teacherId !== actor.id && (await teacherAt(prisma, groupId, date)) !== actor.id) {
        throw new AttendanceError(403, "Bu guruhga ruxsatingiz yo'q", 'FORBIDDEN');
    }
    const window = await editWindowDays();
    const age = daysBetween(date, today);
    const late = age > window;
    if (late && actor.role === 'TEACHER') {
        throw new AttendanceError(403, `${window} kundan eski davomatni faqat administrator sabab bilan tuzatadi`, 'LOCKED');
    }
    const cleanReason = (reason || '').trim();
    if (late && cleanReason.length < 3) {
        throw new AttendanceError(400, `${window} kundan eski davomatni tuzatish uchun sabab yozing`, 'REASON_REQUIRED');
    }
    return { late, reason: late ? cleanReason : null };
}

/** Shu sanada o'quvchi guruh a'zosimi (davr ichida, pauzada emas). Xato matni yoki null. */
async function membershipProblem(studentId: string, groupId: string, date: string): Promise<string | null> {
    const periods = await prisma.enrollmentPeriod.findMany({
        where: { studentId, groupId },
        include: { pauses: { where: { status: 'active' } } },
    });
    if (!periods.length) {
        const current = await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
        return current ? null : "guruhga a'zo emas";
    }
    const p = periods.find(x => x.startDate <= date && (x.endDate == null || x.endDate >= date));
    if (!p) {
        const first = periods.map(x => x.startDate).sort()[0];
        return date < first ? `${first} dan guruhda — undan oldingi sanaga davomat yozilmaydi` : 'bu sanada guruh a\'zosi emas';
    }
    const pause = p.pauses.find(x => x.fromDate <= date && x.toDate >= date);
    if (pause) return `${pause.fromDate}–${pause.toDate} pauzada`;
    return null;
}

export interface MarkInput {
    groupId: string;
    date: string;
    records: Array<{ studentId: string; status: string; note?: string | null }>;
    reason?: string | null;
}

export async function markAttendance(input: MarkInput, actor: AttendanceActor) {
    const { groupId, date, records } = input;
    if (!groupId || !date || !Array.isArray(records) || !records.length) throw new AttendanceError(400, 'groupId, date va records talab qilinadi', 'BAD_INPUT');
    const bad = records.find(r => !ATTENDANCE_STATUSES.has(r.status));
    if (bad) throw new AttendanceError(400, `Noto'g'ri holat: ${bad.status}`, 'BAD_STATUS');
    const { reason } = await checkAccessAndWindow(groupId, date, actor, input.reason);

    const students = await prisma.student.findMany({ where: { id: { in: records.map(r => r.studentId) } }, select: { id: true, name: true, deletedAt: true } });
    const byId = new Map(students.map(s => [s.id, s]));
    const problems: string[] = [];
    for (const r of records) {
        const s = byId.get(r.studentId);
        if (!s || s.deletedAt) { problems.push(`${s?.name ?? r.studentId}: guruhga a'zo emas`); continue; }
        const p = await membershipProblem(r.studentId, groupId, date);
        if (p) problems.push(`${s.name}: ${p}`);
    }
    if (problems.length) throw new AttendanceError(400, problems.join('; '), 'NOT_MEMBER_ON_DATE');

    // Dars rejasi: bekor qilingan/ko'chirilgan kunga yozilmaydi; bor bo'lsa — "o'tildi"
    const sessions = await prisma.lessonSession.findMany({ where: { groupId, date, kind: 'regular' } });
    const active = sessions.find(s => s.status === 'planned' || s.status === 'held');
    const warnings: string[] = [];
    if (!active && sessions.some(s => s.status === 'cancelled')) throw new AttendanceError(409, 'Bu kungi dars bekor qilingan', 'CANCELLED');
    if (!active && sessions.some(s => s.status === 'moved')) throw new AttendanceError(409, "Bu kungi dars boshqa kunga ko'chirilgan", 'MOVED');
    if (!active) {
        const planExists = await prisma.lessonSession.count({ where: { groupId, kind: 'regular', date: { startsWith: monthOf(date) } } });
        if (planExists) warnings.push('Bu sana dars rejasida yo\'q');
    }

    const now = new Date();
    const saved = await prisma.$transaction(async tx => {
        let n = 0;
        for (const r of records) {
            const data = { status: r.status, note: r.note ?? null, markedById: actor.id, markedAt: now, editReason: reason, sessionId: active?.id ?? null };
            await tx.attendanceRecord.upsert({
                where: { studentId_groupId_date: { studentId: r.studentId, groupId, date } },
                create: { studentId: r.studentId, groupId, date, ...data },
                update: data,
            });
            n++;
        }
        if (active && active.status === 'planned') await tx.lessonSession.update({ where: { id: active.id }, data: { status: 'held' } });
        return n;
    });
    return { saved, date, groupId, warnings };
}

export async function deleteAttendance(input: { studentId: string; groupId: string; date: string; reason?: string | null }, actor: AttendanceActor) {
    await checkAccessAndWindow(input.groupId, input.date, actor, input.reason);
    await prisma.attendanceRecord.deleteMany({ where: { studentId: input.studentId, groupId: input.groupId, date: input.date } });
    // Shu kunda boshqa belgilash qolmasa — dars yana "rejada" (belgilanmagan) holatiga qaytadi
    const left = await prisma.attendanceRecord.count({ where: { groupId: input.groupId, date: input.date } });
    if (!left) await prisma.lessonSession.updateMany({ where: { groupId: input.groupId, date: input.date, kind: 'regular', status: 'held' }, data: { status: 'planned' } });
    return { success: true };
}
