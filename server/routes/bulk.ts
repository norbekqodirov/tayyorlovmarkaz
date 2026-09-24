import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole, ROLE_LEVEL } from '../middleware/auth.js';
import { can } from '../middleware/authorize.js';
import { logAudit } from '../middleware/audit.js';
import { normalizeStudentStatus } from '../utils/studentStatus.js';

const router = express.Router();

type BulkAction = 'delete' | 'restore' | 'update' | 'status' | 'assign';

// IP-03 (RX-02) — ommaviy amallar qat'iy chegaralandi:
//  - har kolleksiya o'z modul ruxsatini talab qiladi (ilgari faqat MANAGER
//    darajasi yetarli edi — ruxsat kalitisiz menejer ham ishlatardi);
//  - o'quvchilar: faqat arxivlash/tiklash va holat (ilgari `update` ixtiyoriy
//    maydonni — jumladan balans va parentTelegramId'ni — yozardi);
//  - to'lovlar: ommaviy o'zgartirish butunlay olib tashlandi (holat balans va
//    kassa yozuvidan uzilib qolardi — faqat moliya oqimi orqali);
//  - lidlar: MANAGER faqat o'ziga biriktirilgan yoki biriktirilmagan lidlarni;
//  - bildirishnomalar: faqat o'ziniki (ilgari istalgan foydalanuvchinikini
//    o'chirish mumkin edi).
const COLLECTION_PERMISSION: Record<string, string | null> = {
    students: 'students',
    leads: 'leads',
    staff: null,          // faqat ADMIN+ (quyida)
    notifications: null,  // har kim, faqat o'ziniki
};

const STUDENT_STATUSES = new Set(['active', 'frozen', 'left', 'graduated']);

router.post('/:collection', requireAuth, requireMinRole('MANAGER'), async (req, res) => {
    try {
        const { collection } = req.params;
        const { action, ids, data } = req.body as { action: BulkAction; ids: string[]; data?: any };
        const user = (req as any).user;

        if (!action || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'action va ids kerak' });
        }
        if (ids.length > 500) {
            return res.status(400).json({ message: "Bir martada 500 tadan ortiq yozuv o'zgartirilmaydi" });
        }
        if (!(collection in COLLECTION_PERMISSION)) {
            return res.status(400).json({ message: `Ommaviy amal qo'llab-quvvatlanmaydi: ${collection}` });
        }
        const permissionKey = COLLECTION_PERMISSION[collection];
        if (permissionKey && !(await can(user.id, user.role, permissionKey))) {
            return res.status(403).json({ message: "Sizda bu amalni bajarish uchun ruxsat yo'q" });
        }

        let updated = 0;

        if (collection === 'students') {
            if (action === 'delete') {
                // Arxivlash (IP-01 bilan bir xil ma'no) — hech narsa o'chirilmaydi.
                updated = (await prisma.student.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } })).count;
            } else if (action === 'restore') {
                updated = (await prisma.student.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } })).count;
            } else if (action === 'status' && typeof data?.status === 'string' && STUDENT_STATUSES.has(normalizeStudentStatus(data.status) || '')) {
                updated = (await prisma.student.updateMany({ where: { id: { in: ids } }, data: { status: normalizeStudentStatus(data.status) } })).count;
            } else {
                return res.status(400).json({ message: "O'quvchilar uchun faqat arxivlash, tiklash va holatni o'zgartirish mumkin" });
            }
        } else if (collection === 'leads') {
            // MANAGER — faqat o'ziga biriktirilgan yoki biriktirilmagan lidlar
            // (leads.ts'dagi PUT qoidasi bilan bir xil).
            const scope: any = (ROLE_LEVEL[user.role] || 0) >= ROLE_LEVEL.ADMIN
                ? { id: { in: ids } }
                : { id: { in: ids }, OR: [{ assignedToId: null }, { assignedToId: user.id }] };
            if (action === 'status' && data?.stage) {
                // "won" shu yo'l bilan qo'yilmaydi — faqat POST /leads/:id/convert.
                if (data.stage === 'won') {
                    return res.status(400).json({ message: "\"O'qishni boshladi\" holatiga ommaviy o'tkazib bo'lmaydi — har bir lidni alohida \"O'quvchiga aylantirish\" orqali guruhga yozing" });
                }
                if (data.stage === 'lost' && !String(data.lostReason || '').trim()) {
                    return res.status(400).json({ message: "Rad etish sababini tanlang" });
                }
                updated = (await prisma.lead.updateMany({
                    where: scope,
                    data: { stage: data.stage, stageChangedAt: new Date(), ...(data.stage === 'lost' ? { lostReason: String(data.lostReason), lostAt: new Date() } : {}) },
                })).count;
            } else if (action === 'delete') {
                updated = (await prisma.lead.updateMany({ where: scope, data: { deletedAt: new Date() } })).count;
            } else if (action === 'restore') {
                updated = (await prisma.lead.updateMany({ where: scope, data: { deletedAt: null } })).count;
            } else if (action === 'assign' && data?.userId !== undefined) {
                updated = (await prisma.lead.updateMany({
                    where: scope,
                    data: { assignedToId: data.userId || null, assignedAt: data.userId ? new Date() : null },
                })).count;
            } else {
                return res.status(400).json({ message: 'Noma\'lum amal' });
            }
        } else if (collection === 'staff') {
            if ((ROLE_LEVEL[user.role] || 0) < ROLE_LEVEL.ADMIN) {
                return res.status(403).json({ message: "Xodimlar bilan ommaviy amal faqat administrator uchun" });
            }
            if (action === 'status' && typeof data?.status === 'string') {
                updated = (await prisma.staffMember.updateMany({ where: { id: { in: ids } }, data: { status: data.status } })).count;
            } else if (action === 'delete') {
                updated = (await prisma.staffMember.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date(), status: "Ishdan bo'shagan" } })).count;
            } else {
                return res.status(400).json({ message: 'Noma\'lum amal' });
            }
        } else if (collection === 'notifications') {
            const own = { id: { in: ids }, userId: user.id };
            if (action === 'delete') {
                updated = (await prisma.notification.deleteMany({ where: own })).count;
            } else if (action === 'status') {
                updated = (await prisma.notification.updateMany({ where: own, data: { isRead: true } })).count;
            } else {
                return res.status(400).json({ message: 'Noma\'lum amal' });
            }
        }

        if (collection !== 'notifications') {
            await logAudit({
                userId: user.id, userName: user.name || 'system',
                action: `bulk_${action}`, resource: collection, resourceId: null,
                metadata: { ids: ids.slice(0, 100), count: ids.length, updated, data },
            });
        }

        res.json({ message: `${updated} ta yozuv yangilandi`, updated, errors: [] });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
