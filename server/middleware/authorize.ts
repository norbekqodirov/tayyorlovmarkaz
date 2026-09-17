/**
 * Granular permission tekshiruvi — Bosqich 2 (RBAC qayta qurish rejasi,
 * C:\Users\user\.claude\plans\cosmic-fluttering-quill.md).
 *
 * Bosqich 0/1'da aniqlangan bo'shliq: `User.permissions` (journal/marketing/
 * bi/finance/settings kabi nozik kalitlar) HECH QACHON backend'da
 * tekshirilmasdi — faqat frontend (ProtectedRoute.tsx/CrmLayout.tsx) ularni
 * o'qirdi. Bu fayl shu bo'shliqni yopadi.
 *
 * MUHIM: bu server/middleware/auth.ts'dagi requireAuth/requireMinRole/
 * requireRole'ni ALMASHTIRMAYDI — ular hali ham ROL darajasini (TEACHER<
 * MANAGER<ADMIN<SUPER_ADMIN) tekshiradi va saqlanadi. Bu fayl QO'SHIMCHA,
 * ixtiyoriy nozik qatlam — faqat aniq chaqirilgan joyda ishlaydi.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';

// ADMIN/SUPER_ADMIN — ProtectedRoute.tsx/CrmLayout.tsx bilan bir xil qoida:
// har doim TO'LIQ ruxsatga ega, hech qanday jadval tekshirilmaydi.
const FULL_ACCESS_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Foydalanuvchining haqiqiy (Role + PermissionOverride hisobga olingan)
 * ruxsat kalitlari to'plamini hisoblaydi.
 */
export async function getEffectivePermissions(userId: string, role: string): Promise<Set<string>> {
    if (FULL_ACCESS_ROLES.has(role)) {
        const all = await prisma.permission.findMany({ select: { key: true } });
        return new Set(all.map(p => p.key));
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            permissions: true,
            roleRef: {
                select: {
                    permissions: { select: { permission: { select: { key: true } } } },
                },
            },
        },
    });

    // 2026-09-15'da topilgan bo'shliq: `roleId` faqat CrmUsers.tsx'da admin
    // aniq "Maxsus Rol" tanlaganda o'rnatiladi (server/services/roleAssignment.ts
    // shu payt chaqiriladi) — andoza (TEACHER/MANAGER/MARKETING/...) tanlab
    // yaratilgan (bu ODATIY, birinchi ko'rinadigan oqim) foydalanuvchida
    // roleId HECH QACHON o'rnatilmaydi. migrate_rbac_schema.ts (2026-09-12)
    // faqat O'SHA PAYTDA MAVJUD bo'lgan userlarni bir martalik bog'lagan —
    // shundan keyin andoza orqali yaratilgan HAR BIR yangi foydalanuvchi
    // roleRef'siz qolgan. Agar shu yerda faqat roleRef'ga tayansak, bunday
    // foydalanuvchi (frontend ProtectedRoute.tsx/WidgetPicker.tsx ularning
    // saqlangan `permissions` massivini o'qib to'liq ishlayotganday
    // ko'rsatgani holda) requirePermission() talab qiladigan HAR QANDAY
    // yo'lda (courseTiers/inventory/settings/news/leads va — RBAC xaritasi
    // kengaytirilgach — students/groups/finance/courses'da ham) doim 403
    // olardi, real ruxsatidan qat'i nazar. Shu sabab roleRef yo'q bo'lsa
    // eski `User.permissions` JSON maydoniga tushamiz — bu frontend
    // allaqachon ishonadigan manba bilan bir xil.
    let effective: Set<string>;
    if (user?.roleRef) {
        effective = new Set(user.roleRef.permissions.map(rp => rp.permission.key));
    } else {
        let legacy: unknown = [];
        try { legacy = JSON.parse(user?.permissions || '[]'); } catch { /* buzuq JSON — bo'sh ro'yxat sifatida davom etamiz */ }
        effective = new Set(Array.isArray(legacy) ? legacy.filter((k): k is string => typeof k === 'string') : []);
    }

    const now = new Date();
    const overrides = await prisma.permissionOverride.findMany({
        where: {
            userId,
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
    });
    for (const o of overrides) {
        if (o.effect === 'ALLOW') effective.add(o.permissionKey);
        else effective.delete(o.permissionKey);
    }

    return effective;
}

export async function can(userId: string, role: string, permissionKey: string): Promise<boolean> {
    const perms = await getEffectivePermissions(userId, role);
    return perms.has(permissionKey);
}

/**
 * Express middleware — requireAuth'dan KEYIN ishlatiladi. requireMinRole()
 * bilan bir qatorda qo'llanadi (rol darajasi ALLAQACHON o'tgan bo'ladi) —
 * bu faqat QO'SHIMCHA, nozikroq tekshiruv.
 *
 * Masalan: router.get('/finance', requireAuth, requireMinRole('MANAGER'),
 * requirePermission('finance'), handler) — MANAGER darajasidagi
 * foydalanuvchi ENDI faqat "finance" ruxsati aniq berilgan bo'lsagina o'tadi.
 */
export function requirePermission(permissionKey: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const requester = (req as any).user;
        if (!requester) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
        try {
            const allowed = await can(requester.id, requester.role, permissionKey);
            if (!allowed) {
                return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
            }
            next();
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };
}

/**
 * Payroll-avans partiyasi (2026-09-17): ba'zi amallar (masalan oylik
 * HISOBLASH/ko'rish) "finance" YOKI "payroll_review" (HR) ruxsatlaridan
 * BIRI bilan yetarli, lekin pul harakatini yaratuvchi amallar (tasdiqlash,
 * to'lov, avans berish) hamon FAQAT "finance" bilan cheklangan — bu ikkalasi
 * requirePermission() bilan ifodalab bo'lmaydigan "OR" holati.
 */
export function requireAnyPermission(permissionKeys: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const requester = (req as any).user;
        if (!requester) return res.status(401).json({ message: "Avtorizatsiya talab qilinadi" });
        try {
            const perms = await getEffectivePermissions(requester.id, requester.role);
            const allowed = permissionKeys.some(key => perms.has(key));
            if (!allowed) {
                return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
            }
            next();
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };
}
