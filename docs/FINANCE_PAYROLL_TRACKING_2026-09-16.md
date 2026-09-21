# Moliya va Oyliklar — kuzatuv ro'yxati (F01–F22, O01–O14, W01–W28)

**Manba hujjat:** `C:/Users/user/.codex/visualizations/2026/09/16/01a0a9e8-bc8c-7c21-be73-4c00b3a17bb3/MOLIYA_VA_OYLIKLAR_REJASI_2026-09-16.md` (audit HEAD: `6a2b00a`).
**Ushbu fayl:** amalga oshirish davomida yangilanadigan yagona kuzatuv manbasi — har paketdan keyin holat/fayl/tekshiruv ustunlari yangilanadi, hujjat o'zi qayta yozilmaydi.

Holat belgilari: ✅ bajarildi va jonli tekshirildi · 🟡 qisman/qo'lda-qaror kerak · ⬜ hali boshlanmagan.

## Ish paketlari (mening ketma-ketligim, hujjatning W01–W28/R1–R4'iga mos)

| Paket | Qamrov | Holat | Commit |
|---|---|---|---|
| **P1 — hisob ishonchliligi (asosiy)** | F01, F02, F04, F05, F06 (qisman), F12 (qisman), F13, O01, O02, O07 | ✅ | `6937e01`, `f7ce72d`, (shu partiya) |
| P2 — invoice net/allocation | F02, F03, F09-adjacent | ⬜ | — |
| **P3 — provider qattiqlashtirish** | F07, F08, F09 | ✅ | (shu partiyada) |
| **P4 — hisobot to'g'irlash (F20 bundan mustasno)** | F14, F15, F16 | ✅ | (shu partiyada) |
| P5 — chegirma/kategoriya | F17, F18 | ⬜ | — |
| P6 — byudjet | F19 | ⬜ | — |
| P7 — UX/idempotency | F21, F22 (qisman) | ⬜ | — |
| **P14 — dizayn namunasidan (oylik-ish-varaqasi.html) O05/O12** | O05, O12 | ✅ | (shu partiyada) |
| **P15 — payroll UI ishonchliligi** | O06, O09, O11 | ✅ | (shu partiyada) |
| P8 — payroll UI ishonchliligi (qolgani) | O08 | ⬜ | — |
| **P16 — dizayn namunasidan O13/O14 (tabel matritsasi, qidiruv/filtr)** | O13, O14 | ✅ | (shu partiyada) |
| **P17 — cash allocation proporsional taqsimot (O03/O04)** | O03, O04 | ✅ | (shu partiyada) |
| P9 — payroll UI kengaytirish (qolgani) | O10 | ⬜ | — |
| P10 — billing snapshot/allocation (katta) | F10, F11, W14-W20 ruhida | ⬜ | Katta — alohida reja kerak |
| **P13 — Payroll-avans + berish tartibi tizimi (2026-09-17, foydalanuvchi so'rovi)** | Yangi `StaffAdvance`, Salary qisman to'lov, `payroll_review` ruxsati | ✅ | (shu partiyada) |
| P11 — RBAC granular payroll ruxsatlari (approve/pay ajratish) | 11-bo'lim (payroll.calculate/approve/pay/...) | 🟡 | P13'da qisman bajarildi (pastga q.) |
| P12 — kassa/bank/reconciliation | W24-W26 | ⬜ | Katta — alohida reja kerak |

## F01–F22 (Moliya)

| ID | Daraja | Holat | Izoh / o'zgargan fayllar |
|---|---|---|---|
| F01 | P1 | ✅ | `/finance/transactions` POST endi income+studentId'da Payment(status=paid)ni ham atomar yaratadi, `sourceType='manual_payment'` bilan bog'langan. — `server/routes/finance.ts` |
| F02 | P1 | ✅ | Yangi `computeInvoiceNetAmount()` (amount × (1-discount%) + tax) — invoice "paid" yozish YO'LI va `payment-links` ikkalasi ham endi shundan foydalanadi. 600000+10% misolida Payment/Transaction/balance/link summasi endi 540000 (avval 600000 edi). — `server/routes/finance.ts` |
| F03 | P1 | 🟡 | Payment-link/callback'da hali invoice allocation yo'q — **tashqi to'siq**: Payme tomonida `account.invoice_id`ni qo'shish Payme merchant kabinetida qayta konfiguratsiya talab qiladi (foydalanuvchining Payme biznes hisobi kerak, men mustaqil sinay olmayman). Click tomonida `merchant_trans_id`ni invoiceId sifatida ham qabul qilish MENING nazoratimda (link generator + webhook) — bu P2'da alohida qilinadi (yangi `OnlineTransaction.invoiceId` additive schema maydoni + Click link/webhook o'zgarishi). Hozircha ikkalasi ham studentId asosida ishlayveradi (eski xatti-harakat saqlanadi, yangi zarar qo'shilmadi). |
| F04 | P1 | ✅ | Expense POST/PATCH/DELETE endi bog'langan Transaction (`sourceType='expense'`) bilan bitta `$transaction`da izchil; `createdById` endi to'ldiriladi. — `server/routes/finance.ts` |
| F05 | P1 | ✅ | Generic `PUT /:collection/:id` `transaction` modeli uchun butunlay yopildi (hech qanday UI ishlatmasdi). — `server/routes/crud.ts` |
| F06 | P1 | 🟡 | Generic `POST/PUT /:collection` `payment` modeli uchun yopildi. `student.balance` generic crud.ts whitelist'idan olib tashlandi (defense-in-depth), LEKIN haqiqiy yo'l `server/routes/students.ts`'ning ALOHIDA router'i — u yerda `balance` ATAYLAB whitelist'da qoladi, chunki CrmStudents.tsx yangi o'quvchi yaratishda "boshlang'ich qoldiq"ni shu maydon orqali belgilaydi (haqiqiy, keng ishlatiladigan funksiya). **Ochiq qaror:** balans tuzatmasini alohida, sababli/ledger-bog'langan "adjustment" hodisasiga aylantirish kerakmi (yangi schema jadvali talab qiladi) — hozircha faqat mavjud `withAudit('student')` orqali eski/yangi qiymat jurnalga yoziladi. |
| F07 | P1 | ✅ | Payme `PerformTransaction`/Click Complete endi yaratilgan `Payment`ni `sourceType='online_transaction'/sourceId=OnlineTransaction.id` bilan bog'laydi. Payme `CancelTransaction` (state 2→-2, ya'ni tasdiqlangandan keyin bekor qilish) endi shu bog'lanish orqali topib, Payment.status'ni `'refunded'`ga o'tkazadi (avval abadiy "paid" bo'lib qolardi). Yon ta'sir: teacher payroll CASH bazasi (`Payment.status='paid'` bo'yicha filtrlaydi) endi refund qilingan to'lovni to'g'ri chetlab o'tadi. Click tomonida rasmiy "completed'dan keyin bekor qilish" callback'i yo'q (faqat Prepare/Complete bor) — shuning uchun bu qism faqat Payme uchun. — `prisma/schema.prisma` (`Payment.sourceType/sourceId` additive), `server/routes/payments.ts` |
| F08 | P1 | ✅ | Click Complete (`action=1`) imzo formulasi ilgari Prepare bilan bir xil edi — `merchant_prepare_id` umuman qo'shilmagan. Click'ning rasmiy referens implementatsiyasi (`click-llc/click-integration-php`, `BasicPaymentsErrors.php`) bilan solishtirib tasdiqlandi va tuzatildi: `merchant_prepare_id` endi FAQAT action=1'da, `merchant_trans_id`dan keyin qo'shiladi. Curl/python bilan eski (noto'g'ri) formula endi rad etilishi, rasmiy formula esa qabul qilinishi tasdiqlandi. — `server/routes/payments.ts` |
| F09 | P1 | ✅ | Payme rasmiy MAJBURIY `GetStatement` metodi qo'shildi (`from`/`to` oralig'ida yaratilgan tranzaksiyalar ro'yxati) — rasmiy hujjat (developer.help.paycom.uz) bilan maydon-maydon solishtirilib yozilgan. Jonli tekshirildi: Create→Perform→GetStatement to'g'ri qatorni qaytardi (amount tiyin birligida to'g'ri round-trip). — `server/routes/payments.ts` |
| F10 | P1 | ⬜ | Billing joriy narx/a'zolikka bog'liq (tarixiy snapshot yo'q) — katta, P10. |
| F11 | P1 | ⬜ | Oylik billing charge yaratish/yakunlash yagona oqimi yo'q — P10. |
| F12 | P1 | 🟡 | `/finance/billing-settings` va `/finance/transactions` validatsiyasi allaqachon bor edi (oldingi audit, F0). Bu safar `/finance/transactions`ga `type` validatsiyasi, `/finance/expenses` POST/PATCH'ga musbat-summa tekshiruvi, `POST /finance/transactions`da studentId mavjudligi tekshiruvi qo'shildi. To'liq domen-sxema validatsiyasi (invoice/budget uchun ham) hali qolgan. |
| F13 | P1 | ✅ | `server/routes/salary.ts` barcha 8 route'iga `requirePermission('finance')` qo'shildi — endi `/finance/*` bilan bir xil talab (ADMIN/SUPER_ADMIN FULL_ACCESS_ROLES orqali baribir o'tadi). — `server/routes/salary.ts` |
| F14 | P2 | ✅ | "Oylik" jadvalining "Jami" qatori endi `monthlySummary` (tanlangan `currentYear` bo'yicha filtrlangan) dan hisoblanadi, avvalgi barcha-yillar `totalIncome/Expense` o'rniga. — `src/pages/crm/finance/CrmFinance.tsx` |
| F15 | P2 | ✅ | `reports/students`: `totalPaid`/`totalDebt` endi butun jadval bo'yicha `groupBy` agregatsiyasidan (avval faqat so'nggi 5 to'lovdan). `portal/payments`: `totalUnpaid` endi limitsiz `aggregate`dan (avval ko'rsatiladigan 10 taning yig'indisi edi). Jonli tekshirildi: 8 ta paid+2 ta overdue yozuvli test o'quvchida `totalPaid=800000` (avval 500000 bo'lardi), `totalDebt=100000` to'g'ri chiqdi. — `server/routes/reports.ts`, `server/routes/portal.ts` |
| F16 | P2 | ✅ | Debtors qoidasi (`CrmFinance.tsx` va Dashboard `DebtorsTable.tsx`, ikkalasi ham) endi FAQAT `balance < 0`ga tayanadi — stale `paymentStatus==='Qarzdorlik'` mustaqil shart sifatida olib tashlandi (musbat balansli o'quvchi endi "qarzdor" ro'yxatida noto'g'ri chiqmaydi). — `src/pages/crm/finance/CrmFinance.tsx`, `src/components/dashboard/widgets/DebtorsTable.tsx` |
| F17 | P2 | ⬜ | Promo-kod finance'ga ulanmagan — P5. |
| F18 | P2 | ⬜ | Kategoriya nom sifatida saqlanadi (ID yo'q) — P5. |
| F19 | P2 | ⬜ | Budget reja/fakt/davr almashish yo'q — P6. |
| F20 | P2 | ⬜ | Finance to'liq ro'yxat yuklaydi, server pagination yo'q — P4/P7. |
| F21 | P2 | ⬜ | Idempotency/pending holat/query invalidation yo'q — P7. |
| F22 | P2 | 🟡 | `Expense.createdById` endi to'ldiriladi (F04 bilan birga). To'liq audit trail (kim/nima/qachon/sabab har bir moliyaviy yo'lda) hali umumiy emas — P7/kelajak. |

## O01–O14 (Oylik/Payroll UI)

| ID | Daraja | Holat | Izoh / o'zgargan fayllar |
|---|---|---|---|
| O01 | P1 | ✅ | Yangi tor endpoint `GET /finance/teacher-payroll/teachers-list` (MANAGER+finance) — `CrmTeacherPayroll.tsx` endi `/auth/users` (ADMIN+) o'rniga shuni chaqiradi, MANAGER uchun ro'yxat endi bo'sh qolmaydi. — `server/routes/teacherPayroll.ts`, `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O02 | P1 | ✅ | Draft yaratish (`POST /`) va tasdiqlash (`POST /:id/approve`) endi boshqa basis (accrual/cash) allaqachon tasdiqlangan/to'langan bo'lsa bloklaydi — bitta davr uchun ikkita mustaqil to'lanadigan majburiyat endi yaratilmaydi. — `server/routes/teacherPayroll.ts` |
| O03 | P1 | ✅ | Yangi `calculateStudentCashAllocation()` (billing.ts) — o'quvchining shu oydagi ELIGIBLE (qarzdan oshmagan) puli barcha guruhlaridagi hisoblangan narx nisbatiga proporsional taqsimlanadi. To'liq (invoice-line) allocation emas, lekin double-counting xatosi yopildi. Jonli tekshirildi: 2 ustoz, 1 umumiy o'quvchi, 700000 to'lov, 1000000 jami qarz (600000+400000) → Teacher A 420000, Teacher B 280000 (yig'indi = aynan to'langan summa, avval ikkalasi ham 700000 ko'rsatardi). — `server/services/billing.ts`, `server/services/teacherPayroll.ts` |
| O04 | P1 | ✅ | Guruh yig'indisi endi header (jami revenue)ga to'g'ri mos keladi — O03 bilan bir xil tuzatish orqali. |
| O05 | P1 | ✅ | Tasdiqlangan/to'langan payroll uchun UI endi `sourceSnapshot`dan (muzlatilgan, tasdiqlash paytidagi holat) ko'rsatadi, live preview'dan emas — 🔒 "Saqlangan hisob" belgisi bilan. Joriy davomat/narx asosida qayta hisoblansa natija farq qilishi mumkinligi alohida ogohlantirishda ko'rsatiladi (tasdiqlangan raqamning o'zi o'zgarmaydi). Brauzerda tasdiqlangan. — `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O06 | P1 | ✅ | Staff formda endi "dirty" (saqlanmagan o'zgarish) kuzatiladi — dirty paytida to'lov summasi/tugmasi butunlay yashirinadi, dizayn namunasidagi bilan bir xil ogohlantirish ko'rsatiladi ("Saqlanmagan o'zgarishlar — to'lovdan oldin saqlang"). Brauzerda tasdiqlangan: Bonus o'zgartirilganda Jami darhol yangilanadi, to'lov tugmasi yo'qoladi, Saqlash bosilgandan keyin qayta paydo bo'ladi TO'G'RI (yangi) summa bilan. — `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O07 | P1 | ✅ | `POST /salary` endi `paid`ni request body'dan umuman olmaydi — yaratilgan/yangilangan yozuv har doim `paid:false, paidAt:null` bilan boshlanadi. "To'landi" holatiga faqat `PUT /:id/pay` orqali (xarajat yozuvi bilan atomar) o'tiladi. Joriy UI hech qachon `paid` yubormagani uchun xatti-harakat o'zgarmadi, faqat API-darajasidagi teshik yopildi. — `server/routes/salary.ts` |
| O08 | P1 | ⬜ | Draft qayta hisoblash version/hash bilan qulflanmagan — P8. |
| O09 | P2 | ✅ | O'qituvchilar ro'yxati (`teacherPayrolls`) endi tasdiqlash/to'lov/loyiha yaratishdan keyin ham qayta yuklanadi (`refreshTeacherPayrollList`) — avval faqat oy/yil o'zgarganda yangilanardi, tafsilotdan ro'yxatga qaytganda eski summa/holat qolib ketardi. Xodimlar tomonida bu allaqachon to'g'ri edi (mutatsiya javobi to'g'ridan-to'g'ri local state'ga yoziladi). — `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O10 | P2 | ⬜ | Staff attendance oxirgi-200-yozuv + client-side oy filtri — P9. |
| O11 | P2 | ✅ | Staff forma endi haqiqiy saqlangan ma'lumot ASINXRON kelganda ham to'g'ri sinxronlanadi (avval faqat `selectedStaffId`/`monthStr` o'zgarganda ishlaydigan effekt, server javobi keyinroq kelsa eski/bo'sh qiymatda qolib ketardi) — LEKIN foydalanuvchi formani tahrirlab turgan bo'lsa (dirty), server ma'lumoti uni qayta yozmaydi. Shu bilan bir qatorda taklif qilinadigan to'lov summasi (`payStaffAmount`) ham `total` o'zgarganda to'g'ri yangilanadigan qilib tuzatildi (avval faqat paidAmount/advanceApplied'ga bog'liq edi — Saqlashdan keyin eski qoldiqda qotib qolardi). Ikkalasi ham brauzerda tasdiqlangan. — `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O12 | P2 | ✅ | Yangi `GET /finance/teacher-payroll/:id/payouts` va `GET /salary/:id/payouts` — har bir naqd/bank to'lov (Transaction) VA avtomatik avans-qoplash (StaffAdvanceApplication) hodisasini sana/summa/usul bilan xronologik qaytaradi. UI'da yangi "To'lovlar tarixi (bu davr)" kartasi (`PayoutTimeline`). Brauzerda ikkita alohida to'lov (500000 Naqd + 800000 Bank) to'g'ri, alohida-alohida ko'rsatilgani tasdiqlandi. — `server/routes/teacherPayroll.ts`, `server/routes/salary.ts`, `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O13 | P2 | ✅ | Yangi `GET /finance/teacher-payroll/group/:groupId/attendance-matrix?month=` — sana x o'quvchi davomat matritsasi (yozuv yo'q bo'lsa `null`, "kelmadi" deb TAXMIN QILINMAYDI). Guruh kartasida "Kunlik davomat" kengaytmasi (lazy-load) sifatida qo'shildi. Brauzerda 2 o'quvchi × 3 sana bilan aniq tekshirildi — har bir katakcha (Keldi/Kelmadi/Kech) to'g'ri rang bilan chiqdi. — `server/routes/teacherPayroll.ts`, `src/pages/crm/finance/CrmTeacherPayroll.tsx` |
| O14 | P2 | ✅ | O'qituvchilar VA xodimlar ro'yxatiga ism bo'yicha qidiruv + holat filtri (Hisoblanmagan/Loyiha/Qisman/To'langan) qo'shildi, dizayn namunasidagi "N ta xodim · Summalar so'mda" natija soni bilan. Ommaviy amal/"tekshirish navbati" hali qo'shilmagan (kelgusi ish). Brauzerda tasdiqlangan. — `src/pages/crm/finance/CrmTeacherPayroll.tsx` |

## P13 — Payroll-avans va berish tartibi tizimi (2026-09-17)

**Foydalanuvchi so'rovi (asl matn ma'nosi):** "oylik xodimga hisoblanishi bu berilishi degani emas; berilishi alohida, hisoblangan bo'yicha beriladi, ammo birdaniga to'liq berilmasligi mumkin yoki xodim oldindan avans olishi mumkin — shunga qarab berish tartibi tizimini to'liq o'ylab chiqish kerak; balki oylik hisoblash HR'ga o'tkazilishi kerak."

**Qabul qilingan yechim:**

1. **Yangi `StaffAdvance` modeli** — o'qituvchi (`personType='teacher'`, `personId=User.id`) va boshqa xodim (`personType='staff'`, `personId=StaffMember.id`) uchun BITTA umumiy jadval. Avans muayyan oyga emas, SHAXSGA tegishli — "markaz oldidagi qarz" sifatida `remaining` maydonida saqlanadi.
2. **Avtomatik, FIFO qoplash** (`server/services/staffAdvance.ts`'dagi `applyOutstandingAdvances()`): TeacherPayroll TASDIQLANGANDA yoki Salary BIRINCHI to'lovida, shu shaxsning eng ESKI avansidan boshlab, yangi hisoblangan summagacha avtomatik qopla­nadi. Bitta avans (agar bir oylikdan katta bo'lsa) bir necha davrga bo'lib qoplanishi mumkin — bu `StaffAdvanceApplication` orqali kuzatiladi (qaysi avansdan, qanchasi, qaysi davrga).
3. **Uch alohida ko'rsatkich hamma joyda aniq ajratilgan:** Hisoblangan (accruedAmount/total) → Avansdan qoplandi (advanceApplied) → Naqd/bank to'langan (paidAmount) → Qoldiq (remaining, server hisoblaydi). Hech qanday summa boshqasiga "yashirincha" qo'shilmaydi.
4. **Qisman to'lov endi Salary (boshqa xodimlar) uchun ham bor** — ilgari faqat TeacherPayroll'da bor edi, Salary faqat to'liq/hech narsa edi. Endi ikkalasi bir xil naqshda.
5. **HR/Moliya vakolat ajratishi (foydalanuvchining "HR'ga o'tkazish" g'oyasiga javob):** sahifani jismonan ko'chirish o'rniga (bu "bitta joy — bitta manba" navigatsiya tamoyilini buzardi), yangi **`payroll_review`** ruxsati qo'shildi. Endi:
   - Ko'rish/hisoblash (tabelni ko'rib chiqish, draft yaratish/qayta hisoblash) — `finance` YOKI `payroll_review` (HR) yetarli.
   - Tasdiqlash, to'lov, avans berish (haqiqiy pul harakati) — FAQAT `finance`.
   - Admin "Rollar va Ruxsatlar" sahifasida istalgan (masalan HR) rolga `payroll_review`ni biriktirishi mumkin — kod o'zgarishi kerak emas.

**Jonli tekshirildi** (local, curl + brauzer, keyin tozalangan):
- HR (faqat `payroll_review`): ro'yxat/draft yaratish 200, tasdiqlash/avans berish 403.
- O'qituvchiga 1,000,000 avans → 1,500,000 hisoblangan oylik tasdiqlanganda avtomatik 1,000,000 qoplandi, qoldiq 500,000 to'g'ri chiqdi.
- Katta (3,000,000) avans → kichikroq (1,200,000) keyingi oy TO'LIQ avansdan qoplanib avtomatik "to'langan" bo'ldi, qolgan 1,800,000 avans keyingi davrga to'g'ri ko'chdi (multi-period FIFO).
- Xodim (Salary): 500,000 avans + 700,000 qisman to'lov (birinchi to'lovda avans avtomatik qo'shilib jami 1,200,000 hisobga olindi) + 800,000 qolgan to'lov → to'liq to'langan, barcha oraliq summalar aniq. Qisman to'lovdan keyin tarkibni (Saqlash) tahrirlash to'g'ri bloklandi.
- Brauzerda: "Oldindan berilgan avans (qoldiq)" karta, "Avans berish" oynasi, tarix ro'yxatidagi "(X avansdan)" izohi va Xodim tafsilotidagi to'liq breakdown (Asosiy/Bonus/Ushlanma/Jami/Avansdan qoplandi/Naqd to'langan) — barchasi ekran suratlarida tasdiqlangan.

## Ochiq biznes qarorlari (foydalanuvchidan tasdiq kerak, mustaqil ish davom etmoqda)

1. **F06/balance:** boshlang'ich qoldiqni belgilash (yangi o'quvchi) bilan keyinchalik "balans tuzatish" (mavjud o'quvchi)ni backend darajasida ajratish kerakmi? Ajratilsa, tuzatish uchun sabab-majburiy alohida endpoint + ledger yozuvi qo'shiladi.
2. **O07/Salary paid=true:** yangi Salary yozuvini to'g'ridan-to'g'ri `paid:true` bilan yaratishni butunlay yopish (faqat `PUT /:id/pay` orqali to'lash) — buzilishi mumkin bo'lgan mavjud oqim bormi, tekshirish kerak.
3. **11-bo'lim (ruxsat matritsasi):** `payroll.calculate/approve/pay/refund/close/export` kabi granular kalitlarni DB Role/Permission tizimiga qachon qo'shish — hozircha hammasi bitta `finance` kalitiga tayanadi.
4. **P10 (billing snapshot/allocation) va P12 (kassa/reconciliation):** bular alohida, ko'p kunlik ishlar — davom etishdan oldin ustuvorlikni tasdiqlash foydali (audit hujjatining o'zi ham R3/R4 sifatida keyinga qoldirgan).

## Schema o'zgarishlari (production'ga alohida, tasdiqlangan qadam kerak)

- **`Payment.sourceType String?` / `Payment.sourceId String?`** (F07, P3) — additive, nullable, mavjud yozuvlarga ta'sir qilmaydi. Lokal PostgreSQL'ga `npx prisma db push` bilan qo'llanildi va tekshirildi. **Production'da hali qo'llanilmagan** — CLAUDE.md protokoliga muvofiq, productionga deploy qilinganda bu FAQAT foydalanuvchi tomonidan alohida, aniq tasdiqlangan qadam sifatida qo'llanishi kerak (production SQLite'da mos ustunlarni qo'shish).
- **P13 (2026-09-17) — Payroll-avans:** yangi `StaffAdvance` va `StaffAdvanceApplication` jadvallari; `TeacherPayroll.advanceApplied Float @default(0)`; `Salary.paidAmount Float @default(0)` va `Salary.advanceApplied Float @default(0)`. Barchasi additive (yangi jadval/nullable-defaultli ustun), mavjud yozuvlarga ta'sir qilmaydi. Lokalda `npx prisma db push` bilan qo'llanildi va to'liq tekshirildi (pastga q.). **Production'da hali qo'llanilmagan.**
- Yangi `Permission` DB yozuvi: `payroll_review` (`scripts/seed_payroll_review_permission.ts` orqali idempotent qo'shildi — bu skript schema emas, ma'lumot seed'i, lekin productionga o'tkazishda ham xuddi shunday bir martalik skript sifatida ishga tushirilishi kerak).

## Tekshiruv usuli (P1 uchun bajarilgan)

- `npx tsc --noEmit` — 0 xato.
- Local backend (`npm run server`, PostgreSQL) + vaqtinchalik test fixture (MANAGER+finance, MANAGER-siz-finance, TEACHER, 1 ta student) orqali curl bilan jonli tekshirildi: F01 (Payment+Transaction+balance), F04 (create/patch/delete sync), F05 (transaction PUT 400), F06 (payment POST 400), F13 (403 vs 200), O01 (teachers-list), O02 (dual-basis 400). Barcha test fixture'lar tekshiruvdan keyin o'chirildi.
- Production'ga bu partiyada HECH NARSA deploy qilinmagan — schema o'zgarishi yo'q, faqat kod.
