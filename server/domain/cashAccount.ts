/**
 * IP-22 — kassa hisoblarining sof qoidalari (bazasiz): to'lov usuli matnini kalitga keltirish
 * va hisob tanlanmagan eski yozuv qaysi hisobga tushishini aniqlash.
 */
export type CashAccountLike = { id: string; method: string; isActive: boolean };

/** "Naqd"/"cash" → naqd, "Terminal"/"Uzcard"/"Humo" → karta, "Perechisleniye" → bank; boshqasi — o'zi. */
export function methodKey(m?: string | null): string {
    const s = String(m ?? '').trim().toLowerCase();
    if (!s || /naqd|cash|налич/.test(s)) return 'naqd';
    if (/payme/.test(s)) return 'payme';
    if (/click/.test(s)) return 'click';
    if (/karta|card|terminal|uzcard|humo|plastik|карт/.test(s)) return 'karta';
    if (/bank|o.?tkazma|perechis|перечис|transfer/.test(s)) return 'bank';
    return s;
}

/** Eski yozuv (accountId yo'q): usul kaliti mos birinchi faol hisob (ro'yxat tartibida), bo'lmasa nofaoli. */
export function accountForMethod<T extends CashAccountLike>(accounts: T[], method?: string | null): T | null {
    const key = methodKey(method);
    return accounts.find(a => a.isActive && methodKey(a.method) === key) ?? accounts.find(a => methodKey(a.method) === key) ?? null;
}
