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
import { publicLeadRateLimit, publicViewRateLimit, hashIp } from '../middleware/rateLimit.js';
import { createLeadFromIntake, LeadIntakeValidationError } from '../services/leadIntake.js';

const router = express.Router();

function extraFieldLabel(type: string): string | null {
    return type === 'age' ? 'Yosh' : type === 'grade' ? 'Sinf' : null;
}

async function globalExtraFieldType(): Promise<'none' | 'age' | 'grade'> {
    const setting = await prisma.setting.findUnique({ where: { key: 'lead_extra_field_type' } });
    return (setting?.value as 'none' | 'age' | 'grade') || 'none';
}

// GET /api/public/lead-form-config — lid formasida qo'shimcha maydon (yosh/sinf/yo'q)
// ko'rsatilishi kerakmi, sozlamalardan o'qiydi (global standart — formId'siz sahifalar,
// masalan Contact.tsx, shuni ishlatadi). Login talab qilinmaydi (ommaviy sahifa buni
// ko'rsatishdan oldin chaqiradi).
router.get('/lead-form-config', async (_req, res) => {
    try {
        const type = await globalExtraFieldType();
        res.json({ type, label: extraFieldLabel(type) });
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

// GET /api/public/forms/:id — bitta target forma haqida ommaviy ma'lumot (faol bo'lsa).
// extraField — shu FORMAGA xos sozlama (CrmForms.tsx'da tanlanadi); agar forma
// alohida belgilamagan bo'lsa (extraFieldType == null), global Sozlamalar
// qiymatiga qaytadi — eski (formId'dan oldin yaratilgan) formalar buzilmaydi.
router.get('/forms/:id', async (req, res) => {
    try {
        const form = await prisma.targetForm.findFirst({ where: { id: req.params.id, isActive: true } });
        if (!form) return res.status(404).json({ message: 'Forma topilmadi yoki faol emas' });
        const type = (form.extraFieldType as 'none' | 'age' | 'grade' | null) || await globalExtraFieldType();
        res.json({
            id: form.id, title: form.title, description: form.description, course: form.course,
            extraField: { type, label: extraFieldLabel(type) },
            showCourseField: form.showCourseField,
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/public/courses — faol kurslar ro'yxati (lid formasi dropdown'i uchun,
// avval LeadForm.tsx'da 4 ta qattiq yozilgan variant bor edi)
router.get('/courses', async (_req, res) => {
    try {
        const courses = await prisma.course.findMany({
            where: { status: 'Active' },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        res.json(courses);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/public/forms/:id/view — forma sahifasi ochilganini hisoblaydi
// (konversiya % = arizalar/ko'rishlar shu hisobga tayanadi).
router.post('/forms/:id/view', publicViewRateLimit, async (req, res) => {
    await prisma.targetForm.update({
        where: { id: req.params.id },
        data: { views: { increment: 1 } },
    }).catch(() => null);
    res.json({ ok: true });
});

// POST /api/public/lead — ommaviy sayt/target forma orqali lid yaratish.
// Haqiqiy qabul mantiqi (dublikat, UTM->kampaniya, avtomatik biriktirish,
// ball, bildirishnoma) server/services/leadIntake.ts'da — bu CRM'dan qo'lda
// yaratishda ham ishlatiladigan yagona umumiy yo'l.
router.post('/lead', publicLeadRateLimit, async (req, res) => {
    try {
        const body = req.body as Record<string, string>;
        const result = await createLeadFromIntake({
            name: body.name,
            phone: body.phone,
            email: body.email,
            course: body.course,
            courseId: body.courseId,
            notes: body.notes,
            extraField: body.extraField,
            source: body.source,
            formId: body.formId,
            campaignId: body.campaignId,
            utmSource: body.utm_source || body.utmSource,
            utmMedium: body.utm_medium || body.utmMedium,
            utmCampaign: body.utm_campaign || body.utmCampaign,
            utmContent: body.utm_content || body.utmContent,
            utmTerm: body.utm_term || body.utmTerm,
            clickId: body.gclid || body.fbclid || body.clickId,
            landingPage: body.landingPage,
            referrer: body.referrer || req.get('referer') || undefined,
            ipHash: hashIp(req.ip || ''),
            honeypot: body.website, // yashirin honeypot maydoni — to'ldirilgan bo'lsa bot
        });

        if (!result.ok) {
            // Honeypot ishga tushdi — botga "muvaffaqiyatli" deb yolg'on javob
            // qaytariladi, hech narsa yozilmaydi.
            return res.json({ id: 'ok' });
        }

        if (body.formId) {
            await prisma.targetForm.update({
                where: { id: body.formId },
                data: { submissions: { increment: 1 } },
            }).catch(() => null);
        }

        res.json({ id: result.id });
    } catch (err: any) {
        if (err instanceof LeadIntakeValidationError) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: err.message });
    }
});

export default router;
