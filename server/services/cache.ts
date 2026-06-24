import { LRUCache } from 'lru-cache';

// Universal in-memory cache for analytics & expensive queries.
// 200 max entries, 60s default TTL.
const cache = new LRUCache<string, any>({
    max: 500,
    ttl: 60_000, // 1 minute default
});

/**
 * Wrap an async function with cache. Returns cached value if available,
 * otherwise calls the function and caches the result.
 */
export async function cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number
): Promise<T> {
    const hit = cache.get(key);
    if (hit !== undefined) return hit as T;
    const value = await fn();
    if (value !== undefined && value !== null) {
        cache.set(key, value, ttl ? { ttl } : undefined);
    }
    return value;
}

/**
 * Invalidate all cache entries that start with the given prefix.
 * Use this after CRUD operations to keep cache fresh.
 */
export function invalidate(prefix: string): void {
    const keys = Array.from(cache.keys()) as string[];
    for (const k of keys) {
        if (k.startsWith(prefix)) cache.delete(k);
    }
}

/**
 * Clear the entire cache. Useful in tests or when schema changes.
 */
export function clearCache(): void {
    cache.clear();
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats() {
    return {
        size: cache.size,
        max: cache.max,
        calculatedSize: cache.calculatedSize,
    };
}

// TTL presets (seconds) for common cache scenarios.
export const TTL = {
    SHORT: 30_000,        // 30s — high-mutation data (dashboard counters)
    MEDIUM: 60_000,       // 1min — moderate (recent transactions)
    LONG: 5 * 60_000,     // 5min — slow-changing (monthly aggregates)
    EXTRA_LONG: 30 * 60_000, // 30min — historical (cohort retention)
};

// Common cache key namespaces — use these to keep keys consistent.
export const NS = {
    ANALYTICS: 'analytics:',
    REPORTS: 'reports:',
    DASHBOARD: 'dashboard:',
    FINANCE: 'finance:',
    USER: 'user:',
};

export default { cached, invalidate, clearCache, getCacheStats, TTL, NS };
