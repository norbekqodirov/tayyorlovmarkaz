# ADR: Hisob, to'lov va maosh qoidalari

| | |
|---|---|
| **Holat** | **Qabul qilingan standart** (2026-09-25). Foydalanuvchi ochiq qarorlarni tavsiya variantida bajarishni topshirgan. Rahbar va moliya mas'ulining yozma tasdig'i hali olinmagan (pastdagi imzo jadvali) |
| **Reja** | `docs/CRM_YAGONA_AUDIT_VA_RIVOJLANTIRISH_REJASI_2026-09-25.md` — G bo'limi (formulalar), L bo'limi (OQ-01…19), IP-07 |
| **Kod** | `server/domain/billingFormula.ts` — sof formulalar (bitta manba) |
| **Referens dataset** | `tests/reference/billing_scenarios.json` — 40 ssenariy, qo'lda hisoblangan; `npm test` har o'zgarishda tekshiradi (`tests/unit/referenceDataset.test.ts`) |

## 1. Kontekst

Hozirgi tizim oylik to'lovni har doim to'liq oy deb hisoblaydi va a'zolik sanasini bilmaydi. U qarzni bitta `Student.balance` raqamida saqlaydi, ustoz maoshini esa ustoz yoki foiz tarixisiz hisoblaydi. Bosqich 2 (IP-09…IP-17) hisob yadrosini qayta quradi. Shu ish boshlanishidan oldin hamma "qanday hisoblanadi" savollari yozma javobga ega bo'lishi kerak. Aks holda formulalar kod ichida yashirin taxmin bo'lib qoladi.

## 2. Tasdiqlangan qoidalar (foydalanuvchi, o'zgarmaydi)

| ID | Qoida | Ssenariylar |
|---|---|---|
| TQ-A | Oy o'rtasida qo'shilgan o'quvchi birinchi oy uchun qo'shilgan sanadan qolgan rejadagi darslar bo'yicha to'laydi | RS-01, RS-22 |
| TQ-B | Ustozning foizli maoshi o'quvchiga **hisoblangan** summadan olinadi. O'quvchi to'lagan-to'lamagani ahamiyatsiz | RS-01, RS-02, RS-11, RS-36 |
| TQ-C | Har guruh alohida yuritiladi: sana, tarif, hisob, chegirma, to'lov, qarz, davomat va maosh | RS-10, RS-11 |
| TQ-D | To'lov o'quvchi qidirilib aniq tanlangach kiritiladi va guruh hamda xizmat davri hisobiga biriktiriladi | RS-10, RS-40 |
| TQ-E | Boshqa kirimlar qarzga, kurs tushumiga va maoshga ta'sir qilmaydi | (IP-12 integratsiya testlari) |
| TQ-F | Hisoblangan maosh, berilgan maosh, avans, o'quvchi qarzi va kassa — alohida tushunchalar | RS-34, RS-35, RS-37 |

## 3. Formula (qisqa)

Bitta a'zolik davri va bitta oy uchun:

```text
Baza        = P                               (to'liq oy)
            = round(P × min(R, N) / N)        (qisman oy)
Yalpi       = Baza + Σ qo'shimcha pullik darslar
Davomat_ch  = A ≥ M va A > 0 bo'lsa round(P × A / N), Bazadan oshmaydi
Tuzatmalar  = bekor qilingan dars krediti, qo'lda tuzatma
UstozBazasi = Yalpi − Davomat_ch − Tuzatmalar
Net         = max(0, UstozBazasi − foizli marketing chegirmalari − qat'iy marketing chegirmalari)
Maosh(u)    = round(UstozBazasi × ulush(u) × foiz(u))       ulush — o'tilgan darslar, eng katta qoldiq usuli
Qarz(hisob) = Net − Σ taqsimotlar ≥ 0
Avans       = Σ to'lovlar − Σ taqsimotlar − Σ qaytarishlar ≥ 0
Balans (kesh) = Avans − Σ Qarz
```

Pul butun so'mda hisoblanadi, yaxlitlash 0,5 dan yuqoriga. Foiz basis point'da saqlanadi (40% = 4000).

## 4. Qarorlar

"Sozlama" ustuni qaror qayerda o'zgartirilishini ko'rsatadi. Sozlama kalitlari Bosqich 2'da `Setting` jadvaliga (yoki tarif versiyasiga) qo'shiladi. Ungacha standart qiymat kodda.

| ID | Qaror | Asos | Sozlama (standart) | Ssenariylar | Paket |
|---|---|---|---|---|---|
| **OQ-01** | Maxraj N — tarifdagi paket darslar soni. To'liq oyda P, qisman oyda `P × min(R,N)/N` | Foydalanuvchi misoliga (600 000 / 12 dars) va hozirgi `monthly_lessons_count` ga mos keladi. Dars narxi har oy bir xil qoladi | `TariffVersion.lessonsPerPackage` (12; hozircha `monthly_lessons_count`) | RS-01, RS-03, RS-05 | IP-11 |
| **OQ-02** | Qo'shilgan kuni dars bo'lsa, o'sha dars hisobga kiradi. Administrator darsdan keyin qo'shsa, sanani ertangi kunga qo'yadi. Preview qaysi darsdan hisob boshlanishini ko'rsatadi | Bitta aniq qoida, preview orqali ko'rinadi | `billing_count_join_day_lesson` (true) | RS-22 | IP-09 |
| **OQ-03** | **Ko'chirilgan dars** — o'sha dars, ikki marta hisoblanmaydi. **Bayram** — qisman oyda R'dan chiqariladi, to'liq oyda P o'zgarmaydi. **Markaz bekor qilgan va qoplanmagan dars** — P/N miqdorida kredit (`cancel_credit`); ustoz bazasi ham kamayadi, chunki dars o'tilmagan. **Qoplash darsi** billable emas. **Pullik qo'shimcha dars** — alohida `extra_lesson` qatori, ustoz bazasiga kiradi | Paket narxining barqarorligi saqlanadi, markaz aybi bilan o'tmagan darsga adolatli kompensatsiya beriladi | Qo'shimcha dars narxi — tarifda | RS-04, RS-17, RS-18 | IP-10, IP-11 |
| **OQ-04** | Chegirma faqat `absent` uchun, `A ≥ M` bo'lganda. M qisman oyda ham o'zgarmaydi. `excused` chegirma bermaydi, lekin ro'yxatda alohida ko'rinadi | Hozirgi ishlayotgan qoida (RF-01) saqlanadi — daromadga kutilmagan ta'sir bo'lmaydi | `absence_discount_threshold` (3, mavjud), `absence_discount_statuses` (`absent`) | RS-06…RS-09 | IP-11 |
| **OQ-05** | Tartib: baza → qo'shimcha darslar → davomat chegirmasi → tuzatmalar → foizli marketing chegirmalari (qolgan summaga) → qat'iy marketing chegirmalari → min 0. Foizli marketing chegirmasi kiritilish tartibidan qat'i nazar qat'iydan oldin qo'llanadi. **Ustoz bazasi:** davomat chegirmasi va tuzatmalar kamaytiradi; marketing chegirmalari (promo, aka-uka, ijtimoiy) kamaytirmaydi — ular markaz hisobidan | Marketing qarori ustoz daromadini kamaytirmasligi kerak. Davomat chegirmasi hozir ham bazani kamaytiradi | `marketing_discounts_reduce_teacher_base` (false) | RS-14, RS-15, RS-16, RS-19 | IP-11, IP-15 |
| **OQ-06** | Muzlatish (pauza) 7 kundan 60 kungacha, sabab bilan beriladi. Pauza darslari R'ga kirmaydi, oy qisman hisoblanadi. Joy saqlanadi (sig'imda hisoblanadi) | Administrativ yuk nazoratda, o'quvchi joyini yo'qotmaydi | `pause_min_days` (7), `pause_max_days` (60) | RS-21 | IP-09 |
| **OQ-07** | Oy o'rtasida chiqqanda joriy oy hisobi `endDate`gacha bo'lgan darslar bo'yicha qayta hisoblanadi (TQ-A ning teskarisi). Ortiqcha to'lov avansga o'tadi. Naqd qaytarish ADMIN tasdig'i bilan. Maosh bo'yicha — tuzatma | Kirish va chiqishda bir xil qoida ishlaydi | `refund_approval_min_role` (ADMIN) | RS-27, RS-37 | IP-09, IP-17 |
| **OQ-08** | Yangi hisob e'lon qilinganda avans avtomatik **shu guruh** hisobiga qo'llanadi. Boshqa guruhga o'tkazish — kassir tasdig'i bilan | "Qaysi guruhga to'ladim" chalkashligi bo'lmaydi | `credit_auto_apply_scope` (`same_group`) | RS-12, RS-38 | IP-12 |
| **OQ-09** | To'liq oyda to'lov muddati — oyning 10-sanasi. Qisman oyda — yozilgandan keyin 7 kun, **lekin 10-sanadan oldin emas** (aniqlashtirish†). Muddatdan keyin qarz qolsa — "muddati o'tgan" va eslatma | Ota-onaga yetarli muhlat beriladi, eslatmalar o'z vaqtida ketadi | `payment_due_day` (10), `payment_partial_grace_days` (7) | RS-29…RS-33 | IP-11, IP-13, IP-29 |
| **OQ-10** | Yopilgan oy hisobi o'zgarmaydi. Farq keyingi ochiq oyda tuzatma qatori sifatida o'quvchiga ham, ustozga ham tushadi va asl oyga havola qiladi. Oyni qayta ochish — faqat SUPER_ADMIN, sabab bilan | O'tgan hisobotlar o'zgarmaydi, audit izi saqlanadi | `period_reopen_min_role` (SUPER_ADMIN) | RS-26, RS-27, RS-28 | IP-21 |
| **OQ-11** | Doimiy almashishda ulush o'tilgan darslar bo'yicha. Bir martalik o'rinbosarga o'sha darsning ulushi beriladi (formula xuddi shu) | Bitta formula, jami maosh takrorlanmaydi | — | RS-13, RS-25 | IP-15 |
| **OQ-12** | Ochiq davrda va bog'liq to'lov yoki avans bo'lmasa, yozuvni o'chirish mumkin (test yoki xato yozuvlar uchun). Yopilgan davrda yoki to'lov bo'lsa — faqat qarshi yozuv (reversal). Kassa tranzaksiyasi o'chirilmaydi, "bekor qilinadi" | Foydalanuvchi so'ragan o'chirish imkoniyati saqlanadi, tarix esa yo'qolmaydi | — | (IP-17 integratsiya) | IP-17 |
| **OQ-13** | Ustoz o'quvchining ismini, o'z guruhidagi akademik ma'lumotni (davomat, baho, eslatma) va ota-ona ismini ko'radi. Telefon — faqat ota-ona chati orqali. To'lov va balansni ko'rmaydi | Maxfiylik. **Qisman joriy qilingan:** 2026-09-25 da ro'yxat va profil javoblarida balans yashirildi (RX-04) | — | (tests/api/ip06) | IP-26 |
| **OQ-14** | Bitta yuridik shaxs, bitta hisob. Filial — faqat ma'lumot filtri | Hozirgi ehtiyojga yetarli | — | — | IP-35 |
| **OQ-15** | O'tish sanasi — shadow oydan keyingi oyning 1-sanasi. Boshlang'ich qoldiqlarni moliya mas'uli tasdiqlaydi, rahbar imzolaydi | Birinchi oy ikki tizimga bo'linmaydi | — | — | IP-25 |
| **OQ-16** | Ustoz davomatni 3 kun ichida tuzatishi mumkin. Keyin administrator sabab bilan tuzatadi. Yopilgan oyda — faqat tuzatma | Maosh tasdig'idan oldin ma'lumot barqaror bo'ladi | `attendance_edit_window_days` (3) | — | IP-10 |
| **OQ-17** | Yangi davrlarda maosh faqat accrual bazasida hisoblanadi, cash bazasi yaratilmaydi. Eski yozuvlar saqlanadi. Pul butun so'mda | TQ-B | — | RS-36 | IP-15 |
| **OQ-18** | Sinov darsi bepul, billable emas va maosh bazasiga kirmaydi | Lid konversiyasiga to'siq bo'lmaydi | — | RS-20 | IP-28 |
| **OQ-19** | CRM — operatsion hisob (o'quvchi hisoblari, kassa, maosh). Rasmiy buxgalteriya va soliq — alohida tizimda. Oylik eksport beriladi | Hajm va foyda nisbati | — | — | IP-24 |

† **OQ-09 aniqlashtirish.** Rejada qisman oy uchun faqat "yozilgandan 7 kun" deyilgan. Bu holda 2-sentabrda qo'shilgan o'quvchining muddati (9-sentabr) to'liq oydagilardan (10-sentabr) erta bo'lib qolardi. Shuning uchun ikkala sanadan kechrog'i olinadi (RS-31).

## 5. Formalizatsiya paytida qabul qilingan qo'shimcha qarorlar

Bu savollar L bo'limida alohida qo'yilmagan. Dataset'ni tuzishda javob kerak bo'ldi:

1. **Qo'shimcha pullik dars ustoz bazasiga kiradi** (RS-18). Darsni ustoz o'tadi.
2. **Bekor qilingan dars krediti ustoz bazasini kamaytiradi** (RS-17). Dars o'tilmagan, shuning uchun ulush ham yo'q.
3. **Marketing chegirmasi summadan katta bo'lsa**, o'quvchi 0 to'laydi, ustoz esa bazadan to'liq ulush oladi (RS-19). Bu OQ-05 ning bevosita natijasi: grant va promo markaz hisobidan beriladi. **Rahbar e'tiboriga:** 100% grant bilan o'qiyotgan o'quvchi uchun ham markaz ustozga maosh to'laydi. Buni istamasa, `marketing_discounts_reduce_teacher_base = true` qilinadi.
4. **R = 0 bo'lsa** (faqat sinov darsi yoki butun oy pauza) hisob 0 va maosh 0. Hisob yaratilmaydi, lekin ogohlantirish chiqmaydi (RS-20).
5. **Taqsimot qat'iy tekshiriladi:** bitta taqsimot hisob qarzidan, jami taqsimotlar esa to'lovdan oshmaydi. Xato bo'lsa hech narsa yozilmaydi (RS-40).

### 5.1. IP-17 amalga oshirishda aniqlashtirilgan tafsilotlar

- **Qaytarish kassada manfiy "kirim"** ("To'lov qaytarish"), xarajat emas: shu bilan barcha tushum yig'indilari (dashboard, hisobotlar, maqsadlar) hech qanday o'zgartirishsiz sof tushumni beradi (QT-26), xarajatlar esa sun'iy oshmaydi. Kassa qoldig'i (kirim − chiqim) bir xil.
- **Qarshi yozuv** asl yozuv bilan bir xil tur va kategoriyada, manfiy summa, bugungi sana, `sourceType = 'reversal'`. Asl yozuv `voidedAt` bilan belgilanadi; qarshi yozuvni bekor qilib yoki o'chirib bo'lmaydi.
- **`Payment.status`:** to'liq qaytarilsa `refunded`; qisman qaytarilganda `paid` qoladi va qaytarilgan qism `Refund` qatorlaridan ayriladi (H.4 dagi `partially_refunded` hosila sifatida ko'rsatiladi). Sabab: mavjud "status = 'paid'" yig'indilari to'lovni butunlay yo'qotib qo'ymasligi uchun.
- **Kvitansiya void va qaytarish farqi:** void — pul umuman kelmagan (xato yozuv; taqsimotlar qaytariladi, avans qolmaydi); qaytarish — pul kelgan va qaytarildi (faqat avansdan, hisob taqsimotiga tegmaydi, QT-27).
- **Maosh:** accrual (TQ-B) to'lovga bog'liq emas — qaytarish yoki void maoshni o'zgartirmaydi. Cash asosidagi tasdiqlangan maoshga faqat "qayta ko'rib chiqing" belgisi yoziladi.

## 6. Oqibatlar

- IP-09…IP-17 shu hujjat va `billingFormula.ts` ga tayanadi. Hisob dvigateli formulani qayta yozmaydi, faqat ma'lumot yig'ib (R, A, tariflar, ustoz darslari) shu funksiyalarni chaqiradi.
- Hozirgi `server/services/billing.ts` (to'liq oy, `Group.price`) IP-11 da shu dvigatelga almashtiriladi. Ungacha ishlayotgan hisob o'zgarmaydi.
- Qarorni o'zgartirish tartibi: (1) shu hujjatni yangilash; (2) sozlamani yoki kodni o'zgartirish; (3) `billing_scenarios.json` dagi tegishli kutilgan qiymatlarni qo'lda qayta hisoblash; (4) `npm test`. Dataset o'zgarmasa va test yiqilmasa — qaror kodga yetib bormagan.

## 7. Tasdiq

| Rol | Ism | Sana | Izoh |
|---|---|---|---|
| Rahbar | | | |
| Moliya mas'uli | | | |
