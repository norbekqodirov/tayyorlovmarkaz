// Frontend production build — `npm run build` shu faylni chaqiradi.
//
// NEGA `vite build` o'rniga o'ram (wrapper) kerak:
// Vite `.env` faylidagi `NODE_ENV="development"` qatorini HURMAT QILADI va
// `process.env.NODE_ENV` oldindan o'rnatilmagan bo'lsa, `vite build` ni
// DEVELOPMENT build'ga aylantiradi (React'ning dev runtime'i, jsxDEV,
// komponent nomi/fayl-qator ma'lumotlari, dev ogohlantirishlari). Bizning
// `.env.example`da (va undan nusxa olingan har bir `.env`da) aynan shu qator
// bor edi — natijada `npm run build` asosiy bundle'ni 220 KB o'rniga 427 KB
// qilib chiqarardi. Serverdagi deploy.sh ham `npm run build` ni ishlatgani
// uchun bu xato jimgina productionga ham yetib borishi mumkin edi.
//
// Vite'ning mantig'i (config.ts): `const isNodeEnvSet = !!process.env.NODE_ENV`
// — agar NODE_ENV Vite ishga tushishidan OLDIN o'rnatilgan bo'lsa, `.env`
// dagi qiymat e'tiborga olinmaydi. Shuning uchun uni shu yerda, vite
// import qilinishidan oldin qo'yamiz. (vite.config.ts ichida qo'ysak kech
// bo'ladi — u fayl `isNodeEnvSet` hisoblangandan keyin yuklanadi.)
process.env.NODE_ENV = 'production';

const { build } = await import('vite');

await build();
