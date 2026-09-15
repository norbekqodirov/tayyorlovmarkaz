# Antigravity uchun prompt — audit topilmalari, 1-partiya

Quyidagi matnni to'liq nusxalab, `D:\tayyorlovmarkaz-antigravity` papkasida
(bu sizning worktree'ingiz, `agent/antigravity` branch, joriy `master`
bilan sinxronlangan) `agy`ga bering.

---

```text
Avval AGENTS.md va docs/AGENT_COORDINATION.md ni to'liq o'qi va ularga
qat'iy rioya qil. Bu ayniqsa muhim: quyidagi fayllarga HECH QACHON tegma
— prisma/schema.prisma, server/routes/crud.ts, server/middleware/auth.ts,
deploy.sh, .claude/ yoki SSH/production bilan bog'liq har qanday narsa.
Bular Claude Code'ning mutlaq vakolatida. Agar tuzatish shu fayllarga
tegishishi kerak bo'lib qolsa — o'sha qismni o'tkazib yubor va nima
uchun ekanini yakuniy hisobotda ayt, o'zing tegma.

Sen `agent/antigravity` branch'idasan, u hozir `master`ning eng oxirgi
holatiga (`4807b2b`) sinxronlangan. To'g'ridan-to'g'ri master'ga yozma,
o'z branch'ingda ishla, Claude keyin ko'rib chiqib merge qiladi.

docs/CRM_FULL_AUDIT_AND_AI_PLAN_2026-09-14.md faylini to'liq o'qi — bu
Codex tomonidan yozilgan kodga asoslangan audit. Quyidagi topilmalarni
ANIQ shu tartibda, har birini ALOHIDA commit sifatida tuzat. Har commit'dan
oldin joriy kodni audit yozganidan beri o'zgarmaganini tekshir (Claude
allaqachon boshqa topilmalarni tuzatgan bo'lishi mumkin — agar allaqachon
tuzatilgan bo'lsa, o'tkazib yubor va hisobotda ayt).

=== TOPSHIRIQLAR (birma-bir, har biri alohida commit) ===

1. SEC-01 — server/routes/telegram.ts, GET /api/telegram/set-webhook
   (audit hujjatidagi bo'limga qara). Autentifikatsiyasiz. Tuzat:
   requireAuth + tegishli permission tekshiruvi qo'sh (mavjud
   src/constants/permissions.ts'dagi 'settings' yoki mos keladigan
   permission'dan foydalan — yangi permission ID kerak bo'lsa,
   ALL_PERMISSIONS + ROLE_TEMPLATES'ga frontend tomonda qo'shish mumkin,
   bu schema.prisma emas). Holat o'zgartiruvchi amalni GET'dan POST'ga
   o'tkaz (frontend chaqiruvchisi bo'lsa, uni ham yangilash kerak — grep
   bilan top). Webhook manzilini ruxsat etilgan HTTPS domenlar bilan
   solishtir. Audit yozuvi qo'sh (mavjud audit middleware'dan foydalan).

2. SEC-02 — server/routes/staffTelegram.ts:29, server/bot/index.ts:97.
   Ikkala webhook uchun ham Telegram secret token tekshiruvi qo'sh
   (X-Telegram-Bot-Api-Secret-Token header, Setting jadvalida saqlangan
   secret bilan solishtir). Kontakt tasdig'ida contact.user_id yuboruvchi
   (from.id) bilan mos kelishini tekshir. Allaqachon bog'langan hisobni
   qayta bog'lashda xato/ogohlantirish qaytar (jimgina almashtirmasin).

3. SEC-05 — server/routes/telegram.ts:161, server/routes/staffTelegram.ts:366.
   Bot sozlamalarini yozish/yuborish/broadcast endpointlarida faqat
   requireAuth o'rniga tegishli requirePermission qo'sh (masalan
   'communication' yoki 'settings' — mavjud permission tizimidan
   foydalan, docs/AGENT_COORDINATION.md'da yozilganidek bu senga ochiq).

4. SEC-08 — server/routes/upload.ts. Kengaytma/MIME qattiq ro'yxat bilan
   tekshir (regex emas). SVG'ni rad et yoki xavfsiz tozalab qabul qil.
   Fayl nomi/yo'lini resolve qilib upload papkasidan tashqariga
   chiqmasligini tekshir (path traversal). O'chirishda so'rovchi fayl
   egasi yoki tegishli ruxsatga ega ekanini tekshir.

5. SEC-09 — server/routes/staffPortal.ts:697. Mijozdan kelgan
   `faceBypass` parametrini ENDI ishonib qabul qilma — buni faqat
   ADMIN/MANAGER darajasidagi foydalanuvchi so'rovida, alohida
   audit yozuvi bilan serverda tekshir. Descriptor massivida barcha
   128 element chekli (finite) son ekanini tekshir.

6. SEC-10 — server/middleware/audit.ts. Audit yozuvi saqlashdan oldin
   `password`, token, descriptor kabi maxfiy maydonlarni obyektdan olib
   tashla yoki "***" bilan maskalab yoz.

7. SEC-11 — package.json'dagi `xlsx` paketini SheetJS rasmiy manbasidan
   (https://cdn.sheetjs.com — audit hujjatidagi havolaga qara)
   CVE-2024-22363'dan tashqari xavfsiz versiyaga yangila. server/routes/import.ts
   ga qator/hajm limiti qo'sh (masalan 10000 qator, fayl hajmi chegarasi).

8. SEC-12 — server/index.ts:83 dagi CORS tekshiruvini `startsWith` o'rniga
   aniq origin tengligi (`===` yoki ruxsat etilgan ro'yxatda `includes`)
   bilan almashtir. Production'da ichki xato xabarlarini (`err.message`)
   klientga chiqarishni to'xtat, umumiy xabar qaytar (log'da to'liq
   qoldirilsin). vite.config.ts'dagi AI kalitni frontend'ga oshkor
   qiladigan `define` sozlamasini olib tashla (frontend hozircha
   ishlatmayotgani tasdiqlangan).

9. TEST-01 — server/routes/quiz.ts:225 atrofidagi attempt endpointlari.
   Start'da testning public/active holatini qayta tekshir. Savol shu
   urinish testiga tegishli ekanini tekshir. Yakunlangan urinishga javob
   yozishni blokla. Finish qayta chaqirilganda takror Assessment
   yaratilmasligini tekshir (idempotent qil).

10. TEST-02 — server/routes/tests.ts:297, server/services/gradingService.ts.
    Javobsiz savol uchun Answer topilmasa 500 bermasin — 0 ball sifatida
    hisoblansin, yakunlash muvaffaqiyatli tugasin.

11. FIN-05 — src/pages/crm/finance/CrmFinance.tsx:373 atrofidagi oylik
    hisobot/grafik filtri. Faqat `getMonth()` solishtirilayotgan joylarni
    top, yil ham (`getFullYear()`) solishtirilishini ta'minla — turli
    yillarning bir xil oylari qo'shilib ketmasin.

12. 7.1-bo'lim (accessibility) — quyidagilarni tuzat:
    - src/components/ui/DataTable.tsx: saralash va qator ochish
      klaviaturada ham ishlasin (onKeyDown/tabIndex/role), saralash
      holati aria-sort bilan ifodalansin, checkbox'larga aria-label.
    - src/components/ui/Input.tsx: har renderda tasodifiy ID yaratish
      o'rniga React useId ishlatilsin; xato holatida aria-invalid va
      aria-describedby bog'lansin.
    - src/components/dashboard/widgets/TasksWidget.tsx: umumiy
      'crm_tasks' localStorage kaliti o'rniga joriy foydalanuvchi ID'siga
      bog'langan kalit ishlatilsin (masalan `crm_tasks_${userId}`).

=== HAR BIR TOPSHIRIQ UCHUN MAJBURIY ===

- Tuzatishdan oldin muammoni joriy koddan mustaqil tasdiqla (audit
  satr raqamlari eskirgan bo'lishi mumkin — funksiya/endpoint nomi
  bilan qidir).
- Tuzatish minimal va aynan shu topilmaga tegishli bo'lsin — yon
  refaktor qilma.
- `npx tsc --noEmit` — 0 xato bo'lishi shart, har commit'dan oldin.
- UI/matn/commit xabari o'zbek tilida.
- Har biri uchun alohida, aniq commit xabari yoz (nima va nega).
- Agar topilma allaqachon boshqa agent tomonidan tuzatilgan bo'lsa,
  shu haqda commit qilmasdan, yakuniy hisobotda ayt.
- Agar tuzatish uchun biznes qarori kerak bo'lsa (masalan qaysi
  permission ID ishlatish) — eng oqilona standart tanlab davom et,
  hisobotda nima tanlaganingni va nega ayt.
- SSH, deploy.sh yoki productionga umuman tegma — bu ish tugagach
  Claude Code ko'rib chiqadi va u orqali chiqadi.

Ishni tugatgach: docs/AGENT_COORDINATION.md dagi "Band qilingan ishlar"
ro'yxatidan o'zingning qatoringni o'chir, va menga (foydalanuvchiga)
qaysi topshiriqlar bajarilgani, qaysilari o'tkazib yuborilgani (va nega)
haqida qisqa hisobot ber.
```
