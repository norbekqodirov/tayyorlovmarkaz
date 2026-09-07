# CrmGoals / CrmPredictions auditi — 2026-09-07

Faqat ikki sahifa tuzatildi. Server route'lari, Prisma sxemasi va auth middleware o'zgartirilmadi. API tekshiruvi kodni o'qish orqali; brauzer sinovlari backend shakliga mos mock javoblar bilan bajarildi, bazaga yozilmadi.

## Tuzatilgan real muammolar

1. Ikkala sahifada GET xatosi bo'sh/yaroqli natijadan ajratilmadi; doimiy xato holati va retry qo'shildi. Goals statistikasi loading/error vaqtida eski yoki yolg'on nol ko'rsatmaydi.
2. Tab/yil tez almashganda eski javob yangi holatni buzardi; request identifikatori va effect cleanup bilan bartaraf etildi. Predictions dastlab loading holatida ochiladi.
3. Goals saqlash/o'chirish/sinxronlash amallari parallel yoki takroriy yuborilishi mumkin edi; umumiy yozish qulfi qo'shildi. Saqlash vaqtida forma va modalni yopish bloklanadi; o'chirish pending holati ko'rsatiladi.
4. Bo'shliqli sarlavha, nol/manfiy maqsad, cheksiz qiymat, 100 dan katta foiz, kasr o'quvchi/lid soni va yaroqsiz yil o'tib ketardi. Forma validatsiyasi, trim va Enter orqali submit qo'shildi; birlik turga mos tanlanadi.
5. PUT `type` maydonini saqlamasdi; tahrirlashda tur tanlash bloklandi va izoh qo'shildi.
6. Yillik maqsadni tahrirlash unga joriy oyni biriktirib yuborardi. Yillik payload `month: null` saqlaydi; davr ko'rsatiladi, mavjud choraklik davr saqlanadi.
7. Yangi maqsad filtrlangan yil o'rniga joriy yilga yaratilardi; yaratish filtri meros olinadi. Boshqa yilga saqlanganda shu yil ochiladi.
8. Nol target o'rtacha progressni NaN qilardi; manfiy progress ham cheklanmagan edi. Progress 0–100 oralig'ida; 99.5% endi yaxlitlash tufayli bajarilgan hisoblanmaydi. Kartalar va summary bir xil mezondan foydalanadi.
9. Sinxron tugmasi tanlangan yilni yangilayotgandek ko'rinardi; joriy oy va qo'llab-quvvatlanmagan davomat/yillik maqsadlar haqida aniq izoh berildi.
10. Dinamik `bg-${color}` / `text-${color}` Tailwind klasslari ikkala sahifada to'liq statik klasslarga almashtirildi.
11. Mobil header, kartalar, statistika va jadval sig'masdi; wrap, responsiv grid va jadvalning ichki horizontal scroll'i qo'shildi. Goals modali umumiy scroll/fokus/Escape boshqaruvli Modal'dan foydalanadi; label va ikonka tugmalariga nom berildi.
12. Bashorat qatori grafikda umuman chizilmagan, kelasi oy haqiqiy daromadi esa 0 sifatida chizilgan edi. Alohida forecast Area va null actual qo'shildi; tooltip qator nomini ko'rsatadi.
13. Oldingi oy 0 bo'lganda tarixiy o'zgarish yolg'on 0% edi; endi hisoblanmaydigan foiz `—` bilan ko'rsatiladi.
14. Musbat balans `Math.abs` sabab qarz sifatida ko'rsatilardi; qarz `max(0, -balance)` bilan olinadi.
15. Aynan 999 kun oldin to'lagan talaba hech to'lamagandek ko'rinardi; endi `lastPaymentDate` tekshiriladi.
16. Lead kartasidagi ishlamaydigan o'tish strelkasi olib tashlandi.
17. Custom `bi` permission'li TEACHER frontend sahifasiga kira olishi mumkin, lekin backend MANAGER talab qiladi. Goals yozish tugmalari va handler'lari shu minimal rolga mos bloklanadi; bu backend himoyasining o'rnini bosmaydi.

## Har bir yozish route'i alohida tekshirildi

`server/index.ts:135–136` maxsus routerlarni `/api` generic routeridan oldin ulaydi. `server/routes/goals.ts:18` barcha quyidagi route'larga `requireAuth` va `requireMinRole('MANAGER')` qo'llaydi; middleware custom permissions'ga emas, JWT rol darajasiga qaraydi.

| Amal | URL | Minimal backend rol | Javob / moslik |
|---|---|---|---|
| Yaratish | POST `/api/goals` | MANAGER (2) | `{ data: goal }`; maydonlar mos |
| Tahrirlash | PUT `/api/goals/:id` | MANAGER (2) | `{ data: goal }`; `type` qabul qilinmaydi |
| O'chirish | DELETE `/api/goals/:id` | MANAGER (2) | `{ ok: true }` |
| Sinxronlash | POST `/api/goals/auto-sync` | MANAGER (2) | `{ ok, metrics, updated }`; UI `updated` ishlatadi |

ADMIN (3), SUPER_ADMIN (4) o'tadi; TEACHER (1) rad etiladi. Har bir route umumiy middleware'dan o'tishi kodda tekshirildi; alohida route ichida takroriy rol middleware yo'qligi o'z-o'zidan auth teshigi emas.

GET `/api/goals?year=...` → `{ data }`. Predictions yozish amali yo'q: `/dropout-risk` → `{ data, summary }`, `/revenue-forecast` → `{ historical, forecast }`, `/best-leads` va `/payment-risk` → `{ data }`. To'rttalasi `/api/predictions` ostida va MANAGER+. Axios baseURL `/api`; ikki sahifadagi URL va ishlatilgan javob maydonlari mos.

## Backendda qoldirilgan muammolar (tuzatilmadi)

- `goals.ts:35–70`: POST/PUT to'liq validatsiya qilmaydi. Masalan PUT `target: 0`/manfiy target va POST bo'shliqli sarlavhani qabul qiladi; frontend validatsiyasini bevosita API orqali chetlab o'tish mumkin. PUT `type`ni jim tashlab ketadi.
- `goals.ts:53–70,124–146`: target o'zgarganda status qayta hisoblanmaydi. Masalan completed 100/100 maqsadni 200 ga ko'tarish completed qoldiradi; auto-sync faqat active maqsadlarni oladi. Active maqsadda ham current o'zgarmasa yangi target uchun status qayta hisoblanmaydi.
- `goals.ts:110–112`: oylik conversion maqsadiga barcha davrdagi lidlar konversiyasi yoziladi; davr mos emas.
- `goals.ts:124–134`: davomat butunlay o'tkazib yuboriladi, month=null yillik maqsadlar olinmaydi; choraklik maqsad month joriy oyga teng bo'lsa unga bir oylik metrika yoziladi. UI bu yetishmayotgan hisoblashni bajarmaydi.
- `predictions.ts:140–153`: faqat ikki daromadli oyda vaznlar 0.5+0.3=0.8; ikkala oy 1 mln va trend 0 bo'lsa forecast 800 ming chiqadi. Vaznlar normalizatsiya qilinmagan.
- `predictions.ts:140–147`: nol daromadli oylar olib tashlanadi, natijadagi trend oxirgi ikki kalendar oyga tegishli bo'lmasligi mumkin; UI esa "o'tgan oyga nisbatan" deydi. To'g'ri davr/trend backendda hal qilinishi kerak.
- `predictions.ts:28–30,43–51`: avval 30 ta attendance yozuvi kesib olinib, keyin 30 kun filtrlanadi. Ko'p guruhli talabaning shu davrdagi eskiroq yozuvlari tushib qoladi; chegarada kun sanasini rolling instant bilan solishtirish ham kunning bir qismini tashlaydi.

## Tekshiruv

- `npx.cmd tsc --noEmit`: exit 0, 0 xato. PowerShell `npx.ps1`ni bloklagani sabab ayni npx buyrug'ining `.cmd` launcheri ishlatildi.
- `scripts/audit-goals-predictions.cjs`: Chrome headless, API mock; retry, forma validatsiyasi, yearly payload, disabled type, pending modal, duplicate delete, chart qatorlari, qarz va 999-kun holatlari, tab/yil race, TEACHER tugmalari, 320/375/1280 px.
- Ishga tushirish: Vite 3010 portda (`PORT=3011`); Playwright mavjud bo'lsin yoki `PLAYWRIGHT_MODULE_PATH`ga uning lokal modul yo'lini bering; `node scripts/audit-goals-predictions.cjs`. Skript bazaga murojaat qilmaydi; barcha API so'rovlari mock. Standart brauzer kanali chrome (`AUDIT_BROWSER_CHANNEL` bilan almashtiriladi).
- Git branch yaratish worktree tashqarisidagi umumiy `.git` katalogi yozish ruxsati bilan bloklandi. O'zgarishlar `agent/codex`da; commit/merge/deploy qilinmadi.
