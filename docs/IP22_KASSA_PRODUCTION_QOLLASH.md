# IP-22: Kassa va bank hisoblari — production'ga chiqarish tartibi

**Maqsad (ML-16, TR:P12, QT-80):** tizimdagi pul kassadagi haqiqiy pul bilan mos bo'lsin.
Pul qayerda turgani (naqd kassa, terminal, bank, Payme, Click) ko'rinadi, kun oxirida kassa
sanab yopiladi, kassadan bankka topshirish kabi ichki o'tkazma daromad hisoblanmaydi.

**Branch:** `feature/ip22-kassa`.

**Tartib:** avval sxema, keyin kod. Kod bazadan oldin yetib borsa, yangi Prisma client
`Transaction.accountId` va `Payment.accountId` ustunlarini so'raydi. Natijada Moliya va
kvitansiya so'rovlari yiqiladi (2026-09-21 hodisasi kabi).

## 1. Sxema o'zgarishi — faqat qo'shimcha

SQLite uchun `prisma migrate diff` natijasi (`master` → branch): 7 ta operatsiya, bitta ham
`DROP` yoki jadvalni qayta qurish yo'q.

```sql
ALTER TABLE "Transaction" ADD COLUMN "accountId" TEXT;   -- kassa yozuvi qaysi hisobda
ALTER TABLE "Payment"     ADD COLUMN "accountId" TEXT;   -- kvitansiya puli qaysi hisobga tushgan
CREATE TABLE "CashAccount"  (...);  -- hisoblar: nomi, turi, usul yorlig'i, boshlang'ich qoldiq
CREATE TABLE "CashTransfer" (...);  -- ichki o'tkazmalar (komissiya bilan)
CREATE TABLE "CashSession"  (...);  -- yopilgan kunlar: kutilgan, sanalgan, farq, sabab
CREATE INDEX "CashTransfer_date_idx" ...;
CREATE INDEX "CashSession_accountId_date_idx" ...;
```

- Yangi ustunlar nullable. Eski yozuvlarda `accountId` bo'sh qoladi va ular `method`
  ("Naqd", "Karta", "Bank", "Payme", "Click") bo'yicha mos hisobga tushadi. Shuning uchun
  **ma'lumot ko'chirish (backfill) kerak emas**.
- Mavjud jadvallarga unique qo'shilmagan, hech narsa o'chirilmaydi yoki nomi o'zgarmaydi.
- Lokal tekshiruv: hozirgi production sxemasidagi SQLite bazaga o'quvchi, to'lov va ikki kassa
  yozuvi kiritildi. So'ng yangi sxema `--accept-data-loss`siz qo'llandi. Barcha yozuvlar joyida
  qoldi, yangi jadvallar yaratildi, `integrity_check: ok`.

## 2. Siz bajaradigan buyruqlar (serverda, SSH)

```bash
cd /home/tayyorlovmarkaz/tayyorlovmarkaz && node_modules/.bin/tsx scripts/backup_db.ts manual
```

```bash
git fetch origin && git show origin/feature/ip22-kassa:prisma/schema.prisma | sed 's/provider = "postgresql"/provider = "sqlite"/; s/ @db\.Text//' > prisma/schema.next.prisma
```

```bash
node_modules/.bin/prisma db push --schema prisma/schema.next.prisma --skip-generate && rm prisma/schema.next.prisma
```

Muhim tafsilotlar:
- Vaqtinchalik fayl `prisma/` papkasida bo'lishi shart (`file:./prod.db` sxema papkasiga nisbatan).
- `--accept-data-loss` qo'shilmaydi. Prisma ma'lumot yo'qotish haqida so'rasa — to'xtang va menga ayting.
- `--skip-generate`: ishlab turgan server eski client bilan qoladi, yangisini deploy yaratadi.

## 3. Men bajaraman (siz "bajardim" deganingizdan keyin)

1. Faqat o'qish rejimida tekshiraman: 3 ta yangi jadval va 2 ta ustun haqiqiy bazada bormi.
2. Branch'ni `master`ga birlashtiraman, pre-flight, keyin `deploy.sh`.
3. Post-flight: pm2, sayt, `/api/cash/accounts` (birinchi murojaatda standart 5 hisob yaratiladi).

## 4. Nima o'zgaradi (foydalanuvchi uchun)

- **Yangi sahifa: Moliya → "Kassa va hisoblar".** Har hisob qoldig'i, bugungi kirim/chiqim,
  oxirgi yopilgan kun. Standart hisoblar: Asosiy kassa, Terminal (karta), Bank hisobi, Payme,
  Click. Administrator yangi hisob qo'shadi (masalan 2-filial kassasi), nomini o'zgartiradi,
  boshlang'ich qoldiqni kiritadi.
- **Boshlang'ich qoldiq.** Kassada haqiqatda qancha pul borligini administrator bir marta kiritadi
  ("Sozlash" → Boshlang'ich qoldiq, qaysi kundan). Undan oldingi yozuvlar shu hisob qoldig'iga
  kirmaydi. Kiritilmasa, qoldiq faqat tizimdagi harakatni ko'rsatadi.
- **Formalarda "To'lov usuli" o'rniga "Qaysi hisob".** Kurs to'lovi, boshqa kirim, xarajat,
  oylik va avans to'lovi, pul qaytarish — pul qaysi kassa/bank hisobiga tushgani yoki qaysi
  hisobdan chiqqani tanlanadi. Kvitansiyada avvalgidek usul nomi ("Naqd", "Karta") chiqadi.
  Xarajat endi har doim "Naqd" deb yozilmaydi.
- **Kunni yopish** (naqd kassa va terminal uchun). Kun oxirida kassir pulni sanaydi: tizim
  "kassada bo'lishi kerak" summani ko'rsatadi (kun boshi + kirim − chiqim ± o'tkazma).
  Sanalgan summa kiritiladi. Farq bo'lsa, sababi majburiy va farq "Kassa farqi" yozuvi
  bilan tenglashtiriladi. Yopilgan kunga (va undan oldingi kunlarga) shu hisob bo'yicha
  yangi yozuv, o'chirish yoki o'tkazma kiritilmaydi. Faqat administrator oxirgi yopilgan
  kunni sabab bilan qayta ochadi.
- **Ichki o'tkazma.** Kassadan bankka topshirish, Payme/Click'dan bankka yechish. Bu daromad
  ham, xarajat ham emas — faqat hisoblar orasida. Komissiya (masalan Payme ushlab qolgan
  summa) manba hisobidan "Bank komissiyasi" xarajati bo'lib yoziladi.
- **Oylik solishtirish.** Har hisob bo'yicha oy boshi, kirim, chiqim, o'tkazma, oy oxiri va
  kassa farqlari. Bank va Payme/Click qoldig'ini ularning ko'chirmasi bilan shu yerda
  solishtiriladi. Usul nomi hech bir hisobga mos kelmagan eski yozuvlar alohida ko'rsatiladi.
- **Kassa daftari.** Bitta hisob bo'yicha oy kunlari: kun boshi, kirim, chiqim, o'tkazma,
  kun oxiri va kun yopilganmi.
