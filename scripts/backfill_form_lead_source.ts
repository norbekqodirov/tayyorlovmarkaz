/**
 * Bir martalik tuzatish: server/services/leadIntake.ts'dagi `resolvedSource`
 * ustuvorlik zanjiri avval kampaniya/UTM topilmasa har doim umumiy 'Vebsayt'ga
 * tushardi — target forma orqali kelgan lid bo'lsa ham (kampaniyasiz forma).
 * Natijada Marketing > Lidlar'da "manba" ustuni foydasiz "Vebsayt" deb
 * ko'rsatardi, garchi aynan qaysi target formadan kelgani (Lead.formId orqali)
 * ma'lum bo'lsa ham. Endi kod shu holatda forma sarlavhasini ishlatadi —
 * bu skript esa shu tuzatishdan OLDIN yaratilgan mavjud yozuvlarni orqaga
 * qaytarib to'g'irlaydi.
 *
 * Faqat aniq shu holatga mos keladigan yozuvlarga tegadi: formId bor,
 * campaignId yo'q (bo'lsa campaign.platform ustuvor bo'lardi — tegilmaydi),
 * source aynan 'Vebsayt', VA utmSource haqiqiy Google/AdWords alias EMAS
 * (bo'lsa 'Vebsayt' haqiqatan ham to'g'ri aniqlangan bo'lardi).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GOOGLE_UTM_ALIASES = ['google', 'adwords', 'google-ads'];

async function run() {
    const candidates = await prisma.lead.findMany({
        where: { formId: { not: null }, campaignId: null, source: 'Vebsayt' },
        select: { id: true, name: true, formId: true, utmSource: true },
    });
    console.log(`Tekshirilmoqda: ${candidates.length} ta nomzod`);

    let fixed = 0;
    for (const lead of candidates) {
        if (lead.utmSource && GOOGLE_UTM_ALIASES.includes(lead.utmSource.trim().toLowerCase())) continue;

        const form = await prisma.targetForm.findUnique({ where: { id: lead.formId! }, select: { title: true } });
        if (!form?.title) continue;

        await prisma.lead.update({ where: { id: lead.id }, data: { source: form.title } });
        fixed++;
        console.log(`Tuzatildi: ${lead.name} (${lead.id}) — Vebsayt → ${form.title}`);
    }

    console.log(`\nJami tuzatildi: ${fixed} / ${candidates.length} ta`);
}

run().finally(() => prisma.$disconnect());
