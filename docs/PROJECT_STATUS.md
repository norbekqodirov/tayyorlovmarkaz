# Tayyorlov Markazi CRM — Loyiha Holati

> Bu hujjat yangi Claude/AI sessiyasida ishni davom ettirish uchun yagona manba (single source of truth).
> **Yangi sessiyada birinchi shu faylni to'liq o'qing.**
>
> Ishchi katalog: `D:\tayyorlovmarkaz`
> Ishlab chiqarish (production) serveri: `E:\tayyorlovmarkaz`
> Oxirgi yangilanish: 2026-06-25

---

## 0. TL;DR — Eng muhim qoidalar

1. **Ma'lumotlar bazasi: PostgreSQL** (`prisma/dev.db` — eski SQLite qoldig'i, **ishlatilmaydi**, e'tibor bermang).
2. Schema o'zgartirilganda **faqat** `npx prisma db push --accept-data-loss` — `prisma migrate` **HECH QACHON** ishlatilmaydi.
3. **Navigatsiya yagona manbasi: `src/components/CrmLayout.tsx` dagi `MODULES` massivi.** Yangi sahifa qo'shish uchun faqat (a) `MODULES` ga nav link, (b) `App.tsx` ga route qo'shing. `detectModule`/`getPageTitle` larni **qo'lda tahrirlash shart emas** — ular `MODULES` dan avtomatik hosil bo'ladi (`findActiveLink` orqali).
4. Nav link `permission` qiymati `App.tsx` dagi route `requiredPermission` bilan **bir xil** bo'lishi shart (aks holda link ko'rinadi-yu, sahifa ochilmaydi yoki aksincha).
5. O'zgarishdan keyin doim tekshiring: `npx tsc --noEmit` (0 xato bo'lishi kerak) va kerak bo'lsa `npm run build`.

---

## 1. LOYIHA HAQIDA

**Tayyorlov Markazi** — o'quv markazlari uchun to'liq CRM tizimi (talabalar, guruhlar, moliya, HR, marketing, analitika, Telegram botlar, sertifikatlar, Face ID davomat).

| Qatlam | Texnologiyalar |
|--------|---------------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 6, React Router v7, framer-motion, recharts |
| Backend | Express.js 4, Prisma ORM v5, **PostgreSQL** |
| Bot (talabalar) | grammY framework |
| Bot (xodimlar) | Raw Telegram API (`server/routes/staffTelegram.ts`) |
| Auth | JWT (`Authorization: Bearer <token>`), `requireAuth` middleware |
| Real-time | socket.io (`server/services/realtime.ts`) |
| Landing kontenti | Firebase Firestore (`src/hooks/useFirestore.ts`) |
| Face ID davomat | face-api.js (`src/components/portal/FaceIdCheckin.tsx`) |

### Asosiy yo'llar
- Public sayt: `/` (Home, Biz haqimizda, Natijalar, Ta'lim tizimi, Ustozlar, Blog, Bog'lanish)
- CRM kirish: `/crmtayyorlovmarkaz/login`
- CRM panel: `/crmtayyorlovmarkaz` (`ProtectedRoute` + `CrmLayout`)
- Talabalar Mini App: `/portal`  ·  Xodimlar Mini App: `/staff-portal`
- Public test: `/test/:slug`  ·  Sertifikat tekshirish: `/verify-cert/:id`  ·  Lead forma: `/l/:formId`
- API: `http://localhost:3001/api/...`

---

## 2. CRM MODUL ARXITEKTURASI

CRM 7 modulga bo'lingan. Har bir modul chap "rail" da ikonka, ichida nav linklar.
**Manba: `CrmLayout.tsx` → `MODULES`.**

| Modul | ID | Sahifalar (nav linklar) |
|-------|----|-----|
| Ta'lim | `education` | Dashboard, O'quvchilar, Guruhlar, Kurslar, Dars Jadvali, Elektron Jurnal, Test Tizimi (quiz), Imtihonlar (tests) |
| Marketing | `marketing` | Lidlar (Voronka), Target Formalar, Aksiyalar/SMM, AI Kontent, Aloqa Markazi |
| Kommunikatsiya | `kommunikatsiya` | Xabarlar, E'lonlar, Telegram Bot |
| HR | `hr` | Ustozlar, Xodimlar, Mehnat Ta'tillari, Xodim Davomati, Ish Joylari |
| Moliya | `finance` | Moliya, Chegirmalar |
| Analitika | `analytics` | BI Analitika, AI Bashoratlar, KPI & Maqsadlar, Ijroiya Hisobot |
| Boshqaruv | `management` | Filiallar, Xonalar, Inventar, Materiallar, Avtomatlar, Sertifikatlar, Hisobotlar, Audit Jurnali, Foydalanuvchilar, Sozlamalar |

### Navigatsiya qanday ishlaydi (MUHIM)
`CrmLayout.tsx` da:
- `MODULES: NavModule[]` — barcha modul va linklar (yagona manba).
- `findActiveLink(pathname)` — joriy URL ga eng mos nav linkni topadi (eng uzun prefiks bo'yicha; `/students/:id` kabi ichki route'lar ota-linkka tushadi).
- `detectModule(pathname)` = `findActiveLink(...).module.id` — qaysi modul aktiv ekanini aniqlaydi (rail va panel shunga qarab almashadi).
- `getPageTitle(pathname)` — sahifa sarlavhasi (dinamik route'lar uchun regex, qolgani `findActiveLink` dan).

> ⚠️ Avval `detectModule` qo'lda yozilgan `pathname.includes(...)` ro'yxati edi. Yangi yo'l qo'shilganda ro'yxatga qo'shilmasa, sahifa noto'g'ri modulga (odatda `education` ga) "sakrab" ketardi. **Bu bug 2026-06-25 da `findActiveLink` refaktori bilan butunlay yo'q qilindi** (AI Kontent muammosi shu edi). Endi yangi sahifa qo'shishda bu funksiyalarga tegish shart emas.

### Ruxsatlar tizimi
- `MODULES` dagi har link va `App.tsx` dagi har route ikki nazoratga ega:
  - `permission` / `requiredPermission`: `undefined` = faqat ADMIN; matn (`'students'`, `'finance'`, ...) = shu ruxsat kerak.
  - `allowedRoles`: masalan `['ADMIN','TEACHER','MANAGER']`.
- `CrmLayout.canSeeLink()`: ADMIN/SUPER_ADMIN hammasini ko'radi; aks holda foydalanuvchi `permissions` ro'yxatida bo'lishi kerak.
- **Qoida:** nav linkdagi `permission` route dagi `requiredPermission` bilan mos kelsin.

---

## 3. 2026-06-25 SESSIYASIDA QILINGAN ISHLAR (tozalash va tuzatish)

### 3.1 Tuzatilgan buglar
- **AI Kontent → Ta'lim bo'limiga sakrab ketishi.** Sabab: `detectModule` da `/ai-content` yo'li ro'yxatda yo'q edi → `education` qaytarardi. **Yechim:** `detectModule`/`getPageTitle` `MODULES` dan avtomatik hosil bo'ladigan `findActiveLink` ga refaktor qilindi. Endi bu sinfdagi barcha buglar yo'q.

### 3.2 Olib tashlangan (ortiqcha / xato qo'shilgan)
- **YouTube bo'limi** — to'liq olib tashlandi (foydalanuvchi: "umuman kerak emas, xato bilan qo'shilgan"). O'chirildi: nav link (Boshqaruv→Resurslar), `App.tsx` route + lazy import, `src/pages/crm/CrmVideos.tsx`, `src/components/YoutubeVideoSection.tsx` (hech qayerda import qilinmagan o'lik kod edi), `CrmLayout` dagi `PlaySquare` import.

### 3.3 O'chirilgan o'lik/dublikat fayllar (xavfsiz — hech qayerda import qilinmagan)
| Fayl | Sabab |
|------|-------|
| `src/pages/crm/CrmVideos.tsx` | YouTube — olib tashlandi |
| `src/components/YoutubeVideoSection.tsx` | Landing'da ko'rsatilmagan o'lik kod |
| `src/pages/crm/CrmStudentProfile.tsx` | `CrmStudentDetail.tsx` bilan almashtirilgan (`students/:id` endi `CrmStudentDetail` ishlatadi) |
| `src/components/states/` (3 fayl) | Aktiv ishlatilayotgan `src/components/States.tsx` ning dublikati edi |

### 3.4 Struktura yaxshilanishi
- `App.tsx` route'lari 7 modulga to'g'ri guruhlandi (oldin izohlar noto'g'ri edi: `ai-content`, `predictions`, `communication`, `telegram` "Boshqaruv" ostida turardi). Route'lar o'zgarmadi, faqat tartib va izohlar modullarga moslandi.

### 3.5 Tekshiruv
- `npx tsc --noEmit` → **0 xato**.
- `npm run build` → **muvaffaqiyatli** (exit 0).

---

## 4. FAYL TUZILMASI

```
D:\tayyorlovmarkaz\
├── prisma/
│   ├── schema.prisma          ← Barcha modellar (datasource = postgresql)
│   └── dev.db                 ← ESKI SQLite qoldig'i, ISHLATILMAYDI
├── server/
│   ├── index.ts               ← 35 ta route shu yerda ro'yxatdan o'tgan
│   ├── middleware/auth.ts      ← requireAuth, requireRole, requireMinRole
│   ├── routes/                ← 35 ta route fayli (§5 ga qarang)
│   └── services/
│       ├── realtime.ts        ← socket.io (emitToUser, emitToAdmins)
│       ├── telegramService.ts  ← sendMessage, sendBroadcast, getBotInfo
│       ├── certificateService.ts
│       └── scheduler.ts        ← node-cron avtomatik vazifalar
├── src/
│   ├── App.tsx                ← Barcha lazy route'lar (public + CRM + portal)
│   ├── components/
│   │   ├── CrmLayout.tsx      ← MODULES (navigatsiya yagona manbasi)
│   │   ├── States.tsx         ← EmptyState, ErrorState (faol ishlatiladi)
│   │   ├── Layout.tsx, GlobalSearch.tsx, ProtectedRoute.tsx, Toast.tsx, ...
│   │   ├── group-detail/      ← CrmGroupDetail sub-komponentlari
│   │   ├── leads/             ← CrmLeads sub-komponentlari
│   │   ├── portal/            ← FaceIdCheckin va portal komponentlari
│   │   └── ui/                ← Button, Input, Modal, DataTable, StatCard, ...
│   ├── hooks/
│   │   ├── useFirestore.ts    ← Landing kontenti (Firebase)
│   │   ├── useSocket.ts       ← Real-time
│   │   ├── useCrmData.ts, useApi.ts
│   │   └── useApiQuery.ts, useKeyboardShortcuts.ts  ← ULANMAGAN (§7)
│   ├── pages/
│   │   ├── (public: Home, About, Results, EducationSystem, Teachers, Blog, ...)
│   │   ├── crm/              ← 42 ta CRM sahifasi
│   │   └── portal/           ← TelegramPortal, StaffPortal
│   └── utils/
│       ├── grading.ts        ← toLetterGrade, GPA, ECTS, 5-ball
│       ├── formatters.ts     ← formatMoney, formatDate
│       └── logger.ts
└── docs/PROJECT_STATUS.md     ← Bu fayl
```

---

## 5. SERVER ROUTE'LARI (`server/index.ts` da ro'yxatdan o'tgan)

| API prefix | Fayl | Vazifa |
|-----------|------|--------|
| `/api/auth` | auth.ts | Login, JWT |
| `/api/upload` | upload.ts | Rasm yuklash |
| `/api/analytics` | analytics.ts | Dashboard statistikasi |
| `/api/telegram` | telegram.ts | Bot sozlamalari, broadcast (§6) |
| `/api/payments`, `/api/finance` | payments.ts, finance.ts | To'lovlar, moliya |
| `/api/communication`, `/api/notifications` | communication.ts | Aloqa markazi, bildirishnomalar |
| `/api/students` | students.ts | Talaba profili (`/:id`) |
| `/api/quiz` | quiz.ts | Test tizimi (quizAttempt) |
| `/api/ai` | ai.ts | AI kontent generatsiya (@google/genai) |
| `/api/predictions`, `/api/goals` | predictions.ts, goals.ts | AI bashorat, KPI |
| `/api/portal`, `/api/staff-portal` | portal.ts, staffPortal.ts | Mini App'lar |
| `/api/staff-telegram` | staffTelegram.ts | Xodimlar boti |
| `/api/audit`, `/api/salary`, `/api/reports` | audit.ts, salary.ts, reports.ts | Audit, oylik, hisobot |
| `/api/announcements`, `/api/messages` | announcements.ts, messages.ts | E'lonlar, ichki xabarlar |
| `/api/certificates` | certificates.ts | Sertifikatlar (pdf-lib, qrcode, archiver) |
| `/api/backup` | backup.ts | ⚠️ §7 — SQLite uchun yozilgan, PostgreSQL'ga moslanmagan |
| `/api/bulk`, `/api/import`, `/api/transfer` | bulk.ts, import.ts, transfer.ts | Ommaviy/import/ko'chirish |
| `/api/curriculum` | curriculum.ts | Kurs darajalari/modullari |
| `/api/discounts` | discounts.ts | Chegirmalar |
| `/api/ical` | ical.ts | iCal eksport |
| `/api/progress` | progress.ts | O'quvchi progressi (quizAttempt) |
| `/api/tests` | tests.ts | Imtihonlar |
| `/api/branches` | branches.ts | Filiallar CRUD |
| `/api/work-locations` | workLocations.ts | Ish joylari + GPS hudud |
| `/api/staff-attendance` | staffAttendance.ts | Xodim davomati (Face ID) |
| `/api` | crud.ts | Umumiy CRUD (eng oxirida) |

---

## 6. TELEGRAM BOT SOZLAMALARI

Sozlamalar `Setting` modelida kalit-qiymat sifatida saqlanadi:
```
telegram_bot_token        — Talabalar boti tokeni
telegram_admin_chat_id    — Admin chat ID
telegram_auto_attendance  — Avtomatik davomat (true/false)
telegram_auto_payment     — Avtomatik to'lov eslatma (true/false)
telegram_auto_lead        — Avtomatik lid bildirishnoma (true/false)
telegram_mini_app_url     — Talabalar Mini App URL
staff_bot_token           — Xodimlar boti tokeni
staff_mini_app_url        — Xodimlar Mini App URL
```

API endpoint'lar:
```
GET  /api/telegram/settings        — olish
PUT  /api/telegram/settings        — yangilash (FAQAT yuborilgan kalitlar, !== undefined)
POST /api/telegram/test            — test xabar
POST /api/telegram/broadcast       — ommaviy xabar
GET  /api/telegram/history         — tarix
POST /api/telegram/set-menu-button — menu tugmasi
POST /api/telegram/webhook         — grammY webhook
```
`CrmTelegram.tsx` 6 tab: `overview | broadcast | miniapp | settings | history | staffbot`.

---

## 7. MA'LUM MUAMMOLAR / TEXNIK QARZ

### 7.1 `backup.ts` — PostgreSQL'ga moslanmagan
SQLite `dev.db` faylni ko'chiradi, lekin loyiha PostgreSQL'da. Frontend sahifasi yo'q (foydalanuvchiga ko'rinmaydi). `pg_dump` asosida qayta yozish yoki olib tashlash kerak.

### 7.2 Ulanmagan komponentlar/hooklar (E:\ dan ko'chirilgan, hali integratsiya qilinmagan)
Bular **hech qayerda import qilinmagan** — ishlaydi, lekin foydalanilmaydi. Kerak bo'lsa ulang, kerak bo'lmasa o'chiring (xavfsiz):
- `src/components/ImportWizard.tsx` — ommaviy import sehrgari
- `src/components/ReceiptPrint.tsx` — to'lov cheki chop etish
- `src/components/ShortcutsHelp.tsx` — klaviatura yorliqlari oynasi
- `src/components/SWRProvider.tsx` — global SWR konfiguratsiyasi
- `src/components/LazyChart.tsx` — recharts uchun Suspense o'rami
- `src/components/SavedFiltersDropdown.tsx` — saqlangan filtrlar
- `src/components/NotificationCenter.tsx` — bildirishnoma markazi (CrmLayout'da o'rnatilgan inline versiya bor)
- `src/hooks/useApiQuery.ts` — SWR asosidagi data hook
- `src/hooks/useKeyboardShortcuts.ts` — klaviatura yorliqlari hooki

> Tavsiya: yangi sahifalarda data olishda `useApiQuery` (SWR) ni standart qilib joriy etish va yuqoridagilarni bosqichma-bosqich ulash yoki o'chirish.

### 7.3 `CrmStudentProgress.tsx` ↔ `/api/progress`
`progress.ts` `quizAttempt` ishlatadi. Frontend E:\ formatini kutishi mumkin — real ma'lumot bilan tekshirib ko'ring.

---

## 8. MUHIM BUYRUQLAR

```bash
# Schema o'zgartirilganda (migrate EMAS!)
npx prisma db push --accept-data-loss
npx prisma generate

# Development
npm run dev            # server (3001) + vite (3000) birga (concurrently)
npm run server         # faqat backend (tsx watch)

# Tekshiruv / build
npx tsc --noEmit       # = npm run lint (0 xato bo'lishi shart)
npm run build          # vite build → dist/

# Production (E:\ serverda)
npm run start          # build + NODE_ENV=production tsx server/index.ts
pm2 restart tayyorlovmarkaz
```

---

## 9. YANGI SESSIYA UCHUN KO'RSATMALAR

1. `D:\tayyorlovmarkaz` ishchi katalog. Avval **shu faylni** o'qing.
2. Navigatsiya/sahifa o'zgarishlarida — `CrmLayout.tsx` `MODULES` + `App.tsx` route. `detectModule`/`getPageTitle` ga tegmang (avtomatik).
3. Schema o'zgarsa — **doim** `npx prisma db push --accept-data-loss`. `prisma migrate` ishlatmang.
4. Har o'zgarishdan keyin `npx tsc --noEmit`; jiddiy o'zgarishda `npm run build`.
5. Fayl o'chirishdan oldin import qilinishini tekshiring (Grep). Hech narsani ko'r-ko'rona o'chirmang.
6. Ish yakunida **shu faylni yangilang** — keyingi AI to'liq tushunib, sifatli davom etsin.

### Keyingi tavsiya etilgan ishlar
1. §7.1 — `backup.ts` ni `pg_dump` ga moslash yoki olib tashlash.
2. §7.2 — ulanmagan komponentlarni ulash yoki o'chirish bo'yicha qaror.
3. §7.3 — `CrmStudentProgress` ni real ma'lumotda sinash.
4. Ruxsat (`permission`) mosligini barcha modul/route bo'yicha audit qilish.
