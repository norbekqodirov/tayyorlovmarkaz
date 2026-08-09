/**
 * Ommaviy (login talab qilmaydigan) lid endpointlari uchun oddiy,
 * xotira-asosli rate limit — Map<ip, timestamp[]>. Bitta pm2 jarayoni
 * ishlatilgani uchun xotiradagi holat yetarli; Redis yoki
 * express-rate-limit kabi qo'shimcha bog'liqlik shart emas (loyihada
 * ikkalasi ham yo'q).
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

function prune(timestamps: number[], windowMs: number, now: number): number[] {
    return timestamps.filter(t => now - t < windowMs);
}

function makeRateLimiter(opts: { ipWindowMs: number; ipMax: number; globalWindowMs: number; globalMax: number; message: string }) {
    const ipHits = new Map<string, number[]>();
    let globalHits: number[] = [];

    setInterval(() => {
        const now = Date.now();
        for (const [ip, hits] of ipHits) {
            const fresh = prune(hits, opts.ipWindowMs, now);
            if (fresh.length === 0) ipHits.delete(ip);
            else ipHits.set(ip, fresh);
        }
    }, 5 * 60 * 1000).unref();

    return function rateLimit(req: Request, res: Response, next: NextFunction) {
        const now = Date.now();
        const ip = req.ip || 'unknown';

        globalHits = prune(globalHits, opts.globalWindowMs, now);
        if (globalHits.length >= opts.globalMax) {
            return res.status(429).json({ message: opts.message });
        }

        const hits = prune(ipHits.get(ip) || [], opts.ipWindowMs, now);
        if (hits.length >= opts.ipMax) {
            return res.status(429).json({ message: opts.message });
        }

        hits.push(now);
        ipHits.set(ip, hits);
        globalHits.push(now);

        next();
    };
}

// Lid yaratish — qattiqroq chegara (5 ta ariza / 10 daqiqa / IP).
export const publicLeadRateLimit = makeRateLimiter({
    ipWindowMs: 10 * 60 * 1000,
    ipMax: 5,
    globalWindowMs: 60 * 1000,
    globalMax: 60,
    message: "Juda ko'p ariza yuborildi. Birozdan keyin qayta urinib ko'ring.",
});

// Forma ko'rish hisobi — faqat tez-tez yangilashdan (refresh-spam) himoya,
// oddiy ko'p sahifali brauzing uchun keng chegara.
export const publicViewRateLimit = makeRateLimiter({
    ipWindowMs: 60 * 1000,
    ipMax: 20,
    globalWindowMs: 60 * 1000,
    globalMax: 600,
    message: 'Juda ko\'p so\'rov.',
});

// Xom IP manzilni bazaga yozmaslik uchun bir tomonlama hash (maxfiylik) —
// baribir bir xillikni (masalan "shu IP'dan bugun necha marta kelgan")
// tekshirish uchun yetarli.
export function hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}
