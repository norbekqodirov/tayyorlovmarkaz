# IP-09: production'ga chiqarish tartibi

**Paket:** a'zolik davrlari, tarif, ustoz va foiz tarixi, o'quvchi kodi. Branch: `feature/ip09-azolik-davrlari`.
**Tartib:** avval sxema, keyin kod (reja J.6). Kod bazadan oldin yetib borsa, yangi Prisma client `Student.code` ustunini so'raydi va o'quvchi so'rovlari yiqiladi (2026-09-21 hodisasi kabi).

## 1. Sxema o'zgarishi — faqat qo'shimcha

SQLite uchun `prisma migrate diff` natijasi (lokal sinovda to'liq qo'llangan):

```sql
ALTER TABLE "Student" ADD COLUMN "code" TEXT;
ALTER TABLE "Student" ADD COLUMN "phoneNorm" TEXT;
CREATE TABLE "EnrollmentPeriod" (...);        -- a'zolik tarixi
CREATE TABLE "EnrollmentPause" (...);         -- pauzalar
CREATE TABLE "TariffVersion" (...);           -- guruh narxi tarixi
CREATE TABLE "GroupTeacherAssignment" (...);  -- guruh ustozi tarixi
CREATE TABLE "TeacherRate" (...);             -- ustoz foizi tarixi
CREATE INDEX ... (9 ta indeks)
```

- Mavjud jadval qayta qurilmaydi, ustun o'chirilmaydi yoki nomi o'zgarmaydi.
- `Student.code` ataylab **unique emas**. Unique bo'lsa `db push` `--accept-data-loss` talab qilardi. Noyoblikni ilova ta'minlaydi.
- Lokal tekshiruv: eski sxemali va ichida ma'lumoti bor SQLite bazaga yangi sxema `--accept-data-loss`siz qo'llandi. Ma'lumot joyida qoldi, `integrity_check: ok`.

## 2. Siz bajaradigan buyruqlar (serverda, SSH)

```bash
cd /home/tayyorlovmarkaz/tayyorlovmarkaz && node_modules/.bin/tsx scripts/backup_db.ts manual
```

```bash
git fetch origin && git show origin/feature/ip09-azolik-davrlari:prisma/schema.prisma | sed 's/provider = "postgresql"/provider = "sqlite"/; s/ @db\.Text//' > prisma/schema.next.prisma
```

```bash
node_modules/.bin/prisma db push --schema prisma/schema.next.prisma --skip-generate && rm prisma/schema.next.prisma
```

Muhim tafsilotlar:
- Vaqtinchalik fayl **`prisma/` papkasida bo'lishi shart**. `DATABASE_URL="file:./prod.db"` sxema faylining papkasiga nisbatan hal qilinadi. Fayl `/tmp`da bo'lsa, `/tmp/prod.db` degan bo'sh baza yaratilib, xato ham chiqmaydi.
- `--accept-data-loss` **qo'shilmaydi**. Agar Prisma ma'lumot yo'qotish haqida so'rasa, to'xtang va menga ayting. Bu kutilmagan holat bo'ladi.
- `--skip-generate` kerak: ishlab turgan server eski client bilan qoladi, yangisini deploy o'zi yaratadi.

## 3. Men bajaraman (siz "bajardim" deganingizdan keyin)

1. Faqat o'qish rejimida tekshiraman: yangi 5 jadval va 2 ustun haqiqiy bazada bormi.
2. Branch'ni `master`ga birlashtiraman, CLAUDE.md pre-flight'ini o'tkazaman, keyin `deploy.sh`.
3. Post-flight: pm2, sayt, `/api/enrollments/group/...` va o'quvchilar ro'yxati ishlashi.

## 4. Deploy'dan keyin: ma'lumot ko'chirish (backfill)

Bu ham faqat qo'shimcha: davr, tarix va kod yaratadi, hech narsa o'chirmaydi va qayta ishga tushirilsa xavfsiz. Avval hisobotni ko'ring:

```bash
node_modules/.bin/tsx scripts/backfill_ip09.ts --out /tmp/backfill_dry.md && cat /tmp/backfill_dry.md
```

Hisobotni ko'rib chiqqach, yozish:

```bash
node_modules/.bin/tsx scripts/backfill_ip09.ts --apply --out /tmp/backfill_apply.md
```

Backfill'gacha tizim ishlayveradi:
- eski (sanasiz) a'zoliklar "Guruhdan chiqarish"da bugungi sana bilan yakunlanadi;
- transfer faqat davri bor a'zoliklar uchun ochiladi.

Tekshirish navbatidagi holatlar (ketgan-lekin-a'zo, yakunlangan guruhdagi a'zolik va boshqalar) guruh sahifasida to'g'ri sana bilan yakunlanadi.

## 5. Nima o'zgaradi (foydalanuvchi uchun)

- **Guruh sahifasi.** O'quvchi qo'shishda boshlash sanasi so'raladi va birinchi oy hisobi ko'rsatiladi: darslar soni va summa (TQ-A). Hozirgi oylik hisob-kitob esa IP-11 gacha to'liq oy bo'yicha ishlayveradi.
- **"Guruhdan chiqarish"** endi uch variantli: Ketdi, Bitirdi, Xato qo'shilgan. Tanlangan sana va sabab bilan yakunlanadi. Shu oynadan boshqa guruhga bir qadamda o'tkazish ham mumkin.
- **Tarix.** Guruh narxi, guruh ustozi yoki ustoz foizi o'zgarsa, sana bilan tarixga yoziladi. Eski ustunlar joriy qiymatni ko'rsatishda davom etadi.
- **O'quvchi kodi.** Yangi o'quvchilarga `S-000123` ko'rinishidagi kod beriladi. U to'lov qidiruvi (TQ-D) uchun kerak.
