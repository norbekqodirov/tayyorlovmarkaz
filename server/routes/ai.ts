/**
 * server/routes/ai.ts
 * Faza 4 — AI Marketing & Kontent generatsiyasi
 *
 * POST /api/ai/smm-caption    — Ijtimoiy tarmoq uchun kontent
 * POST /api/ai/blog-post      — Blog maqola yaratish
 * POST /api/ai/quiz-questions — Test savollari generatsiya
 * POST /api/ai/sms-template   — SMS/Telegram xabar shablon
 * GET  /api/ai/suggestions    — CRM uchun umumiy tavsiyalar
 */

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

function getAI() {
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY sozlanmagan');
    return new GoogleGenAI({ apiKey: GEMINI_KEY });
}

async function generate(prompt: string): Promise<string> {
    const ai = getAI();
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    });
    return response.text ?? '';
}

// ─── SMM Kontent generatsiyasi ────────────────────────────────────────────────

router.post('/smm-caption', async (req, res) => {
    const { platform, topic, tone, language, courseInfo, emoji } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic required' });

    const platformGuide = {
        instagram: 'Instagram postiga mos, hashtag bilan, 150-300 so\'z',
        telegram: 'Telegram kanaliga mos, HTML teglari (<b>, <i>) bilan, 100-200 so\'z',
        facebook: 'Facebook postiga mos, 200-300 so\'z',
        tiktok: 'TikTok videosi uchun qisqa matn + hashtag, 50-100 so\'z',
    }[platform as string] || '200 so\'zli post';

    const toneGuide = {
        professional: 'professional va rasmiy uslubda',
        friendly: 'do\'stona va samimiy uslubda',
        motivational: 'rag\'batlantiruvchi va ilhomlantirilgan uslubda',
        humorous: 'engil hazil va qiziqarli uslubda',
    }[tone as string] || 'professional uslubda';

    const lang = language === 'ru' ? 'rus tilida' : language === 'en' ? 'ingliz tilida' : 'o\'zbek tilida';

    const prompt = `Sen o'quv markazi uchun SMM kontent mutaxassisisan.

Quyidagi ma'lumotlar asosida ${platformGuide} yoz:
- Mavzu: ${topic}
- Uslub: ${toneGuide}
- Til: ${lang}
${courseInfo ? `- Kurs haqida: ${courseInfo}` : ''}
${emoji ? '- Emoji ishlat' : '- Emoji ishlatma'}

Faqat post matnini yoz, tushuntirma qo'shma.`;

    try {
        const text = await generate(prompt);
        res.json({ text });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Blog post generatsiyasi ──────────────────────────────────────────────────

router.post('/blog-post', async (req, res) => {
    const { title, category, keywords, length } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const wordCount = { short: '300-500', medium: '600-800', long: '1000-1200' }[length as string] || '500-700';

    const prompt = `Sen o'quv markazi veb-sayti uchun blog maqolalari yozuvchi mutaxassisisan.

Quyidagi mavzuda ${wordCount} so'zlik maqola yoz:
Sarlavha: ${title}
Kategoriya: ${category || 'Ta\'lim'}
${keywords ? `Kalit so'zlar: ${keywords}` : ''}

Talablar:
- O'zbek tilida yoz
- HTML formatida yoz (<h2>, <h3>, <p>, <ul>, <li> teglar bilan)
- Foydali, mazmunli va qiziqarli bo'lsin
- SEO uchun kalit so'zlarni organik tarzda ishlat
- Faqat maqola matnini yoz, boshqa tushuntirma qo'shma`;

    try {
        const text = await generate(prompt);
        res.json({ text });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Test savollari generatsiyasi ─────────────────────────────────────────────

router.post('/quiz-questions', async (req, res) => {
    const { subject, topic, count, difficulty } = req.body;
    if (!subject || !topic) return res.status(400).json({ error: 'subject and topic required' });

    const diffText = { easy: 'oson', medium: "o'rta", hard: 'qiyin' }[difficulty as string] || "o'rta";

    const prompt = `Sen ta'lim mutaxassisisan. ${subject} fanidan ${topic} mavzusida ${count || 5} ta ${diffText} darajadagi test savoli yarat.

Har bir savol uchun JSON format ishlat:
{
  "questions": [
    {
      "text": "savol matni",
      "type": "single",
      "points": 1,
      "options": [
        {"text": "variant A", "isCorrect": true},
        {"text": "variant B", "isCorrect": false},
        {"text": "variant C", "isCorrect": false},
        {"text": "variant D", "isCorrect": false}
      ]
    }
  ]
}

Faqat JSON yoz, boshqa matn qo'shma.`;

    try {
        const text = await generate(prompt);
        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            res.json({ questions: parsed.questions || [] });
        } else {
            res.json({ questions: [], raw: text });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── SMS/Telegram xabar shablon ───────────────────────────────────────────────

router.post('/sms-template', async (req, res) => {
    const { type, context } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });

    const typeGuide = {
        payment_reminder: "to'lov eslatmasi",
        welcome: "yangi o'quvchini qutlash",
        lesson_reminder: "dars eslatmasi",
        birthday: "tug'ilgan kun tabrigi",
        result: "test natijasi xabari",
        promo: "aksiya va chegirma e'loni",
    }[type as string] || type;

    const prompt = `O'quv markazi uchun ${typeGuide} SMS/Telegram xabar shabloni yoz.
${context ? `Qo'shimcha ma'lumot: ${context}` : ''}

Talablar:
- O'zbek tilida
- Qisqa va aniq (50-100 so'z)
- O'zgaruvchilar: {{student_name}}, {{group_name}}, {{amount}}, {{due_date}}, {{lesson_time}}, {{teacher_name}}
- Professional va samimiy ton
- Faqat xabar matnini yoz`;

    try {
        const text = await generate(prompt);
        res.json({ text });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── CRM tavsiyalar ───────────────────────────────────────────────────────────

router.get('/suggestions', async (_req, res) => {
    try {
        const [studentCount, debtorCount, leadCount, conversionData] = await Promise.all([
            prisma.student.count({ where: { status: 'active' } }),
            prisma.student.count({ where: { balance: { lt: 0 }, status: 'active' } }),
            prisma.lead.count({ where: { stage: { in: ['new', 'contacted'] } } }),
            prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
        ]);

        const total = conversionData.reduce((s, d) => s + d._count._all, 0);
        const won = conversionData.find(d => d.stage === 'won')?._count._all ?? 0;
        const convRate = total > 0 ? Math.round((won / total) * 100) : 0;

        const prompt = `Sen o'quv markazi uchun CRM tahlil mutaxassisisan.

Quyidagi ma'lumotlar asosida 3-5 ta konkret amaliy tavsiya ber:
- Faol o'quvchilar: ${studentCount}
- Qarzdorlar: ${debtorCount} (${studentCount > 0 ? Math.round((debtorCount / studentCount) * 100) : 0}%)
- Yangi/aloqa kutilayotgan lidlar: ${leadCount}
- Konversiya: ${convRate}%

Har bir tavsiya uchun: muammo, yechim va kutilayotgan natijani qisqacha yoz.
O'zbek tilida. Faqat tavsiyalar ro'yxatini yoz, boshqa tushuntirma qo'shma.`;

        const text = await generate(prompt);
        res.json({ suggestions: text, stats: { studentCount, debtorCount, leadCount, convRate } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
