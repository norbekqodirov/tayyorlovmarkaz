# BUG AUDIT REPORT - Tayyorlovmarkaz CRM

Below is the list of identified bugs, their severity, description, and status.

| Sahifa | Muammo | Jiddiylik | Holat |
|---|---|---|---|
| Barcha PDF Eksport sahifalari (`CrmFinance`, `CrmBI`, `CrmStudents`, `CrmLeads`, `CrmGroupDetail`) | jsPDF default `helvetica` shriftini ishlatadi, unda o'zbek lotin (`o'`, `g'`) va kirill harflari yo'q (Unicode qo'llab-quvvatlanmaydi), natijada eksport qilingan PDF hujjatlarda yozuvlar buzilib yoki bo'sh qolib chiqadi. | High | Open (Tuzatilmoqda) |
| CrmDashboard & CrmBI | `server/routes/analytics.ts` backend API stats larni `genericDocument` dan (JSON formatda) oladi, lekin `crud.ts` orqali ma'lumotlar to'g'ridan-to'g'ri Prisma modellariga (`Student`, `Lead`, `Transaction`, `Group`) yoziladi. Buning natijasida dashboardda noto'g'ri yoki bo'sh statistika ko'rsatiladi. | Critical | Open (Tuzatilmoqda) |
| CrmFinance & CrmDashboard | Tranzaksiyalar, talabalar va davomatlarni hisoblash butunlay client-side da `.filter().reduce()` orqali amalga oshirilmoqda. Katta hajmdagi ma'lumotlarda brauzerni sekinlashtiradi yoki qotiradi. | Medium | Open (Faza 1.1 da server-side hisobotga o'tkaziladi) |
| CrmGroupDetail | Guruh tafsilotlari komponenti o'ta katta (~39.7KB) va barcha sub-tablarni bitta faylda render qiladi. Bu esa UI sekinlashuviga va kodni o'qish/o'zgartirish qiyinligiga sabab bo'ladi. | Medium | Open (Faza 0.3 da bo'linadi) |
| CrmLeads | Kanban boardda "O'lik Lid" va "Qayta aloqa" vaqti client-side da hisoblanadi va performance ga ta'sir qilishi mumkin. | Low | Open (Faza 0.3 da Kanban optimallashtiriladi) |
