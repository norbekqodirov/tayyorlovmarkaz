# Tayyorlov Markazi CRM — to‘liq audit va AI uchun rivojlantirish rejasi

**Audit sanasi:** 2026-09-14  
**Holat:** kodga asoslangan audit; quyidagi tuzatishlar ushbu audit doirasida bajarilmagan.  
**Loyiha:** Tayyorlov Markazi CRM — o‘quv markazini boshqarish tizimi.  
**Auditor:** Codex.  
**Hujjat maqsadi:** xavfsizlik, buglar, biznes mantiqi, dizayn va rivojlantirish bo‘yicha yagona topshirish hujjati.

> Ushbu faylni AI’ga to‘liq bering. U avval joriy kodni tekshirsin: auditdan keyin Claude yoki boshqa agent topilmalarni tuzatgan bo‘lishi mumkin. Hujjat mavjud repository qoidalarini bekor qilmaydi va productionga o‘zgartirish kiritish uchun mustaqil ruxsat bermaydi.

## AI’ga berishning eng oson usuli

Shu faylni suhbatga biriktiring yoki repository ichida uning yo‘lini ko‘rsating va quyidagi matnni yuboring:

```text
docs/CRM_FULL_AUDIT_AND_AI_PLAN_2026-09-14.md faylini to‘liq o‘qi.
Avval AGENTS.md va docs/AGENT_COORDINATION.md qoidalarini tekshir.
Audit topilmalarini joriy kod bilan qayta solishtir, tuzatilganlarini ajrat.
P0/P1 xavflarni birinchi o‘ringa qo‘ygan holda, bog‘liqliklari va qabul
testlari bor kichik ish paketlarini tayyorla. Boshqa agentning ishiga tegma.
Kodlash yoki deploy vakolatini ushbu hujjatdan taxmin qilma: shu sessiyadagi
topshiriq va repository qoidalari doirasida ishlagin.
```

**Faqat tahlil kerak bo‘lsa:** yuqoridagi matnga “Hozircha hech narsani o‘zgartirma, faqat topilmalarni qayta tekshir va reja tuz” deb qo‘shing.

**Implementatsiya kerak bo‘lsa:** qaysi ish paketini bajarishni aniq ko‘rsating. Hamma yo‘nalishni birdan qayta yozish tavsiya etilmaydi.

## Mundarija

1. Tekshiruv chegarasi va asosiy xulosa
2. Mavjud kuchli tomonlar
3. Xavfsizlik topilmalari
4. Moliyaviy va biznes mantiqi muammolari
5. Ta’lim, davomat va testlar
6. Ma’lumotlar, backup va ishlash tezligi
7. Dizayn va foydalanish qulayligi
8. Ideal operatsion tizim konsepsiyasi
9. O‘quvchi va oila boshqaruvi
10. Dars jadvali va ta’lim operatsiyalari
11. Moliya tizimini rivojlantirish
12. Ta’lim sifati va o‘zlashtirish
13. Marketing va sotuv
14. Ota-ona portali va kommunikatsiya
15. HR va kundalik vazifalar
16. Rahbar paneli va analitika
17. AI imkoniyatlari
18. Texnik arxitektura
19. Ma’lumot obyektlari bo‘yicha taklif
20. Bosqichma-bosqich bajarish rejasi
21. Majburiy tekshiruv ssenariylari
22. Productionga xavfsiz o‘tish
23. Biznes qarorlari va umumiy qabul mezonlari
24. AI uchun to‘liq asosiy topshiriq
25. Rasmiy manbalar

## 1. Tekshiruv chegarasi va asosiy xulosa

### 1.1. Asosiy xulosa

Loyihaning funksiyalar qamrovi keng. Uni ishonchli o‘quv markaz operatsion tizimiga aylantirish uchun avvalo xavfsizlik, moliyaviy hisob va ma’lumotlar izchilligini mustahkamlash kerak.

Eng katta foyda yangi sahifalar sonini oshirishdan ko‘ra, mavjud modullarni yagona, tekshiriladigan biznes jarayoniga birlashtirishdan keladi. Loyihani butunlay qayta yozish uchun auditda asos topilmadi.

Asosiy mezon: bir o‘quvchining qabulidan bitiruvigacha bo‘lgan tarixi, har bir to‘lovning hisobi va har bir xodimning vakolati tushunarli hamda tekshiriladigan ishlashi.

### 1.2. Tekshirilgan qamrov

Audit paytidagi inventar:

| Ko‘rsatkich | Soni |
|---|---:|
| Prisma modeli | 77 |
| Backend route fayli | 41 |
| CRM sahifasi | 46 |

Arxitektura, asosiy biznes oqimlari, autentifikatsiya, ruxsatlar, Telegram, to‘lovlar, davomat, testlar, hisobotlar, umumiy UI komponentlari va loyiha hujjatlari ko‘rib chiqildi. Inventar sonlari har bir satr va har bir runtime holati to‘liq tekshirilganini anglatmaydi.

Fayl yaratmaydigan TypeScript tekshiruvi bajarildi:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
Natija: exit code 0, 0 xato.
```

### 1.3. Nima bajarilmagan

Audit davomida kod, konfiguratsiya, Git holati, baza va xizmatlarga o‘zgartirish kiritilmadi. Build, deploy, migratsiya, yozuvchi API chaqiruvlari, haqiqiy to‘lov yoki bot xabari bajarilmadi.

Keyingi foydalanuvchi topshirig‘i bilan faqat ushbu yangi Markdown hujjati yaratildi. Bu ish implementatsiya emas.

Chegaralar:

- Bu kodga asoslangan audit; production konfiguratsiyasi va tashqi himoyalar tekshirilmagan.
- Barcha ekranlar brauzerda ochilib, real ma’lumot bilan ishlatilmagan.
- Ayrim GET endpointlar ham yon ta’sirga ega bo‘lishi mumkinligi sababli ilovaga jonli so‘rovlar berilmadi.
- Dizayn xulosalari manba kodiga asoslangan. Kontrast, mobil piksel ko‘rinishi, Lighthouse yoki Core Web Vitals ballari o‘lchanmagan.
- Claude tahrirlayotgan dashboard, jadval va guruh sahifalari ish jarayonidagi holat sifatida qaraldi.
- Topilmaning kodda tasdiqlanishi undan productionda kimdir foydalanganini anglatmaydi.
- Keltirilgan fayl satrlari audit vaqtidagi yo‘naltiruvchi manzil; keyingi tahrirlarda siljishi mumkin. Funksiya va endpoint nomi bilan qayta toping.
- To‘liq dependency skaneri yoki faol penetratsion test bajarilmagan.

### 1.4. Ustuvorlik va dalil talqini

| Daraja | Talqin |
|---|---|
| P0 | Hisob yoki tashqi integratsiya nazoratini yo‘qotish xavfi; birinchi navbat |
| P1 | Ma’lumot sizishi, ruxsatsiz o‘zgartirish, pul yoki tarixiy ma’lumot yaxlitligi buzilishi |
| P2 | Ishonchlilik, ishlash tezligi, UX va qo‘llab-quvvatlash kamchiligi |

Quyidagi topilmalar koddagi dalillar bilan berilgan. Productionda real ta’sir endpoint ochiqligi, muhit va ma’lumotga bog‘liq. Rivojlantirish bo‘limlari esa kelajak uchun takliflar bo‘lib, mavjud funksiyalar yo‘q degan da’vo emas.

## 2. Mavjud kuchli tomonlar

| Yo‘nalish | Mavjud imkoniyatlar |
|---|---|
| Ta’lim | O‘quvchilar, guruhlar, kurslar, tariflar, davomat, jurnal, baholash, test va imtihonlar |
| Marketing | Lid voronkasi, UTM, formalar, menejerga biriktirish, SLA, kampaniya tahlili |
| Moliya | Tranzaksiyalar, to‘lovlar, invoice, xarajat, byudjet, chegirmalar |
| HR | Xodimlar, lavozimlar, rollar, maosh, ta’til, davomat, ish joylari |
| Kommunikatsiya | Ikki Telegram bot, ikki portal, ota-ona va xodim chatlari |
| Boshqaruv | Filiallar, audit, sertifikat, hisobot va avtomatlashtirish |
| UI | Umumiy modal, tugma, input, jadval, toast, skeleton va holat komponentlari |

Saqlanadigan ijobiy yechimlar:

- JWT maxfiy kalitisiz server ishlashni rad etadi.
- Parollar bcrypt bilan xeshlanadi.
- Ayrim routerlarda granular permission tekshiruvlari mavjud.
- Ayrim CRUD o‘qishlarida o‘qituvchi guruhi bo‘yicha scope mavjud.
- Davomatni `AttendanceRecord` modeliga birlashtirish boshlangan.
- Invoice to‘lovini belgilashning bir yo‘lida atomar tranzaksiya mavjud.
- AI HTML ko‘rinishi DOMPurify orqali tozalanadi.
- Umumiy modalda fokusni ushlab turish va qaytarish mavjud.
- Mahalliy shrift, lazy loading va ayrim kesh sozlamalari ishlangan.

**Tizimli muammo:** yaxshi yechimlar barcha alternativ API yo‘llari, import, bulk, portal va hisobotlarga bir xil tatbiq etilmagan.

## 3. Xavfsizlik topilmalari

### SEC-01 — P0: ochiq Telegram set-webhook endpointi

**Dalil:** `server/routes/telegram.ts:45`, `GET /api/telegram/set-webhook`.

Endpointda autentifikatsiya yo‘q. Query orqali kelgan webhook manzili serverdagi bot tokeni bilan Telegram’ga yuboriladi.

**Ta’sir:** endpoint tashqaridan ochiq va bot sozlangan bo‘lsa, begona shaxs bot yangilanishlarini boshqa manzilga yo‘naltirishga urinishi mumkin.

**Tuzatish:**

- Faqat alohida integratsiya boshqarish huquqi bilan ishlasin.
- Holat o‘zgartiruvchi amal POST bo‘lsin.
- Webhook manzili ruxsat etilgan HTTPS manzillar ro‘yxati bilan tekshirilsin.
- Audit yozuvi yaratilishi shart.
- Public `/info` orqali operatsion ma’lumot chiqarish qayta ko‘rib chiqilsin.

**Qabul mezoni:** anonim, TEACHER va ruxsatsiz MANAGER so‘rovi Telegram API’ga yetib bormaydi.

### SEC-02 — P0: Telegram hisobini telefonga bog‘lash tasdig‘i yetishmaydi

**Dalil:** `server/routes/staffTelegram.ts:29`, `server/bot/index.ts:97`.

Xodim webhookida so‘rov Telegram’dan kelganini tasdiqlovchi secret tekshiruvi yo‘q. Kontakt telefoni bo‘yicha foydalanuvchi topilib, kelgan `chatId` unga bog‘lanadi. Ikkala botda ham kontakt egasi aynan yuboruvchi ekanini tekshirish yetishmaydi.

**Ta’sir:** boshqa odam kontakti yoki tekshirilmagan webhook ma’lumoti hisob bog‘liqligini noto‘g‘ri o‘zgartirishi mumkin.

**Tuzatish:**

- Har ikki webhook uchun majburiy secret tekshiruvi.
- Private chat, yuboruvchi va kontakt identifikatorlarini tekshirish.
- `contact.user_id` yuboruvchi identifikatoriga mos bo‘lsin; yetishmasa ishonchli alternativ tekshiruv talab qilinsin.
- Oldindan bog‘langan hisobni qayta bog‘lash alohida tasdiqlansin.
- Bog‘lash bir martalik, muddati cheklangan jarayon bo‘lsin.
- Bog‘lash va qayta bog‘lash auditlansin.

**Qabul mezoni:** boshqa shaxs kontakti yoki secret’siz so‘rov hech qanday account bog‘liqligini o‘zgartirmaydi.

### SEC-03 — P0: ADMIN mavjud SUPER_ADMIN parolini almashtira oladigan yo‘l

**Dalil:** `server/routes/auth.ts:291`, foydalanuvchini tahrirlash endpointi.

Kod yuborilayotgan yangi rol `SUPER_ADMIN` ekanini tekshiradi, lekin nishondagi mavjud hisobning joriy rolini tekshirmaydi. Rol maydonini yubormasdan mavjud SUPER_ADMIN’ga parol o‘rnatish yo‘li mavjud.

**Tuzatish:**

- Nishondagi foydalanuvchini avval o‘qish.
- Uning joriy darajasiga qarab parol, telefon, rol, bloklash va permission o‘zgarishini tekshirish.
- Oxirgi faol SUPER_ADMIN’ni himoyalash.
- Yuqori huquqli o‘zgarishda qayta autentifikatsiya.
- Parol o‘zgarganda tegishli sessiyalarni bekor qilish.

**Qo‘shimcha bug:** `isActive` yuborilmasa ham `true` o‘rnatiladi; oddiy tahrir bloklangan hisobni faollashtirishi mumkin. PATCH semantikasida yuborilmagan qiymat saqlanishi kerak.

**Qabul mezoni:** ADMIN SUPER_ADMIN hisobining himoyalangan maydonlarini o‘zgartira olmaydi; yuborilmagan `isActive` o‘zgarmaydi.

### SEC-04 — P1: maxsus endpointlar umumiy scope himoyasidan tashqarida

**Dalil:** `server/routes/students.ts:14`, `server/routes/crud.ts:417`, `server/routes/salary.ts:12`, `server/routes/analytics.ts:371`.

Misollar:

- O‘quvchi profilida faqat login tekshiriladi, o‘qituvchining shu o‘quvchiga kirish ko‘lami tekshirilmaydi.
- Profil bilan payments, invoices va attendance ham qaytadi.
- Enrollment qo‘shish va chiqarishda faqat login tekshiriladi.
- Guruh a’zolari ro‘yxatida guruhga kirish ko‘lami tekshirilmaydi.
- Maosh va maosh hisoboti yo‘llarida rol/permission chegarasi yetarli emas.

**Tuzatish:** har endpointda amal huquqi, obyekt scope’i va qaytariladigan maydonlar tekshirilsin. Menyuni yashirish backend himoyasi emas.

**Qabul mezoni:** boshqa guruh/filial/shaxsga tegishli ID bilan murojaat qilish ma’lumotni oshkor qilmaydi va o‘zgartirmaydi.

### SEC-05 — P1: Telegram boshqaruvi uchun faqat login yetarli

**Dalil:** `server/routes/telegram.ts:161`, `server/routes/staffTelegram.ts:366`.

Bot sozlamalarini yozish, yuborish, broadcast va xodim webhookini sozlash kabi amallarda ko‘pincha faqat `requireAuth` bor.

**Tuzatish:** `integrations.manage`, `communications.send`, `communications.broadcast`, `telegram.link` kabi alohida amallar siyosati. Broadcast uchun auditoriya preview’i, limit va audit.

**Qabul mezoni:** login qilganining o‘zi foydalanuvchiga token, webhook yoki ommaviy yuborishni boshqarish huquqini bermaydi.

### SEC-06 — P1: generic CRUD yozish/o‘chirish himoyasi izchil emas

**Dalil:** `server/routes/crud.ts:705`, `COLLECTION_PERMISSION_MAP` taxminan 386-satr.

- Akademik POST/PUT’da guruh egaligi tekshirilgan joylarda DELETE uchun shu tekshiruv yo‘q.
- `attendanceRecords` generic yozish yo‘li maxsus davomat routerining tekshiruvlariga teng emas.
- `GenericDocument` ID amallarining ayrimlari `id` bilan ishlaydi, `collection` bilan birga tekshirmaydi.
- Permission xaritasi tor; moliya kabi ayrim kolleksiyalar faqat rol darajasida qolgan.

**Tuzatish:** barcha alias va maxsus yo‘llar bitta matritsaga kiritilsin. Muhim domen amallari generic CRUD’dan bosqichma-bosqich chiqarilsin.

**Qabul mezoni:** bir xil obyektga barcha URL va HTTP method orqali bir xil siyosat tatbiq etiladi.

### SEC-07 — P1: login va sessiya himoyasi

**Dalil:** `server/routes/auth.ts:46`, `server/middleware/auth.ts:28`.

- Bo‘sh bazada kodga yozilgan doimiy hisob ma’lumotlari bilan SUPER_ADMIN yaratish yo‘li bor.
- Parolsiz yaratilgan hisobga bir xil standart parol qo‘llanadi.
- Login routerida urinishlar limiti ko‘rinmadi.
- Mavjud telefon va noto‘g‘ri parol javoblari farqlanadi.
- JWT 30 kunlik.
- Parol o‘zgarishi eski JWT’ni bekor qilmaydi.
- DB orqali joriy identity tekshiruvi xatolansa eski JWT roli va faol holatga ishoniladi.

**Tuzatish:** xavfsiz birinchi sozlash, bir martalik taklif, majburiy parol o‘rnatish, rate limit, sessiyalar ro‘yxati/bekor qilish va yuqori huquqli hisoblar uchun MFA. DB xatosida yangi huquq beruvchi fail-open holat bo‘lmasin.

**Qabul mezoni:** bekor qilingan sessiya qayta ishlamaydi; bootstrap ma’lum doimiy parolga tayanmaydi; login cheklovi ishlaydi.

Koddagi hisob ma’lumotlari bu hujjatda qayta keltirilmagan.

### SEC-08 — P1: fayl yuklash va o‘chirish siyosati

**Dalil:** `server/routes/upload.ts`, `server/index.ts` dagi `/uploads` static mount.

- Kengaytma va MIME qat’iy ro‘yxat o‘rniga oddiy regex orqali tekshiriladi.
- SVG qabul qilinadi, tarkibi tekshirilmaydi.
- Fayllar ilovaning o‘z domenida public beriladi.
- O‘chirishda fayl egasi yoki alohida permission tekshirilmaydi.
- Yakuniy yo‘l upload papkasidan tashqariga chiqmasligi aniq tekshirilmagan.

**Ta’sir:** ruxsatsiz fayl o‘chirish va faol kontent xavfi. SVG’ni alohida hujjat sifatida ochish shu domendagi localStorage tokenlari bilan xavfni kuchaytiradi.

**Tuzatish:** tarkib tekshiruvi, rasmlarni qayta kodlash, xavfsiz kengaytmalar, egalik, resolve qilingan yo‘l chegarasi, kvota, private/public ajratish va xavfsiz response sarlavhalari.

**Qabul mezoni:** noto‘g‘ri tarkib rad etiladi; boshqa foydalanuvchi fayli ruxsatsiz o‘chirilmaydi; fayl nomi papkadan tashqaridagi manzilga olib bormaydi.

### SEC-09 — P1: Face ID bypass mijoz tomonidan boshqariladi

**Dalil:** `server/routes/staffPortal.ts:697`.

Server mijoz yuborgan `faceBypass`ni qabul qiladi va yoqilganda yuz solishtirishni tashlab ketadi.

Qo‘shimcha:

- GPS koordinatalari mijozdan keladi.
- Deskriptorda faqat 128 elementli massiv tekshiriladi; barcha elementlar chekli sonligi tekshirilmaydi.
- Yuz profilini qayta yozishda alohida tasdiq oqimi yo‘q.
- Check-out’da check-in’dagidek geofence tekshiruvi yo‘q.

**Tuzatish:** bypass server siyosati va vakolatli tasdiq bilan; sabab/tasdiqlovchi/audit; to‘liq son va koordinata validatsiyasi; profil almashtirish alohida oqim.

**Qabul mezoni:** mijoz parametri o‘zi verifikatsiyani o‘chira olmaydi. Brauzer GPS va client-side liveness mutlaq ishonchli dalil sifatida talqin qilinmaydi. Yakuniy Face ID oqimi haqiqiy telefon va Telegram ichida sinaladi.

### SEC-10 — P1: maxfiy maydonlar audit va Git nusxalarida

**Dalil:** `server/middleware/audit.ts`, `prisma/migration-data/User.json`.

Audit middleware oldingi obyektni to‘liq JSON qiladi; User uchun parol xeshi ham saqlanishi mumkin. Git kuzatayotgan User dump’ida `password` maydoni mavjudligi tasdiqlangan. Qiymati ko‘chirilmagan. Qolgan dump’larning real/test tabiati tekshirilishi kerak.

**Tuzatish:** maxfiy maydonlarni maskalash, sintetik seed, repository tarixi va kirish doirasini vakolatli tekshirish, zarur bo‘lsa credential almashtirish rejasi. Git tarixini alohida kelishuvsiz qayta yozmaslik.

**Qabul mezoni:** parol, token va biometrika audit payload’ida yo‘q; test ma’lumotlarida real shaxsiy ma’lumot yo‘q.

### SEC-11 — P1: xlsx parseri ma’lum ReDoS diapazonida

**Dalil:** `package-lock.json:8908` — `xlsx` 0.18.5; `server/routes/import.ts` serverda `XLSX.read` ishlatadi.

SheetJS ishlab chiqaruvchisi advisory’sida 0.20.1 gacha bo‘lgan versiyalar CVE-2024-22363 ta’sirida ekani ko‘rsatilgan.

**Tuzatish:** rasmiy manbadan xavfsiz, qo‘llab-quvvatlanadigan relizga nazoratli o‘tish. Parser uchun resurs/vaqt/qator/ustun limitlari va zarur bo‘lsa alohida worker.

**Qabul mezoni:** amaldagi dependency rasmiy advisory bo‘yicha ta’sirlangan diapazonda emas; noto‘g‘ri fayl asosiy serverni band qilib qo‘ymaydi.

### SEC-12 — P2: qo‘shimcha himoya kamchiliklari

**Dalillar:** `server/index.ts:83`, `src/api/client.ts`, `vite.config.ts`, `server/middleware/authorize.ts`, `src/components/ProtectedRoute.tsx`.

- CORS origin `startsWith` bilan tekshirilgan; to‘liq origin tengligi kerak.
- JWT localStorage’da; XSS ta’siri yuqoriroq.
- Ko‘plab API xatolari ichki `err.message` yoki `String(error)`ni chiqaradi.
- Frontend eski permissions, backend effective permissions manbalari to‘liq birlashtirilmagan.
- Vite’da server AI kalitini frontend almashtirishiga qo‘shuvchi define mavjud. Hozir frontendda undan foydalanish topilmadi: bundle’da kalit sizgan deb tasdiqlanmaydi, lekin xavfli sozlamani olib tashlash kerak.

**Qabul mezoni:** origin qat’iy tekshiriladi; tashqi xatolar maxfiy tafsilot chiqarmaydi; permission UI va API’da mos; server sirlari frontend konfiguratsiyasiga kirmaydi.

## 4. Moliyaviy va biznes mantiqi muammolari

### FIN-01 — P1: qo‘lda to‘lov kiritish atomar emas

**Dalil:** `src/pages/crm/finance/CrmFinance.tsx:336`, `handleSave`.

Brauzer eski balansni o‘qib yangi balansni yuboradi, keyin alohida so‘rovda Transaction yaratadi. Birinchi amal o‘tib ikkinchisi xatolansa qisman natija qoladi. Ikki kassir eski balansga asoslangan hisobni bir-birining ustidan yozishi mumkin.

Bu yo‘lda Payment yaratish ham ko‘rinmadi; Payment asosidagi portal va marketing hisobotlari Transaction asosidagi ekranlardan farqlanishi mumkin.

**Talab:** bitta server amali ichida payment, moliyaviy yozuv, balans, audit va idempotency. Brauzer yakuniy balansni belgilamasin.

### FIN-02 — P1: Payme/Click atomarligi va callback tekshiruvlari

**Dalil:** `server/routes/payments.ts`.

OnlineTransaction holati, balans, Payment va Transaction alohida yoziladi.

Xavflar:

- Tranzaksiya bajarildi holatida, balans yangilanmagan qolishi.
- Parallel callback’da takror hisoblash.
- Ikki turli to‘lovda balans yangilanishining yo‘qolishi.
- Refund Payment va hisobotlarda izchil aks etmasligi.

Click’da qo‘shimcha topilmalar:

- Secret mavjudligi majburiy tekshirilmaydi.
- `service_id` konfiguratsiya bilan solishtirilmaydi.
- Prepare/Complete shartnoma tekshiruvlari yetarli emas.
- `merchant_prepare_id` olinadi, lekin bog‘liqlik tekshiruvida ishlatilmaydi.
- URL-encoded body parseri ko‘rinmadi; real provider kontent turi bilan tekshirish kerak.

**Talab:** provider holat mashinasi, atomar posting, idempotency, amount/currency/account/provider mosligi va reconciliation. Imzo formulasi va barcha chekka holatlar rasmiy provider shartnomasi bo‘yicha sandbox’da tekshirilsin. Hozirgi audit provider sertifikatsiyasi emas.

### FIN-03 — P1: invoice holatlarini qaytarish orqali takror posting

**Dalil:** `server/routes/finance.ts`.

Paid qilish yo‘li atomar ishlangan. Ammo boshqa statusga o‘tkazish erkinroq: `paid → pending → paid` moliyaviy yozuvni qayta yaratishi mumkin. To‘langan invoice’ni o‘chirish uchun ham domen cheklovi kerak.

`count + 1` orqali invoice raqami yaratish parallel so‘rovda ishonchli emas.

**Talab:** ruxsat etilgan status o‘tishlari, alohida reversal, payment bilan doimiy aloqa, noyob posting identifikatori va xavfsiz raqam generatori.

### FIN-04 — P1: tarixiy billing bugungi holat bilan qayta hisoblanadi

**Dalil:** `server/services/billing.ts`.

Oldingi oy hisobi hozirgi enrollment, guruh/kurs narxi va global sozlamalarni ishlatadi. Guruhdan chiqarish yoki narx o‘zgarishi eski oy natijasini o‘zgartirishi mumkin.

**Talab:** enrollment davri, amal qilish sanali tarif, qoida versiyasi, oy yopilgandagi snapshot va tuzatish yozuvi. Tarixiy natijani jim qayta yozmaslik.

### FIN-05 — P2: yil filtrlanmaydigan oylik hisobot

**Dalil:** `src/pages/crm/finance/CrmFinance.tsx:373` va shu fayldagi grafik/oylik summary hisoblari.

Ayrim filtrlar faqat `getMonth()`ni solishtiradi. Turli yillarning bir xil oylari qo‘shilib ketishi mumkin.

**Talab:** aniq davr chegarasi, Tashkent vaqt qoidasi, yil almashishi va ko‘p yillik ma’lumot testlari.

### FIN-06 — P1/P2: pulning bir nechta mustaqil manbasi

Student.balance, Payment, Transaction, Invoice, Expense, Salary va OnlineTransaction mavjud. Muammo ularning ko‘pligi emas, yagona posting va moslashtirish qoidasining yetishmasligi.

Qo‘lda tranzaksiyani o‘chirish balans/bog‘liq to‘lovni izchil qaytarmaydi. Maosh to‘lash ham holat va xarajatni alohida yozadi.

**Talab:** tasdiqlangan moliyaviy tarix o‘chirilmasin. Reversal/adjustment, FK bog‘liqliklar va avtomatik reconciliation joriy etilsin.

## 5. Ta’lim, davomat va testlar

### 5.1. Akademik topilmalar

| ID | Topilma | Ta’siri va talab |
|---|---|---|
| EDU-01 | Davomatda o‘quvchining guruhga a’zoligi tekshirilmaydi | Enrollment va uning davri bilan tekshirish kerak |
| EDU-02 | Davomat Promise.all bilan alohida saqlanadi | Atomar batch yoki aniq qisman natija shart |
| EDU-03 | Attendance va AttendanceRecord o‘qishlari aralash | Analytics dashboard yordamchisi eski jadvalni o‘qiydi; bitta manbaga o‘tish kerak |
| EDU-04 | “Muzlatilgan” graduated’ga aylantiriladi | Muzlatish va bitirish alohida status/jarayon bo‘lsin |
| EDU-05 | Enrollment tarixiy holati yetishmaydi | Guruhdan chiqish tarixni yo‘qotmasin |
| EDU-06 | student+group+date yagona davomat kaliti | Bir kundagi ikki dars uchun LessonSession kerak |
| EDU-07 | Uchta absent yozuv ketma-ket uch kun deb ko‘riladi | Guruh, dars ketma-ketligi va kalendar bo‘yicha aniqlash kerak |
| EDU-08 | Ota-onaning bir nechta farzandi oqimi to‘liq emas | Birinchi mos student o‘rniga ruxsatli farzand tanlash kerak |

Dalillar: `server/routes/studentAttendance.ts`, `server/routes/analytics.ts`, `server/routes/crud.ts:184`, `prisma/schema.prisma`, `server/services/scheduler.ts`, `server/routes/portal.ts`, `server/bot/index.ts`.

### TEST-01 — P1: public quiz urinishlari himoyasi

**Dalil:** `server/routes/quiz.ts:225` va attempts endpointlari.

- Start’da public/active qayta tekshirilmaydi.
- studentId mijozdan olinadi.
- Savol shu urinish testiga tegishliligi tekshirilmaydi.
- Urinish egasini tasdiqlovchi alohida sessiya tokeni yo‘q.
- Yakunlangan urinish javobini o‘zgartirish cheklovi yo‘q.
- Server vaqt chegarasi qat’iy bajarilmaydi.
- Finish qayta chaqirilsa takror Assessment yaratilishi mumkin.
- Javob saqlashda to‘g‘rilik va ball qaytishi variantlarni sinab topishga yordam beradi.

**Talab:** urinish sessiyasi, server deadline, savol–test–urinish bog‘liqligi, bir martalik yakunlash va javob kalitini ko‘rsatish siyosati.

### TEST-02 — P1: javobsiz savol bilan yakunlash xatosi

**Dalil:** `server/routes/tests.ts:297`, `server/services/gradingService.ts`.

Baholovchi barcha savollar uchun natija beradi. Router har savol uchun mavjud Answer’ni topib `.id`ni oladi; javobsiz savolda obyekt yo‘q bo‘ladi.

**Talab:** javobsiz savol normal 0 ball bo‘lsin; yakunlash 500 bilan to‘xtamasin. Javob yozuvini yaratish yoki mavjud emasligini boshqarish izchil amalga oshirilsin.

## 6. Ma’lumotlar, backup va ishlash tezligi

### DATA-01 — o‘chirish siyosati aralash

Bulk ayrim obyektlarda deletedAt qo‘yadi, generic DELETE jismoniy o‘chiradi. Ayrim ro‘yxatlar deletedAt bilan filtrlanmagan. Natijada arxiv qayta ko‘rinishi yoki cascade orqali tarix yo‘qolishi mumkin.

**Talab:** obyekt turi bo‘yicha archive/delete/restore siyosati. Tarixiy moliya va davomatni oddiy CRUD o‘chirmasin.

### DATA-02 — filial to‘liq izolyatsiya chegarasi emas

branchId ayrim modellarda bor, lekin barcha so‘rov, permission va obyektlarga izchil qo‘llanmagan. Transfer ko‘pincha faqat maydonni o‘zgartiradi.

**Talab:** transfer enrollment, dars, tarif, mas’ul va tarix bilan ishlasin. Filial scope’i API, hisobot, eksport, kesh va job’da tekshirilsin.

### DATA-03 — import biznes qoidalarini chetlab o‘tadi

**Dalil:** `server/routes/import.ts`.

Mapping’dan olingan maydonlar obyektga ko‘chiriladi va modellarga bevosita create qilinadi. Lid normalization, dedup va taqsimlash bir xil intake servisidan o‘tmaydi.

**Talab:** server whitelist, typed mapping, preview, qator xatolari, idempotent import sessiyasi va domen servislari. Qisman import siyosati aniq bo‘lsin.

### DATA-04 — backup fayli tiklanish kafolati emas

**Dalil:** `server/routes/backup.ts`, `server/routes/auth.ts` backup yo‘li.

SQLite oddiy fayl nusxasi faol yozish/WAL sharoitida izchil snapshot ekanini kafolatlamaydi.

**Talab:** bazaga mos snapshot usuli, integrity tekshiruvi, uploads bilan birga tiklash, alohida saqlash va amaliy restore mashqi. Backup borligini emas, tiklash ishlashini tekshirish kerak.

### PERF-01 — umumiy ro‘yxatlar to‘liq yuklanadi

**Dalil:** `src/hooks/useFirestore.ts`, `server/routes/crud.ts`.

Ko‘pincha barcha yozuvlar olinib brauzerda sahifalanadi; API limit majburiy emas.

**Talab:** server-side pagination/filter/search, maksimal limit, dropdown uchun tor proyeksiya va kerak bo‘lsa virtual ro‘yxat.

### PERF-02 — billing’da takroriy mayda so‘rovlar

**Dalil:** `server/services/billing.ts`.

O‘qituvchi → guruh → o‘quvchi → enrollment/davomat bo‘yicha takror hisoblar mavjud.

**Talab:** batch query, aggregatsiya, davr snapshot’i va o‘lchangan query budget. Optimallashtirishda formula o‘zgarmasin.

### PERF-03 — real-time ulanishi yetishmaydi, kanal himoyasi ham kerak

**Dalil:** `server/services/realtime.ts`, `server/index.ts`, `src/hooks/useSocket.ts`.

initRealtime aniqlangan, entrypointda chaqirilishi topilmadi. Frontend socket ishlatadi. Ulanganda subscribe kanal nomiga qarab huquq tekshirilishi ham kerak: hozir faqat nom shakli tekshiriladi.

**Talab:** avval kanal avtorizatsiyasi, keyin server/proxy ulanishi. Faqat ulab qo‘yish yetarli emas. Sessiya bekor qilinsa socket ham huquqini yo‘qotsin.

### PERF-04 — TypeScript va test poydevori

**Dalil:** `tsconfig.json`, `package.json`.

strict yoqilmagan; any va ts-ignore ishlatiladi. Avtomatik regression suite poydevori yetarli emas. Type-check 0 bo‘lsa ham business invariant buzilishi mumkin.

**Talab:** strict’ga bosqichli o‘tish, aniq API tiplari, muhim pul/ruxsat/davomat testlari va CI. Past xavfli kosmetik o‘zgarishlar uchun foydasiz testlar ko‘paytirilmasin.

## 7. Dizayn va foydalanish qulayligi

Umumiy komponent bazasini saqlab, izchil tugatish tavsiya etiladi. Bu bo‘lim vizual brauzer auditi o‘rnini bosmaydi.

### 7.1. Kodda ko‘ringan kamchiliklar

- `DataTable.tsx` saralash va qator ochishni onClick orqali bajaradi; klaviatura muqobili yetishmaydi.
- Saralash holati aria-sort bilan ifodalanmagan.
- Checkbox’larning accessible nomlari yetishmaydi.
- Ayrim row actions faqat hover’da ko‘rinadi.
- `Input.tsx` avtomatik ID’ni har renderda tasodifiy yaratadi; useId kabi barqaror yechim kerak.
- Input xatosiga aria-invalid va aria-describedby bog‘lanishi umumiy komponentda yo‘q.
- Ayrim vidjetlarda muhim matn 9–11 px.
- Global animatsiyalar uchun reduced-motion siyosati ko‘rinmadi.
- Ayrim fetch xatolari yutiladi va bo‘sh holatga o‘xshab qoladi.
- `TasksWidget.tsx` vazifalari umumiy localStorage kalitida, user bo‘yicha ajratilmagan va serverga sinxronlanmaydi.

### 7.2. Maqsadli UX

| Muammo | Kerakli tajriba |
|---|---|
| Ko‘p menyu/sahifa | Rolga mos kundalik ish maydoni |
| Keyingi qadam noaniq | Obyektning keyingi amali va mas’uli |
| Bir oqim turli sahifalarda | O‘quvchi/guruh kartasidan bog‘liq amallar |
| Error va empty o‘xshash | Loading, empty, filtered-empty, denied, error alohida |
| Mayda matn va hover | O‘qiladigan matn, klaviatura va touch amallari |
| Filtrlar yo‘qoladi | URL va saqlangan ko‘rinishlar |
| Forma yopilganda ish yo‘qoladi | Saqlanmagan o‘zgarish himoyasi |

### 7.3. O‘quvchi kartasining birinchi ekrani

Faol guruhlar, bugungi dars, hisoblangan qarzdorlik, oxirgi to‘lov, davomat signali, progress, mas’ul menejer va keyingi vazifa ko‘rinsin. Har bir raqamdan tafsilotga o‘tish mumkin bo‘lsin.

### 7.4. Dizaynni qabul qilish

- Asosiy oqimlar faqat klaviaturada ishlaydi.
- Focus ko‘rinadi va modal yopilganda joyiga qaytadi.
- Har bir input nomi va xatosi yordamchi texnologiyaga bog‘langan.
- Mobil ekranda jadval/amallar yo‘qolmaydi.
- Muhim holat faqat rang bilan ifodalanmaydi.
- Xato bo‘lsa foydalanuvchi ma’lumot yo‘q deb o‘ylamaydi.
- Matnlar o‘zbekcha, atamalar va pul/sana formatlari bir xil.

## 8. Ideal operatsion tizim konsepsiyasi

Asosiy oqim:

**Ariza → aloqa → diagnostika/sinov darsi → shartnoma → guruhga qabul → darslar → davomat va o‘zlashtirish → hisob-kitob → ota-ona bilan aloqa → natija → davom ettirish yoki bitirish.**

Har bosqichda:

- Aniq holat.
- Mas’ul.
- Kirish va chiqish sharti.
- Keyingi amal.
- Muddat.
- Audit.
- Moliyaviy va akademik oqibatlar.

Misol: muzlatish oddiy status update bo‘lmasin. Davr, tasdiq, billing ta’siri, darslar, qaytish sanasi va ota-ona bildirishnomasi bir jarayon sifatida boshqarilsin.

## 9. O‘quvchi va oila boshqaruvi

Mavjud kartani quyidagilar bilan kengaytirish:

- Bir oilada bir nechta farzand.
- Bir o‘quvchiga bir nechta vakil va ularning ko‘rish huquqlari.
- Tasdiqlangan telefonlar va aloqa afzalliklari.
- Bir nechta guruh, har biri uchun tarif va a’zolik davri.
- Diagnostika va sinov darsi natijasi.
- Qabul, muzlatish, qaytish, transfer, bitirish va chiqib ketish tarixi.
- Chiqib ketish sababi va qaytarish vazifasi.
- Shartnoma va zarur rozilik hujjatlari.
- Ta’lim, to‘lov va aloqa uchun yagona timeline.

**Qabul mezonlari:** guruhdan chiqish oldingi tarixni yo‘qotmaydi; ota-ona ruxsatli farzandlarni tanlaydi; telefon o‘zgarishi eski kirishni nazoratsiz qoldirmaydi; dublikat merge preview va audit bilan bajariladi.

## 10. Dars jadvali va ta’lim operatsiyalari

Asosiy yangi tushuncha — **LessonSession: aniq sanada o‘tiladigan alohida dars**. Haftalik qoida bilan o‘tilgan dars tarixi ajratilsin.

Sessiya maydonlari:

- Guruh, ustoz, xona.
- Boshlanish/tugash.
- Rejalashtirilgan, o‘tilgan, bekor qilingan, ko‘chirilgan holat.
- Asosiy/o‘rinbosar ustoz.
- Mavzu, uy vazifasi, material.
- Davomat.
- Billing/ustoz haqiga ta’sir.
- Istisno sababi.

Imkoniyatlar:

- Xona va ustoz vaqt to‘qnashuvini bloklash.
- Guruh sig‘imi va kutish ro‘yxati.
- Bayram/ta’til kalendari.
- Qoldirilgan darsni qoplash.
- Bir martalik jadval istisnosi.
- O‘zgarishda manfaatdor tomonlarga bildirishnoma.
- Bir kunda bir nechta dars.
- Davomat kiritish muddati va kech tuzatish tasdig‘i.

**Qabul mezoni:** kelajak jadvali o‘zgarishi o‘tilgan dars tarixini qayta yozmaydi.

## 11. Moliya tizimini rivojlantirish

Tamoyil: **har bir summa nimadan kelgani tushuntiriladi**.

Imkoniyatlar:

- Davr uchun hisoblangan to‘lov.
- Bitta to‘lovni bir nechta invoice’ga taqsimlash.
- Qisman to‘lov va avans.
- Oilaviy to‘lovni farzandlarga taqsimlash.
- Refund, reversal va adjustment.
- Tasdiqlangan chegirma.
- Kassa ochish/yopish va kassir tushumi.
- Haqiqiy naqd sanoq bilan tizim qoldig‘ini solishtirish.
- Oy yopish va keyingi tuzatish.
- Provider hisoboti bilan reconciliation.
- Qarzdorlik yoshi: 1–7, 8–30, 31–60, 60+ kun.
- To‘lov va’dasi va keyingi aloqa sanasi.

Ma’lumot talablari:

- Pul uchun butun so‘m yoki kichik birlikdagi butun son siyosati aniq tanlansin.
- Float’dan o‘tish yaxlitlash va mavjud summalarni solishtirish bilan bajarilsin.
- Payment provider/kassa identifikatoriga ega bo‘lsin.
- Posting’lar FK bilan bog‘lansin.
- Balans hisobdan hosil bo‘lsin yoki tekshiriladigan cache bo‘lsin.
- Hisoblangan daromad, haqiqiy tushum va qarzdorlik ajratilsin.

Ustoz maoshining bazasi biznes qarori: hisoblangan o‘quvchi to‘lovi, haqiqiy tushum yoki o‘tilgan dars. AI amaldagi formulani o‘zicha almashtirmasin.

## 12. Ta’lim sifati va o‘zlashtirish

Mavjud Test, Quiz, Assessment va progress’ni yagona akademik modelga yaqinlashtirish:

- Kurs → bosqich → modul → mavzu → o‘rganish natijasi.
- Kirish diagnostikasi va boshlang‘ich daraja.
- Mavzu bo‘yicha o‘zlashtirish.
- Uy vazifasi topshirish/tekshirish.
- Rubrika va qayta topshirish qoidasi.
- Savollar banki, versiya, qiyinlik va mavzu yorliqlari.
- Savollarni aralashtirish.
- Natijaga e’tiroz va qayta ko‘rib chiqish.
- Bir xil shkaladagi progress.
- Individual rivojlanish rejasi.

Ustoz samaradorligi faqat o‘rtacha bahoga tayanmasin: boshlang‘ich daraja, o‘sish, guruh hajmi va retention hisobga olinsin.

## 13. Marketing va sotuv

Marketing mavjud va rivojlangan; uni takror qurmasdan quyidagilar bilan tugatish:

- Sinov darsini bron qilish.
- Kelmagan lidni qayta ishlash.
- Maslahat/diagnostika uchrashuvi.
- Kanal bo‘yicha javob tezligi.
- Takror ariza va dublikat boshqaruvi.
- Birinchi/oxirgi manba attribution’i.
- Qayta faollashtirish kampaniyasi.
- Tavsiya orqali kelgan mijozlar.
- Lid → birinchi to‘lov → 30/90 kun retention tahlili.
- Taqsimlashda yuklama, ish vaqti va ta’tilni hisoblash.
- Import lidlarini yagona intake’dan o‘tkazish.

Asosiy KPI: faqat lid soni emas, qancha lid haqiqiy va davomli o‘quvchiga aylanganligi.

## 14. Ota-ona portali va kommunikatsiya

Portal imkoniyatlari:

- Farzand tanlash.
- Keyingi dars va jadval o‘zgarishi.
- To‘lov nimadan hisoblanganini ko‘rsatish.
- Invoice bo‘yicha to‘lash.
- Davomat sababini yuborish.
- Uy vazifasi va ustoz fikri.
- Progress va oylik natija.
- Hujjatlar.
- Murojaat holati.
- Davom ettirish/muzlatish so‘rovi.

Kommunikatsiya:

- Birlashtirilgan inbox va mas’ulga biriktirish.
- Yangi / ko‘rilmoqda / javob kutmoqda / hal qilindi holatlari.
- Javob SLA’i.
- Ichki eslatma va tashqi xabarni ajratish.
- Shablonlar va yetkazilish holati.
- Takror yuborishni cheklash.
- Aloqa afzalliklari.
- Noto‘g‘ri adresatga yuborishdan himoya.

Moliyaviy/shaxsiy ma’lumot auditoriyasini server aniqlasin. Xabar yuborish alohida ruxsat va amaldagi foydalanuvchi vakolati bilan bajarilsin.

## 15. HR va kundalik vazifalar

User va StaffMember telefon/Telegram orqali taxminiy bog‘lanish o‘rniga aniq aloqa olsin.

Imkoniyatlar:

- Ish davri va shartnoma.
- Filial/lavozim tarixi.
- Ish grafigi va o‘rinbosarlik.
- Ta’til tasdiqlash zanjiri.
- Davomat tuzatish so‘rovi.
- Maosh hisoblash/tasdiqlash.
- Bonus/jarima asosi.
- Ishdan chiqishda kirishni bekor qilish.
- Vazifalarni boshqa xodimga topshirish.

Dashboard vazifalari umumiy server Task modeliga o‘tsin: mas’ul, muddat, holat, ustuvorlik, bog‘liq obyekt, takrorlanish, izoh va tarix.

**Qabul mezoni:** bir kompyuterda boshqa hisobga kirilganda oldingi shaxsning vazifalari ko‘rinmaydi; vazifa qurilmalar orasida sinxronlanadi.

## 16. Rahbar paneli va analitika

Panel javob beradigan savollar:

- Bugun qaysi masalaga aralashish kerak?
- Qaysi guruh zarar bilan ishlayapti?
- Kim chiqib ketish xavfida?
- Qaysi menejer ortda qolgan?
- Qayerda davomat belgilanmagan?
- Qaysi to‘lov moslashmagan?
- Qaysi filialda joy bor?
- Keyingi oy pul oqimida qanday xavf bor?

Har KPI uchun pasport:

| Maydon | Mazmun |
|---|---|
| Nomi | Masalan, faol o‘quvchi |
| Ta’rif | Hisobot sanasida faol enrollment’i mavjud o‘quvchi |
| Davr | Aniq sana yoki interval |
| Istisnolar | Arxiv, muzlatilgan, sinovdagi holatlar siyosati |
| Manba | Jadval va hisoblovchi servis |
| Yangilanish | Hisobning yangilanish vaqti |
| Tafsilot | Raqamni hosil qilgan yozuvlar |

Hozirgi AI bashoratlarning ayrimlari qoidaviy ball. `riskScore: 70` kalibrlangan “70% chiqib ketish ehtimoli” degani emas. Nomi, tushuntirish va ishonch chegarasi to‘g‘ri ko‘rsatilsin.

## 17. AI imkoniyatlari

Poydevor tuzalgandan keyin:

- Tabiiy tildagi tahliliy savollar.
- O‘quvchi kartasi xulosasi.
- Menejerga keyingi aloqa tavsiyasi.
- Ota-onaga xabar qoralamasi.
- Dars/uy vazifasi qoralamasi.
- Savol yaratish va sifatsiz savolni aniqlash.
- Haftalik rahbar xulosasi.
- Hisobdagi noodatiy farqlarni aniqlash.
- Ichki yo‘riqnoma yordamchisi.

Majburiy chegaralar:

- AI faqat joriy foydalanuvchiga ruxsat etilgan ma’lumotni oladi.
- Parol/token/biometrika va keraksiz shaxsiy ma’lumot yuborilmaydi.
- Xulosa manba yozuvlari bilan tekshiriladi.
- Pul, ruxsat va broadcast amallari inson tasdig‘idan o‘tadi.
- Xarajat/token/vaqt/so‘rov limitlari mavjud.
- AI ishlamasa asosiy CRM davom etadi.

## 18. Texnik arxitektura

Hozirgi loyiha uchun aniq domenlarga ajratilgan monolit tavsiya qilinadi. Ko‘p microservice’ga darhol ajratish asoslanmagan operatsion yuk bo‘lishi mumkin.

| Domen | Mas’uliyat |
|---|---|
| Identity & Access | Hisob, rol, permission, sessiya, scope |
| Admissions | Lid, diagnostika, sinov, qabul |
| Academic | Kurs, guruh, enrollment, dars, davomat, baholash |
| Billing | Tarif, hisoblash, invoice, payment, reversal |
| People | Xodim, ish davri, jadval, ta’til, maosh |
| Communications | Suhbat, xabar, shablon, yetkazish |
| Operations | Vazifa, tasdiq, filial, xona, resurs |
| Reporting | Yagona ta’rifli agregatsiya |
| Integrations | Telegram, to‘lov providerlari, AI |

Qoidalar:

- Biznes mantiqi React komponentlari va turli routerlarga tarqalmasin.
- Barcha to‘lov manbalari bitta domen servisini ishlatsin.
- Request/response sxemalari aniq bo‘lsin.
- Muhim noma’lum maydon jim tashlanmasin; validatsiya xatosi qaytsin.
- API shartnomasidan frontend tiplari hosil qilinsin.
- Bir xil xato formati va request ID.
- Idempotency kalitlari.
- Parallel tahrir uchun versiya nazorati.
- DB tranzaksiyasi bilan hodisani saqlovchi outbox.
- Job/xabar uchun retry, backoff, dedup va xatolar navbati.

## 19. Ma’lumot obyektlari bo‘yicha taklif

Quyidagilar tayyor migratsiya emas; joriy modellarga nisbatan qayta loyihalanadigan takliflar.

| Obyekt | Maqsad |
|---|---|
| Guardian, StudentGuardian | Bir nechta vakil va farzand |
| Enrollment davri/tarixi | Qabul, transfer, chiqish |
| LessonSession | Aniq dars |
| ScheduleException | Bayram, ko‘chirish, bekor qilish |
| TariffVersion / EnrollmentPrice | Tarixiy narx |
| BillingPeriod / BillingSnapshot | Yopilgan oy hisobi |
| PaymentAllocation | To‘lovni invoice/o‘quvchiga taqsimlash |
| LedgerEntry / Reversal | Izchil moliyaviy tarix |
| CashSession | Kassa ochish/yopish |
| ApprovalRequest | Refund, chegirma, davomat tuzatish |
| Session | Token boshqaruvi va bekor qilish |
| UserBranch / StaffUser link | Filial va xodim identifikatsiyasi |
| OutboxEvent / DeliveryAttempt | Ishonchli integratsiya |
| ConsentRecord | Rozilik va uning versiyasi |

Mustaqil markazlarga SaaS sifatida berilsa Organization/Tenant kerak. Filial va tenant boshqa tushunchalar. Izolyatsiya jadval, fayl, kesh, job, socket, hisobot va eksportda bajarilishi kerak. Hozir tizim bunday izolyatsiyaga tayyor deb bo‘lmaydi.

## 20. Bosqichma-bosqich bajarish rejasi

Muddatlar jamoa quvvati, production ma’lumoti va biznes qarorlari aniqlangandan keyin baholansin. Quyidagi ketma-ketlik bog‘liqliklarga asoslangan.

| Bosqich | Ish | Chiqish mezoni |
|---|---|---|
| 0 | Auditni joriy kodda qayta tasdiqlash | Dalil, mas’ul, holat va test ssenariysi |
| 1 | Telegram, SUPER_ADMIN, login, maxsus route himoyasi | P0 yopilgan |
| 2 | Barcha endpoint permission/scope’i | Rol–amal–obyekt matritsasi testdan o‘tgan |
| 3 | To‘lov/balans yaxlitligi | Parallel/retry/error’da bitta izchil hisob |
| 4 | Enrollment tarixi, sessiya, tarif | Tarix bugungi o‘zgarishdan buzilmaydi |
| 5 | Yagona hisobot manbasi | Bir davr raqamlari barcha ekranlarda mos |
| 6 | O‘quvchi/oila/menejer/ustoz oqimlari | Kundalik jarayonlar uzluksiz |
| 7 | Dizayn, accessibility, tezlik | Mobil/klaviatura/katta ro‘yxat tekshiruvlari o‘tgan |
| 8 | Avtomatlashtirish/integratsiyalar | Takror yuborish yo‘q, xatodan tiklanadi |
| 9 | Kengaytirilgan AI/SaaS | Permission va izolyatsiya talablari bajarilgan |

### 20.1. Birinchi ish paketlari

1. Telegram webhook va account bog‘lash himoyasi — SEC-01, SEC-02, SEC-05.
2. SUPER_ADMIN nishon himoyasi va sessiya — SEC-03, SEC-07.
3. Student/enrollment/salary/analytics scope — SEC-04.
4. Generic DELETE va alternativ yo‘llar — SEC-06.
5. Upload, audit, dependency — SEC-08, SEC-10, SEC-11, SEC-12.
6. Face ID siyosati — SEC-09.
7. Yagona payment posting — FIN-01, FIN-06.
8. Callback atomarligi — FIN-02; 7-paketga bog‘liq.
9. Invoice holati/reversal — FIN-03; 7-paketga bog‘liq.
10. Quiz va test xavfsizligi — TEST-01, TEST-02.
11. Davomat va tarixiy model — EDU-01…EDU-08, FIN-04.
12. Hisobot, backup va performance — FIN-05, DATA/PERF topilmalari.

Backup va yuqori xavfli ma’lumot himoyasi schema o‘zgarishidan oldin tugatilishi shart; paket raqami xavfsizlik bog‘liqligini bekor qilmaydi.

### 20.2. Har ish paketi shabloni

```text
ID va nom:
Bog‘liq audit topilmalari:
Holati: tasdiqlanmagan / tasdiqlangan / tuzatilgan / qayta test kerak
Muammo va dalil:
Foydalanuvchi uchun maqsadli xatti-harakat:
Scope va scope’dan tashqari ishlar:
Oldingi bog‘liqliklar:
Fayl egaligi va mas’ul agent:
O‘zgaradigan fayllar:
API shartnomasi:
DB va tarixiy ma’lumot ta’siri:
Permission va obyekt scope’i:
Idempotency/parallel so‘rov siyosati:
Xato va tiklanish holatlari:
UI holatlari:
Qabul testlari:
Rollout/rollback:
Bajarilgan tekshiruv dalillari:
Qolgan cheklovlar:
```

## 21. Majburiy tekshiruv ssenariylari

| Yo‘nalish | Ssenariy |
|---|---|
| Ruxsat | O‘qituvchi boshqa guruh o‘quvchisini o‘qiy olmaydi |
| Ruxsat | O‘qituvchi boshqa guruhga enrollment yarata olmaydi |
| Ruxsat | ADMIN SUPER_ADMIN parolini almashtira olmaydi |
| Ruxsat | Bulk/import/alias oddiy endpoint siyosatini chetlab o‘tmaydi |
| Telegram | Secret’siz webhook hech narsani o‘zgartirmaydi |
| Telegram | Boshqa odam kontakti hisobni bog‘lamaydi |
| To‘lov | Bir callback 10 marta kelganda bir marta hisoblanadi |
| To‘lov | Ikki parallel to‘lov summasi yo‘qolmaydi |
| To‘lov | O‘rtadagi DB xatosida qisman natija qolmaydi |
| Invoice | Status aylantirish takror kredit bermaydi |
| Billing | Narx o‘zgarishi yopilgan oyga ta’sir qilmaydi |
| Billing | Guruhdan chiqish oldingi qarzdorlikni o‘chirmaydi |
| Davomat | A’zo bo‘lmagan o‘quvchi rad etiladi |
| Davomat | Bir kunda ikki dars alohida saqlanadi |
| Test | Javobsiz savol bilan yakunlash ishlaydi |
| Quiz | Yakunlangan urinish o‘zgartirilmaydi |
| Quiz | Boshqa test savoli javobga qo‘shilmaydi |
| Hisobot | Turli yillarning bir xil oylari aralashmaydi |
| O‘chirish | Arxiv tarixiy moliya/davomatni saqlaydi |
| Backup | Nusxadan izolyatsiyalangan muhitga tiklash ishlaydi |
| Socket | Boshqa foydalanuvchi kanaliga ruxsatsiz qo‘shilib bo‘lmaydi |
| UI | Asosiy oqimlar mobil va klaviaturada ishlaydi |

Test muhitida Telegram va payment adapterlari soxta xizmatlarga yo‘naltirilsin. Haqiqiy mijozga xabar yoki haqiqiy pul operatsiyasi chiqmasin. Real ma’lumotdan foydalanish zarur bo‘lsa, ruxsat va maxfiylik siyosatiga muvofiq anonimlashtirilgan nusxa ishlatilsin.

## 22. Productionga xavfsiz o‘tish

Lokal PostgreSQL va production SQLite farqi repository hujjatlarida ongli ravishda saqlangan. Uni o‘zicha birlashtirish taqiqlanadi.

Har schema o‘zgarishida:

1. Ikkala muhit mosligini tekshirish.
2. Avval qo‘shimcha jadval yoki nullable ustun.
3. Alohida, qayta bajarilganda zarar bermaydigan backfill.
4. Eski/yangi hisoblarni yonma-yon solishtirish.
5. Farqlar hal bo‘lmaguncha yangi manbaga to‘liq o‘tmaslik.
6. Backup’ni amalda tiklab ko‘rish.
7. Rollback yo‘lini tekshirish.
8. Eski ustun/jadvalni alohida qarorsiz o‘chirmaslik.

Repository qoidalari:

- `prisma migrate` ishlatilmaydi.
- Production ma’lumot yo‘qotishiga yo‘l qo‘yilmaydi.
- Schema va yuqori xavfli fayllar egaligi koordinatsiya hujjati bilan belgilanadi.
- Codex uchun SSH, deploy.sh va productionga tegish amaldagi vakolatda yo‘q.
- Production ishlarini vakolatli Claude yoki foydalanuvchi bajaradi.
- Ushbu audit yangi deploy ruxsati emas.

## 23. Biznes qarorlari va umumiy qabul mezonlari

### 23.1. AI taxmin qilmasligi kerak bo‘lgan qarorlar

1. Ustoz maoshi hisoblangan due, haqiqiy tushum yoki darsga bog‘liqmi?
2. Muzlatish, oy o‘rtasida qabul va chiqishda proration qoidasi qanday?
3. Excused/late/cancelled/makeup dars billing’da qanday ishlaydi?
4. Chegirma va refundni kim, qaysi limitgacha tasdiqlaydi?
5. Pul birliklari va yaxlitlash tartibi qanday?
6. Oila to‘lovi farzandlarga qanday taqsimlanadi?
7. Qaysi vakil qaysi farzand ma’lumotini ko‘radi?
8. Filiallar orasida qanday ma’lumot almashiladi?
9. Bu bitta tashkilot uchunmi yoki mustaqil markazlar SaaS’imi?
10. Backup uchun maqbul yo‘qotish oralig‘i va tiklash muddati qanday?

Amaldagi siyosatni saqlash mumkin bo‘lsa, saqlansin. Qaror talab qiladigan joy aniq qayd etilsin; biznes qoidasi jim almashtirilmasin.

### 23.2. “Tayyor” mezoni

- Muammo joriy kodda qayta tasdiqlangan.
- Tuzatish minimal, tushunarli va boshqa agent ishidan ajratilgan.
- Permission barcha alternativ kirish yo‘llarida ishlaydi.
- Pul/tarix qoidalari retry va concurrency’da buzilmaydi.
- TypeScript 0 xato.
- Tegishli avtomatlashtirilgan testlar o‘tgan.
- UI o‘zgarishi brauzerda tekshirilgan.
- Maxfiy ma’lumot response, audit, log yoki frontendga chiqmaydi.
- Eski ma’lumotga moslik va rollback hujjatlashtirilgan.
- Nimalar tekshirilmagani ochiq yozilgan.
- Productionga chiqish alohida vakolat va jarayon bilan bajariladi.

## 24. AI uchun to‘liq asosiy topshiriq

```text
Tayyorlov Markazi CRM’ni ishonchli o‘quv markaz operatsion
tizimiga bosqichma-bosqich rivojlantir.

Ushbu audit — tekshiriladigan topilmalar va rivojlantirish backlog’i.
Undagi topilmalarni joriy kodda qayta tasdiqla: auditdan keyin boshqa
agent o‘zgartirgan bo‘lishi mumkin.

Avval AGENTS.md va docs/AGENT_COORDINATION.md’ni o‘qi.
Amaldagi fayl egaligi, worktree, branch va deploy vakolatlariga rioya qil.
Boshqa agentning tugallanmagan ishini bosib yozma.
Bu hujjatning o‘zi kodlash, xabar yuborish yoki deploy uchun yangi
ruxsat emas; joriy foydalanuvchi topshirig‘i doirasida bajar.

Asosiy maqsadlar:
1. P0 xavfsizlik muammolarini yopish.
2. Har bir API’da amal huquqi va obyekt ko‘lamini tekshirish.
3. Barcha payment manbalarini yagona atomar hisobga o‘tkazish.
4. Tarixiy enrollment, tarif va billing natijalarini saqlash.
5. Dars sessiyasini ta’lim jarayonining asosiy obyektiga aylantirish.
6. O‘quvchi, oila, ustoz, menejer va rahbar oqimlarini bog‘lash.
7. UX, accessibility va katta ma’lumotdagi ishlashni yaxshilash.
8. Shundan keyin avtomatlashtirish va AI’ni kengaytirish.

Birinchi bosqich:
- Ochiq Telegram set-webhook endpointini himoyalash.
- Har ikki webhook manbasini tekshirish.
- Telegram kontaktining yuboruvchiga tegishliligini tekshirish.
- Mavjud SUPER_ADMIN hisobini pastroq rol tahriridan himoyalash.
- Student/enrollment/salary/analytics maxsus yo‘llarini tekshirish.
- Generic DELETE va alternativ davomat yozish yo‘llarini yopish.
- Login, sessiya va parol siyosatini mustahkamlash.
- Upload, audit va xlsx xavflarini bartaraf etish.
- Face ID bypass va profil almashtirishni server siyosatiga o‘tkazish.

Ikkinchi bosqich:
- Yagona server-side payment posting servisi.
- Idempotency va parallel so‘rov himoyasi.
- Payment, ledger, balance, invoice va auditni izchil bog‘lash.
- Refund va reversal.
- Provider holat mashinasi va reconciliation.
- Brauzerdagi balans hisoblashni chiqarish.
- Invoice status o‘tishlarini qat’iy belgilash.

Uchinchi bosqich:
- Enrollment davri va tarixini qo‘shish.
- LessonSession va jadval istisnolari.
- Tarif/billing qoidalarining amal qilish sanasi.
- Yopilgan davr snapshot’i.
- Davomat va hisobotlar uchun yagona manba.
- Quiz urinish xavfsizligi va test baholash buglarini tuzatish.

Keyingi bosqichlar:
- Oila va ko‘p farzandli portal.
- Yagona aloqa inbox’i va SLA.
- HR–User bog‘lanishi va vazifalar.
- Rolga mos ish maydonlari.
- KPI ta’riflari va izchil analitika.
- Ishonchli job/outbox/notification yetkazish.
- Permission bilan cheklangan AI yordamchi.
- Faqat biznes ehtiyoji tasdiqlansa tenant izolyatsiyasi.

Har ish paketi uchun yoz:
- Muammo va dalil.
- Maqsadli xatti-harakat.
- O‘zgaradigan fayllar va ularning egaligi.
- API va DB ta’siri.
- Permission/scope qoidasi.
- Xato, retry va parallel so‘rov holatlari.
- Tarixiy ma’lumot bilan moslik.
- Qabul testlari.
- Rollout va rollback.
- Qolgan cheklovlar.

Texnik talablar:
- UI va commit matnlari o‘zbekcha.
- Biznes qoidalari frontendda saqlanmasin.
- Muhim input maydonlari jim tashlab yuborilmasin.
- Pul uchun aniq birlik va yaxlitlash qoidasi bo‘lsin.
- Moliyaviy tarix jismoniy o‘chirilmasin.
- Ruxsatlar menyu, API, eksport, socket va job’da mos ishlasin.
- Eski qiymatni o‘qib yangi balans yozishdan foydalanma.
- Unknown, error, empty va permission-denied holatlarini ajrat.
- Muhim operatsiyalar auditlansin; maxfiy maydonlar maskalansin.
- Testlar haqiqiy Telegram/to‘lov xizmatlariga chiqmasin.
- Har o‘zgarishdan so‘ng TypeScript 0 xato.
- Foydalanuvchi ko‘radigan oqim brauzerda tekshirilsin.
- Pul va ruxsat o‘zgarishlari avtomatlashtirilgan testdan o‘tsin.
- PostgreSQL va SQLite mosligi alohida hisobga olinsin.
- Productionda destruktiv schema o‘zgarishi qilinmasin.
- prisma migrate ishlatilmasin; repository qoidalariga amal qil.
- Bitta katta qayta yozish o‘rniga kichik paketlar tayyorla.

Barcha g‘oyalarni birdan kodlashga kirishma. Avval poydevorni tugat,
keyin unga bog‘liq imkoniyatlarni joriy et. Biznes qarori kerak joyda
amaldagi qoidani saqla va qaror nuqtasini aniq ko‘rsat.

Hisobotda tasdiqlangan, tuzatilgan va tekshirilmagan holatlarni ajrat.
Amalda ishlatmagan test, brauzer yoki production tekshiruvini
muvaffaqiyatli o‘tdi deb ko‘rsatma.
```

## 25. Rasmiy manbalar

Auditda tashqi texnik tasdiq uchun quyidagi rasmiy manbalar ko‘rildi. Repository kodi tashqi saytga yuborilmadi.

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — har bir so‘rovda ruxsat, eng kam vakolat va scope.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) — fayl tarkibi, huquqlar, joylashtirish va limitlar.
- [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook) — webhook secret sarlavhasi.
- [Telegram Bot API — Contact](https://core.telegram.org/bots/api#contact) — kontakt identifikatori.
- [SheetJS CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363) — ReDoS ta’sirlangan relizlari va tuzatilgan versiya.
- [SQLite Backup API](https://www.sqlite.org/backup.html) — izchil snapshot va online backup.
- [CLICK rasmiy hujjatlari](https://docs.click.uz/) — implementatsiya bosqichida provider shartnomasini qayta tekshirish uchun. Auditda barcha Prepare/Complete tafsilotlari mustaqil sertifikatsiya qilinmagan.

---

**Yakuniy maqsad:** ko‘proq sahifa emas, ishonchli kundalik operatsiya. O‘quvchi tarixi saqlansin, pul hisobini tushuntirish mumkin bo‘lsin, xodim vakolati barcha yo‘llarda bir xil ishlasin, rahbar raqamlarga ishona olsin.
