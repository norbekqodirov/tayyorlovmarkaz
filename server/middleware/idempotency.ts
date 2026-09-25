/**
 * IP-12 — pul komandalari uchun Idempotency-Key (H.1 §7).
 *
 * Mijoz har bir forma yuborishida bitta tasodifiy kalit yuboradi (`Idempotency-Key`
 * sarlavhasi). Shu kalit bilan takroriy so'rov (ikki marta bosish, tarmoq qayta
 * yuborishi) qayta bajarilmaydi — birinchi javob qaytariladi (`Idempotent-Replay: true`).
 * - kalit boshqa foydalanuvchi/yo'l/tana bilan kelsa — 409;
 * - birinchi so'rov hali bajarilayotgan bo'lsa — 409 (5 daqiqadan eski "osilgan" yozuv tozalanadi);
 * - 5xx javob saqlanmaydi (qayta urinish mumkin).
 * Sarlavha bo'lmasa — oddiy so'rov (eski mijozlar buzilmaydi).
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const STALE_MS = 5 * 60 * 1000;

function hashBody(route: string, body: unknown) {
    return crypto.createHash('sha256').update(JSON.stringify({ route, body: body ?? null })).digest('hex');
}

export function idempotent(route: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = req.header('Idempotency-Key');
        if (!key) return next();
        if (!KEY_RE.test(key)) return res.status(400).json({ message: "Idempotency-Key noto'g'ri formatda" });
        const userId: string | null = (req as any).user?.id ?? (req as any).staffUser?.id ?? null;
        const fullRoute = `${route}:${req.originalUrl.split('?')[0]}`;
        const requestHash = hashBody(fullRoute, req.body);
        try {
            await prisma.idempotencyRecord.create({ data: { key, userId, route: fullRoute, requestHash, statusCode: 0 } });
        } catch {
            const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
            if (!existing) return next();
            if (existing.userId !== userId || existing.route !== fullRoute || existing.requestHash !== requestHash) {
                return res.status(409).json({ message: "Bu Idempotency-Key boshqa so'rov uchun ishlatilgan", code: 'IDEMPOTENCY_MISMATCH' });
            }
            if (existing.statusCode === 0) {
                if (Date.now() - existing.createdAt.getTime() < STALE_MS) {
                    return res.status(409).json({ message: "Bu so'rov hozir bajarilmoqda — biroz kuting", code: 'IDEMPOTENCY_IN_PROGRESS' });
                }
                // Osilib qolgan (javobsiz) yozuv — tozalab, qayta bajaramiz
                await prisma.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);
                return idempotent(route)(req, res, next);
            }
            res.setHeader('Idempotent-Replay', 'true');
            return res.status(existing.statusCode).json(existing.responseBody ? JSON.parse(existing.responseBody) : null);
        }
        const originalJson = res.json.bind(res);
        (res as any).json = (body: unknown) => {
            const code = res.statusCode;
            const store = code < 500
                ? prisma.idempotencyRecord.update({ where: { key }, data: { statusCode: code, responseBody: JSON.stringify(body ?? null) } })
                : prisma.idempotencyRecord.delete({ where: { key } });
            store.catch(e => console.error('[idempotency]', e?.message)).finally(() => originalJson(body));
            return res;
        };
        next();
    };
}

/** Eski yozuvlarni tozalash (kunlik). */
export async function pruneIdempotencyRecords(days = 30) {
    const before = new Date(Date.now() - days * 86400000);
    const r = await prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: before } } });
    return r.count;
}
