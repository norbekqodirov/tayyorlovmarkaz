/**
 * server/routes/*.ts fayllarini statik ko'rib, har bir endpoint qanday
 * himoyalanganini aniqlaydi (IP-06, H.7 "marshrut siyosati reyestri").
 * Maqsad: yangi endpoint ruxsat tekshiruvisiz qo'shilib qolmasligi
 * (RX-01 kabi — 8 ta analytics endpointi faqat login bilan ochiq edi).
 */
import fs from 'node:fs';
import path from 'node:path';

export type Protection = 'permission' | 'auth-only' | 'public';

export interface RouteInfo {
    file: string;       // masalan "analytics.ts"
    method: string;     // GET/POST/...
    path: string;       // router ichidagi yo'l
    key: string;        // "analytics.ts GET /reports/debtors"
    protection: Protection;
    guards: string;     // topilgan middleware matni (tashxis uchun)
}

const AUTH_RE = /\brequireAuth\b|\bportalAuth\b|\bstaffPortalAuth\b|\bauthForCollection\b/;
// Ruxsat/rol/doira tekshiruvi deb hisoblanadiganlar. portalAuth/staffPortalAuth —
// alohida ishonch zonasi (Telegram identifikatori bo'yicha o'z ma'lumoti).
const PERMISSION_RE = /requirePermission\(|requireAnyPermission\(|requireMinRole\(\s*'(MANAGER|ADMIN|SUPER_ADMIN)'\s*\)|\bcanReview\b|\bcanManageMoney\b|\.\.\.biAccess|\.\.\.reportsAccess|\bportalAuth\b|\bstaffPortalAuth\b|\bauthForCollection\b/;

export function scanRoutes(routesDir = path.resolve('server/routes')): RouteInfo[] {
    const out: RouteInfo[] = [];
    for (const file of fs.readdirSync(routesDir).filter(f => f.endsWith('.ts')).sort()) {
        const src = fs.readFileSync(path.join(routesDir, file), 'utf8').replace(/\r\n/g, '\n');
        // router.use(...) — o'zidan keyin e'lon qilingan barcha route'larga ta'sir qiladi
        const useCalls: Array<{ index: number; text: string }> = [];
        for (const m of src.matchAll(/router\.use\(([\s\S]*?)\);/g)) {
            useCalls.push({ index: m.index ?? 0, text: m[1] });
        }
        const routeRe = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
        for (const m of src.matchAll(routeRe)) {
            const start = m.index ?? 0;
            // handler boshlanishigacha bo'lgan qism (middleware'lar ro'yxati)
            const rest = src.slice(start, start + 600);
            const cut = rest.search(/async\s*\(|\(\s*_?req\b|\(\s*req\s*:|=>\s*\{/);
            const chain = cut > 0 ? rest.slice(0, cut) : rest.slice(0, 200);
            const inherited = useCalls.filter(u => u.index < start).map(u => u.text).join(' ');
            const all = `${inherited} ${chain}`;
            const protection: Protection = PERMISSION_RE.test(all) ? 'permission' : AUTH_RE.test(all) ? 'auth-only' : 'public';
            const method = m[1].toUpperCase();
            out.push({ file, method, path: m[3], key: `${file} ${method} ${m[3]}`, protection, guards: all.replace(/\s+/g, ' ').trim().slice(0, 200) });
        }
    }
    return out;
}
