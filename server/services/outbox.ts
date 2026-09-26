/**
 * IP-29 — xabarlar navbati (outbox, AL-02/AL-03, QT-90/QT-91).
 *
 * Tashqi xabar avval `MessageOutbox`ga yoziladi (so'rov darhol qaytadi), ishchi har 10 s
 * navbatni yuboradi:
 *  - tezlik: umumiy ~20 xabar/s, bitta chatga bir aylanishda bittadan;
 *  - 429: `retry_after` qadar butun ishchi kutadi (urinish hisoblanmaydi);
 *  - vaqtinchalik xato: 30 s → 2 min → 10 min → 30 min, 5 urinishdan keyin `failed`;
 *  - 400/403 (chat yo'q, bot bloklangan): darhol `failed`;
 *  - `dedupeKey` (unique) — bir voqea uchun bitta xabar; ommaviy xabarda bir chatga bitta;
 *  - restart: `pending` qoladi va keyin yuboriladi; yuborish paytida uzilgan (`sending`)
 *    xabar qayta yuborilmaydi — "yetkazilgani noma'lum" deb `failed` qilinadi (takror bo'lmasin).
 * Yakuniy holat (yuborildi/xato) eski `TelegramMessage` tarixiga ham yoziladi.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../db.js';
import { decideAfterSend, parseQuietHours, quietUntil, QUIET_KINDS, type TelegramResult } from '../domain/outboxPolicy.js';
import { sendTelegramRequest, sendStaffBotRequest } from './telegramService.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface EnqueueInput {
    chatId: string;
    text: string;
    kind?: string;
    channel?: 'telegram' | 'staff' | 'test';
    parseMode?: 'HTML' | 'Markdown' | null;
    replyMarkup?: unknown;
    dedupeKey?: string | null;
    batchId?: string | null;
    refType?: string | null;
    refId?: string | null;
    createdById?: string | null;
    /** Sokin soatni hisobga olmaslik (shoshilinch xabar) */
    urgent?: boolean;
}

const QUIET_DEFAULT = '22:00-08:00';
async function quietStart(kind: string, urgent?: boolean) {
    if (urgent || !QUIET_KINDS.has(kind)) return null;
    const row = await prisma.setting.findUnique({ where: { key: 'telegram_quiet_hours' } }).catch(() => null);
    return quietUntil(new Date(), parseQuietHours(row?.value ?? QUIET_DEFAULT));
}

const isUniqueViolation = (e: any) => e?.code === 'P2002';

/** Navbatga qo'yadi. Shu `dedupeKey` bilan xabar bo'lsa — yangisi yaratilmaydi. */
export async function enqueueMessage(input: EnqueueInput, db: Db = prisma): Promise<{ id: string | null; duplicate: boolean }> {
    const chatId = String(input.chatId ?? '').trim();
    if (!chatId || !input.text) return { id: null, duplicate: false };
    const kind = input.kind || 'manual';
    const at = await quietStart(kind, input.urgent);
    try {
        const row = await db.messageOutbox.create({
            data: {
                channel: input.channel || 'telegram', chatId, text: input.text, kind,
                parseMode: input.parseMode === null ? null : (input.parseMode || 'HTML'),
                replyMarkup: input.replyMarkup ? JSON.stringify(input.replyMarkup) : null,
                dedupeKey: input.dedupeKey || null, batchId: input.batchId || null,
                refType: input.refType || null, refId: input.refId || null, createdById: input.createdById || null,
                // Vaqt Node soatidan (bazaning now() soati biroz farq qilishi mumkin — ishchi Node soati bilan solishtiradi)
                nextAttemptAt: at ?? new Date(),
            },
            select: { id: true },
        });
        kickWorker();
        return { id: row.id, duplicate: false };
    } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        const existing = await db.messageOutbox.findUnique({ where: { dedupeKey: input.dedupeKey! }, select: { id: true } });
        return { id: existing?.id ?? null, duplicate: true };
    }
}

/**
 * Ommaviy xabar: har chatga bitta xabar (QT-91 — ikki farzandli ota-onaga bitta),
 * dedupeKey = `<batchId>:<chatId>`. HTTP so'rov yuborishni kutmaydi.
 */
export async function enqueueBatch(input: { batchId: string; chatIds: string[]; text: string; kind?: string; createdById?: string | null; channel?: 'telegram' | 'staff' | 'test' }) {
    const unique = [...new Set(input.chatIds.map(c => String(c ?? '').trim()).filter(Boolean))];
    let queued = 0, duplicates = input.chatIds.filter(c => String(c ?? '').trim()).length - unique.length;
    for (const chatId of unique) {
        const r = await enqueueMessage({ chatId, text: input.text, kind: input.kind || 'broadcast', batchId: input.batchId, dedupeKey: `${input.batchId}:${chatId}`, createdById: input.createdById, channel: input.channel });
        if (r.duplicate) duplicates++; else if (r.id) queued++;
    }
    return { batchId: input.batchId, queued, duplicates, recipients: unique.length };
}

// ─── Ishchi ──────────────────────────────────────────────────────────────────

export type Sender = (msg: { channel: string; chatId: string; text: string; parseMode: string | null; replyMarkup: string | null }) => Promise<TelegramResult>;

const telegramSender: Sender = async (m) => {
    const params: Record<string, unknown> = { chat_id: m.chatId, text: m.text };
    if (m.parseMode) params.parse_mode = m.parseMode;
    if (m.replyMarkup) { try { params.reply_markup = JSON.parse(m.replyMarkup); } catch { /* noto'g'ri JSON — tugmasiz */ } }
    return m.channel === 'staff' ? sendStaffBotRequest('sendMessage', params) : sendTelegramRequest('sendMessage', params);
};

const HISTORY_TYPE: Record<string, string> = { payment_reminder: 'payment', attendance: 'attendance', broadcast: 'broadcast', lead_alert: 'lead', receipt: 'payment' };
let pausedUntil = 0;
let running = false;

/**
 * Navbatdagi tayyor xabarlarni yuboradi (bitta aylanish). `channels` — qaysi kanallar
 * (test ishchisi faqat 'test'ni, asosiy ishchi 'telegram'/'staff'ni oladi).
 */
export async function processOutbox(opts: { limit?: number; send?: Sender; channels?: string[]; now?: () => Date; spacingMs?: number } = {}) {
    const send = opts.send ?? telegramSender;
    const now = opts.now ?? (() => new Date());
    const channels = opts.channels ?? ['telegram', 'staff'];
    const spacing = opts.spacingMs ?? 50;
    const stats = { sent: 0, retried: 0, failed: 0, deferred: 0 };
    if (Date.now() < pausedUntil && !opts.send) return stats;
    const due = await prisma.messageOutbox.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now() }, channel: { in: channels } },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: opts.limit ?? 100,
    });
    const chatsThisRound = new Set<string>();
    for (const m of due) {
        const chatKey = `${m.channel}:${m.chatId}`;
        if (chatsThisRound.has(chatKey)) { stats.deferred++; continue; } // bitta chatga ~1 xabar/s
        // Egallash: faqat hali 'pending' bo'lsa (parallel ishchi ikki marta yubormasin)
        // nextAttemptAt = egallangan payt (Node soati) — restart'da uzilganini aniqlash uchun
        const claimed = await prisma.messageOutbox.updateMany({ where: { id: m.id, status: 'pending' }, data: { status: 'sending', nextAttemptAt: new Date() } });
        if (claimed.count !== 1) continue;
        chatsThisRound.add(chatKey);
        let result: TelegramResult;
        try { result = await send({ channel: m.channel, chatId: m.chatId, text: m.text, parseMode: m.parseMode, replyMarkup: m.replyMarkup }); }
        catch (e: any) { result = { ok: false, description: e?.message || 'Yuborishda xato' }; }
        const d = decideAfterSend(result, m.attempts, now());
        if (d.action === 'sent') {
            await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: 'sent', sentAt: now(), attempts: m.attempts + 1, lastError: null } });
            stats.sent++;
        } else if (d.action === 'retry') {
            await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: 'pending', nextAttemptAt: d.at, lastError: d.error, attempts: m.attempts + (d.countAttempt ? 1 : 0) } });
            stats.retried++;
            if (d.pauseAllMs) { pausedUntil = Date.now() + d.pauseAllMs; break; }
        } else {
            await prisma.messageOutbox.update({ where: { id: m.id }, data: { status: 'failed', lastError: d.error, attempts: m.attempts + 1 } });
            stats.failed++;
        }
        if (d.action !== 'retry' && m.channel !== 'test') {
            await prisma.telegramMessage.create({
                data: { chatId: m.chatId, type: HISTORY_TYPE[m.kind] || m.kind, message: m.text.slice(0, 500), status: d.action === 'sent' ? 'sent' : 'failed', error: d.action === 'fail' ? d.error : null, entityId: m.refId },
            }).catch(() => {});
        }
        if (spacing) await new Promise(r => setTimeout(r, spacing));
    }
    return stats;
}

/**
 * Restart'dan keyin: yuborish paytida uzilgan (`sending`) xabarlar qayta yuborilmaydi —
 * Telegram qabul qilgan bo'lishi mumkin. "Noma'lum" deb `failed`; kerak bo'lsa qo'lda qayta.
 */
export async function recoverInterrupted(olderThanMs = 60_000, channels?: string[]) {
    const r = await prisma.messageOutbox.updateMany({
        where: { status: 'sending', nextAttemptAt: { lte: new Date(Date.now() - olderThanMs) }, ...(channels ? { channel: { in: channels } } : {}) },
        data: { status: 'failed', lastError: "Server qayta ishga tushdi — yetkazilgani noma'lum (kerak bo'lsa qayta yuboring)" },
    });
    return r.count;
}

let timer: NodeJS.Timeout | null = null;
async function tick() {
    if (running) return;
    running = true;
    try { await processOutbox(); }
    catch (e: any) { console.error('[outbox]', e?.message); }
    finally { running = false; }
}
/** Yangi xabar qo'shilganda navbatni kutmasdan bir aylanish (ishchi yoqilgan bo'lsa). */
function kickWorker() { if (timer) setTimeout(() => void tick(), 200); }

export function startOutboxWorker(intervalMs = 10_000) {
    if (timer) return;
    void recoverInterrupted(0).then(n => { if (n) console.warn(`[outbox] ${n} ta uzilgan xabar "noma'lum" deb belgilandi`); }).catch(() => {});
    timer = setInterval(() => void tick(), intervalMs);
    console.log('[outbox] ishchi ishga tushdi');
}

// ─── Boshqaruv ───────────────────────────────────────────────────────────────

export class OutboxError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function retryMessage(id: string) {
    const r = await prisma.messageOutbox.updateMany({ where: { id, status: { in: ['failed', 'cancelled'] } }, data: { status: 'pending', nextAttemptAt: new Date(), attempts: 0, lastError: null } });
    if (r.count !== 1) throw new OutboxError(409, "Faqat xato yoki bekor qilingan xabar qayta yuboriladi", 'BAD_STATE');
    kickWorker();
    return prisma.messageOutbox.findUnique({ where: { id } });
}

export async function cancelMessage(id: string) {
    const r = await prisma.messageOutbox.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
    if (r.count !== 1) throw new OutboxError(409, "Faqat navbatdagi (hali yuborilmagan) xabar bekor qilinadi", 'BAD_STATE');
    return prisma.messageOutbox.findUnique({ where: { id } });
}

export async function retryFailed(batchId?: string | null) {
    const r = await prisma.messageOutbox.updateMany({ where: { status: 'failed', ...(batchId ? { batchId } : {}) }, data: { status: 'pending', nextAttemptAt: new Date(), attempts: 0, lastError: null } });
    kickWorker();
    return r.count;
}

/** Holatlar bo'yicha sonlar (umumiy yoki bitta ommaviy xabar bo'yicha). */
export async function outboxCounts(where: Prisma.MessageOutboxWhereInput = {}) {
    const rows = await prisma.messageOutbox.groupBy({ by: ['status'], where, _count: { _all: true } });
    const c: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const r of rows) c[r.status] = r._count._all;
    return c;
}

/** Ommaviy xabarlar (batchId) bo'yicha yetkazish holati. */
export async function batchCounts(batchIds: string[]) {
    if (!batchIds.length) return new Map<string, Record<string, number>>();
    const rows = await prisma.messageOutbox.groupBy({ by: ['batchId', 'status'], where: { batchId: { in: batchIds } }, _count: { _all: true } });
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) {
        if (!r.batchId) continue;
        const c = out.get(r.batchId) ?? { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
        c[r.status] = r._count._all;
        out.set(r.batchId, c);
    }
    return out;
}
