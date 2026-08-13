import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();

type BulkAction = 'delete' | 'restore' | 'update' | 'status' | 'assign';

// POST /api/bulk/:collection — ommaviy amal
router.post('/:collection', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { collection } = req.params;
        const { action, ids, data } = req.body as { action: BulkAction; ids: string[]; data?: any };

        if (!action || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'action va ids kerak' });
        }

        let updated = 0;
        let errors: string[] = [];

        if (collection === 'students') {
            if (action === 'delete') {
                const result = await prisma.student.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: new Date() },
                });
                updated = result.count;
            } else if (action === 'status' && data?.status) {
                const result = await prisma.student.updateMany({
                    where: { id: { in: ids } },
                    data: { status: data.status },
                });
                updated = result.count;
            } else if (action === 'update' && data) {
                const result = await prisma.student.updateMany({
                    where: { id: { in: ids } },
                    data,
                });
                updated = result.count;
            } else if (action === 'restore') {
                const result = await prisma.student.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: null },
                });
                updated = result.count;
            }
        } else if (collection === 'payments') {
            if (action === 'status' && data?.status) {
                const result = await prisma.payment.updateMany({
                    where: { id: { in: ids } },
                    data: { status: data.status },
                });
                updated = result.count;
            } else if (action === 'delete') {
                const result = await prisma.payment.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: new Date() },
                });
                updated = result.count;
            }
        } else if (collection === 'leads') {
            if (action === 'status' && data?.stage) {
                // "won" shu yo'l bilan qo'yilmaydi — bu server/routes/leads.ts'ning
                // POST /:id/convert orqali (talaba yaratish + guruhga yozish, bitta
                // tranzaksiya) o'tishi SHART, aks holda lid studentId'siz "won"da
                // qotib qoladi va Marketing > ROI hisob-kitoblarida umuman
                // ko'rinmaydi (frontend allaqachon bu variantni yashiradi, bu esa
                // to'g'ridan-to'g'ri API chaqiruviga qarshi qo'shimcha himoya).
                if (data.stage === 'won') {
                    return res.status(400).json({ message: "\"O'qishni boshladi\" holatiga ommaviy o'tkazib bo'lmaydi — har bir lidni alohida \"O'quvchiga aylantirish\" orqali guruhga yozing" });
                }
                const result = await prisma.lead.updateMany({
                    where: { id: { in: ids } },
                    data: { stage: data.stage, stageChangedAt: new Date() },
                });
                updated = result.count;
            } else if (action === 'delete') {
                const result = await prisma.lead.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: new Date() },
                });
                updated = result.count;
            } else if (action === 'restore') {
                const result = await prisma.lead.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: null },
                });
                updated = result.count;
            } else if (action === 'assign' && data?.userId !== undefined) {
                const result = await prisma.lead.updateMany({
                    where: { id: { in: ids } },
                    data: { assignedToId: data.userId || null, assignedAt: data.userId ? new Date() : null },
                });
                updated = result.count;
            }
        } else if (collection === 'staff') {
            if (action === 'status' && data?.status) {
                const result = await prisma.staffMember.updateMany({
                    where: { id: { in: ids } },
                    data: { status: data.status },
                });
                updated = result.count;
            } else if (action === 'delete') {
                const result = await prisma.staffMember.updateMany({
                    where: { id: { in: ids } },
                    data: { deletedAt: new Date() },
                });
                updated = result.count;
            }
        } else if (collection === 'notifications') {
            if (action === 'delete') {
                const result = await prisma.notification.deleteMany({
                    where: { id: { in: ids } },
                });
                updated = result.count;
            } else if (action === 'status') {
                const result = await prisma.notification.updateMany({
                    where: { id: { in: ids } },
                    data: { isRead: true },
                });
                updated = result.count;
            }
        } else {
            return res.status(400).json({ message: `Collection qo'llab-quvvatlanmaydi: ${collection}` });
        }

        res.json({
            message: `${updated} ta yozuv yangilandi`,
            updated,
            errors,
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
