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
            roleRef: {
                select: {
                    permissions: { select: { permission: { select: { key: true } } } },
                },
            },
        },
    });

    const effective = new Set<string>(
        (user?.roleRef?.permissions ?? []).map(rp => rp.permission.key)
    );

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
