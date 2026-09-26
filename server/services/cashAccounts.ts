/**
 * IP-22 — kassa/bank hisoblari va solishtirish (ML-16, TR:P12, QT-80).
 *
 * Pul turgan joylar (CashAccount): naqd kassa, terminal (karta), bank hisobi, Payme, Click.
 * Har kassa yozuvi (Transaction) hisobga `accountId` bilan bog'lanadi; eski yozuvlarda
 * `accountId` yo'q — ular `method` ("Naqd", "Karta", ...) bo'yicha mos hisobga tushadi,
 * shuning uchun ma'lumot ko'chirish kerak emas.
 *
 *   qoldiq(D) = boshlang'ich qoldiq + Σ kirim − Σ chiqim + o'tkazma kirdi − o'tkazma chiqdi   (≤ D)
 *
 * Ichki o'tkazma (CashTransfer) daromad ham, xarajat ham emas — faqat hisoblar orasida;
 * komissiya manba hisobidan alohida xarajat yozuvi bo'ladi.
 *
 * Kunni yopish (CashSession, faqat naqd kassa va terminal): kutilgan = boshlanish + kun
 * harakati; sanalgan bilan farq sababi bilan yoziladi va "Kassa farqi" yozuvi bilan
 * tenglashtiriladi. Yopilgan kun va undan oldingi kunlarga shu hisob bo'yicha yangi yozuv,
 * o'tkazma yoki o'chirish yo'q — oxirgi yopilgan kunni ADMIN qayta ochadi.
 */
import prisma from '../db.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { todayDateStr } from '../utils/timezone.js';
import { isValidDate } from '../domain/lessonCalendar.js';
import { isMonthClosed, reverseTransactionInTx } from './moneyReversal.js';
import { methodKey, accountForMethod } from '../domain/cashAccount.js';

export { methodKey, accountForMethod };

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { id?: string | null; name?: string | null; role?: string | null };

export class CashError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export const ACCOUNT_TYPES = ['cash', 'card', 'bank', 'online'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];
/** Kunlik yopish faqat qo'l bilan sanaladigan pul uchun; bank/online — oylik solishtirish. */
export const DAY_CLOSE_TYPES = new Set<string>(['cash', 'card']);
export const CASH_DIFF_CATEGORY = 'Kassa farqi';
export const TRANSFER_FEE_CATEGORY = 'Bank komissiyasi';

const DEFAULT_ACCOUNTS = [
    { name: 'Asosiy kassa', type: 'cash', method: 'Naqd', sortOrder: 1 },
    { name: 'Terminal (karta)', type: 'card', method: 'Karta', sortOrder: 2 },
    { name: 'Bank hisobi', type: 'bank', method: 'Bank', sortOrder: 3 },
    { name: 'Payme', type: 'online', method: 'Payme', sortOrder: 4 },
    { name: 'Click', type: 'online', method: 'Click', sortOrder: 5 },
];

type Account = { id: string; name: string; type: string; method: string; openingBalance: number; openingDate: string | null; isActive: boolean; sortOrder: number };

const round = (n: number) => Math.round(n);
export function prevDay(date: string) {
    const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}
function monthBounds(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CashError(400, "Oy YYYY-MM formatida bo'lishi kerak", 'BAD_MONTH');
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ─── Hisoblar ────────────────────────────────────────────────────────────────

/** Birinchi murojaatda standart 5 hisob (bir marta — Setting qulfi bilan, parallel so'rovlar dublikat qilmaydi). */
export async function ensureDefaultAccounts(db: Db = prisma) {
    if (await db.cashAccount.count()) return;
    try { await db.setting.create({ data: { key: 'cash_accounts_seeded', value: todayDateStr() } }); }
    catch { return; } // boshqa so'rov allaqachon yaratmoqda
    await db.cashAccount.createMany({ data: DEFAULT_ACCOUNTS });
}

export async function getAccounts(db: Db = prisma): Promise<Account[]> {
    await ensureDefaultAccounts(db);
    return db.cashAccount.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

/** Yozuv uchun hisob: aniq `accountId` (faol bo'lishi shart) yoki usul bo'yicha. `method` hisob yorlig'iga tenglashadi. */
export async function resolveAccount(db: Db, input: { accountId?: string | null; method?: string | null }) {
    if (input.accountId) {
        const acc = await db.cashAccount.findUnique({ where: { id: input.accountId } });
        if (!acc || !acc.isActive) throw new CashError(400, 'Kassa/bank hisobi topilmadi yoki faol emas', 'BAD_ACCOUNT');
        return { accountId: acc.id, method: acc.method, account: acc as Account };
    }
    const acc = accountForMethod(await getAccounts(db), input.method || 'Naqd');
    return { accountId: acc?.id ?? null, method: input.method || acc?.method || 'Naqd', account: acc };
}

/** Hisobning oxirgi yopilgan kuni (shu kun va undan oldingilar qulf). */
export async function lastClosedDate(db: Db, accountId: string): Promise<string | null> {
    const s = await db.cashSession.findFirst({ where: { accountId, status: 'closed' }, orderBy: { date: 'desc' }, select: { date: true } });
    return s?.date ?? null;
}

export async function assertDayOpen(db: Db, accountId: string | null | undefined, date: string) {
    if (!accountId) return;
    const last = await lastClosedDate(db, accountId);
    if (last && date <= last) {
        const acc = await db.cashAccount.findUnique({ where: { id: accountId }, select: { name: true } });
        throw new CashError(409, `«${acc?.name ?? 'Kassa'}» ${last.split('-').reverse().join('.')} gacha yopilgan — yozuvni keyingi sana bilan kiriting yoki ADMIN kunni qayta ochsin`, 'DAY_CLOSED');
    }
}

/** Yozishdan oldin: hisobni aniqlash + yopilgan kunni tekshirish. `{accountId, method}` Transaction'ga yoziladi. */
export async function stampAccount(db: Db, input: { accountId?: string | null; method?: string | null; date: string }) {
    const r = await resolveAccount(db, input);
    await assertDayOpen(db, r.accountId, input.date);
    return { accountId: r.accountId, method: r.method };
}

/** Mavjud yozuv (eski bo'lishi mumkin) qaysi hisobda — accountId yoki usul bo'yicha. */
export async function accountIdOf(db: Db, t: { accountId?: string | null; method?: string | null }) {
    if (t.accountId) return t.accountId;
    return accountForMethod(await getAccounts(db), t.method)?.id ?? null;
}

// ─── Harakat va qoldiq ───────────────────────────────────────────────────────

export interface Flow { income: number; expense: number; transfersIn: number; transfersOut: number }
const emptyFlow = (): Flow => ({ income: 0, expense: 0, transfersIn: 0, transfersOut: 0 });
const net = (f: Flow) => f.income - f.expense + f.transfersIn - f.transfersOut;

/**
 * [from, to] oralig'idagi harakat hisob bo'yicha (kalit — hisob id; hisobi aniqlanmagan eski
 * usullar — `?<usul>`). Hisobning `openingDate`idan oldingi yozuvlar hisobga olinmaydi.
 */
async function flows(db: Db, accounts: Account[], from: string | null, to: string, byDate = false) {
    const dateWhere = { lte: to, ...(from ? { gte: from } : {}) };
    const [rows, transfers] = await Promise.all([
        db.transaction.groupBy({ by: ['accountId', 'method', 'type', 'date'], where: { date: dateWhere }, _sum: { amount: true } }),
        db.cashTransfer.findMany({ where: { voidedAt: null, date: dateWhere }, select: { fromAccountId: true, toAccountId: true, amount: true, fee: true, date: true } }),
    ]);
    const byId = new Map(accounts.map(a => [a.id, a]));
    const out = new Map<string, Flow>();
    const get = (key: string, date: string) => {
        const k = byDate ? `${key}|${date}` : key;
        if (!out.has(k)) out.set(k, emptyFlow());
        return out.get(k)!;
    };
    const before = (a: Account | undefined | null, date: string) => !!a?.openingDate && date < a.openingDate;
    for (const r of rows) {
        const acc = r.accountId ? byId.get(r.accountId) ?? null : accountForMethod(accounts, r.method);
        if (before(acc, r.date)) continue;
        const f = get(acc ? acc.id : `?${r.method || '—'}`, r.date);
        const amt = r._sum.amount ?? 0;
        if (r.type === 'income') f.income += amt; else if (r.type === 'expense') f.expense += amt;
    }
    for (const t of transfers) {
        const moved = t.amount - t.fee;
        const src = byId.get(t.fromAccountId); const dst = byId.get(t.toAccountId);
        if (src && !before(src, t.date)) get(src.id, t.date).transfersOut += moved;
        if (dst && !before(dst, t.date)) get(dst.id, t.date).transfersIn += moved;
    }
    return out;
}

function openingPart(a: Account, date: string) {
    return !a.openingDate || a.openingDate <= date ? a.openingBalance : 0;
}

/** Barcha hisoblar qoldig'i D kuni oxiriga. */
export async function balancesAt(db: Db, date: string, accounts?: Account[]) {
    const accs = accounts ?? await getAccounts(db);
    const f = await flows(db, accs, null, date);
    return new Map(accs.map(a => [a.id, round(openingPart(a, date) + net(f.get(a.id) ?? emptyFlow()))]));
}

/** Hisoblar ro'yxati: bugungi qoldiq, bugungi harakat, oxirgi yopilgan kun. */
export async function accountsOverview(db: Db = prisma) {
    const today = todayDateStr();
    const accounts = await getAccounts(db);
    const [bal, todayFlows, sessions] = await Promise.all([
        balancesAt(db, today, accounts),
        flows(db, accounts, today, today),
        db.cashSession.groupBy({ by: ['accountId'], where: { status: 'closed' }, _max: { date: true } }),
    ]);
    const lastClosed = new Map(sessions.map(s => [s.accountId, s._max.date]));
    return accounts.map(a => {
        const f = todayFlows.get(a.id) ?? emptyFlow();
        const last = lastClosed.get(a.id) ?? null;
        return {
            ...a, balance: bal.get(a.id) ?? 0,
            today: { income: round(f.income), expense: round(f.expense), transfersIn: round(f.transfersIn), transfersOut: round(f.transfersOut) },
            dayClose: DAY_CLOSE_TYPES.has(a.type), lastClosedDate: last, todayClosed: !!last && last >= today,
        };
    });
}

// ─── Kunni yopish ────────────────────────────────────────────────────────────

/** Kun ko'rinishi (yopishdan oldin): boshlanish, harakat, kutilgan qoldiq va yozuvlar ro'yxati. */
export async function dayPreview(db: Db, accountId: string, date: string) {
    if (!isValidDate(date)) throw new CashError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    const accounts = await getAccounts(db);
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) throw new CashError(404, 'Hisob topilmadi', 'NOT_FOUND');
    const opening = (await balancesAt(db, prevDay(date), accounts)).get(acc.id) ?? 0;
    const f = (await flows(db, accounts, date, date)).get(acc.id) ?? emptyFlow();
    const openingAdded = acc.openingDate === date ? acc.openingBalance : 0;
    const expected = round(opening + openingAdded + net(f));
    const [txs, transfers, session] = await Promise.all([
        db.transaction.findMany({
            where: { date, OR: [{ accountId: acc.id }, { accountId: null }] },
            orderBy: { createdAt: 'asc' },
            select: { id: true, type: true, amount: true, category: true, description: true, method: true, accountId: true, studentName: true, staffName: true, sourceType: true, voidedAt: true, createdAt: true },
        }),
        db.cashTransfer.findMany({ where: { date, voidedAt: null, OR: [{ fromAccountId: acc.id }, { toAccountId: acc.id }] }, orderBy: { createdAt: 'asc' } }),
        db.cashSession.findFirst({ where: { accountId: acc.id, date, status: 'closed' } }),
    ]);
    const entries = txs.filter(t => t.accountId === acc.id || accountForMethod(accounts, t.method)?.id === acc.id);
    return {
        account: acc, date, opening: round(opening), openingAdded,
        income: round(f.income), expense: round(f.expense), transfersIn: round(f.transfersIn), transfersOut: round(f.transfersOut),
        expected, entries, transfers, session, lastClosedDate: await lastClosedDate(db, acc.id),
        canClose: DAY_CLOSE_TYPES.has(acc.type),
    };
}

export async function closeDay(input: { accountId: string; date: string; counted: number; note?: string | null }, actor: Actor) {
    const date = String(input.date || '');
    if (!isValidDate(date)) throw new CashError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    if (date > todayDateStr()) throw new CashError(400, "Kelajak kunini yopib bo'lmaydi", 'FUTURE');
    const counted = Number(input.counted);
    if (!Number.isFinite(counted) || counted < 0 || counted > 1e11) throw new CashError(400, "Sanalgan summa manfiy bo'lmagan son bo'lishi kerak", 'BAD_AMOUNT');
    const note = String(input.note ?? '').trim().slice(0, 500);
    const lockKey = `cash_close_lock:${input.accountId}`;

    return prisma.$transaction(async tx => {
        const acc = await tx.cashAccount.findUnique({ where: { id: input.accountId } });
        if (!acc) throw new CashError(404, 'Hisob topilmadi', 'NOT_FOUND');
        if (!DAY_CLOSE_TYPES.has(acc.type)) throw new CashError(400, "Bank va onlayn hisoblar kunlik yopilmaydi — oylik solishtirish hisobotidan foydalaning", 'NO_DAY_CLOSE');
        if (acc.openingDate && date < acc.openingDate) throw new CashError(400, `Hisob ${acc.openingDate} dan boshlab yuritiladi`, 'BEFORE_OPENING');
        // Parallel yopishlar: bitta qulf qatori, optimistik yangilash
        const lock = await tx.setting.findUnique({ where: { key: lockKey } });
        const last = await lastClosedDate(tx, acc.id);
        if (last && date <= last) throw new CashError(409, `Bu hisob ${last.split('-').reverse().join('.')} gacha allaqachon yopilgan`, 'ALREADY_CLOSED');
        if (lock) {
            const r = await tx.setting.updateMany({ where: { key: lockKey, value: lock.value }, data: { value: date } });
            if (r.count !== 1) throw new CashError(409, "Boshqa foydalanuvchi shu hisobni hozir yopmoqda — qayta urinib ko'ring", 'BUSY');
        } else {
            try { await tx.setting.create({ data: { key: lockKey, value: date } }); }
            catch { throw new CashError(409, "Boshqa foydalanuvchi shu hisobni hozir yopmoqda — qayta urinib ko'ring", 'BUSY'); }
        }

        const p = await dayPreview(tx, acc.id, date);
        const difference = round(counted - p.expected);
        if (difference !== 0 && note.length < 3) throw new CashError(400, `Farq ${difference > 0 ? '+' : ''}${difference} so'm — sababini yozing`, 'NOTE_REQUIRED');
        if (difference !== 0 && await isMonthClosed(tx, date)) throw new CashError(409, `${date.slice(0, 7)} oyi yopilgan — farqni tuzatma bilan yozib bo'lmaydi`, 'PERIOD_CLOSED');

        const session = await tx.cashSession.create({
            data: {
                accountId: acc.id, date, opening: p.opening + p.openingAdded, income: p.income, expense: p.expense,
                transfersIn: p.transfersIn, transfersOut: p.transfersOut, expected: p.expected, counted: round(counted), difference,
                note: note || null, closedById: actor.id ?? null, closedByName: actor.name ?? null,
            },
        });
        if (difference !== 0) {
            const adj = await tx.transaction.create({
                data: {
                    type: difference > 0 ? 'income' : 'expense', amount: Math.abs(difference), category: CASH_DIFF_CATEGORY,
                    description: `Kassa farqi · ${acc.name} · ${date} — ${note}`.slice(0, 1000),
                    date, method: acc.method, accountId: acc.id, sourceType: 'cash_session', sourceId: session.id,
                },
            });
            return tx.cashSession.update({ where: { id: session.id }, data: { adjustmentTransactionId: adj.id } });
        }
        return session;
    });
}

/** Faqat oxirgi yopilgan kunni qayta ochish (ADMIN): farq yozuvi olib tashlanadi, qulf oldingi yopilgan kunga qaytadi. */
export async function reopenDay(sessionId: string, reasonRaw: unknown, actor: Actor) {
    const reason = String(reasonRaw ?? '').trim();
    if (reason.length < 3) throw new CashError(400, 'Qayta ochish sababini yozing', 'REASON_REQUIRED');
    return prisma.$transaction(async tx => {
        const s = await tx.cashSession.findUnique({ where: { id: sessionId } });
        if (!s || s.status !== 'closed') throw new CashError(404, 'Yopilgan kun topilmadi', 'NOT_FOUND');
        const last = await lastClosedDate(tx, s.accountId);
        if (last !== s.date) throw new CashError(409, `Avval keyingi yopilgan kunni (${last}) qayta oching`, 'NOT_LAST');
        if (await isMonthClosed(tx, s.date)) throw new CashError(409, `${s.date.slice(0, 7)} oyi yopilgan — avval oyni qayta oching`, 'PERIOD_CLOSED');
        const r = await tx.cashSession.updateMany({
            where: { id: s.id, status: 'closed' },
            data: { status: 'reopened', reopenedById: actor.id ?? null, reopenedAt: new Date(), reopenReason: reason.slice(0, 500) },
        });
        if (r.count !== 1) throw new CashError(409, 'Kun allaqachon qayta ochilgan', 'ALREADY_REOPENED');
        if (s.adjustmentTransactionId) await tx.transaction.deleteMany({ where: { id: s.adjustmentTransactionId, sourceType: 'cash_session' } });
        const prev = await lastClosedDate(tx, s.accountId);
        await tx.setting.upsert({ where: { key: `cash_close_lock:${s.accountId}` }, create: { key: `cash_close_lock:${s.accountId}`, value: prev ?? '' }, update: { value: prev ?? '' } });
        return tx.cashSession.findUnique({ where: { id: s.id } });
    });
}

// ─── Ichki o'tkazma ──────────────────────────────────────────────────────────

export async function createTransfer(input: { fromAccountId: string; toAccountId: string; amount: number; fee?: number; date?: string; note?: string | null }, actor: Actor) {
    const amount = Number(input.amount); const fee = Number(input.fee || 0);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1e11) throw new CashError(400, "Summa musbat butun son bo'lishi kerak", 'BAD_AMOUNT');
    if (!Number.isInteger(fee) || fee < 0 || fee >= amount) throw new CashError(400, "Komissiya 0 dan kichik yoki summadan katta bo'lmasligi kerak", 'BAD_FEE');
    if (!input.fromAccountId || input.fromAccountId === input.toAccountId) throw new CashError(400, "Ikki xil hisobni tanlang", 'SAME_ACCOUNT');
    const date = input.date || todayDateStr();
    if (!isValidDate(date)) throw new CashError(400, "Sana YYYY-MM-DD formatida bo'lishi kerak", 'BAD_DATE');
    if (date > todayDateStr()) throw new CashError(400, "Kelajak sanasi bilan o'tkazma yozilmaydi", 'FUTURE');
    if (await isMonthClosed(prisma, date)) throw new CashError(409, `${date.slice(0, 7)} oyi yopilgan — bugungi sana bilan yozing`, 'PERIOD_CLOSED');

    return prisma.$transaction(async tx => {
        const [src, dst] = await Promise.all([
            tx.cashAccount.findUnique({ where: { id: input.fromAccountId } }),
            tx.cashAccount.findUnique({ where: { id: input.toAccountId } }),
        ]);
        if (!src?.isActive || !dst?.isActive) throw new CashError(400, 'Hisob topilmadi yoki faol emas', 'BAD_ACCOUNT');
        await assertDayOpen(tx, src.id, date);
        await assertDayOpen(tx, dst.id, date);
        const note = String(input.note ?? '').trim().slice(0, 500) || null;
        const t = await tx.cashTransfer.create({
            data: { fromAccountId: src.id, toAccountId: dst.id, amount, fee, date, note, createdById: actor.id ?? null, createdByName: actor.name ?? null },
        });
        if (fee > 0) {
            const feeTx = await tx.transaction.create({
                data: {
                    type: 'expense', amount: fee, category: TRANSFER_FEE_CATEGORY,
                    description: `O'tkazma komissiyasi · ${src.name} → ${dst.name}${note ? ` — ${note}` : ''}`.slice(0, 1000),
                    date, method: src.method, accountId: src.id, sourceType: 'cash_transfer', sourceId: t.id,
                },
            });
            return tx.cashTransfer.update({ where: { id: t.id }, data: { feeTransactionId: feeTx.id } });
        }
        return t;
    });
}

export async function voidTransfer(id: string, reasonRaw: unknown, actor: Actor) {
    const reason = String(reasonRaw ?? '').trim();
    if (reason.length < 3) throw new CashError(400, 'Bekor qilish sababini yozing', 'REASON_REQUIRED');
    return prisma.$transaction(async tx => {
        const t = await tx.cashTransfer.findUnique({ where: { id } });
        if (!t) throw new CashError(404, "O'tkazma topilmadi", 'NOT_FOUND');
        if (t.voidedAt) throw new CashError(409, "O'tkazma allaqachon bekor qilingan", 'ALREADY_VOID');
        if (await isMonthClosed(tx, t.date)) throw new CashError(409, `${t.date.slice(0, 7)} oyi yopilgan`, 'PERIOD_CLOSED');
        await assertDayOpen(tx, t.fromAccountId, t.date);
        await assertDayOpen(tx, t.toAccountId, t.date);
        const r = await tx.cashTransfer.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: actor.id ?? null, voidReason: reason.slice(0, 500) } });
        if (r.count !== 1) throw new CashError(409, "O'tkazma allaqachon bekor qilingan", 'ALREADY_VOID');
        // Komissiya — o'sha sana bilan qarshi yozuv (kassa tarixida qoladi)
        if (t.feeTransactionId) await reverseTransactionInTx(tx, t.feeTransactionId, `O'tkazma bekor qilindi: ${reason}`, actor, t.date);
        return tx.cashTransfer.findUnique({ where: { id } });
    });
}

// ─── Hisobotlar ──────────────────────────────────────────────────────────────

/** Oylik solishtirish: har hisob bo'yicha boshlanish, kirim, chiqim, o'tkazmalar, yakun, kun yopish farqlari. */
export async function monthlyReport(db: Db, month: string) {
    const { from, to: monthEnd } = monthBounds(month);
    const today = todayDateStr();
    const to = monthEnd > today ? today : monthEnd;
    const accounts = await getAccounts(db);
    if (from > today) return { month, from, to: monthEnd, accounts: [], unassigned: [] };
    const [openBal, f, sessions] = await Promise.all([
        balancesAt(db, prevDay(from), accounts),
        flows(db, accounts, from, to),
        db.cashSession.findMany({ where: { date: { gte: from, lte: to }, status: 'closed' }, select: { accountId: true, difference: true, date: true } }),
    ]);
    const rows = accounts.map(a => {
        const fl = f.get(a.id) ?? emptyFlow();
        const opening = openBal.get(a.id) ?? 0;
        const openingAdded = a.openingDate && a.openingDate >= from && a.openingDate <= to ? a.openingBalance : 0;
        const ss = sessions.filter(s => s.accountId === a.id);
        return {
            id: a.id, name: a.name, type: a.type, method: a.method, isActive: a.isActive,
            opening, openingAdded, income: round(fl.income), expense: round(fl.expense),
            transfersIn: round(fl.transfersIn), transfersOut: round(fl.transfersOut),
            closing: round(opening + openingAdded + net(fl)),
            closedDays: ss.length, differenceTotal: round(ss.reduce((s, x) => s + x.difference, 0)),
            lastClosedDate: ss.map(s => s.date).sort().pop() ?? null,
        };
    }).filter(r => r.isActive || r.opening || r.closing || r.income || r.expense);
    const unassigned = [...f.entries()].filter(([k]) => k.startsWith('?')).map(([k, fl]) => ({ method: k.slice(1), income: round(fl.income), expense: round(fl.expense) }));
    return { month, from, to, accounts: rows, unassigned };
}

/** Kassa daftari: bitta hisob bo'yicha oy kunlari — boshlanish, kirim, chiqim, o'tkazma, yakun, yopilganmi. */
export async function cashBook(db: Db, accountId: string, month: string) {
    const { from, to: monthEnd } = monthBounds(month);
    const today = todayDateStr();
    const to = monthEnd > today ? today : monthEnd;
    const accounts = await getAccounts(db);
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) throw new CashError(404, 'Hisob topilmadi', 'NOT_FOUND');
    if (from > today) return { account: acc, month, days: [] };
    const [openBal, f, sessions] = await Promise.all([
        balancesAt(db, prevDay(from), accounts),
        flows(db, accounts, from, to, true),
        db.cashSession.findMany({ where: { accountId, date: { gte: from, lte: to } }, orderBy: { closedAt: 'asc' } }),
    ]);
    let running = openBal.get(acc.id) ?? 0;
    const days = [];
    for (let d = from; d <= to; d = nextDay(d)) {
        const fl = f.get(`${acc.id}|${d}`) ?? emptyFlow();
        const added = acc.openingDate === d ? acc.openingBalance : 0;
        const opening = running;
        running = round(running + added + net(fl));
        const session = sessions.filter(s => s.date === d).pop() ?? null;
        if (fl.income || fl.expense || fl.transfersIn || fl.transfersOut || added || session) {
            days.push({
                date: d, opening, openingAdded: added, income: round(fl.income), expense: round(fl.expense),
                transfersIn: round(fl.transfersIn), transfersOut: round(fl.transfersOut), closing: running,
                session: session ? { id: session.id, status: session.status, counted: session.counted, difference: session.difference, note: session.note, closedByName: session.closedByName } : null,
            });
        }
    }
    return { account: acc, month, opening: openBal.get(acc.id) ?? 0, closing: running, days };
}

function nextDay(date: string) {
    const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
