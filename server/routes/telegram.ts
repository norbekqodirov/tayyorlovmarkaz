/**
 * server/routes/telegram.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Telegram Bot webhook handler.
 *
 * Qo'llab-quvvatlanadigan komandalar:
 *   /start   — Xush kelibsiz xabari
 *   /leads   — Bugungi yangi lidlar soni
 *   /stats   — Asosiy statistika (o'quvchilar, guruhlar, moliya)
 *   /new_lead— Yangi lid qo'shish (interaktiv dialog)
 *
 * Sozlash:
 *   .env da TELEGRAM_BOT_TOKEN va TELEGRAM_WEBHOOK_SECRET ni qo'shing.
 *   Webhook URL: POST /api/telegram/webhook
 *
 * Production uchun:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://sizning-domain.uz/api/telegram/webhook
 */

import express from 'express';
import prisma from '../db.js';

const router = express.Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// ─── Telegram API helper ──────────────────────────────────────────────────────
async function sendMessage(chatId: number | string, text: string, options: Record<string, any> = {}) {
    if (!BOT_TOKEN) {
        console.warn('[Telegram] BOT_TOKEN not set — skipping sendMessage');
        return;
    }
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...options });
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        if (!res.ok) {
            const err = await res.text();
            console.error('[Telegram] sendMessage error:', err);
        }
    } catch (e) {
        console.error('[Telegram] sendMessage fetch error:', e);
    }
}

// ─── Command handlers ─────────────────────────────────────────────────────────
async function handleStart(chatId: number) {
    await sendMessage(chatId,
        `🎓 <b>Tayyorlovmarkaz CRM Bot</b>\n\n` +
        `Assalomu alaykum! Men sizga CRM tizimi bilan ishlashda yordam beraman.\n\n` +
        `<b>Mavjud komandalar:</b>\n` +
        `/leads — Bugungi yangi lidlar\n` +
        `/stats — Umumiy statistika\n` +
        `/help — Yordam\n\n` +
        `<i>Muammolar bo'lsa admin bilan bog'laning.</i>`
    );
}

async function handleLeads(chatId: number) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayLeads = await prisma.lead.findMany({
            where: { createdAt: { gte: today } },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });
        const total = await prisma.lead.count();
        const won = await prisma.lead.count({ where: { stage: 'won' } });

        let text = `📊 <b>Lidlar Hisoboti</b>\n\n`;
        text += `Bugungi yangi lidlar: <b>${todayLeads.length}</b>\n`;
        text += `Jami lidlar: <b>${total}</b>\n`;
        text += `Yutilgan (Won): <b>${won}</b>\n`;
        text += `Konversiya: <b>${total > 0 ? Math.round((won / total) * 100) : 0}%</b>\n\n`;

        if (todayLeads.length > 0) {
            text += `<b>Bugungi lidlar:</b>\n`;
            todayLeads.forEach((l, i) => {
                text += `${i + 1}. ${l.name} — ${l.phone} (${l.source || 'Noma\'lum'})\n`;
            });
        } else {
            text += `<i>Bugun hali yangi lid yo'q.</i>`;
        }

        await sendMessage(chatId, text);
    } catch (e) {
        await sendMessage(chatId, '❌ Ma\'lumot olishda xatolik yuz berdi.');
    }
}

async function handleStats(chatId: number) {
    try {
        const [students, groups, leads, revenue] = await Promise.all([
            prisma.student.count({ where: { status: 'active' } }),
            prisma.group.count({ where: { status: { in: ['Active', 'Faol'] } } }),
            prisma.lead.count({ where: { stage: { in: ['new', 'contacted', 'meeting'] } } }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { type: 'income' },
            }),
        ]);

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthRevenue = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: 'income', createdAt: { gte: monthStart } },
        });

        const totalRevenue = revenue._sum.amount || 0;
        const monthRev = monthRevenue._sum.amount || 0;

        const text =
            `📈 <b>Umumiy Statistika</b>\n\n` +
            `👩‍🎓 Faol o'quvchilar: <b>${students}</b>\n` +
            `📚 Faol guruhlar: <b>${groups}</b>\n` +
            `🎯 Aktiv lidlar: <b>${leads}</b>\n\n` +
            `💰 <b>Moliyaviy Holat:</b>\n` +
            `Bu oy tushumlari: <b>${new Intl.NumberFormat('uz-UZ').format(monthRev)} so'm</b>\n` +
            `Jami tushumlar: <b>${new Intl.NumberFormat('uz-UZ').format(totalRevenue)} so'm</b>`;

        await sendMessage(chatId, text);
    } catch (e) {
        await sendMessage(chatId, '❌ Statistika olishda xatolik.');
    }
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
    // Webhook secret tekshiruvi (ixtiyoriy lekin xavfsizlik uchun tavsiya etiladi)
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    res.status(200).json({ ok: true }); // Telegramga tez javob qaytaramiz

    const update = req.body;
    const message = update?.message || update?.edited_message;
    if (!message) return;

    const chatId = message.chat.id;
    const text: string = message.text || '';
    const command = text.split(' ')[0].toLowerCase();

    try {
        switch (command) {
            case '/start':
            case '/help':
                await handleStart(chatId);
                break;
            case '/leads':
                await handleLeads(chatId);
                break;
            case '/stats':
                await handleStats(chatId);
                break;
            default:
                if (text.startsWith('/')) {
                    await sendMessage(chatId, `❓ Noma'lum komanda: <code>${command}</code>\n\nYordam uchun: /help`);
                }
        }
    } catch (e) {
        console.error('[Telegram] Handler error:', e);
    }
});

// ─── Webhook registration helper (dev only) ───────────────────────────────────
router.get('/set-webhook', async (req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const webhookUrl = req.query.url as string;
    if (!webhookUrl) return res.status(400).json({ error: 'url query param required' });

    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
    const body = JSON.stringify({ url: webhookUrl, secret_token: WEBHOOK_SECRET || undefined });
    const r = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await r.json();
    res.json(data);
});

// ─── Webhook info ─────────────────────────────────────────────────────────────
router.get('/info', async (_req, res) => {
    if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await r.json();
    res.json(data);
});

export default router;
