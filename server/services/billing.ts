/**
 * Oylik to'lovni davomat asosida hisoblash.
 *
 * Qoida (foydalanuvchi tomonidan 2026-09-15'da qat'iy tasdiqlangan — RF-01):
 * - Har bir kurs (guruh) alohida hisoblanadi.
 * - M — sozlamadagi chegirma boshlanadigan ENG KAM qoldirilgan dars soni (standart: 3).
 * - Agar o'quvchi shu oyda o'sha guruhdan qoldirgan darslar soni (A) M dan
 *   KATTA YOKI TENG bo'lsa (A >= M) — guruh narxi "oyiga necha dars" sozlamasiga
 *   (standart: 12) bo'linib, bitta dars narxi topiladi va QOLDIRGAN BARCHA (A ta)
 *   dars uchun shu summa umumiy narxdan ayriladi. M dan ORTGAN qismgina emas —
 *   aynan M ta qoldirilganda ham barcha M taning puli ayriladi (masalan M=3,
 *   A=3 bo'lsa 3 dars puli, A=4 bo'lsa 4 dars puli ayriladi).
 * - Agar A < M bo'lsa — chegirma YO'Q, to'liq narx.
 * - Bitta o'quvchi bir nechta kursda o'qisa, har biri mustaqil hisoblanadi.
 */
import prisma from '../db.js';
import { enrollmentActiveInMonthWhere, groupActiveInMonthWhere, monthStartInstant } from '../utils/activeFilters.js';

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

    // IP-01: arxivlangan o'quvchi/guruh — faqat arxivlangan oyigacha hisoblanadi.
    const enrollments = await prisma.enrollment.findMany({
        where: { studentId, ...enrollmentActiveInMonthWhere(year, month) },
        include: { group: { include: { course: { select: { name: true, price: true } } } } },
    });

    const byGroup: GroupDueBreakdown[] = await Promise.all(enrollments.map(async (e) => {
        const group = e.group;
        const basePrice = group.price ?? group.course?.price ?? 0;
        const absences = await prisma.attendanceRecord.count({
            where: { studentId, groupId: group.id, date: { startsWith: monthStr }, status: 'absent' },
        });
        const perLessonPrice = s.lessonsPerMonth > 0 ? basePrice / s.lessonsPerMonth : 0;
        // RF-01: foydalanuvchi qat'iy tasdiqlagan qoida — A >= M (M dan ORTGAN
        // qism emas, M ga TENG bo'lganda ham barcha qoldirilganlar hisoblanadi).
        // `absences > 0` qo'shimcha sharti: M=0 qilib qo'yilsa (chegirmani
        // "har doim faol" qilish), 0 ta qoldirgan o'quvchida ham 0>=0=true
        // chiqib, UI'da chegirma "qo'llandi" deb noto'g'ri ko'rsatilmasin
        // (raqamga ta'siri yo'q edi, faqat displayApplied flagi noto'g'ri edi).
        const discountApplied = absences > 0 && absences >= s.absenceThreshold;
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

export interface StudentCashAllocation {
    studentId: string;
    dueTotal: number;
    totalPaid: number;
    /** min(totalPaid, dueTotal) — ortiqcha to'lov/avans shu oy uchun "tushum" sifatida hisoblanmaydi. */
    eligibleCash: number;
    byGroup: { groupId: string; allocated: number }[];
}

// O03/O04 tuzatish (2026-09-16 audit): "bir nechta o'qituvchining guruhida
// bo'lgan o'quvchining BUTUN to'lovi har ustozga to'liq kirardi" — bitta pul
// bir necha teacher hisobida (mustaqil) ko'rinib, jamlanganda haqiqiy
// tushumdan ko'p chiqardi. Endi shu oy uchun ELIGIBLE (haqiqiy qarzdan
// oshmagan) naqd summa, o'quvchining BARCHA guruhlaridagi hisoblangan
// narx (finalPrice) nisbatiga PROPORSIONAL taqsimlanadi — guruhlar
// bo'yicha yig'indi hech qachon o'quvchining eligible summasidan oshmaydi,
// shuning uchun turli teacher'lar orasida bir xil pul ikki marta
// hisoblanmaydi. Bu hali ANIQ (invoice-line) allocation emas — muayyan
// biznes qarori bilan almashtirilishi mumkin bo'lgan qoidaviy taxmin,
// lekin double-counting xatosini yopadi.
export async function calculateStudentCashAllocation(
    studentId: string,
    year: number,
    month: number,
    settings?: BillingSettings,
): Promise<StudentCashAllocation> {
    const due = await calculateStudentMonthlyDue(studentId, year, month, settings);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const payments = await prisma.payment.findMany({
        where: { studentId, status: 'paid', date: { startsWith: monthStr } },
        select: { amount: true },
    });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const eligibleCash = Math.min(totalPaid, due.total);
    const byGroup = due.byGroup.map(g => ({
        groupId: g.groupId,
        allocated: due.total > 0 ? Math.round(eligibleCash * (g.finalPrice / due.total)) : 0,
    }));
    return { studentId, dueTotal: due.total, totalPaid, eligibleCash, byGroup };
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
    const teacher = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { salaryPercent: true },
    });
    const salaryPercent = teacher?.salaryPercent ?? settings.teacherSalaryPercent;
    const monthStart = monthStartInstant(year, month);
    const groups = await prisma.group.findMany({
        where: { teacherId, ...groupActiveInMonthWhere(year, month) },
        include: { enrollments: { where: { student: { OR: [{ deletedAt: null }, { deletedAt: { gte: monthStart } }] } }, select: { studentId: true } } },
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
        salary: Math.round(revenue * (salaryPercent / 100)),
        salaryPercent,
        groups: groupSummaries,
    };
}
