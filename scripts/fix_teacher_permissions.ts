/**
 * Bir martalik tuzatish: CrmTeachers.tsx (va eski migrate_teachers.ts)
 * `User.permissions` maydoniga ruxsatlar ro'yxati o'rniga o'qituvchi
 * metama'lumotini ({meta:{subject,exp,desc}} yoki {subject,experience})
 * yozib qo'ygan edi. ProtectedRoute.tsx buni "custom ruxsatlar ro'yxati"
 * deb tushunib, har qanday sahifaga kirishni rad etadi (faqat Dashboard
 * ishlaydi) — chunki massiv ichida satr emas, obyekt bor.
 *
 * Bu skript: role=TEACHER bo'lgan har bir userni tekshiradi, agar
 * permissions to'g'ri (satrlar massivi) bo'lmasa — undagi eski
 * subject/exp/desc ma'lumotini yangi User.subject/experience/bio
 * ustunlariga ko'chiradi va permissions'ni standart TEACHER shabloniga
 * qaytaradi.
 *
 * V2 (2026-09-07): birinchi versiya permissions'ni '[]' (bo'sh massiv)ga
 * qaytarardi — bu ProtectedRoute'dagi sahifaga kirish bloklanishini
 * to'g'irlaydi (bo'sh massiv => allowedRoles asosidagi tekshiruvga
 * qaytadi), LEKIN CrmLayout.tsx'ning canSeeLink() bo'sh massivda BARCHA
 * ruxsat-cheklangan menyu bandini yashiradi — natijada o'qituvchi
 * sahifalarga to'g'ridan-to'g'ri havola bilan kira olardi, lekin yon
 * menyusi butunlay bo'sh ko'rinardi. Endi DEFAULT_TEACHER_PERMISSIONS
 * (CrmUsers.tsx'dagi TEACHER shabloni bilan bir xil) ga qaytariladi —
 * ham menyu, ham sahifalar to'g'ri ishlaydi.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEACHER_PERMISSIONS } from '../src/constants/permissions.js';

const prisma = new PrismaClient();

function isValidPermissionArray(v: any): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === 'string');
}

async function run() {
    const teachers = await prisma.user.findMany({ where: { role: 'TEACHER' } });
    console.log(`Tekshirilmoqda: ${teachers.length} ta o'qituvchi`);

    let fixed = 0;
    for (const t of teachers) {
        let parsed: any;
        try { parsed = JSON.parse(t.permissions || '[]'); } catch { parsed = null; }

        if (isValidPermissionArray(parsed)) continue;

        let subject = (t as any).subject as string | null;
        let experience = (t as any).experience as string | null;
        let bio = (t as any).bio as string | null;

        if (Array.isArray(parsed)) {
            const metaEntry = parsed.find((p: any) => p && typeof p === 'object' && p.meta);
            if (metaEntry) {
                subject = subject || metaEntry.meta.subject || null;
                experience = experience || metaEntry.meta.exp || null;
                bio = bio || metaEntry.meta.desc || null;
            }
        } else if (parsed && typeof parsed === 'object') {
            subject = subject || parsed.subject || null;
            experience = experience || parsed.experience || null;
        }

        await prisma.user.update({
            where: { id: t.id },
            data: { permissions: JSON.stringify(DEFAULT_TEACHER_PERMISSIONS), subject, experience, bio } as any,
        });
        fixed++;
        console.log(`Tuzatildi: ${t.name} (${t.id}) — fan: ${subject || '—'}, tajriba: ${experience || '—'}`);
    }

    console.log(`\nJami tuzatildi: ${fixed} / ${teachers.length} ta o'qituvchi`);
}

run().finally(() => prisma.$disconnect());
