/**
 * Prisma mijozini faqat-o'qish rejimiga o'raydi: model delegatlarida faqat
 * o'qish metodlari, `$queryRawUnsafe` da faqat SELECT/PRAGMA (qiymat bermasdan).
 * Qolgan hammasi (create/update/delete/upsert, $executeRaw, $transaction...)
 * xato otadi. Inventarizatsiya va tahlil skriptlari uchun (IP-08).
 */
const READ_METHODS = new Set(['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);

export function readOnlyPrisma<T extends object>(client: T): T {
    return new Proxy(client as any, {
        get(target, prop: string | symbol) {
            const v = target[prop];
            if (typeof prop !== 'string') return v;
            if (prop === '$queryRawUnsafe') {
                return (sql: string, ...args: any[]) => {
                    if (!/^\s*(select|pragma)\b/i.test(sql) || /pragma\s+[\w.]+\s*=/i.test(sql) || /;\s*\S/.test(sql)) {
                        throw new Error(`Faqat bitta SELECT/PRAGMA o'qish so'roviga ruxsat: ${sql}`);
                    }
                    return v.call(target, sql, ...args);
                };
            }
            if (prop.startsWith('$')) {
                if (prop === '$disconnect' || prop === '$connect') return v.bind(target);
                throw new Error(`Faqat o'qish rejimi — ${prop} taqiqlangan`);
            }
            if (v && typeof v === 'object') {
                return new Proxy(v, {
                    get(delegate, method: string | symbol) {
                        if (typeof method !== 'string' || !READ_METHODS.has(method)) {
                            throw new Error(`Faqat o'qish rejimi — ${prop}.${String(method)} taqiqlangan`);
                        }
                        return delegate[method].bind(delegate);
                    },
                });
            }
            return v;
        },
    }) as T;
}
