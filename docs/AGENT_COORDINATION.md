# Ko'p-agent muvofiqlashtirish (Claude Code + Codex + ixtiyoriy Antigravity)

> Bu hujjat Claude Code va Codex (va agar qo'shilsa, Antigravity CLI) shu
> loyihada **bir vaqtda, bir-biriga xalaqit bermasdan** ishlashi uchun
> protokolni belgilaydi. Ish boshlashdan oldin har bir agent shu faylni
> o'qishi kerak (Claude — `CLAUDE.md`, Codex/Antigravity — `AGENTS.md` orqali
> shu yerga yo'naltiriladi).

## 1. Nega worktree

Bitta papkada ikkita agent bir vaqtda fayl o'zgartirsa — kim nimani
o'zgartirganini kuzatib bo'lmaydi, ikkalasi bitta faylni qayta yozib
qo'yishi mumkin. Yechim: **har bir agent o'zining git worktree'sida ishlaydi**
— alohida papka, alohida branch, bitta umumiy `.git` tarix. Fayl darajasida
to'qnashuv FIZIK jihatdan mumkin emas; git darajasida to'qnashuv (ikkalasi
bir xil faylni turli branch'da o'zgartirgan) faqat merge vaqtida, ko'rinadigan
holda yuzaga keladi.

## 2. Worktree joylashuvi va portlar

| Nom | Yo'l | Branch | Kim ishlatadi | Frontend port | Backend port |
|---|---|---|---|---|---|
| main | `D:\tayyorlovmarkaz` | `master` | Claude Code (asosiy) | 3000 | 3001 |
| codex | `D:\tayyorlovmarkaz-codex` | `agent/codex` | Codex CLI (1-oqim) | 3010 | 3011 |
| codex-2 | `D:\tayyorlovmarkaz-codex-2` | `agent/codex-2` | Codex CLI (2-oqim, parallel) | 3012 | 3013 |
| antigravity | `D:\tayyorlovmarkaz-antigravity` | `agent/antigravity` | Antigravity CLI (1-oqim) | 3020 | 3021 |
| antigravity-2 | `D:\tayyorlovmarkaz-antigravity-2` | `agent/antigravity-2` | Antigravity CLI (2-oqim, parallel) | 3022 | 3023 |

**Parallel oqimlar:** har bir AI (Codex, Antigravity) endi 2 tagacha vazifani
BIR VAQTDA bajarishi mumkin — har biriga alohida worktree/branch/port.
Claude vazifalarni taqsimlashda ikkala oqim bir xil faylga tegmasligini
oldindan tekshiradi (masalan bitta faylni ikkala Codex oqimiga bermaydi).

**Antigravity CLI haqida muhim eslatma (2026-09, `agy` hali yosh vosita):**
`agy`ning headless/skript rejimi (`agy -p`/`--print`, subprocess'dan
chaqirilganda) hozircha yuqori oqim (upstream)da ma'lum xatolarga ega —
ba'zan cheksiz osilib qoladi yoki stdout'ga hech narsa chiqarmaydi (non-TTY
kontekstda). Shu sabab Antigravity hozircha **interaktiv rejimda** (siz yoki
Claude terminal orqali qo'lda `agy` ishga tushirib, natijani ko'rib turgan
holda) ishlatilishi tavsiya etiladi — Codex kabi to'liq avtomatik fon
jarayoni sifatida ishonchli emas. Bu vaziyat vosita yangilanishlari bilan
o'zgarishi mumkin, keyingi safar qayta tekshirish kerak.

`agent/codex/*` — Codex har bir vazifa uchun shu prefiks ostida yangi branch
ochadi (masalan `agent/codex/lead-form-ux`), `master`dan boshlab. To'g'ridan
to'g'ri `master`ga yozmaydi, o'z branch'ini o'zi merge qilmaydi.

**Har bir worktree'da alohida kerak (git kuzatmaydi):**
- `.env` — asosiy papkadan qo'lda ko'chiriladi (worktree yaratilganda
  Claude tomonidan bir marta qilingan; token/parol o'zgarsa qayta ko'chirish
  kerak).
- `node_modules/` — har birida o'z `npm install`i (worktree'lar orasida
  ulanmaydi).
- Prisma Client — har birida o'z `npx prisma generate`i. **Diqqat:** ikkala
  worktree bir xil `node_modules/.prisma` fayl qulfini bir vaqtda yozishga
  urinsa EPERM xatosi chiqishi mumkin (avvalgi sessiyada kuzatilgan) — agar
  ikkalasi ham bir vaqtda schema o'zgartirayotgan bo'lsa, birma-bir
  ishlatish kerak.

## 3. Umumiy dev baza — ehtiyot choralari

Ikkala worktree ham (agar `.env`dagi `DATABASE_URL` bir xil bo'lsa) **bitta**
lokal Postgres bazasiga ulanadi. Bu demak:
- Oddiy CRUD ishlatish (talaba/guruh yaratish, test ma'lumot) ikkalasida ham
  ko'rinadi — muammo emas, hatto foydali (ikkalasi ham haqiqiy ma'lumot bilan
  ishlaydi).
- **Schema o'zgarishi (`npx prisma db push`) FAQAT Claude tomonidan
  qilinadi** (quyidagi §4ga qarang) — Codex worktree'sida schema o'zgartirib,
  boshqa worktree kutilmaganda "field mavjud emas" xatosiga duch kelishi
  mumkin.
- Agar Codex sinov uchun baza yozuvlarini ommaviy yaratsa/o'chirsa, buni
  ishni topshirishda aytib o'tishi kerak (test ma'lumotni tozalash uchun).

## 4. Fayl/hudud egaligi

**Faqat Claude Code tegadi (Codex/Antigravity taklif qiladi, o'zi o'zgartirmaydi):**
- `prisma/schema.prisma` — sxema o'zgarishi butun loyihaga ta'sir qiladi,
  production'ga deploy qilishda alohida qadam talab qiladi (CLAUDE.md'ga q.).
- `server/routes/crud.ts`, `server/middleware/auth.ts` — generic CRUD va RBAC
  yadrosi; bu loyihaning eng ko'p "jim buzilish" bug'lari shu yerdan chiqqan
  (SCHEMA_FIELDS/RELATION_INCLUDES/COLLECTION_READ_LEVEL) — bitta joyni ikki
  agent bir vaqtda tuzatishga urinishi ayniqsa xavfli.
- `deploy.sh`, `.claude/`, SSH/production bilan bog'liq har qanday narsa —
  deploy vakolati faqat Claude Code'ga berilgan (CLAUDE.md/AGENTS.md'da
  yozilgan).

**Codex (yoki Antigravity) erkin ishlashi mumkin:**
- `src/pages/crm/**` — aynan bitta sahifa/komponent ustida ishlash (masalan
  bitta CRM sahifasini UI jihatdan yaxshilash, forma bug'ini tuzatish).
- Yangi, izolyatsiyalangan komponent/util/skript yozish.
- Test/hujjat yozish, mavjud kodni refaktor qilish (schema/crud.ts/auth.ts'ga
  tegmasdan).
- Mustaqil kod review — Claude'ning o'zgarishini boshqa ko'z bilan tekshirish.

Chegara aniq bo'lmagan holat (masalan yangi maydon `schema.prisma`ga HAM,
`SCHEMA_FIELDS`ga HAM qo'shilishi kerak bo'lgan forma) — Codex frontend
qismini tayyorlaydi, schema/backend qismini Claude'ga topshiradi (yoki
so'raydi), ikkalasi alohida commit bo'lib birlashadi.

## 5. Band qilingan ishlar (claims log)

Ish boshlashdan oldin shu ro'yxatga qo'shing, tugagach o'chiring — ikkinchi
agent bir xil fayl/modulni tanlab qolmasligi uchun. Format: `[Agent] soha —
qisqa tavsif — sana`.

<!-- AKTIV: -->
- [Claude] `server/routes/auth.ts`, `server/middleware/auth.ts`, `server/routes/crud.ts`,
  `server/routes/students.ts`, `server/routes/salary.ts`, `server/routes/analytics.ts`,
  `server/routes/payments.ts`, `server/routes/finance.ts` — docs/CRM_FULL_AUDIT_AND_AI_PLAN_2026-09-14.md
  SEC-03, SEC-04, SEC-06, SEC-07, FIN-01/02/03/06, EDU-01/06 — 2026-09-14
- [Antigravity] `server/routes/telegram.ts`, `server/routes/staffTelegram.ts`, `server/bot/index.ts`,
  `server/routes/upload.ts`, `server/routes/staffPortal.ts`, `server/middleware/audit.ts`,
  `server/routes/import.ts`, `server/index.ts`, `vite.config.ts`, `src/api/client.ts`,
  `server/routes/quiz.ts`, `server/routes/tests.ts`, `server/services/gradingService.ts`,
  `src/pages/crm/finance/CrmFinance.tsx`, `src/components/ui/DataTable.tsx`,
  `src/components/ui/Input.tsx`, `src/components/dashboard/widgets/TasksWidget.tsx` —
  docs/CRM_FULL_AUDIT_AND_AI_PLAN_2026-09-14.md SEC-01/02/05/08/09/10/11/12, TEST-01/02,
  FIN-05, 7.1-bo'lim — 2026-09-14

## 6. Merge oqimi

1. Codex/Antigravity o'z branch'ida ishni tugatadi, `npx tsc --noEmit`
   (0 xato) bilan tekshiradi, commit qiladi.
2. Claude Code (yoki foydalanuvchi) `git diff master...agent/codex/<branch>`
   orqali ko'rib chiqadi — boshqa har qanday agent fon-vazifasi kabi,
   ko'rib chiqmasdan merge qilinmaydi.
3. Muammo bo'lmasa, Claude `master`ga merge qiladi (`git merge --no-ff`),
   `npx tsc --noEmit` + kerak bo'lsa brauzerda tekshiradi.
4. Deploy — alohida, foydalanuvchi so'ragan yoki tabiiy davomi bo'lgan
   holatda, faqat Claude orqali (CLAUDE.md'dagi mavjud protokol bo'yicha).

## 7. Xavfsizlik eslatmasi (qisqa)

Production serverga SSH/deploy vakolati **faqat Claude Code'ga** berilgan —
bu foydalanuvchi bilan uzoq ishlash tarixidan kelib chiqqan, alohida
ishonch. Codex yoki Antigravity hech qachon `ssh`/`deploy.sh` ishlatmaydi,
hatto vazifa "deploy qil" deb qo'yilgan bo'lsa ham — bunday so'rov kelsa,
ishni tayyor deb belgilab, Claude Code yoki foydalanuvchiga topshiradi.
