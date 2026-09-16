# Moliya va Oyliklar — kuzatuv ro'yxati (F01–F22, O01–O14, W01–W28)

**Manba hujjat:** `C:/Users/user/.codex/visualizations/2026/09/16/01a0a9e8-bc8c-7c21-be73-4c00b3a17bb3/MOLIYA_VA_OYLIKLAR_REJASI_2026-09-16.md` (audit HEAD: `6a2b00a`).
**Ushbu fayl:** amalga oshirish davomida yangilanadigan yagona kuzatuv manbasi — har paketdan keyin holat/fayl/tekshiruv ustunlari yangilanadi, hujjat o'zi qayta yozilmaydi.

Holat belgilari: ✅ bajarildi va jonli tekshirildi · 🟡 qisman/qo'lda-qaror kerak · ⬜ hali boshlanmagan.

## Ish paketlari (mening ketma-ketligim, hujjatning W01–W28/R1–R4'iga mos)

| Paket | Qamrov | Holat | Commit |
|---|---|---|---|
| **P1 — hisob ishonchliligi (asosiy)** | F01, F04, F05, F06 (qisman), F13, O01, O02 | ✅ | (shu partiyada) |
| P2 — invoice net/allocation | F02, F03, F09-adjacent | ⬜ | — |
| P3 — provider qattiqlashtirish | F07, F08, F09 | ⬜ | — |
| P4 — hisobot/pagination to'g'irlash | F14, F15, F16, F20 | ⬜ | — |
| P5 — chegirma/kategoriya | F17, F18 | ⬜ | — |
| P6 — byudjet | F19 | ⬜ | — |
| P7 — UX/idempotency | F21, F22 (qisman) | ⬜ | — |
| P8 — payroll UI ishonchliligi | O05, O06, O08, O09, O11 | ⬜ | — |
| P9 — payroll UI kengaytirish | O03, O04, O07, O10, O12, O13, O14 | ⬜ | — |
| P10 — billing snapshot/allocation (katta) | F10, F11, W14-W20 ruhida | ⬜ | Katta — alohida reja kerak |
| P11 — RBAC granular payroll ruxsatlari | 11-bo'lim (payroll.calculate/approve/pay/...) | ⬜ | Biznes qaror kerak |
| P12 — kassa/bank/reconciliation | W24-W26 | ⬜ | Katta — alohida reja kerak |

## F01–F22 (Moliya)

| ID | Daraja | Holat | Izoh / o'zgargan fayllar |
|---|---|---|---|
| F01 | P1 | ✅ | `/finance/transactions` POST endi income+studentId'da Payment(status=paid)ni ham atomar yaratadi, `sourceType='manual_payment'` bilan bog'langan. — `server/routes/finance.ts` |
| F02 | P1 | ⬜ | Invoice discount/tax net-summa kontrakti hali server/UI o'rtasida birlashtirilmagan. Keyingi paket (P2). |
| F03 | P1 | ⬜ | Payment-link'da hali invoice allocation yo'q. P2. |
| F04 | P1 | ✅ | Expense POST/PATCH/DELETE endi bog'langan Transaction (`sourceType='expense'`) bilan bitta `$transaction`da izchil; `createdById` endi to'ldiriladi. — `server/routes/finance.ts` |
| F05 | P1 | ✅ | Generic `PUT /:collection/:id` `transaction` modeli uchun butunlay yopildi (hech qanday UI ishlatmasdi). — `server/routes/crud.ts` |
| F06 | P1 | 🟡 | Generic `POST/PUT /:collection` `payment` modeli uchun yopildi. `student.balance` generic crud.ts whitelist'idan olib tashlandi (defense-in-depth), LEKIN haqiqiy yo'l `server/routes/students.ts`'ning ALOHIDA router'i — u yerda `balance` ATAYLAB whitelist'da qoladi, chunki CrmStudents.tsx yangi o'quvchi yaratishda "boshlang'ich qoldiq"ni shu maydon orqali belgilaydi (haqiqiy, keng ishlatiladigan funksiya). **Ochiq qaror:** balans tuzatmasini alohida, sababli/ledger-bog'langan "adjustment" hodisasiga aylantirish kerakmi (yangi schema jadvali talab qiladi) — hozircha faqat mavjud `withAudit('student')` orqali eski/yangi qiymat jurnalga yoziladi. |
| F07 | P1 | ⬜ | Payme cancel/Payment/cash uzilishi — P3. |
| F08 | P1 | ⬜ | Click complete imzo formulasi (`merchant_prepare_id`) — P3, rasmiy hujjat bilan qayta tekshirish kerak. |
| F09 | P1 | ⬜ | Payme `GetStatement` yo'q — P3. |
| F10 | P1 | ⬜ | Billing joriy narx/a'zolikka bog'liq (tarixiy snapshot yo'q) — katta, P10. |
| F11 | P1 | ⬜ | Oylik billing charge yaratish/yakunlash yagona oqimi yo'q — P10. |
| F12 | P1 | 🟡 | `/finance/billing-settings` va `/finance/transactions` validatsiyasi allaqachon bor edi (oldingi audit, F0). Bu safar `/finance/transactions`ga `type` validatsiyasi, `/finance/expenses` POST/PATCH'ga musbat-summa tekshiruvi, `POST /finance/transactions`da studentId mavjudligi tekshiruvi qo'shildi. To'liq domen-sxema validatsiyasi (invoice/budget uchun ham) hali qolgan. |
| F13 | P1 | ✅ | `server/routes/salary.ts` barcha 8 route'iga `requirePermission('finance')` qo'shildi — endi `/finance/*` bilan bir xil talab (ADMIN/SUPER_ADMIN FULL_ACCESS_ROLES orqali baribir o'tadi). — `server/routes/salary.ts` |
| F14 | P2 | ⬜ | Jadval footer'i barcha yillar jamini oladi — P4. |
| F15 | P2 | ⬜ | `reports/students`/`portal` limitlangan payment sonidan hisoblaydi — P4. |
| F16 | P2 | ⬜ | Debtors hosil qilish qoidasi izchil emas — P4. |
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
| O03 | P1 | ⬜ | Cash allocation yo'q — katta, P10 (Receipt/PaymentAllocation modeli kerak). |
| O04 | P1 | ⬜ | Guruh yig'indisi va header mos emas (O03 bilan bog'liq) — P10. |
| O05 | P1 | ⬜ | Tasdiqlangandan keyin UI saqlangan snapshot'ni emas, live preview'ni ko'rsatadi — P8. |
| O06 | P1 | ⬜ | Staff formda dirty-state himoyasi yo'q — P8. |
| O07 | P1 | ⬜ | Salary POST `paid=true`ni expense'siz qabul qiladi (RF-05 qisman yopgan — endi shu yo'l orqali paid=true umuman o'zgartirilmaydi agar mavjud yozuv paid bo'lsa, lekin YANGI yozuvni bevosita `paid:true` bilan yaratish hali mumkin) — P8'da to'liq yopiladi. |
| O08 | P1 | ⬜ | Draft qayta hisoblash version/hash bilan qulflanmagan — P8. |
| O09 | P2 | ⬜ | Ro'yxat mutatsiyadan keyin invalidatsiya qilinmaydi — P8. |
| O10 | P2 | ⬜ | Staff attendance oxirgi-200-yozuv + client-side oy filtri — P9. |
| O11 | P2 | ⬜ | Staff form async salary bilan qayta sinxronlanmaydi — P8. |
| O12 | P2 | ⬜ | Har bir payout hodisasi (sana/usul/kassir/chek) alohida ko'rinmaydi — P9. |
| O13 | P2 | ⬜ | Tabelda kun/dars matritsasi yo'q — P9. |
| O14 | P2 | ⬜ | Qidiruv/holat filtri/tekshirish navbati/ommaviy amal yo'q — P9. |

## Ochiq biznes qarorlari (foydalanuvchidan tasdiq kerak, mustaqil ish davom etmoqda)

1. **F06/balance:** boshlang'ich qoldiqni belgilash (yangi o'quvchi) bilan keyinchalik "balans tuzatish" (mavjud o'quvchi)ni backend darajasida ajratish kerakmi? Ajratilsa, tuzatish uchun sabab-majburiy alohida endpoint + ledger yozuvi qo'shiladi.
2. **O07/Salary paid=true:** yangi Salary yozuvini to'g'ridan-to'g'ri `paid:true` bilan yaratishni butunlay yopish (faqat `PUT /:id/pay` orqali to'lash) — buzilishi mumkin bo'lgan mavjud oqim bormi, tekshirish kerak.
3. **11-bo'lim (ruxsat matritsasi):** `payroll.calculate/approve/pay/refund/close/export` kabi granular kalitlarni DB Role/Permission tizimiga qachon qo'shish — hozircha hammasi bitta `finance` kalitiga tayanadi.
4. **P10 (billing snapshot/allocation) va P12 (kassa/reconciliation):** bular alohida, ko'p kunlik ishlar — davom etishdan oldin ustuvorlikni tasdiqlash foydali (audit hujjatining o'zi ham R3/R4 sifatida keyinga qoldirgan).

## Tekshiruv usuli (P1 uchun bajarilgan)

- `npx tsc --noEmit` — 0 xato.
- Local backend (`npm run server`, PostgreSQL) + vaqtinchalik test fixture (MANAGER+finance, MANAGER-siz-finance, TEACHER, 1 ta student) orqali curl bilan jonli tekshirildi: F01 (Payment+Transaction+balance), F04 (create/patch/delete sync), F05 (transaction PUT 400), F06 (payment POST 400), F13 (403 vs 200), O01 (teachers-list), O02 (dual-basis 400). Barcha test fixture'lar tekshiruvdan keyin o'chirildi.
- Production'ga bu partiyada HECH NARSA deploy qilinmagan — schema o'zgarishi yo'q, faqat kod.
