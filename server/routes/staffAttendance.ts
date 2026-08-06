import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();
const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Toshkent vaqti bo'yicha "bugun" — check-in/check-out staffPortal.ts'da xuddi
// shu Toshkent sanasi bilan yoziladi, shuning uchun bu yerda ham mos kelishi shart
// (server UTC'da ishlasa, ikkalasi mos kelmay qolib, "bugungi" davomat bo'sh chiqardi).
const todayStr = todayDateStr;

// ─── GET /api/staff-attendance — HR dashboard: bugun yoki sana bo'yicha ───────

router.get('/', requireAuth, async (req, res) => {
    try {
        const date = (req.query.date as string) || todayStr();

        const [attendance, allStaff] = await Promise.all([
            prisma.staffAttendance.findMany({
                where: { date },
                include: {
                    staff: { select: { id: true, name: true, role: true, photo: true, department: true, branchId: true } },
                    location: { select: { id: true, name: true } },
                },
                orderBy: { checkIn: 'asc' },
            }),
            prisma.staffMember.findMany({
                where: { deletedAt: null, status: 'Faol' },
                select: { id: true, name: true, role: true, photo: true, department: true, branchId: true },
            }),
        ]);

        const attendanceMap = new Map(attendance.map(a => [a.staffId, a]));

        // Har bir faol xodim uchun status
        const rows = allStaff.map(s => {
            const rec = attendanceMap.get(s.id);
            return {
                staff: s,
                record: rec || null,
                status: rec?.status || 'absent',
            };
        });

        const summary = {
            total: rows.length,
            present: rows.filter(r => r.status === 'present').length,
            late:    rows.filter(r => r.status === 'late').length,
            absent:  rows.filter(r => r.status === 'absent').length,
            pending: rows.filter(r => r.status === 'pending').length,
        };

        res.json({ date, summary, rows });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/staff-attendance/report — oy bo'yicha hisobot

router.get('/report', requireAuth, async (req, res) => {
    try {
        const month = (req.query.month as string) || todayDateStr().slice(0, 7);
        const staffId = req.query.staffId as string | undefined;

        const records = await prisma.staffAttendance.findMany({
            where: {
                date: { startsWith: month },
                ...(staffId ? { staffId } : {}),
            },
            include: {
                staff: { select: { id: true, name: true, role: true, photo: true } },
                location: { select: { id: true, name: true } },
            },
            orderBy: [{ staffId: 'asc' }, { date: 'asc' }],
        });

        // Xodimlar bo'yicha guruhlash
        const byStaff: Record<string, any> = {};
        for (const r of records) {
            if (!byStaff[r.staffId]) {
                byStaff[r.staffId] = {
                    staff: r.staff,
                    records: [],
                    summary: { present: 0, late: 0, absent: 0, total: 0 },
                };
            }
            byStaff[r.staffId].records.push(r);
            byStaff[r.staffId].summary.total++;
            if (r.status === 'present') byStaff[r.staffId].summary.present++;
            else if (r.status === 'late') byStaff[r.staffId].summary.late++;
            else if (r.status === 'absent') byStaff[r.staffId].summary.absent++;
        }

        res.json({ month, data: Object.values(byStaff) });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/staff-attendance/staff/:staffId — xodim tarixi

router.get('/staff/:staffId', requireAuth, async (req, res) => {
    try {
        const { staffId } = req.params;
        const limit = parseInt(req.query.limit as string) || 30;
        const month = req.query.month as string | undefined;

        const records = await prisma.staffAttendance.findMany({
            where: {
                staffId,
                ...(month ? { date: { startsWith: month } } : {}),
            },
            include: { location: { select: { id: true, name: true } } },
            orderBy: { date: 'desc' },
            take: limit,
        });

        const stats = {
            present: records.filter(r => r.status === 'present').length,
            late:    records.filter(r => r.status === 'late').length,
            absent:  records.filter(r => r.status === 'absent').length,
            total:   records.length,
        };

        res.json({ staffId, stats, records });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/staff-attendance/:id — admin manual override

router.patch('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { status, checkIn, checkOut, notes } = req.body;
        const rec = await prisma.staffAttendance.update({
            where: { id: req.params.id },
            data: {
                ...(status !== undefined && { status }),
                ...(checkIn !== undefined && { checkIn }),
                ...(checkOut !== undefined && { checkOut }),
                ...(notes !== undefined && { notes }),
                verifiedBy: 'admin',
            },
            include: { staff: { select: { id: true, name: true } } },
        });
        res.json(rec);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/staff-attendance/manual — admin tomonidan qo'lda qo'shish

router.post('/manual', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { staffId, date, status, checkIn, checkOut, notes } = req.body;
        if (!staffId || !date) return res.status(400).json({ message: 'staffId va date kerak' });

        const rec = await prisma.staffAttendance.upsert({
            where: { staffId_date: { staffId, date } },
            update: {
                status: status || 'present',
                checkIn: checkIn || null,
                checkOut: checkOut || null,
                notes: notes || null,
                verifiedBy: 'admin',
            },
            create: {
                staffId,
                date,
                status: status || 'present',
                checkIn: checkIn || null,
                checkOut: checkOut || null,
                notes: notes || null,
                verifiedBy: 'admin',
            },
            include: { staff: { select: { id: true, name: true } } },
        });
        res.json(rec);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/staff-attendance/:id

router.delete('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        await prisma.staffAttendance.delete({ where: { id: req.params.id } });
        res.json({ message: 'Davomat yozuvi o\'chirildi' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// ─── Face Profile management (HR tomonidan ro'yxatdan o'tkazish) ──────────────

// GET /api/staff-attendance/face-profiles — barcha xodimlarning yuz profil holati

router.get('/face-profiles', requireAuth, requireMinRole('ADMIN'), async (_req, res) => {
    try {
        const staff = await prisma.staffMember.findMany({
            where: { deletedAt: null },
            select: {
                id: true, name: true, role: true, photo: true,
                faceProfile: { select: { id: true, photoUrl: true, registeredAt: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.json(staff);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/staff-attendance/face-profiles/:staffId — yuz profilini o'chirish

router.delete('/face-profiles/:staffId', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        await prisma.staffFaceProfile.deleteMany({ where: { staffId: req.params.staffId } });
        res.json({ message: 'Yuz profil o\'chirildi' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
