/**
 * IP-23 — kirim/chiqim kategoriyalari: tahrirlash va o'chirish qoidalari (ro'yxat va yaratish —
 * umumiy CRUD, /api/transactionCategories). Nom o'zgarsa kassa yozuvlari, xarajatlar va byudjetdagi
 * nom keshi yangilanadi; tizim kategoriyalari o'chirilmaydi va turi o'zgarmaydi; ishlatilgan
 * kategoriya o'chirilmaydi — arxivlanadi. Mantiq: server/services/categories.ts.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { CATEGORY_KINDS_BY_TYPE, CategoryError, updateCategory, deleteCategory, orphanCategoryNames } from '../services/categories.js';

const router = express.Router();
const canWrite = [requireAuth, requireMinRole('MANAGER'), requirePermission('transaction_categories')];

function fail(res: express.Response, err: any) {
    if (err instanceof CategoryError) return res.status(err.status).json({ message: err.message, error: err.message, code: err.code });
    return res.status(500).json({ message: err?.message || 'Server xatosi' });
}

// GET /api/transactionCategories/orphans — kategoriyasi ro'yxatda yo'q (erkin matnli) kassa yozuvlari
router.get('/orphans', requireAuth, requireMinRole('MANAGER'), requireAnyPermission(['transaction_categories', 'finance']), async (_req, res) => {
    try { res.json(await orphanCategoryNames(prisma)); } catch (e) { fail(res, e); }
});

// PUT /api/transactionCategories/:id — { name?, type?, kind?, isActive? }
router.put('/:id', ...canWrite, async (req: any, res) => {
    try {
        const body = req.body || {};
        if (body.kind !== undefined && body.kind !== '' && body.kind !== null) {
            const type = body.type || (await prisma.transactionCategory.findUnique({ where: { id: req.params.id }, select: { type: true } }))?.type;
            const allowed: string[] = type === 'income' || type === 'expense' ? CATEGORY_KINDS_BY_TYPE[type as 'income' | 'expense'] : [];
            if (!allowed.includes(body.kind)) return res.status(400).json({ message: "Kategoriya turi noto'g'ri" });
        }
        const before = await prisma.transactionCategory.findUnique({ where: { id: req.params.id } });
        const r = await updateCategory(prisma, req.params.id, { name: body.name, type: body.type, kind: body.kind, isActive: body.isActive });
        await logAudit({
            userId: req.user?.id, userName: req.user?.name || 'system', action: 'update', resource: 'transaction_category', resourceId: req.params.id,
            before: before ? { name: before.name, type: before.type, kind: before.kind, isActive: before.isActive } : undefined,
            after: { name: r.category.name, type: r.category.type, kind: r.category.kind, isActive: r.category.isActive, renamed: r.renamed },
        });
        res.json({ ...r.category, renamed: r.renamed });
    } catch (e) { fail(res, e); }
});

// DELETE /api/transactionCategories/:id — ishlatilgan bo'lsa arxivlanadi
router.delete('/:id', ...canWrite, async (req: any, res) => {
    try {
        const r = await deleteCategory(prisma, req.params.id);
        await logAudit({ userId: req.user?.id, userName: req.user?.name || 'system', action: 'archived' in r ? 'archive' : 'delete', resource: 'transaction_category', resourceId: req.params.id, after: r });
        res.json({ success: true, ...r });
    } catch (e) { fail(res, e); }
});

export default router;
