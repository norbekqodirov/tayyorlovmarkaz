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
import { getBillingSettings, calculateStudentMonthlyDue } from './billing.js';

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

    const groups = await prisma.group.findMany({
        where: { teacherId },
        include: { enrollments: { include: { student: { select: { id: true, name: true } } } } },
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

    const groups = await prisma.group.findMany({
        where: { teacherId },
        include: { enrollments: { select: { studentId: true } } },
    });

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    // Har bir o'quvchi FAQAT BIR MARTA hisoblanadi (shu teacher doirasida) —
    // bir nechta guruhda bo'lsa ham to'lovi ikki marta qo'shilmasin.
    const studentIds = Array.from(new Set(groups.flatMap(g => g.enrollments.map(e => e.studentId))));
    const payments = studentIds.length
        ? await prisma.payment.findMany({
            where: { studentId: { in: studentIds }, status: 'paid', date: { startsWith: monthStr } },
            select: { studentId: true, amount: true },
        })
        : [];
    const paidByStudent = new Map<string, number>();
    for (const p of payments) {
        paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) || 0) + p.amount);
    }

    const groupBreakdown: TeacherPayrollGroupBreakdown[] = groups.map(g => ({
        groupId: g.id,
        groupName: g.name,
        studentCount: g.enrollments.length,
        // Taxminiy: guruhga proporsional emas, o'quvchining shu oydagi UMUMIY
        // to'lovi shu yerda ko'rsatiladi (aniq allocation yo'qligi sabab).
        revenue: g.enrollments.reduce((sum, e) => sum + (paidByStudent.get(e.studentId) || 0), 0),
    }));

    const revenue = Array.from(paidByStudent.values()).reduce((sum, v) => sum + v, 0);

    return {
        teacherId,
        year,
        month,
        basis: 'cash',
        salaryPercent,
        revenue,
        salary: Math.round(revenue * (salaryPercent / 100)),
        groups: groupBreakdown,
        note: "Taxminiy — hozircha to'lovlar aniq kurs/guruhga bog'lanmagan (invoice allocation hali yo'q). O'quvchi bir nechta o'qituvchining guruhida bo'lsa, bitta to'lov ikkalasida ham ko'rinishi mumkin.",
    };
}

export async function calculateTeacherPayroll(teacherId: string, year: number, month: number, basis: PayrollBasis): Promise<TeacherPayrollBreakdown> {
    return basis === 'cash'
        ? calculateTeacherCashCollection(teacherId, year, month)
        : calculateTeacherAccrual(teacherId, year, month);
}
