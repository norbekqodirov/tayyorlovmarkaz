// IP-26 (RX-08, RX-04/OQ-13, QT-86): standart parol yo'q; parol o'zgarsa eski sessiyalar yaroqsiz;
// sirpanuvchi sessiya (eski token yangilanadi); o'qituvchi o'quvchi telefon/manzil/balansini ko'rmaydi.
import { createRequire } from 'node:module';
import path from 'node:path';
import { prisma, api, makeUser, track, check, summary, cleanup, TAG, BASE } from './testkit.mjs';

const require = createRequire(path.resolve('package.json'));
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const staffIds = [];
const login = async (phone, password) => {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

try {
  const admin = await makeUser('ADMIN');

  // ── RX-08: standart "123456" yo'q
  let r = await api('POST', '/auth/users', admin.token, { name: `${TAG} Parolsiz`, phone: '+998901119901', role: 'TEACHER' });
  check('foydalanuvchi parolsiz yaratilmaydi (400)', r.status === 400, r.data);
  const staffPhone = '+998901119902';
  r = await api('POST', '/staff', admin.token, { name: `${TAG} Xodim login`, role: 'Kassir', phone: staffPhone, createLogin: true });
  staffIds.push(r.data?.id);
  const temp = r.data?.temporaryPassword;
  const loginUser = await prisma.user.findUnique({ where: { phone: staffPhone } });
  if (loginUser) track('user', loginUser.id);
  check('xodim logini: tasodifiy vaqtinchalik parol javobda (8 belgi)', r.status < 300 && typeof temp === 'string' && temp.length === 8 && !!loginUser, { status: r.status, temp });
  check('"123456" bilan kirib bo\'lmaydi', (await login(staffPhone, '123456')).status === 401);
  check('vaqtinchalik parol bilan kiriladi', !!(await login(staffPhone, temp)).data?.token);
  const authLogs = await prisma.auditLog.findMany({ where: { resource: 'auth', resourceId: loginUser?.id } });
  check("kirish jurnali: muvaffaqiyatli va noto'g'ri urinish yozildi (IP bilan)", authLogs.some(l => l.action === 'login' && l.ipAddress) && authLogs.some(l => l.action === 'login_failed'), authLogs.map(l => l.action));
  await prisma.auditLog.deleteMany({ where: { resource: 'auth', resourceId: loginUser?.id } }).catch(() => {});

  // ── Autofill himoyasi: email maydoniga telefon tushib qolsa saqlanmaydi; yaratish audit'ga yoziladi
  r = await api('POST', '/auth/users', admin.token, { name: `${TAG} Autofill`, phone: '+998901119903', email: '+998901119909', password: 'Test12345!', role: 'TEACHER' });
  check('email o\'rniga telefon — 400, foydalanuvchi yaratilmaydi', r.status === 400 && !(await prisma.user.findUnique({ where: { phone: '+998901119903' } })), r);
  r = await api('POST', '/auth/users', admin.token, { name: `${TAG} Emailli`, phone: '+998901119904', email: ' Ustoz@Markaz.UZ ', password: 'Test12345!', role: 'TEACHER' });
  const emailUser = r.data?.id; if (emailUser) track('user', emailUser);
  check('to\'g\'ri email saqlanadi (kichik harf, bo\'shliqsiz)', r.status === 200 && r.data.email === 'ustoz@markaz.uz', r.data);
  const created = await prisma.auditLog.findFirst({ where: { resource: 'user', action: 'create', resourceId: emailUser } });
  check('yaratish audit jurnalida — kim yaratgani bor, parol yo\'q', !!created && created.userId === admin.user.id && !String(created.after).includes('Test12345'), created);
  r = await api('PUT', `/auth/users/${emailUser}`, admin.token, { password: 'Boshqa12345' });
  const afterPut = await prisma.user.findUnique({ where: { id: emailUser } });
  check('faqat parol tahriri emailni o\'chirmaydi', r.status === 200 && afterPut?.email === 'ustoz@markaz.uz', { status: r.status, email: afterPut?.email });
  r = await api('PUT', `/auth/users/${emailUser}`, admin.token, { password: '123' });
  check('tahrirda ham qisqa parol rad etiladi', r.status === 400, r.status);
  r = await api('PUT', `/auth/users/${emailUser}`, admin.token, { email: '901119909' });
  check('tahrirda noto\'g\'ri email rad etiladi', r.status === 400, r.status);
  await prisma.auditLog.deleteMany({ where: { resource: 'user', resourceId: emailUser } }).catch(() => {});

  // ── Parol o'zgarsa eski sessiyalar yaroqsiz
  const u = await makeUser('MANAGER', ['dashboard']);
  const oldToken = u.token;
  check('yangi token parol izi (pv) va 7 kunlik muddat bilan', (() => { const d = jwt.decode(oldToken); return !!d.pv && d.exp - d.iat === 7 * 86400; })(), jwt.decode(oldToken));
  r = await api('PUT', '/auth/change-password', oldToken, { currentPassword: 'Test12345!', newPassword: 'Yangi12345!' });
  const newToken = r.data?.token;
  check('parol o\'zgartirildi — shu qurilma uchun yangi token', r.status === 200 && !!newToken, r.data);
  r = await api('GET', '/communication/notifications', oldToken);
  check('eski token darhol yaroqsiz (401 SESSION_REVOKED)', r.status === 401 && r.data?.code === 'SESSION_REVOKED', r);
  r = await api('GET', '/auth/me', oldToken);
  check('/auth/me ham eski tokenni rad etadi', r.status === 401, r.status);
  r = await api('GET', '/communication/notifications', newToken);
  check('yangi token ishlaydi', r.status === 200, r.status);
  // Admin boshqa foydalanuvchi parolini almashtirsa — uning sessiyalari ham tugaydi
  const v = await makeUser('MANAGER', ['dashboard']);
  r = await api('PUT', `/auth/users/${v.user.id}`, admin.token, { password: 'Admin123456' });
  r = await api('GET', '/communication/notifications', v.token);
  check('admin parolni almashtirsa — foydalanuvchi eski tokeni yaroqsiz', r.status === 401, r.status);

  // ── Sirpanuvchi sessiya: 1 kundan eski token yangilanadi; pv'siz eski token ham (o'tish davri)
  const secret = process.env.JWT_SECRET;
  const cur = await prisma.user.findUnique({ where: { id: u.user.id } });
  const oldIat = Math.floor(Date.now() / 1000) - 2 * 86400;
  const agedLegacy = jwt.sign({ id: cur.id, role: cur.role, phone: cur.phone, name: cur.name, iat: oldIat }, secret, { expiresIn: '30d' });
  const res = await fetch(`${BASE}/communication/notifications`, { headers: { Authorization: `Bearer ${agedLegacy}` } });
  const renewed = res.headers.get('x-renewed-token');
  check('eski (pv\'siz, 2 kunlik) token qabul qilindi va yangilandi', res.status === 200 && !!renewed && !!jwt.decode(renewed)?.pv, { status: res.status, renewed: !!renewed });
  const fresh = await fetch(`${BASE}/communication/notifications`, { headers: { Authorization: `Bearer ${newToken}` } });
  check('yangi token yangilanmaydi (1 kundan yosh)', fresh.status === 200 && !fresh.headers.get('x-renewed-token'));

  // ── OQ-13: o'qituvchiga o'quvchi telefon, manzil, balansi berilmaydi
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal']);
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups']);
  const course = await prisma.course.create({ data: { name: `${TAG} kurs proyeksiya`, price: 100000 } }); track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Proyeksiya`, courseId: course.id, teacherId: teacher.user.id, maxSize: 10, price: 100000 } }); track('group', G.id);
  const S = await prisma.student.create({ data: { name: `${TAG} Proyeksiya O'quvchi`, phone: '+998901234500', parentPhone: '+998901234501', parentName: 'Ota-ona Ismi', address: 'Manzil', balance: -50000, notes: 'ichki izoh' } }); track('student', S.id);
  const E = await prisma.enrollment.create({ data: { studentId: S.id, groupId: G.id } }); track('enrollment', E.id);
  const hidden = ['phone', 'parentPhone', 'address', 'balance', 'paymentStatus', 'notes', 'telegramChatId', 'parentTelegramId'];
  const clean = (o) => o && hidden.every(k => !(k in o));
  r = await api('GET', `/students/${S.id}`, teacher.token);
  check('o\'qituvchi: o\'quvchi profili — telefon, manzil, balans, izoh yo\'q; ota-ona ismi bor', r.status === 200 && clean(r.data) && r.data.parentName === 'Ota-ona Ismi', r.data && Object.keys(r.data));
  r = await api('GET', `/enrollments/group/${G.id}`, teacher.token);
  check('o\'qituvchi: guruh a\'zolari ro\'yxatida ham yo\'q', r.status === 200 && r.data.every(e => clean(e.student)), r.data?.[0]?.student && Object.keys(r.data[0].student));
  r = await api('GET', '/students', teacher.token);
  const inList = (Array.isArray(r.data) ? r.data : r.data?.data || []).find(x => x.id === S.id);
  check('o\'qituvchi: umumiy ro\'yxatda ham yo\'q', r.status === 200 && clean(inList), inList && Object.keys(inList));
  r = await api('GET', `/students/${S.id}`, manager.token);
  check('menejer telefonni ko\'radi (proyeksiya faqat o\'qituvchiga)', r.status === 200 && r.data.phone === '+998901234500', r.data?.phone);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  await prisma.staffMember.deleteMany({ where: { id: { in: staffIds.filter(Boolean) } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { phone: { in: ['+998901119902', '+998901119903', '+998901119904'] } } }).catch(() => {});
  void bcrypt;
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
