/**
 * O'qituvchi oyligi — ikki bazali hisoblash (audit: RF-06, 7-8-bo'lim).
 *
 * ACCRUAL — tasdiqlangan davomat chegirmasidan keyingi hisoblangan (net)
 *   to'lovdan. O'quvchi hali to'lamagan bo'lsa ham teacher hisoblangan
 *   daromadi paydo bo'ladi. Bu mavjud `calculateTeacherMonthlyRevenue`
 *   (billing.ts, RF-01 tuzatilgan) ustiga qurilgan — dublikat formula yo'q.
 *
 * CASH_COLLECTION — shu oyda haqiqatan TUSHGAN (Payment.status='paid')
 *   pul asosida. **V1 CHEKLOVI (ochiq yozilishi shart):** Invoice/Receipt
 *   allocation hali yo'q (RF-10) — bitta Payment aynan qaysi guruh/kursga
 *   tegishli ekani saqlanmaydi. Shuning uchun bu funksiya "shu oyda shu
 *   teacher'ning guruhlaridagi o'quvchilardan kelgan TO'LIQ to'lov"ni
 *   taxminiy baza sifatida oladi — agar bitta o'quvchi bir nechta
 *   teacher'ning guruhida bo'lsa va bitta umumiy to'lov qilsa, bu summa har
 *   ikkala teacher hisobida (mustaqil ravishda) ko'rinishi mumkin. Bu aniq
 *   allocation servisi (F6, kelajakda) qo'shilgunga qadar chidab turiladigan,
 *   lekin UI'da albatta "taxminiy" deb belgilanishi kerak bo'lgan holat.
 */
import prisma from '../db.js';
import { groupActiveInMonthWhere, monthStartInstant } from '../utils/activeFilters.js';
import { getBillingSettings, calculateStudentMonthlyDue, calculateStudentCashAllocation, StudentCashAllocation } from './billing.js';

export type PayrollBasis = 'accrual' | 'cash';

export interface TeacherPayrollStudentRow {
    studentId: string;
    studentName: string;
    absences: number;
    basePrice: number;
    discountApplied: boolean;
    discount: number;
    finalPrice: number;
}

export interface TeacherPayrollGroupBreakdown {
    groupId: string;
    groupName: string;
    studentCount: number;
    revenue: number;
    /** Shu oyda ushbu guruh uchun necha kun davomat olingani (o'tilgan dars soni). */
    lessonsHeld?: number;
    /** HR "tabel" ko'rinishi uchun — har o'quvchining davomat/chegirma qatori. */
    students?: TeacherPayrollStudentRow[];
}

export interface TeacherPayrollBreakdown {
    teacherId: string;
    year: number;
    month: number;
    basis: PayrollBasis;
    salaryPercent: number;
    revenue: number;
    salary: number;
    groups: TeacherPayrollGroupBreakdown[];
    /** CASH bazasida taxminiylik haqida foydalanuvchiga ko'rsatiladigan izoh. */
    note: string | null;
}

// ACCRUAL — HR "bu son qayerdan chiqdi?" deb tekshira olishi uchun, har bir
// guruh ichida HAR BIR o'quvchining o'zi (necha dars qoldirgani, shu sabab
// qancha chegirma olgani) ko'rsatiladi — shuning uchun mavjud (agregat)
// calculateTeacherMonthlyRevenue()ga emas, to'g'ridan-to'g'ri
// calculateStudentMonthlyDue()ga tayanadi (billing.ts, RF-01 tuzatilgan).
export async function calculateTeacherAccrual(teacherId: string, year: number, month: number): Promise<TeacherPayrollBreakdown> {
    const settings = await getBillingSettings();
    const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { salaryPercent: true } });
    const salaryPercent = teacher?.salaryPercent ?? settings.teacherSalaryPercent;

    // IP-01: arxivlangan guruh/o'quvchi — faqat arxivlangan oyigacha qatnashadi.
    const monthStart = monthStartInstant(year, month);
    const groups = await prisma.group.findMany({
        where: { teacherId, ...groupActiveInMonthWhere(year, month) },
        include: { enrollments: { where: { student: { OR: [{ deletedAt: null }, { deletedAt: { gte: monthStart } }] } }, include: { student: { select: { id: true, name: true } } } } },
    });

    const groupBreakdown: TeacherPayrollGroupBreakdown[] = await Promise.all(groups.map(async (g) => {
        const studentRows: TeacherPayrollStudentRow[] = await Promise.all(g.enrollments.map(async (e) => {
            const due = await calculateStudentMonthlyDue(e.studentId, year, month, settings);
            const groupDue = due.byGroup.find(b => b.groupId === g.id);
            return {
                studentId: e.studentId,
                studentName: e.student.name,
                absences: groupDue?.absences ?? 0,
                basePrice: groupDue?.basePrice ?? 0,
                discountApplied: groupDue?.discountApplied ?? false,
                discount: groupDue?.discount ?? 0,
                finalPrice: groupDue?.finalPrice ?? 0,
            };
        }));
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const lessonDates = await prisma.attendanceRecord.findMany({
            where: { groupId: g.id, date: { startsWith: monthStr } },
            select: { date: true },
            distinct: ['date'],
        });
        return {
            groupId: g.id,
            groupName: g.name,
            studentCount: g.enrollments.length,
            revenue: studentRows.reduce((sum, s) => sum + s.finalPrice, 0),
            lessonsHeld: lessonDates.length,
            students: studentRows,
        };
    }));

    const revenue = groupBreakdown.reduce((sum, g) => sum + g.revenue, 0);

    return {
        teacherId,
        year,
        month,
        basis: 'accrual',
        salaryPercent,
        revenue,
        salary: Math.round(revenue * (salaryPercent / 100)),
        groups: groupBreakdown,
        note: null,
    };
}

export async function calculateTeacherCashCollection(teacherId: string, year: number, month: number): Promise<TeacherPayrollBreakdown> {
    const settings = await getBillingSettings();
    const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { salaryPercent: true } });
    const salaryPercent = teacher?.salaryPercent ?? settings.teacherSalaryPercent;

    // IP-01: arxivlangan guruh/o'quvchi — faqat arxivlangan oyigacha qatnashadi.
    const monthStart = monthStartInstant(year, month);
    const groups = await prisma.group.findMany({
        where: { teacherId, ...groupActiveInMonthWhere(year, month) },
        include: { enrollments: { where: { student: { OR: [{ deletedAt: null }, { deletedAt: { gte: monthStart } }] } }, include: { student: { select: { id: true, name: true } } } } },
    });

    // O03/O04 tuzatish (2026-09-16 audit): ilgari har bir o'quvchining
    // UMUMIY (barcha guruh/teacher bo'yicha) to'lovi HAR bir guruhga TO'LIQ
    // qo'shilardi — bitta o'quvchi ikki teacher'ning guruhida bo'lsa, bitta
    // pul ikkalasida ham (mustaqil) hisoblanardi. Endi har o'quvchining shu
    // oydagi "eligible" (qarzdan oshmagan) puli calculateStudentCashAllocation()
    // orqali BARCHA guruhlaridagi ulushiga proporsional taqsimlanadi — bu
    // yerda faqat shu teacher'ning guruhlariga tegishli ulush olinadi.
    // Har bir noyob o'quvchi uchun BIR MARTA hisoblanadi (bir nechta shu
    // teacher guruhida bo'lsa ham allocation qayta so'ralmaydi).
    const uniqueStudentIds = Array.from(new Set(groups.flatMap(g => g.enrollments.map(e => e.studentId))));
    const allocations = new Map<string, StudentCashAllocation>();
    await Promise.all(uniqueStudentIds.map(async (sid) => {
        allocations.set(sid, await calculateStudentCashAllocation(sid, year, month, settings));
    }));

    const groupBreakdown: TeacherPayrollGroupBreakdown[] = groups.map(g => {
        const studentRows: TeacherPayrollStudentRow[] = g.enrollments.map(e => {
            const alloc = allocations.get(e.studentId);
            const groupAlloc = alloc?.byGroup.find(b => b.groupId === g.id);
            return {
                studentId: e.studentId,
                studentName: e.student.name,
                absences: 0, // Cash bazasida davomat emas — allocated ulush ko'rsatiladi.
                basePrice: alloc?.dueTotal ?? 0, // Kontekst uchun: o'quvchining shu oydagi JAMI (barcha guruh) qarzi.
                discountApplied: false,
                discount: 0,
                finalPrice: groupAlloc?.allocated ?? 0,
            };
        });
        return {
            groupId: g.id,
            groupName: g.name,
            studentCount: g.enrollments.length,
            revenue: studentRows.reduce((sum, s) => sum + s.finalPrice, 0),
            students: studentRows,
        };
    });

    const revenue = groupBreakdown.reduce((sum, g) => sum + g.revenue, 0);

    return {
        teacherId,
        year,
        month,
        basis: 'cash',
        salaryPercent,
        revenue,
        salary: Math.round(revenue * (salaryPercent / 100)),
        groups: groupBreakdown,
        note: "O'quvchining shu oyda to'lagan puli barcha guruhlaridagi hisoblangan narx ulushiga proporsional taqsimlangan (aniq invoice-qatoriga bog'langan allocation hali yo'q) — bitta to'lov endi ikki o'qituvchida to'liq holda qayta hisoblanmaydi.",
    };
}

export async function calculateTeacherPayroll(teacherId: string, year: number, month: number, basis: PayrollBasis): Promise<TeacherPayrollBreakdown> {
    return basis === 'cash'
        ? calculateTeacherCashCollection(teacherId, year, month)
        : calculateTeacherAccrual(teacherId, year, month);
}
