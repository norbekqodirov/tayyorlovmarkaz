// Simple LRU-style in-memory cache — no external dependencies.
// 500 max entries, 60s default TTL.

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

const store = new Map<string, CacheEntry<any>>();
const MAX_ENTRIES = 500;

function evictExpired() {
    const now = Date.now();
    for (const [k, e] of store) {
        if (e.expiresAt <= now) store.delete(k);
    }
}

function set<T>(key: string, value: T, ttl = 60_000) {
    if (store.size >= MAX_ENTRIES) evictExpired();
    if (store.size >= MAX_ENTRIES) {
        const firstKey = store.keys().next().value;
        if (firstKey) store.delete(firstKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttl });
}

function get<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { store.delete(key); return undefined; }
    return entry.value as T;
}

export async function cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number
): Promise<T> {
    const hit = get<T>(key);
    if (hit !== undefined) return hit;
    const value = await fn();
    if (value !== undefined && value !== null) {
        set(key, value, ttl ?? 60_000);
    }
    return value;
}

export function invalidate(prefix: string): void {
    for (const k of Array.from(store.keys())) {
        if (k.startsWith(prefix)) store.delete(k);
    }
}

export function clearCache(): void {
    store.clear();
}

export function getCacheStats() {
    return {
        size: store.size,
        max: MAX_ENTRIES,
        calculatedSize: store.size,
    };
}

export const TTL = {
    SHORT: 30_000,
    MEDIUM: 60_000,
    LONG: 5 * 60_000,
    EXTRA_LONG: 30 * 60_000,
};

export const NS = {
    ANALYTICS: 'analytics:',
    REPORTS: 'reports:',
    DASHBOARD: 'dashboard:',
    FINANCE: 'finance:',
    USER: 'user:',
};

export default { cached, invalidate, clearCache, getCacheStats, TTL, NS };
