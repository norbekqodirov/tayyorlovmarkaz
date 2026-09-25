# Bosqich 2: production'ga chiqarish tartibi

**Paketlar:**
- IP-09: a'zolik davrlari, tarif, ustoz va foiz tarixi, o'quvchi kodi.
- IP-10: dars rejasi, bayramlar, yagona davomat xizmati.
- IP-11: oylik hisob dvigateli (hisoblar, tuzatmalar, takrorlanuvchi chegirmalar, shadow solishtirish).

**Branch:** `feature/ip09-azolik-davrlari`. Barcha paketlarning sxemasi bitta qadamda qo'llanadi (reja J.2, 3-qadam).

**Tartib:** avval sxema, keyin kod (reja J.6). Kod bazadan oldin yetib borsa, yangi Prisma client yangi ustunlarni (`Student.code`, `AttendanceRecord.markedById` va boshqalar) so'raydi. Natijada o'quvchi va davomat so'rovlari yiqiladi (2026-09-21 hodisasi kabi).

## 1. Sxema o'zgarishi — faqat qo'shimcha

SQLite uchun `prisma migrate diff` natijasi: 44 ta `ALTER` va `CREATE` operatsiyasi. Hammasi lokal sinovda to'liq qo'llangan.

```sql
-- IP-09
ALTER TABLE "Student" ADD COLUMN "code" TEXT;
ALTER TABLE "Student" ADD COLUMN "phoneNorm" TEXT;
CREATE TABLE "EnrollmentPeriod" (...);        -- a'zolik tarixi
CREATE TABLE "EnrollmentPause" (...);         -- pauzalar
CREATE TABLE "TariffVersion" (...);           -- guruh narxi tarixi
CREATE TABLE "GroupTeacherAssignment" (...);  -- guruh ustozi tarixi
CREATE TABLE "TeacherRate" (...);             -- ustoz foizi tarixi
-- IP-10
ALTER TABLE "AttendanceRecord" ADD COLUMN "markedById" / "markedAt" / "editReason" / "sessionId";
ALTER TABLE "LessonSession" ADD COLUMN "kind" / "status" / "billable" / "price" / "teacherId" /
                                       "replacesSessionId" / "cancelReason" / "compensate" / "createdById";
CREATE TABLE "Holiday" (...);                 -- bayramlar (unique faqat shu YANGI jadvalda)
-- IP-11
CREATE TABLE "BillingPeriod" (...);           -- oy holati (open/closing/closed)
CREATE TABLE "Charge" (...);                  -- hisob: chargeKey unique (yangi jadval)
CREATE TABLE "ChargeLine" (...);              -- hisob qatorlari
CREATE TABLE "StudentDiscount" (...);         -- takrorlanuvchi chegirmalar
CREATE INDEX ... (indekslar)
```

- Mavjud jadval qayta qurilmaydi, ustun o'chirilmaydi yoki nomi o'zgarmaydi. Yangi ustunlarning hammasi nullable.
- Mavjud jadvallarga unique qo'shilmagan. `Student.code` ham ataylab unique emas, chunki unique bo'lsa `db push` `--accept-data-loss` talab qilardi. Noyoblikni ilova ta'minlaydi.
- Lokal tekshiruv: eski (hozirgi production) sxemali SQLite bazaga o'quvchi, guruh, davomat va eski qo'shimcha dars yozuvlari kiritildi. So'ng yangi sxema `--accept-data-loss`siz qo'llandi. Barcha yozuvlar joyida qoldi, `integrity_check: ok`.

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

**Dars rejasi (IP-10).** Rejalar avtomatik yaratiladi: har oyning 25-sanasida keyingi oy uchun, 1-sanasida joriy oy uchun, barcha faol guruhlarga. Joriy oy rejasini darhol yaratish uchun guruh sahifasidagi Davomat tabida "Oy rejasini yaratish" tugmasi bor. Reja bo'lmagan oyda davomat avvalgidek jadval kunlari bo'yicha ishlaydi, faqat a'zolik va pauza tekshiruvlari qo'shiladi.

**Bayramlar.** `POST /api/lesson-plan/holidays` orqali qo'shiladi. Bayram kuniga dars rejalashtirilmaydi.

## 5. Nima o'zgaradi (foydalanuvchi uchun)

- **Guruh sahifasi.** O'quvchi qo'shishda boshlash sanasi so'raladi va birinchi oy hisobi ko'rsatiladi: darslar soni va summa (TQ-A). Hozirgi oylik hisob-kitob esa IP-11 gacha to'liq oy bo'yicha ishlayveradi.
- **"Guruhdan chiqarish"** endi uch variantli: Ketdi, Bitirdi, Xato qo'shilgan. Tanlangan sana va sabab bilan yakunlanadi. Shu oynadan boshqa guruhga bir qadamda o'tkazish ham mumkin.
- **Tarix.** Guruh narxi, guruh ustozi yoki ustoz foizi o'zgarsa, sana bilan tarixga yoziladi. Eski ustunlar joriy qiymatni ko'rsatishda davom etadi.
- **O'quvchi kodi.** Yangi o'quvchilarga `S-000123` ko'rinishidagi kod beriladi. U to'lov qidiruvi (TQ-D) uchun kerak.
- **Davomat — ustozlarni oldindan ogohlantiring.** Ustoz davomatni faqat oxirgi **3 kun** ichida belgilashi yoki tuzatishi mumkin (OQ-16). Eskiroq sanani administrator sabab yozib tuzatadi, sabab jurnalga tushadi. Kunlar soni `attendance_edit_window_days` sozlamasida o'zgartiriladi.
- **Davomat qoidalari.** A'zolik boshlanishidan oldingi, pauzadagi va kelajakdagi sanaga davomat yozilmaydi. Bekor qilingan dars kuniga ham yozilmaydi. Telegram Mini App ham aynan shu qoidalar bilan ishlaydi. Har belgilashda kim va qachon belgilagani saqlanadi.
- **Oylik hisoblar (Moliya → "Oylik hisoblar").** Deploy'dan keyin ham rejim `legacy` bo'lib qoladi. Yangi hisoblar hech narsaga ta'sir qilmaydi, qarz va balans eskicha qoladi. Sinov oyi uchun administrator "Shadow rejimini yoqish"ni bosadi. Shunda har kuni 01:30 da draft hisoblar yangilanadi va "Eski tizim bilan solishtirish" tabida farqlar sababi bilan ko'rinadi. Jonli rejim (`live`) — IP-13/14 dan keyin, izohlanmagan farq 0 bo'lganda (J.7).
- **Dars rejasi.** Davomat jadvali oy rejasi bo'yicha ko'rsatiladi. Menejer kun sarlavhasini bosib darsni bekor qila oladi: markaz yoki ustoz sababli, kompensatsiya bilan. Darsni boshqa kunga ko'chirish ham shu yerdan. Bekor qilingan kun kulrang va "bekor" belgisi bilan chiqadi.
