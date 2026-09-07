# Guruh va Enrollment oqimlari auditi — 2026-09-07

## Tuzatilgan frontend muammolari

1. **Yuklash xatosi bo‘sh ro‘yxatdek ko‘rinardi.** Guruhlar, jadval va forma ma’lumotlariga loading/error/retry holatlari qo‘shildi. Zarur ma’lumotlar tayyor bo‘lmasa yaratish/tahrirlash ochilmaydi. Forma ma’lumotidagi xato guruhlar ro‘yxatini ko‘rishga to‘sqinlik qilmaydi.
2. **Xona/vaqt to‘qnashuvi saqlashni to‘xtatmasdi.** Bir xil xona, umumiy dars kuni va kesishuvchi vaqt oralig‘i aniqlansa saqlash bloklanadi, aniq xabar chiqadi. Tahrirlanayotgan guruhning o‘z jadvali chiqarib tashlanadi; tutash vaqtlar to‘qnashmaydi.
3. **Kurs almashganda tugash vaqti eski davomiylikda qolardi.** Endi tanlangan kurs davomiyligiga qayta hisoblanadi.
4. **Vaqtni tozalash ishlamasdi; 24:00 dan oshgan vaqt yuborilardi.** Bo‘sh/noto‘g‘ri vaqt va shu kun ichida tugamaydigan dars uchun maydon yonida xato ko‘rsatiladi.
5. **Boshlanish sanasi va sanalar tartibi tekshirilmasdi.** Bo‘sh boshlanish va boshlanishdan oldingi tugash bloklanadi. Forma xabari endi faqat majburiy maydonlar haqidagina emas, xatolarni tuzatishni so‘raydi. Guruh nomi trim qilinadi.
6. **Sig‘imni mavjud o‘quvchilar sonidan pastga tushirish mumkin edi.** Tahrirlashda `_count.enrollments` bo‘yicha pastki chegara qo‘shildi. Avvaldan mavjud musbat butun son tekshiruvi saqlandi va bo‘sh/0/manfiy/kasr qiymatlar bilan tekshirildi.
7. **0 narx `null` bo‘lib yuborilardi.** `??` orqali 0 saqlanadi; 0 kiritilganda kurs narxi placeholder sifatida ko‘rsatilmaydi. Manfiy yoki cheksiz narx validatsiyasi qo‘shildi.
8. **Guruh yaralib, jadval yozilishi xato bersa qayta urinish dublikat guruh yaratardi.** Yaratilgan ID formada saqlanadi; keyingi urinish shu guruhni davom ettiradi. Qisman saqlanish haqida doimiy xabar bor. Bu backend tranzaksiyasi o‘rnini bosmaydi.
9. **Saqlash davomida modalni yopish va formani o‘zgartirish mumkin edi.** So‘rov paytida forma bloklanadi, spinner chiqadi; Escape/fon/yopish tugmalari orqali yopish ham bloklanadi. Takroriy submit ref orqali to‘xtatiladi.
10. **Enrollment yuklanmasa “guruhda o‘quvchi yo‘q” ko‘rinardi.** Sidebar va unga bog‘liq tablarda alohida yuklash/xato/qayta urinish holatlari bor. Ro‘yxat noma’lum paytda qo‘shish va eksport bloklanadi. Boshqa guruhga o‘tilganda eski so‘rov natijalari aralashishi to‘xtatildi.
11. **Qo‘shiladigan o‘quvchilar manbasida loading/error yo‘q edi.** Endi spinner va qayta urinish bor. Ro‘yxatning dastlabki 20 yozuv bilan sun’iy kesilishi olib tashlandi; scroll orqali qolganlarini ham tanlash mumkin.
12. **`alreadyEnrolled: true` javobi “qo‘shildi” deb ko‘rsatilardi.** Endi allaqachon a’zo ekanini aytadi. Lokal takror ham tekshiriladi; qidiruvda a’zolar filtrlanadi va bo‘sh natija sababi tushuntiriladi.
13. **Bir vaqtning o‘zida bir nechta qo‘shish/chiqarish so‘rovi ketishi, sig‘im oshishi mumkin edi.** Mutatsiyalar navbatma-navbat bajariladi, barcha tegishli tugmalar bloklanadi, spinner chiqadi. Ro‘yxatdagi son `maxSize`ga yetsa qo‘shish bloklanadi.
14. **Mobil forma va sidebar siqilardi; jadvaldagi tahrirlash faqat hoverda ko‘rinardi.** Forma kichik ekranda bir ustunli; uzun matnlar qatorga tushadi, pastki tugmalar o‘raladi. Jadvaldagi tahrirlash mobil va klaviatura fokusida ko‘rinadi hamda nomlangan.

**Tasdiqlash:** o‘quvchini chiqarish uchun `ConfirmDialog` avvaldan mavjud edi. Saqlandi; bekor qilish DELETE yubormasligi, tasdiqlash esa aynan `DELETE /api/enrollments/remove` yuborishi tekshirildi. Qo‘shish `POST /api/enrollments` orqali qolgan; `Group.students` yozilmaydi.

## Backend topilmalari — o‘zgartirilmadi

- **Enrollment route’lari soyalanmoqda:** `server/routes/crud.ts:444`dagi `POST /:collection` 581-qatordagi `POST /enrollments`dan oldin; 537-qatordagi `DELETE /:collection/:id` esa 609-qatordagi `DELETE /enrollments/remove`dan oldin. `enrollments` MODEL_MAP’da yo‘q, shuning uchun POST GenericDocument yaratish yo‘liga tushadi, DELETE esa `remove` ID’li generic hujjatni o‘chirishga urinadi. Maxsus Enrollment handlerlariga yetib bormaydi. Bu haqiqiy integratsiya uchun bloklovchi backend muammo.
- **Server sig‘imni tekshirmaydi:** maxsus Enrollment POST handlerida `maxSize`/joriy a’zolar soni tekshiruvi yo‘q. Guruh tahririda ham sig‘imni a’zolar sonidan kamaytirishga server cheklovi yo‘q. Frontend tekshiruvi boshqa sessiyalar o‘rtasidagi bir vaqtdagi yozishlarni kafolatlamaydi.
- **Server xona/vaqt to‘qnashuvini tekshirmaydi:** generic schedule yozishlari klientdan mustaqil ravishda kesishuvchi jadvallarni qabul qilishi mumkin. Guruh va jadval ikki alohida yozish bo‘lib, atomar emas.
- **O‘qituvchi tanlash endpointi rollarga mos emas:** `server/routes/auth.ts:147`dagi `/auth/users` faqat ADMIN/SUPER_ADMIN uchun. Guruh sahifasiga kira oladigan MANAGER bu dropdown manbasida 403 oladi. Frontend endi buni bo‘sh o‘qituvchilar ro‘yxati deb yashirmaydi.

## Tekshiruv

- `npx.cmd tsc --noEmit` — **0 xato, exit code 0**. PowerShell `npx.ps1`ni bloklagani uchun xuddi shu TypeScript buyrug‘i Windows `.cmd` orqali bajarildi.
- `scripts/audit-group-flows.mjs`: headless Chrome, Vite :3012, izolyatsiyalangan API fixture’lari. Validatsiya, konflikt, kurs davomiyligi, 0 narx, qisman saqlanish, tahrirlash sig‘imi, retry, duplicate, qo‘shish blokirovkasi va ConfirmDialog tekshiruvlari.
- Barcha 4 brauzer sinov bloki **PASS**. 390 px, 320 px va 1440 px ko‘rinishlar. Skrinshotlar tizimning vaqtinchalik papkasidagi `tayyorlov-group-audit` ichida.
- Real bazaga test yozuvlari yozilmadi. Mock API tekshiruvi yuqoridagi backend muammolari hal bo‘lganini anglatmaydi.
- `prisma/schema.prisma`, `server/routes/crud.ts`, `server/middleware/auth.ts` va boshqa backend fayllari o‘zgartirilmadi.

Git worktree branchi `agent/codex-2`. Alohida branch/commit yaratish umumiy `.git` katalogiga yozish ruxsati bilan cheklangan; o‘zgarishlar review uchun ishchi katalogda qoldirildi.
