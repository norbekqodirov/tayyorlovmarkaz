/**
 * server/bot/index.ts
 * grammY bot — Tayyorlovmarkaz CRM Telegram Bot
 *
 * Komandalar:
 *   /start       — Xush kelibsiz + tizimga bog'lash
 *   /help        — Yordam
 *   /balance     — O'z balansini ko'rish (o'quvchilar)
 *   /attendance  — Bu oydagi davomat (o'quvchilar)
 *   /pay <summa> — To'lov linki olish
 *   /leads       — Bugungi lidlar (admin/manager)
 *   /stats       — Umumiy statistika (admin/manager)
 *   /debtors     — Qarzdorlar ro'yxati (admin/manager)
 *   /notify <chatId> <xabar> — Xabar yuborish (faqat server tomonidan)
 */

import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import prisma from '../db.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!BOT_TOKEN) {
    console.warn('[Bot] TELEGRAM_BOT_TOKEN topilmadi — bot ishlamaydi');
}

export const bot = new Bot(BOT_TOKEN || 'PLACEHOLDER');

// ─── O'quvchi & admin tekshiruvi ─────────────────────────────────────────────

async function findStudentByChatId(chatId: number | string) {
    return prisma.student.findFirst({
        where: { notes: { contains: `tg:${chatId}` } },
        include: { enrollments: { include: { group: { include: { course: true } } } } }
    });
}

async function isAdmin(chatId: number | string) {
    const admins = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim());
    return admins.includes(String(chatId));
}

// ─── /start ──────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    const student = await findStudentByChatId(chatId);

    if (student) {
        const kb = new InlineKeyboard()
            .text('💳 Balansim', 'balance')
            .text('📅 Davomat', 'attendance').row()
            .text('💰 To\'lov linki', 'pay_link')
            .text('📊 Ma\'lumotlarim', 'my_info');

        await ctx.reply(
            `👋 Xush kelibsiz, <b>${student.name}</b>!\n\n` +
            `Tayyorlovmarkaz CRM botiga muvaffaqiyatli kirdingiz.\n` +
            `Quyidagi tugmalardan foydalaning:`,
            { parse_mode: 'HTML', reply_markup: kb }
        );
    } else {
        const payload = ctx.match; // /start <token>
        if (payload) {
            await ctx.reply(
                `🔗 Tizimga ulanish uchun:\n\n` +
                `Telefon raqamingizni yuboring yoki admin bilan bog'laning.`,
                { parse_mode: 'HTML' }
            );
        } else {
            await ctx.reply(
                `🎓 <b>Tayyorlovmarkaz CRM Bot</b>\n\n` +
                `Siz hali tizimga ulanmadingiz.\n\n` +
                `<b>Admin uchun komandalar:</b>\n` +
                `/leads — Bugungi lidlar\n` +
                `/stats — Statistika\n` +
                `/debtors — Qarzdorlar\n\n` +
                `<b>O\'quvchilar:</b>\n` +
                `Admin orqali akkauntingizni Telegram ga ulang.`,
                { parse_mode: 'HTML' }
            );
        }
    }
});

bot.command('help', async (ctx) => {
    const admin = await isAdmin(ctx.chat.id);
    let text = `🤖 <b>Tayyorlovmarkaz Bot — Yordam</b>\n\n`;

    if (admin) {
        text += `<b>Admin komandalari:</b>\n`;
        text += `/leads — Bugungi yangi lidlar\n`;
        text += `/stats — Umumiy statistika\n`;
        text += `/debtors — Qarzdorlar ro'yxati\n\n`;
    }
    text += `<b>O'quvchi komandalari:</b>\n`;
    text += `/balance — Balansim\n`;
    text += `/attendance — Bu oydagi davomatim\n`;
    text += `/pay <summa> — To'lov linki (masalan: /pay 500000)\n`;

    await ctx.reply(text, { parse_mode: 'HTML' });
});

// ─── /balance ────────────────────────────────────────────────────────────────

bot.command('balance', async (ctx) => {
    const student = await findStudentByChatId(ctx.chat.id);
    if (!student) {
        await ctx.reply('❌ Siz tizimga ulanmadingiz. Admin bilan bog\'laning.');
        return;
    }

    const balance = student.balance ?? 0;
    const statusEmoji = balance >= 0 ? '✅' : '❌';
    const lastPayment = await prisma.payment.findFirst({
        where: { studentId: student.id, status: 'paid' },
        orderBy: { createdAt: 'desc' }
    });

    let text = `💳 <b>Moliyaviy holat</b>\n\n`;
    text += `👤 O'quvchi: <b>${student.name}</b>\n`;
    text += `${statusEmoji} Balans: <b>${new Intl.NumberFormat('uz-UZ').format(balance)} so'm</b>\n`;

    if (lastPayment) {
        text += `📅 Oxirgi to'lov: <b>${lastPayment.date}</b>\n`;
        text += `💰 Miqdor: <b>${new Intl.NumberFormat('uz-UZ').format(lastPayment.amount)} so'm</b> (${lastPayment.method})\n`;
    }

    if (balance < 0) {
        text += `\n⚠️ Qarzingiz bor! To'lov qilish uchun /pay ${Math.abs(balance)} yuboring.`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
});

// ─── /attendance ─────────────────────────────────────────────────────────────

bot.command('attendance', async (ctx) => {
    const student = await findStudentByChatId(ctx.chat.id);
    if (!student) {
        await ctx.reply('❌ Siz tizimga ulanmadingiz.');
        return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const records = await prisma.attendanceRecord.findMany({
        where: {
            studentId: student.id,
            date: { gte: monthStart, lte: monthEnd }
        },
        orderBy: { date: 'asc' }
    });

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const total = records.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    const monthNames = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
    const monthName = monthNames[now.getMonth()];

    let text = `📅 <b>${monthName} ${now.getFullYear()} — Davomat</b>\n\n`;
    text += `👤 ${student.name}\n`;
    text += `✅ Keldi: <b>${present}</b>\n`;
    text += `❌ Kelmadi: <b>${absent}</b>\n`;
    text += `⏰ Kech keldi: <b>${late}</b>\n`;
    text += `📊 Davomat foizi: <b>${rate}%</b>\n\n`;

    if (records.length > 0) {
        text += `<b>Batafsil:</b>\n`;
        records.slice(-10).forEach(r => {
            const emoji = r.status === 'present' ? '✅' : r.status === 'absent' ? '❌' : '⏰';
            text += `${emoji} ${r.date}\n`;
        });
        if (records.length > 10) text += `<i>...va boshqa ${records.length - 10} ta yozuv</i>`;
    } else {
        text += `<i>Bu oyda davomat yozuvlari yo'q.</i>`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
});

// ─── /pay ────────────────────────────────────────────────────────────────────

bot.command('pay', async (ctx) => {
    const student = await findStudentByChatId(ctx.chat.id);
    if (!student) {
        await ctx.reply('❌ Siz tizimga ulanmadingiz.');
        return;
    }

    const amountStr = ctx.match?.trim();
    const amount = amountStr ? Number(amountStr) : Math.abs(student.balance ?? 0);

    if (!amount || isNaN(amount) || amount <= 0) {
        await ctx.reply(`💰 To'lov miqdorini kiriting:\n/pay 500000`);
        return;
    }

    const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || '';
    const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
    const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';

    const paymePayload = `m=${PAYME_MERCHANT_ID};ac.student_id=${student.id};a=${amount * 100}`;
    const paymeLink = `https://checkout.paycom.uz/${Buffer.from(paymePayload).toString('base64')}`;
    const clickLink = `https://my.click.uz/services/pay?service_id=${CLICK_SERVICE_ID}&merchant_id=${CLICK_MERCHANT_ID}&amount=${amount}&transaction_param=${student.id}`;

    const kb = new InlineKeyboard()
        .url('💳 Payme orqali to\'lash', paymeLink).row()
        .url('🟢 Click orqali to\'lash', clickLink);

    await ctx.reply(
        `💰 <b>To'lov</b>\n\n` +
        `Miqdor: <b>${new Intl.NumberFormat('uz-UZ').format(amount)} so'm</b>\n\n` +
        `Quyidagi tugmalardan to'lov tizimini tanlang:`,
        { parse_mode: 'HTML', reply_markup: kb }
    );
});

// ─── /leads (admin) ──────────────────────────────────────────────────────────

bot.command('leads', async (ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const [todayLeads, total, won] = await Promise.all([
            prisma.lead.findMany({ where: { createdAt: { gte: today } }, orderBy: { createdAt: 'desc' }, take: 10 }),
            prisma.lead.count(),
            prisma.lead.count({ where: { stage: 'won' } })
        ]);

        let text = `📊 <b>Lidlar Hisoboti</b>\n\n`;
        text += `🗓 Bugungi yangi lidlar: <b>${todayLeads.length}</b>\n`;
        text += `📈 Jami lidlar: <b>${total}</b>\n`;
        text += `🏆 Yutilgan: <b>${won}</b>\n`;
        text += `📉 Konversiya: <b>${total > 0 ? Math.round((won / total) * 100) : 0}%</b>\n\n`;

        if (todayLeads.length > 0) {
            text += `<b>Bugungi lidlar:</b>\n`;
            todayLeads.forEach((l, i) => {
                const statusEmoji = l.status === 'hot' ? '🔥' : l.status === 'warm' ? '🌡' : '❄️';
                text += `${i + 1}. ${statusEmoji} ${l.name} — ${l.phone}\n`;
                if (l.source) text += `   📌 Manba: ${l.source}\n`;
            });
        } else {
            text += `<i>Bugun hali yangi lid yo'q.</i>`;
        }

        await ctx.reply(text, { parse_mode: 'HTML' });
    } catch {
        await ctx.reply('❌ Ma\'lumot olishda xatolik.');
    }
});

// ─── /stats (admin) ──────────────────────────────────────────────────────────

bot.command('stats', async (ctx) => {
    try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [students, groups, leads, allRevenue, monthRevenue] = await Promise.all([
            prisma.student.count({ where: { status: 'active' } }),
            prisma.group.count({ where: { status: { in: ['Active', 'Faol', 'active'] } } }),
            prisma.lead.count({ where: { stage: { in: ['new', 'contacted', 'meeting'] } } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'income' } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: 'income', createdAt: { gte: monthStart } } }),
        ]);

        const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n);

        const text =
            `📈 <b>Umumiy Statistika</b>\n\n` +
            `👩‍🎓 Faol o'quvchilar: <b>${students}</b>\n` +
            `📚 Faol guruhlar: <b>${groups}</b>\n` +
            `🎯 Aktiv lidlar: <b>${leads}</b>\n\n` +
            `💰 <b>Moliyaviy holat:</b>\n` +
            `Bu oy: <b>${fmt(monthRevenue._sum.amount ?? 0)} so'm</b>\n` +
            `Jami: <b>${fmt(allRevenue._sum.amount ?? 0)} so'm</b>`;

        await ctx.reply(text, { parse_mode: 'HTML' });
    } catch {
        await ctx.reply('❌ Statistika olishda xatolik.');
    }
});

// ─── /debtors (admin) ────────────────────────────────────────────────────────

bot.command('debtors', async (ctx) => {
    try {
        const debtors = await prisma.student.findMany({
            where: { balance: { lt: 0 }, status: 'active' },
            orderBy: { balance: 'asc' },
            take: 15,
            select: { id: true, name: true, phone: true, balance: true }
        });

        if (debtors.length === 0) {
            await ctx.reply('✅ Hozirda qarzdor o\'quvchilar yo\'q!');
            return;
        }

        const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.abs(n));
        let text = `💸 <b>Qarzdor O'quvchilar (${debtors.length} ta)</b>\n\n`;

        debtors.forEach((s, i) => {
            text += `${i + 1}. ${s.name}\n`;
            text += `   📞 ${s.phone || 'Tel yo\'q'}\n`;
            text += `   ❌ Qarz: <b>${fmt(s.balance ?? 0)} so'm</b>\n\n`;
        });

        await ctx.reply(text, { parse_mode: 'HTML' });
    } catch {
        await ctx.reply('❌ Ma\'lumot olishda xatolik.');
    }
});

// ─── Inline keyboard callbacks ────────────────────────────────────────────────

bot.callbackQuery('balance', async (ctx) => {
    await ctx.answerCallbackQuery();
    const student = await findStudentByChatId(ctx.chat!.id);
    if (!student) { await ctx.reply('❌ Tizimga ulanmadingiz.'); return; }
    const balance = student.balance ?? 0;
    const statusEmoji = balance >= 0 ? '✅' : '❌';
    await ctx.reply(
        `💳 <b>Balansim</b>\n\n${statusEmoji} <b>${new Intl.NumberFormat('uz-UZ').format(balance)} so'm</b>`,
        { parse_mode: 'HTML' }
    );
});

bot.callbackQuery('attendance', async (ctx) => {
    await ctx.answerCallbackQuery();
    const student = await findStudentByChatId(ctx.chat!.id);
    if (!student) { await ctx.reply('❌ Tizimga ulanmadingiz.'); return; }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const records = await prisma.attendanceRecord.findMany({
        where: { studentId: student.id, date: { gte: monthStart } }
    });
    const present = records.filter(r => r.status === 'present').length;
    const total = records.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    await ctx.reply(
        `📅 <b>Bu oydagi davomat: ${rate}%</b>\n✅ Keldi: ${present} / ${total}`,
        { parse_mode: 'HTML' }
    );
});

bot.callbackQuery('pay_link', async (ctx) => {
    await ctx.answerCallbackQuery();
    const student = await findStudentByChatId(ctx.chat!.id);
    if (!student) { await ctx.reply('❌ Tizimga ulanmadingiz.'); return; }
    const balance = Math.abs(student.balance ?? 0);
    await ctx.reply(`💰 To'lov uchun miqdorni yuboring:\n/pay ${balance > 0 ? balance : 500000}`);
});

bot.callbackQuery('my_info', async (ctx) => {
    await ctx.answerCallbackQuery();
    const student = await findStudentByChatId(ctx.chat!.id);
    if (!student) { await ctx.reply('❌ Tizimga ulanmadingiz.'); return; }
    const enrollment = student.enrollments?.[0];
    let text = `👤 <b>Ma'lumotlarim</b>\n\n`;
    text += `Ism: <b>${student.name}</b>\n`;
    if (student.phone) text += `📞 Tel: ${student.phone}\n`;
    if (enrollment) {
        text += `📚 Kurs: ${enrollment.group.course.name}\n`;
        text += `👥 Guruh: ${enrollment.group.name}\n`;
    }
    text += `📅 Ro'yxatga olingan: ${student.createdAt.toLocaleDateString('uz-UZ')}`;
    await ctx.reply(text, { parse_mode: 'HTML' });
});

// ─── Webhook handler export ───────────────────────────────────────────────────

export const handleBotWebhook = webhookCallback(bot, 'express');

// ─── Xabar yuborish utility (server tomonidan chaqiriladi) ────────────────────

export async function sendTelegramNotification(chatId: string | number, message: string) {
    if (!BOT_TOKEN) return;
    try {
        await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
        console.error('[Bot] sendTelegramNotification error:', e);
    }
}
