/**
 * Marshrut siyosati (IP-06, QT-60): server/routes'dagi har bir endpoint
 * ruxsat/rol tekshiruviga ega bo'lishi SHART — yoki quyidagi ro'yxatlardan
 * birida sababi bilan ko'rsatilgan bo'lishi kerak. Yangi endpoint himoyasiz
 * qo'shilsa, bu test yiqiladi (RX-01 — 8 ta analytics endpointi faqat login
 * bilan ochiq qolgani kabi holatlar takrorlanmasligi uchun).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanRoutes } from './scanRoutes.ts';

/** Login talab qilinmaydigan (ataylab ochiq) endpointlar. */
const PUBLIC: Record<string, string> = {
    'auth.ts POST /login': 'kirish',
    'auth.ts GET /me': 'handler ichida token tekshiriladi (tokensiz — 401)',
    'certificates.ts GET /verify/:serial': 'sertifikatni ommaviy tekshirish',
    'payments.ts POST /payme': 'Payme webhook — imzo/Basic auth handler ichida',
    'payments.ts POST /click': 'Click webhook — imzo handler ichida',
    'public.ts GET /lead-form-config': 'ommaviy sayt lid formasi',
    'public.ts GET /forms/:id': 'ommaviy forma',
    'public.ts GET /courses': 'ommaviy kurslar ro\'yxati',
    'public.ts POST /forms/:id/view': 'forma ko\'rishlar hisoblagichi',
    'public.ts POST /lead': 'ommaviy saytdan lid',
    'quiz.ts GET /public/:slug': 'ommaviy test (quiz) oqimi',
    'quiz.ts POST /:id/start': 'ommaviy test (quiz) oqimi',
    'quiz.ts POST /attempts/:aid/answer': 'ommaviy test (quiz) oqimi',
    'quiz.ts POST /attempts/:aid/finish': 'ommaviy test (quiz) oqimi',
    'staffTelegram.ts POST /webhook': 'Telegram webhook (secret token)',
    'telegram.ts POST /webhook': 'Telegram webhook (secret token)',
    'telegram.ts GET /info': 'bot nomi/havolasi — maxfiy emas',
};

/** Faqat login talab qiladigan endpointlar — doira handler ichida cheklangan. */
const AUTH_ONLY: Record<string, string> = {
    'auth.ts PUT /change-password': 'faqat o\'z paroli',
    'auth.ts GET /users/assignable-teachers': 'tor proyeksiya (id, ism, rol) — guruh formasi uchun',
    'auth.ts GET /users': 'handler ichida isAdminOrAbove',
    'auth.ts POST /users': 'handler ichida isAdminOrAbove',
    'auth.ts PUT /users/:id': 'handler ichida isAdminOrAbove / o\'zi',
    'auth.ts DELETE /users/:id': 'handler ichida isAdminOrAbove',
    'branches.ts GET /': 'filiallar ma\'lumotnomasi (filtrlar uchun)',
    'branches.ts GET /:id': 'filiallar ma\'lumotnomasi',
    'communication.ts GET /notifications': 'faqat o\'z bildirishnomalari',
    'communication.ts POST /notifications/mark-all-read': 'faqat o\'z bildirishnomalari',
    'communication.ts PATCH /notifications/:id/read': 'faqat o\'z bildirishnomalari',
    'enrollments.ts GET /group/:groupId': 'handler ichida ustoz guruh egaligi tekshiriladi, moliya maydonlari yashiriladi',
    'ical.ts GET /group/:groupId.ics': 'handler ichida ustoz guruh egaligi tekshiriladi',
    'ical.ts GET /teacher/:userId.ics': 'handler ichida ustoz faqat o\'zini ko\'radi',
    'upload.ts POST /': 'fayl yuklash — barcha xodimlar (uy vazifasi, avatar)',
    'upload.ts POST /multiple': 'fayl yuklash — barcha xodimlar',
    'upload.ts DELETE /:filename': 'handler ichida MANAGER+ tekshiriladi',
    'workLocations.ts GET /': 'faol ish joylari (geozona) — xodimlar uchun',
    'workLocations.ts GET /:id': 'ish joyi ma\'lumotnomasi',
    'workLocations.ts POST /check': 'koordinata geozonada ekanini tekshirish',
};

const routes = scanRoutes();

test('skaner marshrutlarni topadi', () => {
    assert.ok(routes.length > 250, `kutilganidan kam marshrut: ${routes.length}`);
});

test('har bir ochiq (public) endpoint ro\'yxatda sababi bilan', () => {
    const unexpected = routes.filter(r => r.protection === 'public' && !PUBLIC[r.key]).map(r => r.key);
    assert.deepEqual(unexpected, [], `Himoyasiz endpoint(lar): requireAuth + ruxsat qo'shing yoki PUBLIC ro'yxatiga sababi bilan kiriting`);
});

test('faqat-login endpointlar ro\'yxatda sababi bilan', () => {
    const unexpected = routes.filter(r => r.protection === 'auth-only' && !AUTH_ONLY[r.key]).map(r => r.key);
    assert.deepEqual(unexpected, [], `Ruxsat tekshiruvisiz endpoint(lar): requirePermission/requireMinRole qo'shing yoki AUTH_ONLY ro'yxatiga sababi bilan kiriting`);
});

test('ro\'yxatlarda eskirgan yozuv yo\'q', () => {
    const byKey = new Map(routes.map(r => [r.key, r.protection]));
    const stalePublic = Object.keys(PUBLIC).filter(k => byKey.get(k) !== 'public');
    const staleAuth = Object.keys(AUTH_ONLY).filter(k => byKey.get(k) !== 'auth-only');
    assert.deepEqual([...stalePublic, ...staleAuth], [], 'Endpoint o\'chirilgan yoki himoyasi o\'zgargan — ro\'yxatdan olib tashlang');
});
