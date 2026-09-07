# CrmCommunication.tsx Chuqur Bug va UX Auditi — 2026-09-07

Ushbu audit `src/pages/crm/marketing/CrmCommunication.tsx` sahifasini har bir komponent, API chaqiruvi, UX o'zaro ta'siri va server yo'nalishlari (`server/routes/communication.ts`) bilan solishtirib amalga oshirildi.
Server va Prisma sxema fayllariga mutlaqo teyilmadi. All backend discrepancies are reported below for backend maintenance.

---

## 1. Frontendlari Tuzatilgan Real Muammolar (CrmCommunication.tsx)

1. **Ommaviy Xabar Yuborishda Guruh Tanlash Yetishmasligi (Targeting Bug)**:
   - **Muammo**: "Guruh bo'yicha" (`group`) tanlanganda foydalanuvchiga qaysi guruhga xabar yuborilishini tanlash uchun dropdown kiritish maydoni yo'q edi. `bulkForm.targetId` bo'sh (`""`) qolib kelayotgan edi, natijada backend `targetId` yo'qligi sababli 0 qabul qiluvchi topardi.
   - **Tuzatish**: Modalda `/api/groups` orqali mavjud guruhlar ro'yxati yuklanib, `group` tanlanganda guruh tanlash dropdown'i ko'rsatildi va validatsiya qo'shildi.

2. **Loading, Error va Retry (Qayta urinish) Holatlari Yo'qligi**:
   - **Muammo**: Shablonlar, ommaviy xabarlar va bildirishnomalar yuklanishida tarmoq yoki server xatosi yuz bersa, xato jimgina yutib yuborilardi (`catch { setTemplates([]); }`). Ommaviy xabarlarda loading indikatori umuman yo'q edi.
   - **Tuzatish**: Barcha 3 tab uchun alohida loading va error holatlari (`templatesError`, `bulkError`, `notifError`) hamda "Qayta urinish" (Retry) tugmalari va `RefreshCw` indikatorlari qo'shildi.

3. **Mobil Qurilmalarda Shablon Amal Tugmalarining Yo'qolishi (Touch UX Bug)**:
   - **Muammo**: Shablonlar ro'yxatidagi nusxalash, tahrirlash va o'chirish tugmalariga `opacity-0 group-hover:opacity-100` berilgan edi. Mobil va sensor ekranlarda hover effekti bo'lmagani sababli foydalanuvchilar shablonni tahrirlay va o'chira olmas edi.
   - **Tuzatish**: Tugmalar ekran o'lchamiga moslab moslashtirildi (`opacity-100 md:opacity-0 md:group-hover:opacity-100`), mobil qurilmalarda tugmalar har doim ko'rinadi.

4. **Mobil Responsive Layout Va Grid Buzilishlari**:
   - **Muammo**: Statistika kartalari har qanday ekranda `grid-cols-3` edi, bu kichik mobil ekranlarda matn va ikonkalarni sig'dira olmas edi. Tablar ro'yxati ham kichik ekranda sig'may qolishi mumkin edi.
   - **Tuzatish**: Statistika kartalari `grid-cols-1 sm:grid-cols-3` ga va tablar horizontal scrollable (`overflow-x-auto no-scrollbar`) qilib moslashtirildi.

5. **Alohida Bildirishnomani O'qilgan Deb Belgilash Imkoniyati Yo'qligi**:
   - **Muammo**: Backendda `PATCH /api/communication/notifications/:id/read` route'i bor bo'lsa ham, UI'da faqat "Barchasini o'qilgan deb belgilash" bor edi, alohida bitta bildirishnomani o'qilgan deb belgilash funksiyasi yo'q edi.
   - **Tuzatish**: Har bir o'qilmagan bildirishnomaga bosilganda yakka bildirishnoma statusini `isRead: true` ga o'tkazish handler'i (`handleMarkSingleRead`) va UI belgisi qo'shildi.

6. **Shablon O'chirishda Tasdiqlash (Confirmation) Yo'qligi**:
   - **Muammo**: O'chirish tugmasiga bosilganda shablon hech qanday tasdiqsiz zudlik bilan o'chirib yuborilardi.
   - **Tuzatish**: O'chirishdan oldin `window.confirm` orqali tasdiq so'rash qo'shildi.

7. **Forma Validatsiyasi va Trim Bo'shliqlari**:
   - **Muammo**: Shablon yaratish/tahrirlash va xabar yuborishda matn va nom bo'sh bo'shliqlardan (`"   "`) iborat bo'lsa ham tugma faol qolardi.
   - **Tuzatish**: Matn va nom parametrlariga `.trim()` validatsiyasi hamda yuborish/saqlash jarayonida tugmalarni `disabled` qilish mantig'i kuchaytirildi.

8. **Frontend Rol / Ruxsat Darajasi Cheklovi (`canWrite`)**:
   - **Muammo**: Ommaviy xabar yuborish va shablon yaratish/tahrirlash/o'chirish tugmalari har qanday kirgan foydalanuvchiga (masalan TEACHER) ko'rinib turgan edi.
   - **Tuzatish**: Frontendda `localStorage` orqali foydalanuvchi roli `MANAGER`, `ADMIN`, `SUPER_ADMIN` ekani tekshirilib, yozish amallari shu rollarga cheklandi (`canWrite`).

---

## 2. Har Bir Backend Route Rol va API Mosligi Tekshiruvi

`server/routes/communication.ts` faylidagi barcha route'lar audit qilindi:

| Amal | Endpoind | Backend Rol Muhiti (`requireAuth`) | Payload / Javob Mosligi |
|---|---|---|---|
| Shablonlar GET | `GET /api/communication/templates` | `requireAuth` | Javob `[Template]`; `res.data` mos |
| Shablon POST | `POST /api/communication/templates` | `requireAuth` *(muammo)* | Request `{ name, content, type, language }`; mos |
| Shablon PUT | `PUT /api/communication/templates/:id` | `requireAuth` *(muammo)* | Request `{ name, content, type, language }`; mos |
| Shablon DELETE | `DELETE /api/communication/templates/:id` | `requireAuth` *(muammo)* | Javob `{ success: true }`; mos |
| Ommaviy GET | `GET /api/communication/bulk-messages` | `requireAuth` | Javob `[BulkMessage]`; `res.data` mos |
| Ommaviy Yuborish | `POST /api/communication/bulk-messages/send` | `requireAuth` *(muammo)* | Request `{ content, targetType, targetId, templateId }`; Javob `{ success, sentCount, failedCount, noTelegramCount, totalRecipients }`; mos |
| Bildirishnoma GET | `GET /api/communication/notifications` | `requireAuth` | Javob `[Notification]`; mos |
| Bildirishnoma Barchasi | `POST /api/communication/notifications/mark-all-read` | `requireAuth` | Javob `{ success: true }`; mos |
| Bildirishnoma Yakka | `PATCH /api/communication/notifications/:id/read` | `requireAuth` | Javob `{ success: true }`; mos |

---

## 3. Backendda Topilgan Muammolar (Xabar Berish Uchun)

*(Backend fayllariga tegish bo'yicha taqiq bo'lgani sababli, quyidagi muammolar backend dasturchilari uchun hisobot sifatida keltiriladi):*

1. **Xavfsizlik / Rol Cheklovlarining Yo'qligi (`server/routes/communication.ts`)**:
   - `POST /templates`, `PUT /templates/:id`, `DELETE /templates/:id`, `POST /bulk-messages/send` route'larining barchasida FAQAT `requireAuth` qo'llanilgan, lekin `requireMinRole('MANAGER')` yoki `requireRole(['ADMIN', 'MANAGER'])` QO'YILMAGAN!
   - Natijada har qanday autentifikatsiyadan o'tgan foydalanuvchi (masalan O'qituvchi - `TEACHER`) API orqali to'g'ridan-to'g'ri ommaviy Telegram xabarlar yuborishi yoki shablonlarni o'chirib tashlashi mumkin.
   - **Tavsiya**: Backend `server/routes/communication.ts` yozish endpoint'lariga `requireMinRole('MANAGER')` qo'shilishi kerak.

2. **Backendda `course` bo'yicha Ommaviy Xabar Qabul Qiluvchilari Qo'llab-quvvatlanmagani**:
   - Frontendda avval `TARGET_TYPES` orasida `course` bor edi, lekin backend `server/routes/communication.ts` (84-102 qatorlar) faqat `all`, `debtors` va `group` turlarini ko'rib chiqadi. `targetType === 'course'` yuborilganda backendda `recipients` bo'sh massiv bo'lib qoladi va 0 ta xabar yuboriladi.
   - **Tavsiya**: Backendda `else if (targetType === 'course' && targetId)` bloki qo'shilib, ushbu kursdagi guruhlar va ularning o'quvchilari olinishi kerak.

---

## 4. Tasdiqlash
- `npx tsc --noEmit` orqali 0 ta TypeScript xatosi tasdiqlandi.
