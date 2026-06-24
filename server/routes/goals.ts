/**
 * server/routes/goals.ts
 * Faza 5.3 — KPI va Maqsadlar
 *
 * GET    /api/goals          — maqsadlar ro'yxati (filter: year, month, type)
 * POST   /api/goals          — yangi maqsad
 * PUT    /api/goals/:id      — yangilash
 * DELETE /api/goals/:id      — o'chirish
 * POST   /api/goals/auto-sync — CRM dan joriy ko'rsatkichlarni avtomatik yangilash
 */

import express from 'express';
import prisma from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { year, month, type } = req.query;
    try {
        const goals = await prisma.goal.findMany({
            where: {
                ...(year && { year: Number(year) }),
                ...(month && { month: Number(month) }),
                ...(type && { type: String(type) }),
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ data: goals });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
    const { title, description, type, target, unit, period, month, year, assignedTo } = req.body;
    if (!title || !type || !target || !year) return res.status(400).json({ error: 'title, type, target, year required' });
    try {
        const goal = await prisma.goal.create({
            data: {
                title, description, type,
                target: Number(target), unit: unit || 'ta',
                period: period || 'monthly',
                month: month ? Number(month) : null,
                year: Number(year),
                assignedTo: assignedTo || null,
            }
        });
        res.status(201).json({ data: goal });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
    const { title, description, target, current, unit, period, month, year, status, assignedTo } = req.body;
    try {
        const updated = await prisma.goal.update({
            where: { id: req.params.id },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(target !== undefined && { target: Number(target) }),
                ...(current !== undefined && { current: Number(current) }),
                ...(unit && { unit }),
                ...(period && { period }),
                ...(month !== undefined && { month: month ? Number(month) : null }),
                ...(year && { year: Number(year) }),
                ...(status && { status }),
                ...(assignedTo !== undefined && { assignedTo }),
            }
        });
        res.json({ data: updated });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.goal.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Auto-sync: CRM dan joriy ko'rsatkichlarni yuklash
router.post('/auto-sync', async (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];

    try {
        // 1. Daromad
        const revenue = await prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: 'income', date: { gte: monthStart, lte: monthEnd } }
        });

        // 2. Yangi o'quvchilar
        const newStudents = await prisma.student.count({
            where: { createdAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) } }
        });

        // 3. Jami faol o'quvchilar
        const activeStudents = await prisma.student.count({ where: { status: 'active' } });

        // 4. Yangi lidlar
        const newLeads = await prisma.lead.count({
            where: { createdAt: { gte: new Date(year, month - 1, 1) } }
        });

        // 5. Konversiya
        const totalLeads = await prisma.lead.count();
        const wonLeads = await prisma.lead.count({ where: { stage: 'won' } });
        const conversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

        const metrics = {
            revenue: revenue._sum.amount ?? 0,
            newStudents,
            activeStudents,
            newLeads,
            conversion,
        };

        // Active goals ni yangilash
        const goals = await prisma.goal.findMany({
            where: { year, month, status: 'active' }
        });

        const updates: { id: string; current: number }[] = [];
        for (const goal of goals) {
            let current = goal.current;
            if (goal.type === 'revenue') current = metrics.revenue;
            else if (goal.type === 'students') current = metrics.newStudents;
            else if (goal.type === 'leads') current = metrics.newLeads;
            else if (goal.type === 'conversion') current = metrics.conversion;
            else if (goal.type === 'attendance') continue; // Attendance alohida hisoblanadi

            if (current !== goal.current) {
                await prisma.goal.update({
                    where: { id: goal.id },
                    data: {
                        current,
                        status: current >= goal.target ? 'completed' : 'active'
                    }
                });
                updates.push({ id: goal.id, current });
            }
        }

        res.json({ ok: true, metrics, updated: updates.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
