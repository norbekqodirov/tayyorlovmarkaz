// Autentifikatsiyasiz (login talab qilmaydigan) ommaviy endpointlar — asosan
// marketing saytidagi lid formalar uchun (Contact.tsx, LeadForm.tsx).
//
// MUHIM: server/routes/crud.ts dagi generic /api/:collection barcha metodlar
// (GET/POST/PUT/DELETE) uchun requireAuth talab qiladi. Bu haqiqiy (login
// qilmagan) tashrif buyuruvchi uchun /api/leads ga to'g'ridan-to'g'ri POST
// qilishni imkonsiz qilardi — demak umumiy sayt orqali tushgan lidlar
// (asosiy marketing maqsadi!) production'da HECH QACHON saqlanmagan bo'lishi
// mumkin edi. Shu fayl shu muammoni maxsus, tor doiradagi ommaviy endpointlar
// bilan hal qiladi (faqat lid yaratish + forma ko'rish, boshqa hech narsa).
import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { todayDateStr } from '../utils/timezone.js';

const router = express.Router();

// GET /api/public/lead-form-config — lid formasida qo'shimcha maydon (yosh/sinf/yo'q)
// ko'rsatilishi kerakmi, sozlamalardan o'qiydi. Login talab qilinmaydi (ommaviy sahifa
// buni ko'rsatishdan oldin chaqiradi).
router.get('/lead-form-config', async (_req, res) => {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: 'lead_extra_field_type' } });
        const type = (setting?.value as 'none' | 'age' | 'grade') || 'none';
        const label = type === 'age' ? 'Yosh' : type === 'grade' ? 'Sinf' : null;
        res.json({ type, label });
    } catch {
        res.json({ type: 'none', label: null });
    }
});

// PUT /api/public/lead-form-config — faqat ADMIN o'zgartira oladi (Sozlamalar sahifasi)
router.put('/lead-form-config', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const { type } = req.body as { type: 'none' | 'age' | 'grade' };
        if (!['none', 'age', 'grade'].includes(type)) {
            return res.status(400).json({ message: "type 'none' | 'age' | 'grade' bo'lishi shart" });
        }
        await prisma.setting.upsert({
            where: { key: 'lead_extra_field_type' },
            update: { value: type },
            create: { key: 'lead_extra_field_type', value: type },
        });
        res.json({ ok: true, type });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/public/forms/:id — bitta target forma haqida ommaviy ma'lumot (faol bo'lsa)
router.get('/forms/:id', async (req, res) => {
    try {
        const form = await prisma.targetForm.findFirst({ where: { id: req.params.id, isActive: true } });
        if (!form) return res.status(404).json({ message: 'Forma topilmadi yoki faol emas' });
        res.json({ id: form.id, title: form.title, description: form.description, course: form.course });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/public/lead — ommaviy sayt/target forma orqali lid yaratish
router.post('/lead', async (req, res) => {
    try {
        const { name, phone, course, source, extraField, notes, formId } = req.body as Record<string, string>;
        if (!name?.trim() || !phone?.trim()) {
            return res.status(400).json({ message: 'Ism va telefon kiritilishi shart' });
        }

        const lead = await prisma.lead.create({
            data: {
                name: String(name).trim().slice(0, 200),
                phone: String(phone).trim().slice(0, 30),
                course: course ? String(course).trim().slice(0, 200) : null,
                source: source ? String(source).trim().slice(0, 100) : 'Vebsayt',
                stage: 'new',
                status: 'warm',
                date: todayDateStr(),
                extraField: extraField ? String(extraField).trim().slice(0, 200) : null,
                notes: notes ? String(notes).trim().slice(0, 2000) : null,
            },
        });

        if (formId) {
            await prisma.targetForm.update({
                where: { id: formId },
                data: { submissions: { increment: 1 } },
            }).catch(() => null);
        }

        res.json({ id: lead.id });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
