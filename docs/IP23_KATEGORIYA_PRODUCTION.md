# IP-23: Kategoriya ID va turi — production'ga chiqarish tartibi

**Maqsad (ML-12, TR:F18, QT-16):** kirim/chiqim kategoriyasining nomini o'zgartirish formalar,
eski yozuvlar va hisobotlarni buzmasin ("Kurs to'lovi" → "O'quvchi to'lovi" bo'lsa ham).

**Branch:** `feature/ip23-kategoriya`. **Tartib:** avval sxema, keyin kod.

## 1. Sxema o'zgarishi — faqat qo'shimcha

```sql
ALTER TABLE "Transaction" ADD COLUMN "categoryId" TEXT;          -- kassa yozuvi qaysi kategoriyada (ID)
ALTER TABLE "TransactionCategory" ADD COLUMN "systemKey" TEXT;   -- tizim kategoriyasi kaliti
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
```

Ikkala ustun ham bo'sh bo'lishi mumkin; hech narsa o'chirilmaydi. Mahalliy SQLite nusxada ma'lumot
bilan sinaldi: yozuvlar joyida, `integrity_check: ok`. Production'da hozircha kassa yozuvi yo'q —
ma'lumot ko'chirish kerak emas (eski/erkin matnli yozuvlar nom bo'yicha hisoblanadi).

## 2. Siz bajaradigan buyruqlar (serverda, SSH)

```bash
cd /home/tayyorlovmarkaz/tayyorlovmarkaz && node_modules/.bin/tsx scripts/backup_db.ts manual
```

```bash
git fetch origin && git show origin/feature/ip23-kategoriya:prisma/schema.prisma | sed 's/provider = "postgresql"/provider = "sqlite"/; s/ @db\.Text//' > prisma/schema.next.prisma
```

```bash
node_modules/.bin/prisma db push --schema prisma/schema.next.prisma --skip-generate && rm prisma/schema.next.prisma
```

`--accept-data-loss` qo'shilmaydi; Prisma ma'lumot yo'qotish haqida so'rasa — to'xtang va menga ayting.

## 3. Men bajaraman (siz "bajardim" deganingizdan keyin)

1. Faqat o'qish rejimida: 2 ta ustun va indeks bormi.
2. Birlashtirish, pre-flight, `deploy.sh`.
3. Post-flight + tizim kategoriyalari belgilanganini tekshirish (faqat o'qish).

## 4. Nima o'zgaradi

- **Tizim kategoriyalari** (Kirim/Chiqim kategoriyalari sahifasida "Tizim" belgisi bilan):
  Kurs to'lovi, To'lov qaytarish, Oylik, Avans, Kassa farqi (kirim va chiqim), Bank komissiyasi.
  Nomini o'zgartirish mumkin; o'chirish, nofaol qilish va turini o'zgartirish mumkin emas.
  Server birinchi ishga tushganda mavjud "Kurs to'lovi", "Oylik", "Avans" shu belgini oladi,
  yo'qlari (qaytarish kirimi, kassa farqi, bank komissiyasi) yaratiladi.
- **Nomni o'zgartirish** — shu kategoriyadagi barcha eski kassa yozuvlari, xarajatlar va byudjet
  qatorlarida ham yangi nom ko'rinadi (tarix bir xil nomda). Band nomga o'zgartirib bo'lmaydi.
- **Formalar nom emas, turdan foydalanadi:** "Oylik" "Ish haqi"ga o'zgartirilsa ham oylik to'lash
  formasi (xodim, davr tanlash) ishlaydi; kurs to'lovi ham xuddi shunday.
- **O'chirish:** kategoriya bilan yozuvlar bo'lsa — o'chirilmaydi, arxivlanadi (nofaol, tarix
  saqlanadi); ishlatilmagan bo'lsa — o'chiriladi.
- **"Ro'yxatda yo'q kategoriya nomlari"** — eski yoki erkin matn bilan yozilgan yozuvlar nomlari;
  "Qo'shish" bilan kategoriya qilib, turini aniq belgilash mumkin.
- Qaytarish, kassa farqi va bank komissiyasi qo'lda kiritish formalarida ko'rinmaydi (ular
  tizim tomonidan avtomatik yoziladi).
