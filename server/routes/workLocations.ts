import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/work-locations — barcha ish joylari
router.get('/', requireAuth, async (_req, res) => {
    try {
        const locations = await prisma.workLocation.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
        });
        res.json(locations);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/work-locations/all — o'chirilganlar bilan birga (admin)
router.get('/all', requireAuth, requireMinRole('ADMIN'), async (_req, res) => {
    try {
        const locations = await prisma.workLocation.findMany({ orderBy: { createdAt: 'asc' } });
        res.json(locations);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/work-locations/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const loc = await prisma.workLocation.findUnique({ where: { id: req.params.id } });
        if (!loc) return res.status(404).json({ message: 'Ish joyi topilmadi' });
        res.json(loc);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/work-locations
router.post('/', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { name, address, latitude, longitude, radius, workStartTime, lateAfterMin, branchId } = req.body;

        if (!name?.trim()) return res.status(400).json({ message: 'Nom kiritilishi shart' });
        if (latitude == null || longitude == null) return res.status(400).json({ message: 'Koordinatalar kiritilishi shart' });

        const loc = await prisma.workLocation.create({
            data: {
                name: name.trim(),
                address: address || null,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                radius: radius ? parseInt(radius) : 200,
                workStartTime: workStartTime || '09:00',
                lateAfterMin: lateAfterMin ? parseInt(lateAfterMin) : 15,
                branchId: branchId || null,
                isActive: true,
            },
        });
        res.status(201).json(loc);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/work-locations/:id
router.put('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { name, address, latitude, longitude, radius, workStartTime, lateAfterMin, branchId, isActive } = req.body;
        const loc = await prisma.workLocation.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(address !== undefined && { address: address || null }),
                ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
                ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
                ...(radius !== undefined && { radius: parseInt(radius) }),
                ...(workStartTime !== undefined && { workStartTime }),
                ...(lateAfterMin !== undefined && { lateAfterMin: parseInt(lateAfterMin) }),
                ...(branchId !== undefined && { branchId: branchId || null }),
                ...(isActive !== undefined && { isActive }),
            },
        });
        res.json(loc);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/work-locations/:id
router.delete('/:id', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        await prisma.workLocation.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ message: "Ish joyi o'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/work-locations/check — koordinata hudud ichida yoki yo'qligini tekshirish
router.post('/check', requireAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (latitude == null || longitude == null) return res.status(400).json({ message: 'Koordinatalar kerak' });

        const locations = await prisma.workLocation.findMany({ where: { isActive: true } });

        const matched = locations.filter(loc => {
            const dist = haversineDistance(latitude, longitude, loc.latitude, loc.longitude);
            return dist <= loc.radius;
        }).map(loc => ({
            ...loc,
            distance: Math.round(haversineDistance(latitude, longitude, loc.latitude, loc.longitude)),
        }));

        res.json({ inZone: matched.length > 0, matched });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Haversine masofasi (metr)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { haversineDistance };
export default router;
