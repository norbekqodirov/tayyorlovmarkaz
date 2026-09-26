# IP-29: Xabarlar navbati — production'ga chiqarish tartibi

**Maqsad (AL-02, AL-03, AL-05; QT-90, QT-91):** Telegram xabarlari yo'qolmasin, takrorlanmasin va
Telegram cheklovlariga urilib to'xtab qolmasin; ommaviy xabar so'rovi darhol qaytsin; jonli
bildirishnomalar (lid biriktirildi, yangi xabar) ishlasin.

**Branch:** `feature/ip29-outbox`. **Tartib:** avval sxema, keyin kod.

## 1. Sxema o'zgarishi — faqat qo'shimcha

SQLite uchun `prisma migrate diff` natijasi (`master` → branch): **bitta yangi jadval**
`MessageOutbox` va uning 4 ta indeksi (noyob indeks faqat shu yangi jadvalda). Mavjud jadvallarga
tegilmaydi, `DROP` va `ALTER` yo'q, ma'lumot ko'chirish kerak emas. Lokal SQLite nusxada
ma'lumot bilan sinaldi: yozuvlar joyida, `integrity_check: ok`.

## 2. Siz bajaradigan buyruqlar (serverda, SSH)

```bash
cd /home/tayyorlovmarkaz/tayyorlovmarkaz && node_modules/.bin/tsx scripts/backup_db.ts manual
```

```bash
git fetch origin && git show origin/feature/ip29-outbox:prisma/schema.prisma | sed 's/provider = "postgresql"/provider = "sqlite"/; s/ @db\.Text//' > prisma/schema.next.prisma
```

```bash
node_modules/.bin/prisma db push --schema prisma/schema.next.prisma --skip-generate && rm prisma/schema.next.prisma
```

`--accept-data-loss` qo'shilmaydi; Prisma ma'lumot yo'qotish haqida so'rasa — to'xtang va menga ayting.

## 3. Men bajaraman (siz "bajardim" deganingizdan keyin)

1. Faqat o'qish rejimida: `MessageOutbox` jadvali va indekslari bormi.
2. Birlashtirish, pre-flight, `deploy.sh`.
3. Post-flight: pm2, sayt, jurnalda `[outbox] ishchi ishga tushdi` va `[Realtime]`.

## 4. Nima o'zgaradi

- **Barcha avtomatik xabarlar navbat orqali:** to'lov eslatmasi, kvitansiya, davomat, yangi lid,
  admin xabarlari, ommaviy xabar. Ishchi har 10 soniyada yuboradi:
  - Telegram "juda tez" desa (429) — aytilgan vaqtcha kutadi, xabar yo'qolmaydi;
  - internet/Telegram vaqtinchalik ishlamasa — 30 s, 2 min, 10 min, 30 min keyin qayta urinadi,
    5 urinishdan keyin "Xato";
  - ota-ona botni bloklagan yoki chat topilmasa — darhol "Xato" (qayta urinish befoyda);
  - server qayta ishga tushsa — navbatdagilar keyin yuboriladi; aynan yuborish paytida uzilgan
    xabar takror yuborilmaydi ("yetkazilgani noma'lum" deb belgilanadi, kerak bo'lsa qo'lda qayta).
- **Ommaviy xabar** (Aloqa markazi va Telegram → Yuborish): tugma bosilgach darhol javob, xabarlar
  fonda ketadi. Bir ota-onaga ikki farzand uchun **bitta** xabar. Tarixda "Yuborilmoqda / Yuborildi /
  Qisman / Xato" va nechta yetkazilgani ko'rinadi.
- **To'lov eslatmasi:** bir ota-onaga bitta xabar — barcha farzandlari qarzi ro'yxati bilan;
  3 kunda bir martadan ko'p emas.
- **Sokin soatlar:** ommaviy xabar va to'lov eslatmalari 22:00–08:00 (Toshkent) oralig'ida
  yuborilmaydi — ertalab 08:00 da ketadi. Kvitansiya, davomat va lid xabarlari darhol.
- **Telegram → "Navbat" tabi:** har xabar holati (navbatda / yuborildi / xato / bekor), urinishlar
  soni va xato sababi; "Qayta yuborish", "Bekor qilish", "Xatolarni qayta yuborish".
- **Jonli bildirishnomalar (realtime) ulandi:** menejerga lid biriktirilganda, yangi xabar
  kelganda sahifa o'zi yangilanadi. Brauzer konsolidagi doimiy WebSocket xatolari yo'qoladi.
  Xavfsizlik: foydalanuvchi faqat o'z kanaliga ulanadi (avvalgi kodda istalgan kanalga obuna
  bo'lish mumkin edi — olib tashlandi).
- "Test xabar" va bitta kishiga qo'lda yuborish avvalgidek darhol (natija ko'rinishi uchun).
