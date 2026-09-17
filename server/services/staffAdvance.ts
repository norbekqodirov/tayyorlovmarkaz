/**
 * server/services/staffAdvance.ts
 *
 * Payroll-avans (2026-09-17, foydalanuvchi so'rovi): "oylik hisoblanishi —
 * berilishi degani emas; xodim oldindan avans olishi mumkin, shunga qarab
 * berish tartibi o'ylab chiqilishi kerak".
 *
 * Model: StaffAdvance — shaxsga (o'qituvchi YOKI boshqa xodim) tegishli,
 * muayyan oyga BOG'LANMAGAN "markaz oldida qarzi" yozuvi. Bir davr
 * tasdiqlanganda/birinchi to'lov qilinganda, o'sha shaxsning HALI
 * qoplanmagan avanslari ENG ESKISIDAN boshlab (FIFO) yangi hisoblangan
 * summaga qarab avtomatik qoplanadi — bitta avans bir nechta davrga
 * bo'linib qoplanishi mumkin (StaffAdvanceApplication orqali kuzatiladi).
 *
 * MUHIM: bu funksiya har doim CHAQIRUVCHINING $transaction ichida
 * chaqirilishi kerak (tx — o'sha $transaction klienti) — StaffAdvance.remaining
 * yangilanishi va TeacherPayroll/Salary.advanceApplied yangilanishi bitta
 * atomar amal bo'lishi shart.
 */
import type { Prisma } from '@prisma/client';

export type PersonType = 'teacher' | 'staff';

/**
 * `availableAmount` gacha (masalan yangi tasdiqlangan accruedAmount/total)
 * shu shaxsning eng eski avanslaridan boshlab qopla. Qaytaradi: jami
 * qoplangan summa (0 bo'lishi mumkin — avans yo'q yoki availableAmount<=0).
 */
export async function applyOutstandingAdvances(
    tx: Prisma.TransactionClient,
    personType: PersonType,
    personId: string,
    availableAmount: number,
    appliedToType: 'teacher_payroll' | 'salary',
    appliedToId: string,
): Promise<number> {
    if (!Number.isFinite(availableAmount) || availableAmount <= 0) return 0;

    const outstanding = await tx.staffAdvance.findMany({
        where: { personType, personId, remaining: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
    });

    let budget = availableAmount;
    let totalApplied = 0;

    for (const advance of outstanding) {
        if (budget <= 0) break;
        const applyNow = Math.min(advance.remaining, budget);
        if (applyNow <= 0) continue;

        await tx.staffAdvance.update({
            where: { id: advance.id },
            data: { remaining: { decrement: applyNow } },
        });
        await tx.staffAdvanceApplication.create({
            data: { advanceId: advance.id, amount: applyNow, appliedToType, appliedToId },
        });

        budget -= applyNow;
        totalApplied += applyNow;
    }

    return totalApplied;
}

/** Shaxsning hali qoplanmagan avanslar yig'indisi (UI'da "Avans qoldig'i" uchun). */
export async function getOutstandingAdvanceTotal(
    tx: Prisma.TransactionClient | typeof import('../db.js').default,
    personType: PersonType,
    personId: string,
): Promise<number> {
    const result = await tx.staffAdvance.aggregate({
        where: { personType, personId, remaining: { gt: 0 } },
        _sum: { remaining: true },
    });
    return result._sum.remaining || 0;
}
