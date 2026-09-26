import crypto from 'crypto';
import prisma from '../db.js';
import { enqueueMessage, enqueueBatch, type EnqueueInput } from './outbox.js';

// ─── Core helpers ─────────────────────────────────────────────────────────────

async function getBotToken(): Promise<string | null> {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: 'telegram_bot_token' } });
        return setting?.value || process.env.TELEGRAM_BOT_TOKEN || null;
    } catch {
        return process.env.TELEGRAM_BOT_TOKEN || null;
    }
}

/** Raw Telegram Bot API call */
export async function sendTelegramRequest(method: string, params: Record<string, any>): Promise<any> {
    const token = await getBotToken();
    if (!token) return { ok: false, description: 'Token not set' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        return res.json();
    } catch (err: any) {
        return { ok: false, description: err.message };
    }
}

// ─── Phone normalization ──────────────────────────────────────────────────────

/** Returns last 9 significant digits for Uzbek phone matching */
export function extractPhoneDigits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : digits;
}

// ─── Telegram Mini App initData validation ────────────────────────────────────

export async function validateInitData(initData: string): Promise<{
    valid: boolean;
    telegramUserId?: string;
    firstName?: string;
    username?: string;
}> {
    const token = await getBotToken();
    if (!token || !initData) return { valid: false };
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return { valid: false };

        params.delete('hash');
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (expectedHash !== hash) return { valid: false };

        // Replay-attack: reject if older than 24 hours
        const authDate = parseInt(params.get('auth_date') || '0');
        if (Math.floor(Date.now() / 1000) - authDate > 86_400) return { valid: false };

        const user = params.get('user') ? JSON.parse(params.get('user')!) : null;
        return {
            valid: true,
            telegramUserId: String(user?.id || ''),
            firstName: user?.first_name || '',
            username: user?.username || '',
        };
    } catch {
        return { valid: false };
    }
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

type QueueOpts = Pick<EnqueueInput, 'kind' | 'dedupeKey' | 'batchId' | 'refType' | 'refId' | 'createdById' | 'urgent'>;

/**
 * IP-29: xabar navbatga qo'yiladi (MessageOutbox) — ishchi yuboradi, qayta urinadi, 429'da kutadi.
 * `true` — navbatga qo'yildi (yoki shu dedupeKey bilan allaqachon bor). Darhol natija kerak
 * bo'lsa (masalan "Test xabar") — `sendMessageNow`.
 */
export async function sendMessage(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
    replyMarkup?: any,
    opts: QueueOpts = {},
): Promise<boolean> {
    try {
        const r = await enqueueMessage({ chatId, text, parseMode, replyMarkup, ...opts });
        return !!r.id;
    } catch (err: any) {
        console.error("[Telegram] navbatga qo'yib bo'lmadi:", err.message);
        return false;
    }
}

/** Darhol yuborish (navbatsiz) — faqat foydalanuvchi natijani kutayotgan joyda (test xabar). */
export async function sendMessageNow(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
    replyMarkup?: any,
): Promise<boolean> {
    const token = await getBotToken();
    if (!token) {
        console.warn('[Telegram] Bot token topilmadi. Settings → Telegram da token kiriting.');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body: any = { chat_id: chatId, text, parse_mode: parseMode };
        if (replyMarkup) body.reply_markup = replyMarkup;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await response.json() as any;

        await prisma.telegramMessage.create({
            data: {
                chatId,
                type: 'manual',
                message: text.substring(0, 500),
                status: result.ok ? 'sent' : 'failed',
                error: result.ok ? null : JSON.stringify(result.description),
            },
        }).catch(() => {});

        return result.ok;
    } catch (err: any) {
        console.error('[Telegram] sendMessage xato:', err.message);
        await prisma.telegramMessage.create({
            data: { chatId, type: 'manual', message: text.substring(0, 500), status: 'failed', error: err.message },
        }).catch(() => {});
        return false;
    }
}

/** Set bot menu button to Mini App URL */
export async function setMenuButton(miniAppUrl: string): Promise<boolean> {
    const result = await sendTelegramRequest('setChatMenuButton', {
        menu_button: { type: 'web_app', text: '📱 Portal', web_app: { url: miniAppUrl } },
    });
    return result.ok === true;
}

/**
 * IP-29: ommaviy xabar navbatga — so'rov darhol qaytadi, har chatga bitta xabar (dublikatsiz).
 * Yetkazish holati: `batchId` bo'yicha MessageOutbox (Telegram → Navbat).
 */
export async function sendBroadcast(chatIds: string[], text: string, type: string = 'broadcast', opts: { batchId?: string; createdById?: string | null } = {}) {
    return enqueueBatch({ batchId: opts.batchId || `${type}:${crypto.randomUUID()}`, chatIds, text, kind: type, createdById: opts.createdById });
}

// ─── Staff Bot helpers ────────────────────────────────────────────────────────

async function getStaffBotToken(): Promise<string | null> {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: 'staff_bot_token' } });
        return setting?.value || process.env.STAFF_BOT_TOKEN || null;
    } catch {
        return process.env.STAFF_BOT_TOKEN || null;
    }
}

/** Raw Staff Bot API call */
export async function sendStaffBotRequest(method: string, params: Record<string, any>): Promise<any> {
    const token = await getStaffBotToken();
    if (!token) return { ok: false, description: 'Staff bot token not set' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        return res.json();
    } catch (err: any) {
        return { ok: false, description: err.message };
    }
}

/** Send message via Staff Bot */
export async function sendStaffMessage(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
    replyMarkup?: any,
): Promise<boolean> {
    const token = await getStaffBotToken();
    if (!token) {
        console.warn('[StaffBot] Token topilmadi. Settings → Staff Bot Token kiriting.');
        return false;
    }
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body: any = { chat_id: chatId, text, parse_mode: parseMode };
        if (replyMarkup) body.reply_markup = replyMarkup;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await response.json() as any;
        return result.ok;
    } catch (err: any) {
        console.error('[StaffBot] sendMessage xato:', err.message);
        return false;
    }
}

/** Validate Telegram Mini App initData using STAFF bot token */
export async function validateStaffInitData(initData: string): Promise<{
    valid: boolean;
    telegramUserId?: string;
    firstName?: string;
    username?: string;
}> {
    const token = await getStaffBotToken();
    if (!token || !initData) return { valid: false };
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return { valid: false };

        params.delete('hash');
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (expectedHash !== hash) return { valid: false };

        const authDate = parseInt(params.get('auth_date') || '0');
        if (Math.floor(Date.now() / 1000) - authDate > 86_400) return { valid: false };

        const user = params.get('user') ? JSON.parse(params.get('user')!) : null;
        return {
            valid: true,
            telegramUserId: String(user?.id || ''),
            firstName: user?.first_name || '',
            username: user?.username || '',
        };
    } catch {
        return { valid: false };
    }
}

/** Set Staff bot webhook */
export async function setStaffWebhook(url: string): Promise<any> {
    // RS-01 tuzatish: ilgari secret_token UMUMAN yuborilmasdi — demak
    // staffTelegram.ts'dagi qanday secret tekshiruvi bo'lsa ham, Telegram'ning
    // o'zi hech qachon `X-Telegram-Bot-Api-Secret-Token` header'ini yubormasdi.
    const secret = process.env.STAFF_TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
    return sendStaffBotRequest('setWebhook', { url, drop_pending_updates: true, secret_token: secret });
}

/** Get Staff bot webhook info */
export async function getStaffWebhookInfo(): Promise<any> {
    return sendStaffBotRequest('getWebhookInfo', {});
}

// Davomat bildirishnomasi — ota-onaga
export async function sendAttendanceAlert(studentName: string, groupName: string, parentTelegramId: string, opts: QueueOpts = {}): Promise<boolean> {
    const text = `📚 <b>Davomat Xabari</b>\n\n` +
        `Hurmatli ota-ona, <b>${studentName}</b> bugun <b>${groupName}</b> darsiga kelmadi.\n\n` +
        `Iltimos, sababini ma'lum qiling. Savollar uchun markaz bilan bog'laning. 📞`;

    return sendMessage(parentTelegramId, text, 'HTML', undefined, { kind: 'attendance', ...opts });
}

// To'lov eslatmasi
export async function sendPaymentReminder(studentName: string, amount: number, dueDate: string, chatId: string, overdue = false, opts: QueueOpts = {}): Promise<boolean> {
    const emoji = overdue ? '🔴' : '⚠️';
    const text = overdue
        ? `${emoji} <b>To'lov Muddati O'tdi!</b>\n\n` +
          `<b>${studentName}</b> uchun <b>${amount.toLocaleString('uz-UZ')} so'm</b> to'lov ${dueDate} gacha to'lanishi kerak edi.\n\n` +
          `Iltimos, imkon qadar tezroq to'lang yoki markaz bilan bog'laning. 📞`
        : `${emoji} <b>To'lov Eslatmasi</b>\n\n` +
          `<b>${studentName}</b> uchun <b>${amount.toLocaleString('uz-UZ')} so'm</b> to'lov muddati: <b>${dueDate}</b>\n\n` +
          `O'z vaqtida to'lash uchun rahmat! 🙏`;

    return sendMessage(chatId, text, 'HTML', undefined, { kind: 'payment_reminder', ...opts });
}

// To'lov tasdiqlash xabari
export async function sendPaymentConfirmation(studentName: string, amount: number, method: string, chatId: string): Promise<boolean> {
    const text = `✅ <b>To'lov Qabul Qilindi</b>\n\n` +
        `O'quvchi: <b>${studentName}</b>\n` +
        `Summa: <b>${amount.toLocaleString('uz-UZ')} so'm</b>\n` +
        `Usul: ${method}\n` +
        `Sana: ${new Date().toLocaleDateString('uz-UZ')}\n\n` +
        `To'lovingiz uchun rahmat! 🙏`;

    return sendMessage(chatId, text);
}

// Yangi lid xabari — adminga
export async function sendNewLeadAlert(leadName: string, phone: string, course: string, source: string, adminChatId: string): Promise<boolean> {
    const text = `🆕 <b>Yangi Qiziquvchi!</b>\n\n` +
        `Ism: <b>${leadName}</b>\n` +
        `Telefon: <a href="tel:${phone}">${phone}</a>\n` +
        `Kurs: ${course || 'Ko\'rsatilmagan'}\n` +
        `Manba: ${source || 'Noma\'lum'}\n\n` +
        `⏰ Tezda bog'laning!`;

    return sendMessage(adminChatId, text, 'HTML', undefined, { kind: 'lead_alert', urgent: true });
}

// Bot ma'lumotlarini tekshirish
export async function getBotInfo(): Promise<{ ok: boolean; username?: string; name?: string; error?: string }> {
    const token = await getBotToken();
    if (!token) return { ok: false, error: 'Bot token topilmadi' };

    try {
        const url = `https://api.telegram.org/bot${token}/getMe`;
        const response = await fetch(url);
        const result = await response.json() as any;
        if (result.ok) {
            return { ok: true, username: result.result.username, name: result.result.first_name };
        }
        return { ok: false, error: result.description };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
