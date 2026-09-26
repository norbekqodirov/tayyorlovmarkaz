/**
 * IP-29 — xabarlar navbatining sof qoidalari (bazasiz, test qilinadi):
 * Telegram javobiga qarab keyingi qadam (yuborildi / keyinroq qayta / butunlay xato)
 * va sokin soatlar (tunda eslatma va ommaviy xabar yuborilmaydi).
 *
 * Telegram cheklovlari: umumiy ~30 xabar/s, bitta chatga ~1 xabar/s; oshsa 429 va
 * `parameters.retry_after` (soniya) qaytadi — shuncha kutish shart.
 */

export const MAX_ATTEMPTS = 5;
/** 1-, 2-, 3-, 4-urinishdan keyingi kutish (keyin — xato). */
export const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];

export interface TelegramResult { ok?: boolean; error_code?: number; description?: string; parameters?: { retry_after?: number } }

export type OutboxDecision =
    | { action: 'sent' }
    | { action: 'retry'; at: Date; error: string; pauseAllMs?: number; countAttempt: boolean }
    | { action: 'fail'; error: string };

/**
 * `attempts` — shu urinishdan OLDIN qilingan urinishlar soni.
 * 429 — urinish hisoblanmaydi (Telegram "kut" degan), butun ishchi ham kutadi.
 * 400/403 (chat topilmadi, bot bloklangan, noto'g'ri matn) — qayta urinish befoyda.
 * Tarmoq xatosi, 5xx, token yo'q — backoff bilan qayta, MAX_ATTEMPTS dan keyin xato.
 */
export function decideAfterSend(result: TelegramResult | null | undefined, attempts: number, now = new Date()): OutboxDecision {
    if (result?.ok) return { action: 'sent' };
    const code = result?.error_code;
    const error = String(result?.description || (code ? `Telegram xatosi ${code}` : "Tarmoq xatosi yoki javob yo'q")).slice(0, 500);
    if (code === 429) {
        const sec = Math.max(1, Math.min(3600, Number(result?.parameters?.retry_after) || 5));
        return { action: 'retry', at: new Date(now.getTime() + sec * 1000), error, pauseAllMs: sec * 1000, countAttempt: false };
    }
    if (code === 400 || code === 401 || code === 403 || code === 404) {
        // 401/404 — token noto'g'ri: barcha xabarlarga tegishli, lekin avtomatik tuzalmaydi
        return { action: 'fail', error };
    }
    const done = attempts + 1;
    if (done >= MAX_ATTEMPTS) return { action: 'fail', error: `${error} (${done} urinish)` };
    return { action: 'retry', at: new Date(now.getTime() + BACKOFF_MS[Math.min(done - 1, BACKOFF_MS.length - 1)]), error, countAttempt: true };
}

/** "22:00-08:00" → daqiqalar; noto'g'ri bo'lsa null (sokin soat yo'q). */
export function parseQuietHours(v?: string | null): { from: number; to: number } | null {
    const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const from = Number(m[1]) * 60 + Number(m[2]); const to = Number(m[3]) * 60 + Number(m[4]);
    if (from > 1439 || to > 1439 || from === to) return null;
    return { from, to };
}

/**
 * Sokin soat ichida bo'lsa — sokin soat tugaydigan payt (UTC Date), aks holda null.
 * Vaqt Toshkent bo'yicha (UTC+5), server vaqt zonasidan qat'i nazar.
 */
export function quietUntil(now: Date, window: { from: number; to: number } | null, tzOffsetMin = 300): Date | null {
    if (!window) return null;
    const local = new Date(now.getTime() + tzOffsetMin * 60_000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const inside = window.from < window.to
        ? minutes >= window.from && minutes < window.to
        : minutes >= window.from || minutes < window.to; // tun orqali (22:00-08:00)
    if (!inside) return null;
    const end = new Date(local);
    end.setUTCHours(Math.floor(window.to / 60), window.to % 60, 0, 0);
    if (end.getTime() <= local.getTime()) end.setUTCDate(end.getUTCDate() + 1);
    return new Date(end.getTime() - tzOffsetMin * 60_000);
}

/** Sokin soatga bo'ysunadigan (shoshilinch bo'lmagan) xabar turlari. */
export const QUIET_KINDS = new Set(['payment_reminder', 'broadcast']);
