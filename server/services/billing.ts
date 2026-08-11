/**
 * Oylik to'lovni davomat asosida hisoblash.
 *
 * Qoida (foydalanuvchi tomonidan berilgan):
 * - Har bir kurs (guruh) alohida hisoblanadi.
 * - Agar o'quvchi shu oyda o'sha guruhdan sozlamalarda belgilangan chegaradan
 *   (standart: 3) KO'P dars qoldirsa — guruh narxi "oyiga necha dars" sozlamasiga
 *   (standart: 12) bo'linib, bitta dars narxi topiladi va QOLDIRGAN BARCHA
 *   kunlar uchun shu summa umumiy narxdan ayriladi.
 * - Agar chegaradan kam yoki teng qoldirgan bo'lsa — chegirma YO'Q, to'liq narx.
 * - Bitta o'quvchi bir nechta kursda o'qisa, har biri mustaqil hisoblanadi.
 */
import prisma from '../db.js';

export interface BillingSettings {
    lessonsPerMonth: number;
    absenceThreshold: number;
    teacherSalaryPercent: number;
}

const DEFAULTS: BillingSettings = {
    lessonsPerMonth: 12,
    absenceThreshold: 3,
    teacherSalaryPercent: 40,
};

export async function getBillingSettings(): Promise<BillingSettings> {
    const rows = await prisma.setting.findMany({
        where: { key: { in: ['monthly_lessons_count', 'absence_discount_threshold', 'teacher_salary_percent'] } },
    });
    const map: Record<string, string> = {};
    rows.forEach(r => { map[r.key] = r.value; });
    // `|| DEFAULT` bilan emas — 0 ham "o'rnatilmagan" deb noto'g'ri talqin qilinardi
    // (masalan admin chegara/foizni ataylab 0 qilib qo'ysa, sozlama jimgina 3/40'ga
    // qaytib ketardi). Faqat qiymat umuman yo'q yoki raqam bo'lmasa standartga tushadi.
    const numOrDefault = (raw: string | undefined, fallback: number): number => {
        if (raw === undefined) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    };
    return {
        lessonsPerMonth: numOrDefault(map['monthly_lessons_count'], DEFAULTS.lessonsPerMonth),
        absenceThreshold: numOrDefault(map['absence_discount_threshold'], DEFAULTS.absenceThreshold),
        teacherSalaryPercent: numOrDefault(map['teacher_salary_percent'], DEFAULTS.teacherSalaryPercent),
    };
}

export interface GroupDueBreakdown {
    groupId: string;
    groupName: string;
    courseName: string;
    teacherId: string | null;
    basePrice: number;
    absences: number;
    discountApplied: boolean;
    perLessonPrice: number;
    discount: number;
    finalPrice: number;
}

export interface StudentMonthlyDue {
    month: string; // "YYYY-MM"
    total: number;
    totalBeforeDiscount: number;
    byGroup: GroupDueBreakdown[];
}

/** Bitta o'quvchining shu oy uchun (barcha guruhlari bo'yicha) to'lashi kerak bo'lgan summa. */
export async function calculateStudentMonthlyDue(
    studentId: string,
    year: number,
    month: number,
    settings?: BillingSettings,
): Promise<StudentMonthlyDue> {
    const s = settings || await getBillingSettings();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const enrollments = await prisma.enrollment.findMany({
        where: { studentId },
        include: { group: { include: { course: { select: { name: true, price: true } } } } },
    });

    const byGroup: GroupDueBreakdown[] = await Promise.all(enrollments.map(async (e) => {
        const group = e.group;
        const basePrice = group.price ?? group.course?.price ?? 0;
        const absences = await prisma.attendanceRecord.count({
            where: { studentId, groupId: group.id, date: { startsWith: monthStr }, status: 'absent' },
        });
        const perLessonPrice = s.lessonsPerMonth > 0 ? basePrice / s.lessonsPerMonth : 0;
        const discountApplied = absences > s.absenceThreshold;
        const discount = discountApplied ? Math.round(perLessonPrice * absences) : 0;
        const finalPrice = Math.max(0, Math.round(basePrice - discount));

        return {
            groupId: group.id,
            groupName: group.name,
            courseName: group.course?.name || 'Kurs',
            teacherId: group.teacherId,
            basePrice,
            absences,
            discountApplied,
            perLessonPrice: Math.round(perLessonPrice),
            discount,
            finalPrice,
        };
    }));

    return {
        month: monthStr,
        total: byGroup.reduce((sum, g) => sum + g.finalPrice, 0),
        totalBeforeDiscount: byGroup.reduce((sum, g) => sum + g.basePrice, 0),
        byGroup,
    };
}

/**
 * Bitta o'qituvchining shu oydagi haqiqiy (davomat chegirmasidan keyingi) daromadi
 * va shundan hisoblangan oyligi — CrmTeachers.tsx payroll'da ishlatiladi.
 * Naiv "narx * o'quvchilar soni" o'rniga har bir o'quvchining haqiqiy to'lovini yig'adi.
 */
export async function calculateTeacherMonthlyRevenue(
    teacherId: string,
    year: number,
    month: number,
): Promise<{ revenue: number; salary: number; salaryPercent: number; groups: Array<{ groupId: string; groupName: string; studentCount: number; revenue: number }> }> {
    const settings = await getBillingSettings();
    const groups = await prisma.group.findMany({
        where: { teacherId },
        include: { enrollments: { select: { studentId: true } } },
    });

    const groupSummaries = await Promise.all(groups.map(async (g) => {
        const dues = await Promise.all(
            g.enrollments.map(enr => calculateStudentMonthlyDue(enr.studentId, year, month, settings))
        );
        const groupRevenue = dues.reduce((sum, due) => {
            const groupDue = due.byGroup.find(b => b.groupId === g.id);
            return sum + (groupDue?.finalPrice || 0);
        }, 0);
        return { groupId: g.id, groupName: g.name, studentCount: g.enrollments.length, revenue: groupRevenue };
    }));
    const revenue = groupSummaries.reduce((sum, g) => sum + g.revenue, 0);

    return {
        revenue,
        salary: Math.round(revenue * (settings.teacherSalaryPercent / 100)),
        salaryPercent: settings.teacherSalaryPercent,
        groups: groupSummaries,
    };
}
