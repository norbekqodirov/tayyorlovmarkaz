# Tayyorlov Markazi CRM — Loyiha Holati

> Bu hujjat yangi Claude/AI sessiyasida ishni davom ettirish uchun yagona manba (single source of truth).
> **Yangi sessiyada birinchi shu faylni to'liq o'qing.**
>
> Ishchi katalog: `D:\tayyorlovmarkaz` (lokal, PostgreSQL bilan ishlaydi)
> Ishlab chiqarish (production) serveri: SSH `46.8.194.26` (user `tayyorlovmarkaz`),
> `/home/tayyorlovmarkaz/tayyorlovmarkaz/` — **SQLite** bilan ishlaydi (§0.6 ga q.),
> `bash deploy.sh` orqali yangilanadi, PM2 (`pm2 restart tayyorlovmarkaz`) boshqaradi.
> Oxirgi yangilanish: 2026-08-11 (Marketing/Lidlar moduli production'ga chiqarilmoqda — §3.7–3.8 ga q.)

---

## 0. TL;DR — Eng muhim qoidalar

1. **Lokal DB: PostgreSQL.** Schema o'zgartirilganda **faqat** `npx prisma db push --accept-data-loss` — `prisma migrate` **HECH QACHON** ishlatilmaydi. `prisma/dev.db` eski SQLite qoldig'i, ishlatilmaydi.
2. **MUHIM — Production DB: SQLite, lokal DB'dan farqli!** Serverda `git update-index --skip-worktree prisma/schema.prisma` o'rnatilgan — `schema.prisma`ning serverdagi nusxasi qo'lda `provider = "sqlite"` (va `@db.Text` siz) qilib saqlangan, `git pull` buni ustidan yozmaydi. Schema o'zgarishi productionga borishi kerak bo'lsa: additive-only (yangi nullable ustun/jadval), avval backup, keyin **qo'lda** serverda `prisma db push` — `deploy.sh` buni AVTOMATIK QILMAYDI.
3. **`deploy.sh` frontendni BUILD QILMAYDI.** Faqat `git pull` + schema-fix + `npm install` + `prisma generate` + `pm2 restart`. `dist/` `.gitignore`da. Frontend o'zgarishi productionga chiqishi uchun: lokal `npm run build` → `dist/`ni `tar -czf` bilan paketlash → SCP → serverda `rm -rf dist && mkdir dist && tar -xzf ... -C dist`.
4. **Navigatsiya yagona manbasi: `src/components/CrmLayout.tsx` dagi `MODULES` massivi.** Yangi sahifa qo'shish uchun faqat (a) `MODULES` ga nav link, (b) `App.tsx` ga route qo'shing. `detectModule`/`getPageTitle` larni **qo'lda tahrirlash shart emas** — ular `MODULES` dan avtomatik hosil bo'ladi (`findActiveLink` orqali).
5. Nav link `permission` qiymati `App.tsx` dagi route `requiredPermission` bilan **bir xil** bo'lishi shart. **Diqqat:** agar foydalanuvchida custom `permissions` massivi bo'lsa, `requiredPermission` FAQAT frontendda (`ProtectedRoute`) tekshiriladi — backend (`crud.ts`/`leads.ts`/...) faqat ROL darajasini (`TEACHER<MANAGER<ADMIN<SUPER_ADMIN`) tekshiradi, custom permission array'ni umuman bilmaydi. Ya'ni "administrator UI'da o'chirib qo'ygan" ruxsat API'ga to'g'ridan-to'g'ri so'rov bilan baribir ishlaydi (§7.6 ga q.) — bu bilinigan strukturaviy kamchilik, hali tuzatilmagan.
6. O'zgarishdan keyin doim tekshiring: `npx tsc --noEmit` (0 xato bo'lishi kerak) va kerak bo'lsa `npm run build`.

---

## 1. LOYIHA HAQIDA

**Tayyorlov Markazi** — o'quv markazlari uchun to'liq CRM tizimi (talabalar, guruhlar, moliya, HR, marketing, analitika, Telegram botlar, sertifikatlar, Face ID davomat).

| Qatlam | Texnologiyalar |
|--------|---------------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 6, React Router v7, framer-motion, recharts |
| Backend | Express.js 4, Prisma ORM v5, **PostgreSQL (lokal) / SQLite (production)** — §0.2 ga q. |
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

### 3.6 To'rtinchi sessiya (2026-08-07) — forma-bo-forma chuqur audit
CrmStaff→CrmTeachers→CrmFinance→CrmStudents→CrmGroups→CrmCourses ketma-ket tekshirildi. "Maydon SCHEMA_FIELDS'da yo'q YOKI Prisma'da ustun sifatida umuman yo'q, lekin forma baribir to'ldirib yuboradi (jimgina yo'qoladi)" bug sinfining yana bir varianti topildi:
- `User.avatar` — `auth.ts`ning POST/PUT `/users` uni body'dan o'qimasdi → ustoz rasmi hech qachon saqlanmasdi. Tuzatildi.
- `Course.image` — Prisma modelida USTUN SIFATIDA UMUMAN YO'Q edi, lekin `CrmCourses.tsx`da to'liq ishlaydigan rasm yuklash UI'si bor edi (o'zining base64 `FileReader`i, umumiy `ImageUpload` komponentidan foydalanmasdi). Schema'ga `image String?` qo'shildi, forma umumiy `ImageUpload`ga o'tkazildi.
- **Eng katta topilma: `'teachers'` generic kolleksiyasi.** `MODEL_MAP`da yo'q, shu nomli Prisma modeli ham yo'q → `GenericDocument` fallback'ga tushardi, lekin hech kim unga yozmagan (haqiqiy ustozlar `User.role=TEACHER` orqali saqlanadi) — `useFirestore('teachers')` doim BO'SH qaytardi. Bu ommaviy sayt `/ustozlar`, `GlobalSearch`, `CrmDashboard`, `CrmBI`, `CrmFinance`ning ustoz-tanlash dropdown'ini buzgan edi (5 joy). Yechim: `crud.ts`ga `getPublicTeachersList()` — `GET /api/teachers`ni `User(role=TEACHER)`dan xavfsiz proyeksiya bilan hisoblaydi.
Commit: `7b0ddc9` (Teachers/Finance), `1b8adcd` (Students/Groups/Courses).

### 3.7 Beshinchi–Oltinchi sessiya (2026-08-07/09) — dizayn izchilligi, production deploy, RBAC bugi
- **Dizayn izchilligi (7 to'lqin):** ~21 fayl (HR/Marketing/Communication/Management/Finance) qo'lda yozilgan modal/stat-card'lardan umumiy `Modal`/`StatCard`/`Input`/`Button`/`MoneyInput`/`PhoneInput`/`ConfirmDialog` komponentlariga ko'chirildi.
- **Birinchi production deploy** — GitHub push + server git setup (`git reset --hard origin/master`), keyinchalik `deploy.sh` + skip-worktree sxemasi shu yerdan boshlab qat'iylashdi (§0.2-0.3 ga q.).
- **StaffPortal "Xabar" tabi yo'q edi** — 5-sessiyada faqat ota-ona tomoniga chat qo'shilgan, xodim tomoni unutilgan ekan. `staffPortal.ts`ga `/chat-threads` qo'shildi.
- **KRITIK — `User.permissions`ning ikki xil maqsadda ishlatilishi (RBAC vs metadata) to'qnashuvi:** `CrmTeachers.tsx` o'qituvchi qo'shishda `permissions`ga `[{meta:{subject,exp,desc}}]` (obyektlar massivi) yozardi, lekin bu maydon `ProtectedRoute.tsx`da RBAC ruxsatlar ro'yxati (`perms.includes(...)`) sifatida ishlatiladi — natijada shu yo'l bilan qo'shilgan HAR BIR o'qituvchi faqat Dashboard'ga kira olardi. Yechim: `User`ga alohida `subject`/`experience`/`bio` ustunlar qo'shildi, `CrmTeachers.tsx` endi `permissions`ga tegmaydi. **Production'da bitta martalik `scripts/fix_teacher_permissions.ts` ishga tushirilishi SHART edi** (buzilgan mavjud hisoblarni tuzatish uchun) — bu skript ishlatilganmi, tasdiqlanmagan, tekshirilishi kerak.
Commit: `dddad10`.

### 3.8 Yettinchi sessiya (2026-08-09/11) — Marketing/Lidlar moduli 8 faza (to'liq qayta qurish)
Foydalanuvchi "davom et oxirigacha o'zing qil" deb tasdiqlagan avtonom bajarilish. Audit shuni ko'rsatdiki, modul sirtdan to'liq ko'rinardi, lekin uchta katta qism ishlamas edi (`predictions.ts` himoyasiz, `CrmForms.tsx` forma yaratish 500 berardi, ROI doim −100% edi). 8 ta commit (`ce6305c`→`6c7a0d5`), har biri `tsc`+`build` bilan tekshirilgan:
1. Xavfsizlik (`predictions.ts`ga auth), bug tuzatishlar, STAGES yagona manbaga.
2. `Lead` sxemasi kengaytirildi (assignedTo/SLA/UTM/campaignId/studentId/duplicateOfId), `leadIntake.ts` — bitta umumiy qabul quvuri.
3. `server/routes/leads.ts` — `crud.ts`dan ajratilgan maxsus router.
4. `useLeads.ts` + Kanban/List/Detail/Modal qayta qurildi (server-side filtr/sahifalash).
5. `server/routes/marketing.ts` — ROI/CAC/CPL/ROAS haqiqiy `Lead.campaignId`+`studentId`+`Payment`dan.
6. `/api/leads/settings` — taqsimlash/SLA/ish vaqti (ADMIN).
7. Soxta "Avtomatizatsiya" tabi olib tashlandi, `scheduler.ts`ga 4 yangi job (barchasi `isActive:false` bilan seed — **ADMIN Sozlamalar orqali qo'lda yoqishi kerak**).
8. `src/utils/utm.ts`, `LeadCaptureWidget.tsx` (Bosh sahifa), `LeadForm.tsx` qayta yozildi, `withAudit('lead')` ulandi.

**Deploy holati (sessiya oxirida):** faqat local commit, **productionga hali push/deploy qilinmagan edi** — Lead modeliga ~25 yangi ustun qo'shilgani sababli, deploy qilishdan oldin production SQLite bazasida qo'lda `npx prisma db push` shart (barcha o'zgarish additive, xavfsiz).

### 3.9 Sakkizinchi sessiya (2026-08-11, bugungi) — Lidlar moduli ishga tushirishga tayyorlash + to'liq audit
Foydalanuvchi bu modulni birinchi bo'lib ishlatishni boshlaydi, shuning uchun ishga tushirishdan oldingi jilo va audit:
- **Lid formalaridan email butunlay olib tashlandi** (Contact.tsx, LeadForm.tsx, CRM `LeadFormModal.tsx`) — markazda email ishlatilmaydi.
- **Butun tizim shrifti Manrope'ga o'zgartirildi** — `@fontsource/manrope` orqali mahalliy (self-hosted), Google Fonts CDN'siz (tarixiy bug: CDN import UZ/Telegram WebView'da CSS yuklanishini bloklagan edi).
- **"Sinf" maydoni erkin matndan 2–6-sinf tanlov (dropdown)ga o'zgartirildi**, uch joyning uchalasida ham (public forma, `/l/:formId`, CRM modal).
- **Lid forma sarlavhasi standartlashtirildi** — avval `/l/:formId` sahifasida forma nomi ("Insta" kabi) sarlavha sifatida ko'rinardi; endi doim "Ro'yxatdan o'tish" ko'rsatiladi, forma nomi faqat CRM ichida (qaysi formadan qancha lid kelayotganini bilish uchun) ishlatiladi.
- **Kanban lead kartochkasi ixchamlashtirildi va chap chetidagi rang chiziq olib tashlandi** (kichik nuqta bilan almashtirildi) — kartochka balandligi kamaytirildi, telefon/menejer qatorlari birlashtirildi.
- **Brauzer tab nomi** `index.html`da "My Google AI Studio App" (Google AI Studio'dan qolib ketgan default) → "10+10 Tayyorlov Markazi" ga tuzatildi, `lang="en"`→`"uz"`, meta description qo'shildi.
- **To'liq xavfsizlik/tezlik/kod sifati auditi** o'tkazildi — natijalar §7 (Ma'lum muammolar) bo'limida.

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
│   │   ├── (public: Home, About, Results, EducationSystem, Teachers, Blog, Contact, LeadForm, ...)
│   │   ├── crm/               ← CRM sahifalari, 7 modulga guruhlangan (2026-08-06 dan beri, flat EMAS):
│   │   │   ├── education/     ← CrmStudents, CrmGroups, CrmCourses, CrmSchedule, CrmJournal, CrmQuiz, CrmTests, ...
│   │   │   ├── marketing/     ← CrmLeads, CrmForms, CrmMarketing, CrmAIContent
│   │   │   ├── communication/ ← CrmCommunication, CrmAnnouncements, CrmTelegram, CrmParentChat
│   │   │   ├── hr/            ← CrmTeachers, CrmStaff, CrmStaffDetail, CrmStaffAttendance, CrmWorkLocations
│   │   │   ├── finance/       ← CrmFinance, CrmDiscounts
│   │   │   ├── analytics/     ← CrmBI, CrmPredictions, CrmGoals, CrmExecutiveReport
│   │   │   └── management/    ← CrmBranches, CrmRooms, CrmInventory, CrmAutomations, CrmCertificates, CrmReports, CrmAudit, CrmUsers, CrmSettings
│   │   │       (CrmLogin.tsx modul emas, `crm/` ildizida qoladi)
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
| `/api/public` | **public.ts** | ⭐ Login talab qilmaydigan ommaviy endpointlar — lid formalar, forma config/ko'rish (§3.7-3.8) |
| `/api/upload` | upload.ts | Rasm yuklash |
| `/api/analytics` | analytics.ts | Dashboard statistikasi |
| `/api/telegram` | telegram.ts | Bot sozlamalari, broadcast (§6) |
| `/api/payments`, `/api/finance` | payments.ts, finance.ts | To'lovlar, moliya |
| `/api/communication`, `/api/notifications` | communication.ts | Aloqa markazi, bildirishnomalar |
| `/api/parent-chat` | parentChat.ts | Ota-ona ↔ xodim chat (Message modeli, FK'siz sxema) |
| `/api/students` | students.ts | Talaba profili (`/:id`) |
| `/api/quiz` | quiz.ts | Test tizimi (quizAttempt) |
| `/api/ai` | ai.ts | AI kontent generatsiya (@google/genai) |
| `/api/predictions`, `/api/goals` | predictions.ts, goals.ts | AI bashorat, KPI |
| `/api/portal`, `/api/staff-portal` | portal.ts, staffPortal.ts | Mini App'lar |
| `/api/staff-telegram` | staffTelegram.ts | Xodimlar boti |
| `/api/audit`, `/api/salary`, `/api/reports` | audit.ts, salary.ts, reports.ts | Audit, oylik, hisobot |
| `/api/announcements`, `/api/messages` | announcements.ts, messages.ts | E'lonlar, ichki xabarlar |
| `/api/certificates` | certificates.ts | Sertifikatlar (pdf-lib, qrcode, archiver) |
| `/api/backup` | backup.ts | `server/services/dbBackup.ts` orqali Postgres/SQLite ikkalasini ham qo'llab-quvvatlaydi (§7 — Fixed) |
| `/api/bulk`, `/api/import`, `/api/transfer` | bulk.ts, import.ts, transfer.ts | Ommaviy/import/ko'chirish |
| `/api/curriculum` | curriculum.ts | Kurs darajalari/modullari |
| `/api/discounts` | discounts.ts | Chegirmalar |
| `/api/ical` | ical.ts | iCal eksport |
| `/api/leave` | leave.ts | Mehnat ta'tillari |
| `/api/progress` | progress.ts | O'quvchi progressi (quizAttempt) |
| `/api/tests` | tests.ts | Imtihonlar |
| `/api/transfer` | transfer.ts | O'quvchi/guruh ko'chirish |
| `/api/branches` | branches.ts | Filiallar CRUD |
| `/api/work-locations` | workLocations.ts | Ish joylari + GPS hudud |
| `/api/staff-attendance` | staffAttendance.ts | Xodim davomati (Face ID) |
| `/api/leads` | **leads.ts** | ⭐ Lidlar — `crud.ts`dan OLDIN mount, generic CRUD'ni "leads" uchun soyalaydi (§3.7) |
| `/api/marketing` | **marketing.ts** | ⭐ ROI/CAC/CPL/funnel/manager reytingi — haqiqiy Lead+Payment zanjiridan (§3.7) |
| `/api` | crud.ts | Umumiy CRUD (eng oxirida mount qilinadi — yuqoridagi maxsus router'lar ustunlik qiladi) |

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

> **2026-08-05 yangilanish: §7.1–7.3 va BUG_AUDIT.md dagi barcha High/Critical bug'lar tuzatildi.**
> Tafsilotlar uchun `docs/BUG_AUDIT.md` ga qarang. Qisqacha:
> - `backup.ts` + `auth.ts`ning `/backup` — endi `server/services/dbBackup.ts` orqali Postgres (`pg_dump`) va SQLite (fayl nusxa) ikkalasini ham to'g'ri qo'llab-quvvatlaydi.
> - `crud.ts`da **jiddiy** bug topildi va tuzatildi: `Attendance.records`/`GroupSchedule.days` JSON-string maydonlariga frontend'dan massiv to'g'ridan-to'g'ri yozilardi (Prisma validatsiya xatosi) — bu **davomat belgilash va dars jadvali yaratishni butunlay ishlamas qilardi**. Endi `stringifyJsonFields`/`parseJsonFields` bor.
> - Ulanmagan komponentlar (§7.2 eski ro'yxati): `useKeyboardShortcuts`/`ShortcutsHelp`/`ImportWizard`/`ReceiptPrint`/`SWRProvider` aslida ALLAQACHON ulangan ekan (ro'yxat eskirgan edi). `NotificationCenter`ning real-time (socket) qismi `CrmLayout`ga ko'chirildi, standalone fayl o'chirildi. `LazyChart`, `SavedFiltersDropdown`, `useApiQuery` hech qayerda ishlatilmagani va ulash muhim yangi feature talab qilgani uchun **o'chirildi**.
> - `CrmStudentProgress.tsx` (§7.3) — backend javobi bilan mos kelmasligi tasdiqlandi va tuzatildi (assessments/tests obyekt vs massiv, `monthlyTrend`, `payments.totalPaid/pendingAmount`, homework ajratish).
> - Bonus: Face ID xodim davomatida server UTC vaqt zonasi bug'i (`soat 5 soat siljiydi`) — `server/utils/timezone.ts` bilan tuzatildi.
>
> Hali OCHIQ (kelgusi sessiyaga qoldirilgan, kattaroq refaktorlar):
> - CrmFinance/CrmDashboard client-side hisoblash → server-side ga o'tkazish (Faza 1.1)
> - CrmGroupDetail (~40KB) bo'linishi (Faza 0.3)
> - Vaqt zonasi (UTC) muammosi loyihaning boshqa fayllarida ham bor: `scheduler.ts`, `analytics.ts`, `portal.ts` — `server/utils/timezone.ts` yordamchilarini shu yerlarga ham qo'llash kerak.

### 7.4 Sakkizinchi sessiya (2026-08-11) — xavfsizlik/tezlik/sifat auditi — Fixed

To'liq loyiha auditi (Lidlar moduli birinchi ishga tushirilishi oldidan). Tafsilotlar `docs/BUG_AUDIT.md`da. Qisqacha, hammasi shu sessiyada tuzatildi va tekshirildi (`tsc`+`build`+live server orqali):

**Kritik (xavfsizlik):**
- **`JWT_SECRET` fallback bug** — 6 ta fayl (`middleware/auth.ts`, `routes/auth.ts`, `routes/portal.ts`, `routes/staffPortal.ts`, `routes/staffTelegram.ts`, `services/realtime.ts`) `JWT_SECRET` o'rnatilmasa OG'IZ ochiq matn (`'fallback-secret-key-for-local'`/`'dev-only-secret-key'` — ikkisi hatto BIR-BIRIGA ham mos kelmasdi) bilan tokenlarni imzolashni davom ettirardi — bu muhitda o'zgaruvchi tasodifan o'chib qolsa, kodni ko'rgan har kim SUPER_ADMIN token yasay olardi. Yechim: `server/config/jwtSecret.ts` — yagona manba, `JWT_SECRET` yo'q bo'lsa serverni **darhol yiqitadi** (fail-fast), boshqa hech qanday joyda mahalliy fallback qolmadi.
- **`/api/quiz` (admin qismi), `/api/ai/*`, `/api/goals` — umuman autentifikatsiyasiz edi.** Har kim login qilmasdan istalgan testni o'chira olardi (`DELETE /api/quiz/:id`), Gemini API kvotasini charxlashi mumkin edi (`POST /api/ai/*` — moliyaviy xarajat xavfi), KPI maqsadlarini o'qiy/o'chira olardi. `quiz.ts`da FAQAT haqiqiy ommaviy oqim (`/public/:slug`, `/:id/start`, `/attempts/*` — anonim test topshiruvchi uchun, `PublicQuiz.tsx`) ochiq qoldirildi, qolgan hammasiga `requireAuth`; `ai.ts`/`goals.ts`ga router-darajasida `requireAuth` (`goals.ts`ga `requireMinRole('MANAGER')` ham) qo'shildi.
- **Click to'lov webhook'ida holat tekshiruvi yetishmasdi** — `payments.ts`ning Click "Complete" (`action=1`) filiali faqat `tx.state===1` (allaqachon bajarilgan)ni alohida ko'rardi, lekin `tx.state===2` (bekor qilingan/xato) holatini TEKSHIRMASDAN baribir hisobni kreditlab yuborardi — Payme filialida bu tekshiruv bor edi, Click'da yo'q edi. Endi `tx.state===2` uchun ham aniq rad javobi (`error: -9`) qo'shildi.

**O'rtacha:**
- **Sertifikat tekshirish sahifasi butunlay ishlamasdi** — `CrmCertificates.tsx` `/verify/:serial`ga havola berardi va QR kod generatori (`certificateService.ts`) ham xuddi shu URL'ni ishlatardi, lekin `App.tsx`da faqat `/verify-cert/:id` ro'yxatdan o'tgan edi (404) — hatto to'g'ri bo'lganda ham `VerifyCert.tsx` `useParams().serial`ni o'qirdi, `:id` esa boshqa nom edi. Route `/verify/:serial`ga tuzatildi (link/QR/component allaqachon shunga mos edi — **shu yo'l bilan eski, allaqachon bosilgan sertifikatlardagi QR kodlar ham ishlay boshladi**, chunki ular o'zgartirilmadi).
- **`CrmInventory.tsx` `status`/`description`ni jimgina yo'qotardi** — bu maydonlar Prisma'da yo'q (haqiqiy nomlari `condition`/`notes`), `SCHEMA_FIELDS`da ham ro'yxatda emas edi — CLAUDE.md'dagi "silently dropped field" bug sinfining yana bir namunasi. Frontend `condition`/`notes`ga moslashtirildi.
- **`billing.ts`da N+1 so'rov zanjiri** — `calculateTeacherMonthlyRevenue` har bir guruh/o'quvchi uchun ketma-ket (`for await`) so'rov yuborardi (5 guruh × 25 o'quvchi ≈ 100+ ketma-ket DB so'rovi, `CrmTeachers.tsx`dagi oylik hisoblash uchun). `Promise.all` bilan parallellashtirildi — natija bir xil, faqat tezroq.
- **`GET /api/payments/generate-links` autentifikatsiyasiz edi** — istalgan kishi `studentId` orqali haqiqiy Payme/Click to'lov havolalarini yasay olardi va 404/200 farqidan talaba ID'larini "sanab chiqishi" (enumerate) mumkin edi. `requireAuth` qo'shildi.

**Kichik:**
- O'zi hech qayerda ishlatilmagan `src/components/ui/ChartCard.tsx` o'chirildi (`CrmBI.tsx` o'zining alohida nusxasini ishlatadi).
- `index.html` sarlavhasi ("My Google AI Studio App" — Google AI Studio'dan qolgan default) → "10+10 Tayyorlov Markazi"; `lang="en"`→`"uz"`.

**Hali OCHIQ qoldi (§0.5 ga ham q. — RBAC gap):**
- Backend hech qayerda foydalanuvchining custom `permissions` massivini tekshirmaydi — faqat rol darajasi (`requireMinRole`). Bu butun loyihaga tarqalgan strukturaviy masala, bitta sessiyada xavfsiz tuzatib bo'lmaydi (har bir route uchun to'g'ri permission key aniqlash kerak) — alohida vazifa sifatida qoldirildi.
- `server/routes/marketing.ts`ning `/by-campaign`, `/by-form`, `/managers` endpointlarida N+1 naqsh bor (har bir kampaniya/forma/menejer uchun alohida so'rov). Bu loyihaning hozirgi kichik hajmida (o'nlab kampaniya/menejer) sezilarli emas, lekin o'sishda `groupBy`ga o'tkazish tavsiya etiladi.

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

# Production (SSH 46.8.194.26, /home/tayyorlovmarkaz/tayyorlovmarkaz/, SQLite)
bash deploy.sh          # git pull + schema-fix (SQLite) + npm install + prisma generate + pm2 restart
                         # ⚠️ frontend BUILD QILMAYDI — dist/ o'zgarishi uchun lokal build+tar+SCP shart (§0.3)
                         # ⚠️ schema o'zgarsa — bu skript db push QILMAYDI, qo'lda serverda bajarish shart (§0.2)
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
1. **Backend RBAC gap** (§7.4) — custom `permissions` massivini backend darajasida ham tekshirish (hozir faqat rol darajasi tekshiriladi). Katta, ehtiyotkorlik bilan qilinishi kerak bo'lgan ish.
2. Marketing/Lidlar moduli — **hali productionga deploy qilinmagan** (§3.8-3.9), Lead sxemasiga ~25 yangi ustun qo'shilgan — deploy qilishdan oldin production SQLite bazasida qo'lda `prisma db push` SHART (§0.2).
3. Vaqt zonasi (UTC) muammosini `scheduler.ts`/`analytics.ts`/`portal.ts` da ham tuzatish (`server/utils/timezone.ts` allaqachon bor).
4. CrmFinance/CrmDashboard hisoblashni server-side ga o'tkazish (Faza 1.1).
5. CrmGroupDetail (~40KB) sub-komponentlarga bo'lish (Faza 0.3).
6. `marketing.ts`dagi N+1 so'rovlarni (`/by-campaign`, `/by-form`, `/managers`) kampaniya/menejer soni ko'paysa `groupBy`ga o'tkazish.
7. Face ID xodim davomatini real qurilmada sinab ko'rish (mobil Telegram WebView).
8. `scripts/fix_teacher_permissions.ts` productionda ishga tushirilganmi — tasdiqlanmagan (§3.7), tekshirish kerak.
