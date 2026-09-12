/**
 * Rollar va Ruxsatlar boshqaruvi — RBAC qayta qurish rejasi, Bosqich 3
 * (C:\Users\user\.claude\plans\cosmic-fluttering-quill.md).
 *
 * Role/Permission/RolePermission — Bosqich 1'da qo'shilgan haqiqiy relatsion
 * jadvallar (src/constants/permissions.ts'dagi statik ro'yxatdan seed
 * qilingan). Bu fayl ularni to'g'ridan-to'g'ri boshqaradi — frontend'dagi
 * Role Builder UI shu endpoint'lar bilan ishlaydi, soxta/alohida ro'yxat
 * emas.
 *
 * Faqat ADMIN+ — rol/ruxsat boshqaruvi tizim darajasidagi tanqidiy amal,
 * granular Permission tekshiruvi shart emas (ADMIN/SUPER_ADMIN har doim
 * to'liq huquqli, boshqa hech bir rol bu sahifani ko'rmaydi).
 */
import express from 'express';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { withAudit } from '../middleware/audit.js';
import prisma from '../db.js';

const router = express.Router();
router.use(requireAuth, requireMinRole('ADMIN'));

const VALID_BASE_LEVELS = new Set(['TEACHER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']);

// ─── GET /api/roles/permissions — DB'dagi haqiqiy ruxsatlar ro'yxati ────────
// E'tibor: bu /:id'dan OLDIN turishi shart, aks holda Express "permissions"ni
// :id sifatida talqin qiladi.
router.get('/permissions', async (_req, res) => {
    try {
        const permissions = await prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { label: 'asc' }] });
        res.json(permissions);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/roles — ro'yxat (ruxsat/foydalanuvchi soni bilan) ─────────────
router.get('/', async (_req, res) => {
    try {
        const roles = await prisma.role.findMany({
            include: {
                _count: { select: { permissions: true, users: true } },
            },
            orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
        });
        res.json(roles.map(r => ({
            id: r.id, name: r.name, label: r.label, description: r.description,
            baseRoleLevel: r.baseRoleLevel, isSystem: r.isSystem, isActive: r.isActive,
            permissionCount: r._count.permissions, userCount: r._count.users,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
        })));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── GET /api/roles/:id — tafsilot (ruxsat kalitlari bilan) ─────────────────
router.get('/:id', async (req, res) => {
    try {
        const role = await prisma.role.findUnique({
            where: { id: req.params.id },
            include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
        });
        if (!role) return res.status(404).json({ message: 'Rol topilmadi' });
        res.json({
            id: role.id, name: role.name, label: role.label, description: role.description,
            baseRoleLevel: role.baseRoleLevel, isSystem: role.isSystem, isActive: role.isActive,
            userCount: role._count.users,
            permissionKeys: role.permissions.map(rp => rp.permission.key),
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

async function setRolePermissions(roleId: string, permissionKeys: string[]) {
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId } }),
        prisma.rolePermission.createMany({
            data: permissions.map(p => ({ roleId, permissionId: p.id })),
        }),
    ]);
}

// ─── POST /api/roles — yangi (odatda maxsus/custom) rol yaratish ───────────
router.post('/', withAudit('role'), async (req, res) => {
    try {
        const { label, description, baseRoleLevel, permissions } = req.body;
        if (!label || typeof label !== 'string' || !label.trim()) {
            return res.status(400).json({ message: 'Rol nomi kiritilishi shart' });
        }
        if (!VALID_BASE_LEVELS.has(baseRoleLevel)) {
            return res.status(400).json({ message: "Asosiy daraja noto'g'ri (TEACHER/MANAGER/ADMIN/SUPER_ADMIN)" });
        }
        // Faqat SUPER_ADMIN o'zi SUPER_ADMIN darajasidagi rol yarata oladi —
        // aks holda ADMIN o'zidan yuqori daraja beruvchi rol yasab olardi.
        const requester = (req as any).user;
        if (baseRoleLevel === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: "Faqat Super Admin bu darajadagi rol yarata oladi" });
        }

        // Ichki `name` — unikal, avtomatik generatsiya qilinadi (foydalanuvchi
        // faqat ko'rinadigan `label`ni kiritadi).
        const slug = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ROLE';
        let name = `CUSTOM_${slug}`;
        let suffix = 1;
        while (await prisma.role.findUnique({ where: { name } })) {
            suffix += 1;
            name = `CUSTOM_${slug}_${suffix}`;
        }

        const role = await prisma.role.create({
            data: { name, label: label.trim(), description: description || null, baseRoleLevel, isSystem: false },
        });
        if (Array.isArray(permissions) && permissions.length > 0) {
            await setRolePermissions(role.id, permissions);
        }
        res.status(201).json({ id: role.id });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── PUT /api/roles/:id — tahrirlash ────────────────────────────────────────
// Tizim rollari (isSystem) uchun ham label/description/permissions
// tahrirlanishi mumkin (bu — Role Builder'ning aynan o'zi), lekin ularning
// ichki `name`si va `baseRoleLevel`i O'ZGARTIRILMAYDI — bular ROLE_LEVEL
// tekshiruvlari va migratsiya bog'lanishi uchun barqaror kalit hisoblanadi.
router.put('/:id', withAudit('role'), async (req, res) => {
    try {
        const role = await prisma.role.findUnique({ where: { id: req.params.id } });
        if (!role) return res.status(404).json({ message: 'Rol topilmadi' });

        const { label, description, isActive, baseRoleLevel, permissions } = req.body;
        const requester = (req as any).user;
        const data: any = {};
        if (label !== undefined) {
            if (!label.trim()) return res.status(400).json({ message: 'Rol nomi bo\'sh bo\'lishi mumkin emas' });
            data.label = label.trim();
        }
        if (description !== undefined) data.description = description || null;
        if (isActive !== undefined) {
            if (role.isSystem) return res.status(400).json({ message: "Tizim roli faollikni o'chirib bo'lmaydi" });
            data.isActive = !!isActive;
        }
        if (!role.isSystem && baseRoleLevel !== undefined) {
            if (!VALID_BASE_LEVELS.has(baseRoleLevel)) {
                return res.status(400).json({ message: "Asosiy daraja noto'g'ri" });
            }
            if (baseRoleLevel === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ message: "Faqat Super Admin bu darajani bera oladi" });
            }
            data.baseRoleLevel = baseRoleLevel;
        }

        if (Object.keys(data).length > 0) {
            await prisma.role.update({ where: { id: role.id }, data });
        }
        if (Array.isArray(permissions)) {
            await setRolePermissions(role.id, permissions);
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── POST /api/roles/:id/duplicate — nusxa (har doim custom, o'chirilishi/
// deaktivatsiya qilinishi mumkin bo'lgan) ───────────────────────────────────
router.post('/:id/duplicate', withAudit('role'), async (req, res) => {
    try {
        const source = await prisma.role.findUnique({
            where: { id: req.params.id },
            include: { permissions: { include: { permission: true } } },
        });
        if (!source) return res.status(404).json({ message: 'Rol topilmadi' });

        const baseLabel = `${source.label} (nusxa)`;
        let name = `CUSTOM_${source.name}_COPY`;
        let suffix = 1;
        while (await prisma.role.findUnique({ where: { name } })) {
            suffix += 1;
            name = `CUSTOM_${source.name}_COPY_${suffix}`;
        }

        const copy = await prisma.role.create({
            data: {
                name, label: baseLabel, description: source.description,
                baseRoleLevel: source.baseRoleLevel, isSystem: false, isActive: true,
            },
        });
        await prisma.rolePermission.createMany({
            data: source.permissions.map(rp => ({ roleId: copy.id, permissionId: rp.permissionId })),
        });
        res.status(201).json({ id: copy.id });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── DELETE /api/roles/:id — faqat foydalanuvchisiz, custom rollar ────────
router.delete('/:id', withAudit('role'), async (req, res) => {
    try {
        const role = await prisma.role.findUnique({
            where: { id: req.params.id },
            include: { _count: { select: { users: true } } },
        });
        if (!role) return res.status(404).json({ message: 'Rol topilmadi' });
        if (role.isSystem) return res.status(400).json({ message: "Tizim rolini o'chirib bo'lmaydi" });
        if (role._count.users > 0) {
            return res.status(409).json({ message: `Bu rolga ${role._count.users} ta foydalanuvchi biriktirilgan — avval ularni boshqa rolga o'tkazing` });
        }
        await prisma.role.delete({ where: { id: role.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
