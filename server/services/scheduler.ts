import cron from 'node-cron';
import prisma from '../db.js';
import { sendMessage, sendPaymentReminder, sendAttendanceAlert, sendBroadcast, sendStaffMessage } from './telegramService.js';

// ─── Helper: Workflow logi saqlash ───────────────────────────────────────────
async function logWorkflow(workflowId: string, status: 'success' | 'error' | 'skipped', output: any, duration: number) {
    await prisma.workflowLog.create({
        data: { workflowId, status, output: JSON.stringify(output), duration },
    }).catch(() => {});

    await prisma.workflow.update({
        where: { id: workflowId },
        data: {
            lastRun: new Date(),
            runCount: { increment: 1 },
        },
    }).catch(() => {});
}

// ─── Helper: Telegram sozlamasini olish ──────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
    try {
        const s = await prisma.setting.findUnique({ where: { key } });
        return s?.value || null;
    } catch { return null; }
}

// ─── JOB 1: To'lov Eslatmalari (har kuni 09:00) ──────────────────────────────
async function runPaymentReminders() {
    const start = Date.now();
    const workflowName = 'daily_payment_reminder';
    let workflow = await prisma.workflow.findFirst({ where: { trigger: workflowName } });

    if (!workflow || !workflow.isActive) return;

    const autoPayment = await getSetting('telegram_auto_payment');
    if (autoPayment !== 'true') {
        await logWorkflow(workflow.id, 'skipped', { reason: 'telegram_auto_payment off' }, 0);
        return;
    }

    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // 3 kun ichida muddati tugaydigan to'lovlar
        const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const upcomingPayments = await prisma.payment.findMany({
            where: {
                status: 'pending',
                dueDate: { gte: todayStr, lte: in3Days },
            },
            include: {
                student: { select: { name: true, telegramChatId: true, parentTelegramId: true } },
            },
        });

        const overduePayments = await prisma.payment.findMany({
            where: {
                status: 'overdue',
            },
            include: {
                student: { select: { name: true, telegramChatId: true, parentTelegramId: true } },
            },
        });

        let sentCount = 0;
        const errors: string[] = [];

        // Upcoming eslatmalar
        for (const payment of upcomingPayments) {
            const chatId = payment.student?.parentTelegramId || payment.student?.telegramChatId;
            if (!chatId) continue;

            const overdue = payment.dueDate ? payment.dueDate < todayStr : false;
            const ok = await sendPaymentReminder(
                payment.student.name,
                payment.amount,
                payment.dueDate || todayStr,
                chatId,
                overdue
            );
            if (ok) sentCount++;
        }

        // Overdue eslatmalar
        for (const payment of overduePayments) {
            const chatId = payment.student?.parentTelegramId || payment.student?.telegramChatId;
            if (!chatId) continue;

            const ok = await sendPaymentReminder(
                payment.student.name,
                payment.amount,
                payment.dueDate || todayStr,
                chatId,
                true
            );
            if (ok) sentCount++;

            // Managerga ham xabar
            const adminChatId = await getSetting('telegram_admin_chat_id');
            if (adminChatId) {
                await sendMessage(adminChatId,
                    `🔴 <b>Qarzdor o'quvchi</b>\n` +
                    `${payment.student.name}: ${payment.amount.toLocaleString('uz-UZ')} so'm\n` +
                    `Muddati: ${payment.dueDate || 'Ko\'rsatilmagan'}`
                );
            }
        }

        await logWorkflow(workflow.id, 'success', {
            upcoming: upcomingPayments.length,
            overdue: overduePayments.length,
            sent: sentCount,
            errors,
        }, Date.now() - start);

        console.log(`[Scheduler] To'lov eslatmalari: ${sentCount} xabar yuborildi`);
    } catch (err: any) {
        await logWorkflow(workflow.id, 'error', { error: err.message }, Date.now() - start);
        console.error('[Scheduler] To\'lov eslatma xatosi:', err.message);
    }
}

// ─── JOB 2: Davomat Monitoringi (har kuni 17:30) ─────────────────────────────
async function runAttendanceMonitoring() {
    const start = Date.now();
    const workflowName = 'daily_attendance_monitor';
    let workflow = await prisma.workflow.findFirst({ where: { trigger: workflowName } });

    if (!workflow || !workflow.isActive) return;

    const autoAttendance = await getSetting('telegram_auto_attendance');
    if (autoAttendance !== 'true') {
        await logWorkflow(workflow.id, 'skipped', { reason: 'telegram_auto_attendance off' }, 0);
        return;
    }

    try {
        const today = new Date().toISOString().split('T')[0];

        // Bugun kelmagan o'quvchilar
        const absentRecords = await prisma.attendanceRecord.findMany({
            where: { date: today, status: 'absent' },
            include: {
                student: {
                    select: { name: true, parentTelegramId: true, telegramChatId: true },
                },
                group: { select: { name: true } },
            },
        });

        let sentCount = 0;
        for (const record of absentRecords) {
            const chatId = record.student?.parentTelegramId;
            if (!chatId) continue;

            const ok = await sendAttendanceAlert(
                record.student.name,
                record.group?.name || 'Noma\'lum guruh',
                chatId
            );
            if (ok) sentCount++;
        }

        // 3 kun ketma-ket kelmagan o'quvchilar → managerga
        const adminChatId = await getSetting('telegram_admin_chat_id');
        if (adminChatId) {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const absentStudents = await prisma.attendanceRecord.findMany({
                where: { date: { gte: threeDaysAgo, lte: today }, status: 'absent' },
                select: { studentId: true },
            });

            const studentAbsences: Record<string, number> = {};
            absentStudents.forEach(r => {
                studentAbsences[r.studentId] = (studentAbsences[r.studentId] || 0) + 1;
            });

            const seriousAbsents = Object.entries(studentAbsences).filter(([_, count]) => count >= 3);
            if (seriousAbsents.length > 0) {
                const ids = seriousAbsents.map(([id]) => id);
                const students = await prisma.student.findMany({
                    where: { id: { in: ids } },
                    select: { name: true, phone: true },
                });

                const list = students.map(s => `• ${s.name} (${s.phone})`).join('\n');
                await sendMessage(adminChatId,
                    `⚠️ <b>Ketma-ket kelmagan o'quvchilar (3+ kun)</b>\n\n${list}\n\n` +
                    `Iltimos, ular bilan bog'laning!`
                );
            }
        }

        await logWorkflow(workflow.id, 'success', {
            absent: absentRecords.length,
            notified: sentCount,
        }, Date.now() - start);

        console.log(`[Scheduler] Davomat monitoring: ${sentCount} bildirishnoma yuborildi`);
    } catch (err: any) {
        await logWorkflow(workflow.id, 'error', { error: err.message }, Date.now() - start);
        console.error('[Scheduler] Davomat monitoring xatosi:', err.message);
    }
}

// ─── JOB 3: Lead Nurturing (har 2 soatda) ────────────────────────────────────
async function runLeadNurturing() {
    const start = Date.now();
    const workflowName = 'hourly_lead_nurturing';
    let workflow = await prisma.workflow.findFirst({ where: { trigger: workflowName } });

    if (!workflow || !workflow.isActive) return;

    try {
        // 7 kun mobaynida faol bo'lmagan lidlarni "cold" ga o'tkazish
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const coldLeads = await prisma.lead.updateMany({
            where: {
                status: { not: 'cold' },
                stage: { notIn: ['won', 'lost'] },
                updatedAt: { lt: sevenDaysAgo },
            },
            data: { status: 'cold' },
        });

        // Yangi lidlar uchun managerga eslatma (24 soat javob yo'q)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pendingLeads = await prisma.lead.findMany({
            where: {
                stage: 'new',
                createdAt: { lt: oneDayAgo },
            },
            select: { name: true, phone: true, source: true },
        });

        if (pendingLeads.length > 0) {
            const adminChatId = await getSetting('telegram_admin_chat_id');
            if (adminChatId) {
                const list = pendingLeads.slice(0, 5).map(l => `• ${l.name} (${l.phone})`).join('\n');
                const more = pendingLeads.length > 5 ? `\n... va yana ${pendingLeads.length - 5} ta` : '';
                await sendMessage(adminChatId,
                    `📋 <b>Javob berilmagan lidlar (24+ soat)</b>\n\n${list}${more}\n\n` +
                    `Iltimos, CRM tizimida ko'rib chiqing!`
                );
            }
        }

        await logWorkflow(workflow.id, 'success', {
            coldUpdated: coldLeads.count,
            pendingLeads: pendingLeads.length,
        }, Date.now() - start);
    } catch (err: any) {
        await logWorkflow(workflow.id, 'error', { error: err.message }, Date.now() - start);
    }
}

// ─── JOB 4: Guruh Hayot Sikli (har kuni 10:00) ───────────────────────────────
async function runGroupLifecycle() {
    const start = Date.now();
    const workflowName = 'daily_group_lifecycle';
    let workflow = await prisma.workflow.findFirst({ where: { trigger: workflowName } });

    if (!workflow || !workflow.isActive) return;

    try {
        const adminChatId = await getSetting('telegram_admin_chat_id');
        const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        // 7 kun ichida tugaydigan guruhlar
        const endingSoon = await prisma.group.findMany({
            where: {
                status: 'active',
                endDate: { gte: today, lte: in7Days },
            },
            select: { name: true, endDate: true },
        });

        if (endingSoon.length > 0 && adminChatId) {
            const list = endingSoon.map(g => `• ${g.name} — ${g.endDate}`).join('\n');
            await sendMessage(adminChatId,
                `📅 <b>Tugayotgan guruhlar (7 kun ichida)</b>\n\n${list}\n\n` +
                `Yangi guruh ochish va o'quvchilarni xabardor qilishni unutmang!`
            );
        }

        // Muddati o'tgan guruhlarni yakunlash
        const expired = await prisma.group.updateMany({
            where: {
                status: 'active',
                endDate: { lt: today },
            },
            data: { status: 'completed' },
        });

        await logWorkflow(workflow.id, 'success', {
            endingSoon: endingSoon.length,
            expired: expired.count,
        }, Date.now() - start);
    } catch (err: any) {
        await logWorkflow(workflow.id, 'error', { error: err.message }, Date.now() - start);
    }
}

// ─── Default workflow'larni DB ga qo'shish ───────────────────────────────────
async function ensureDefaultWorkflows() {
    const defaults = [
        {
            trigger: 'daily_payment_reminder',
            name: "To'lov Eslatmalari",
            description: "Har kuni to'lov muddati yaqinlashayotgan va muddati o'tgan to'lovlar uchun Telegram eslatma",
            isActive: false,
        },
        {
            trigger: 'daily_attendance_monitor',
            name: "Davomat Monitoringi",
            description: "Kelmagan o'quvchilar ota-onasiga Telegram xabar yuborish",
            isActive: false,
        },
        {
            trigger: 'hourly_lead_nurturing',
            name: "Lead Nurturing",
            description: "Javob berilmagan lidlar uchun eslatma, 7 kun faolsiz lidlarni cold ga o'tkazish",
            isActive: false,
        },
        {
            trigger: 'daily_group_lifecycle',
            name: "Guruh Hayot Sikli",
            description: "Tugayotgan guruhlar haqida ogohlantirish, muddati o'tgan guruhlarni yakunlash",
            isActive: false,
        },
    ];

    for (const wf of defaults) {
        const exists = await prisma.workflow.findFirst({ where: { trigger: wf.trigger } });
        if (!exists) {
            await prisma.workflow.create({ data: wf });
            console.log(`[Scheduler] Workflow yaratildi: ${wf.name}`);
        }
    }
}

// ─── Schedulerni ishga tushirish ─────────────────────────────────────────────
export async function startScheduler() {
    try {
        await ensureDefaultWorkflows();
        console.log('[Scheduler] ✅ Workflow\'lar tekshirildi');

        // Har kuni 09:00 — To'lov eslatmalari
        cron.schedule('0 9 * * *', () => {
            console.log('[Scheduler] ⏰ To\'lov eslatma job boshlandi');
            runPaymentReminders();
        }, { timezone: 'Asia/Tashkent' });

        // Har kuni 17:30 — Davomat monitoring
        cron.schedule('30 17 * * *', () => {
            console.log('[Scheduler] ⏰ Davomat monitoring job boshlandi');
            runAttendanceMonitoring();
        }, { timezone: 'Asia/Tashkent' });

        // Har 2 soatda — Lead nurturing
        cron.schedule('0 */2 * * *', () => {
            runLeadNurturing();
        }, { timezone: 'Asia/Tashkent' });

        // Har kuni 10:00 — Guruh hayot sikli
        cron.schedule('0 10 * * *', () => {
            console.log('[Scheduler] ⏰ Guruh lifecycle job boshlandi');
            runGroupLifecycle();
        }, { timezone: 'Asia/Tashkent' });

        // Har kuni 08:00 — Staff: dars eslatmasi
        cron.schedule('0 8 * * *', () => {
            console.log('[StaffScheduler] ⏰ Kunlik briefing boshlandi');
            runStaffDailyBriefing();
        }, { timezone: 'Asia/Tashkent' });

        // Har kuni 12:00 — Staff: davomat belgilanmagan guruhlar
        cron.schedule('0 12 * * *', () => {
            console.log('[StaffScheduler] ⏰ Davomat alert boshlandi');
            runStaffAttendanceAlert();
        }, { timezone: 'Asia/Tashkent' });

        console.log('[Scheduler] ✅ Barcha cron joblar ishga tushdi');
    } catch (err: any) {
        console.error('[Scheduler] Xato:', err.message);
    }
}

// ─── Staff Bot: 08:00 — O'qituvchilarga bugungi dars eslatmasi ───────────────

async function runStaffDailyBriefing() {
    try {
        const todayNum = new Date().getDay() || 7; // 0=Sun→7
        const DAY_UZ: Record<number, string> = {
            1: 'Dushanba', 2: 'Seshanba', 3: 'Chorshanba', 4: 'Payshanba',
            5: 'Juma', 6: 'Shanba', 7: 'Yakshanba',
        };

        // Get teachers with today's lessons
        const teacherGroups = await prisma.group.findMany({
            where: {
                status: 'active', deletedAt: null,
                teacherId: { not: null },
                schedules: { some: { dayOfWeek: todayNum } },
            },
            include: {
                teacher: { select: { id: true, name: true, telegramChatId: true } },
                schedules: { where: { dayOfWeek: todayNum }, select: { startTime: true, endTime: true } },
            },
        });

        // Group by teacher
        const byTeacher: Record<string, { chatId: string; name: string; groups: string[] }> = {};
        for (const g of teacherGroups) {
            if (!g.teacher?.telegramChatId) continue;
            const tid = g.teacher.id;
            if (!byTeacher[tid]) {
                byTeacher[tid] = { chatId: g.teacher.telegramChatId, name: g.teacher.name, groups: [] };
            }
            const times = g.schedules.map(s => `${s.startTime}–${s.endTime}`).join(', ');
            byTeacher[tid].groups.push(`• ${g.name} (${times})`);
        }

        let sent = 0;
        for (const { chatId, groups } of Object.values(byTeacher)) {
            const text =
                `📚 <b>Bugungi darslar — ${DAY_UZ[todayNum]}</b>\n\n` +
                groups.join('\n') + '\n\n' +
                `Dars jadvali uchun /today`;
            const ok = await sendStaffMessage(chatId, text, 'HTML');
            if (ok) sent++;
        }
        console.log(`[StaffScheduler] ✅ Kunlik briefing: ${sent} o'qituvchiga yuborildi`);
    } catch (err: any) {
        console.error('[StaffScheduler] Briefing xato:', err.message);
    }
}

// ─── Staff Bot: 12:00 — Davomat belgilanmagan guruhlar ────────────────────────

async function runStaffAttendanceAlert() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayNum = new Date().getDay() || 7;

        // Groups with today's schedule that have NO attendance records yet
        const groups = await prisma.group.findMany({
            where: {
                status: 'active', deletedAt: null,
                teacherId: { not: null },
                schedules: { some: { dayOfWeek: todayNum } },
                attendanceRecords: { none: { date: today } },
            },
            include: {
                teacher: { select: { name: true, telegramChatId: true } },
            },
        });

        let alerted = 0;
        for (const g of groups) {
            if (!g.teacher?.telegramChatId) continue;
            const text =
                `⚠️ <b>Davomat belgilanmagan</b>\n\n` +
                `<b>${g.name}</b> guruhi uchun bugungi davomat hali belgilanmagan.\n\n` +
                `Iltimos, tezroq belgilang.`;
            const ok = await sendStaffMessage(g.teacher.telegramChatId, text, 'HTML');
            if (ok) alerted++;
        }
        console.log(`[StaffScheduler] ✅ Davomat alert: ${alerted} o'qituvchiga yuborildi`);
    } catch (err: any) {
        console.error('[StaffScheduler] Attendance alert xato:', err.message);
    }
}

// Manual ishga tushirish (API orqali)
export const JOBS: Record<string, () => Promise<void>> = {
    daily_payment_reminder: runPaymentReminders,
    daily_attendance_monitor: runAttendanceMonitoring,
    hourly_lead_nurturing: runLeadNurturing,
    daily_group_lifecycle: runGroupLifecycle,
    staff_daily_briefing: runStaffDailyBriefing,
    staff_attendance_alert: runStaffAttendanceAlert,
};
