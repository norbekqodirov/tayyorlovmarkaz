/**
 * Hisob tizimi rejimi (`Setting.ledger_mode`):
 *   legacy — eski tizim (Student.balance qo'lda/eski yo'llar bilan), yangi hisoblar ta'sirsiz;
 *   shadow — yangi hisoblar kunlik hisoblanadi va eski bilan solishtiriladi (ta'sirsiz);
 *   live   — qarz/balans yangi hisoblar va taqsimotlardan (Student.balance — kesh, IP-14).
 * Alohida modul — tsiklik importlarsiz hamma xizmat foydalanishi uchun.
 */
import prisma from '../db.js';

export type LedgerMode = 'legacy' | 'shadow' | 'live';
export const LEDGER_MODES: LedgerMode[] = ['legacy', 'shadow', 'live'];

export class LedgerModeError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function getLedgerMode(): Promise<LedgerMode> {
    const row = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
    return LEDGER_MODES.includes(row?.value as LedgerMode) ? (row!.value as LedgerMode) : 'legacy';
}

export async function setLedgerMode(mode: string): Promise<LedgerMode> {
    if (!LEDGER_MODES.includes(mode as LedgerMode)) throw new LedgerModeError(400, "Rejim: legacy | shadow | live", 'BAD_MODE');
    await prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
    return mode as LedgerMode;
}
