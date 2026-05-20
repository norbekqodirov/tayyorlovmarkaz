import prisma from '../db.js';

// Telegram Bot API orqali xabar yuborish (telegraf ishlatmasdan, to'g'ridan HTTP)
async function getBotToken(): Promise<string | null> {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: 'telegram_bot_token' } });
        return setting?.value || process.env.TELEGRAM_BOT_TOKEN || null;
    } catch {
        return process.env.TELEGRAM_BOT_TOKEN || null;
    }
}

export async function sendMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    const token = await getBotToken();
    if (!token) {
        console.warn('[Telegram] Bot token topilmadi. Settings → Telegram da token kiriting.');
        return false;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode,
            }),
        });

        const result = await response.json() as any;

        // Log saqlash
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
            data: {
                chatId,
                type: 'manual',
                message: text.substring(0, 500),
                status: 'failed',
                error: err.message,
            },
        }).catch(() => {});

        return false;
    }
}

export async function sendBroadcast(chatIds: string[], text: string, type: string = 'broadcast'): Promise<{ sent: number; failed: number }> {
    const token = await getBotToken();
    if (!token) return { sent: 0, failed: chatIds.length };

    let sent = 0;
    let failed = 0;

    for (const chatId of chatIds) {
        if (!chatId || chatId.trim() === '') continue;
        const ok = await sendMessage(chatId, text);
        if (ok) sent++;
        else failed++;

        // Spam oldini olish uchun kichik kechikish
        await new Promise(r => setTimeout(r, 50));
    }

    return { sent, failed };
}

// Davomat bildirishnomasi — ota-onaga
export async function sendAttendanceAlert(studentName: string, groupName: string, parentTelegramId: string): Promise<boolean> {
    const text = `📚 <b>Davomat Xabari</b>\n\n` +
        `Hurmatli ota-ona, <b>${studentName}</b> bugun <b>${groupName}</b> darsiga kelmadi.\n\n` +
        `Iltimos, sababini ma'lum qiling. Savollar uchun markaz bilan bog'laning. 📞`;

    // Log turi saqlash uchun to'g'ri type bilan chaqiramiz
    const token = await getBotToken();
    if (!token) return false;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: parentTelegramId, text, parse_mode: 'HTML' }),
        });
        const result = await response.json() as any;
        await prisma.telegramMessage.create({
            data: { chatId: parentTelegramId, type: 'attendance', message: text.substring(0, 500), status: result.ok ? 'sent' : 'failed', error: result.ok ? null : result.description },
        }).catch(() => {});
        return result.ok;
    } catch { return false; }
}

// To'lov eslatmasi
export async function sendPaymentReminder(studentName: string, amount: number, dueDate: string, chatId: string, overdue = false): Promise<boolean> {
    const emoji = overdue ? '🔴' : '⚠️';
    const text = overdue
        ? `${emoji} <b>To'lov Muddati O'tdi!</b>\n\n` +
          `<b>${studentName}</b> uchun <b>${amount.toLocaleString('uz-UZ')} so'm</b> to'lov ${dueDate} gacha to'lanishi kerak edi.\n\n` +
          `Iltimos, imkon qadar tezroq to'lang yoki markaz bilan bog'laning. 📞`
        : `${emoji} <b>To'lov Eslatmasi</b>\n\n` +
          `<b>${studentName}</b> uchun <b>${amount.toLocaleString('uz-UZ')} so'm</b> to'lov muddati: <b>${dueDate}</b>\n\n` +
          `O'z vaqtida to'lash uchun rahmat! 🙏`;

    const token = await getBotToken();
    if (!token) return false;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        });
        const result = await response.json() as any;
        await prisma.telegramMessage.create({
            data: { chatId, type: 'payment', message: text.substring(0, 500), status: result.ok ? 'sent' : 'failed', error: result.ok ? null : result.description },
        }).catch(() => {});
        return result.ok;
    } catch { return false; }
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

    return sendMessage(adminChatId, text);
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
