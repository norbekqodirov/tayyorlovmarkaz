import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

try {
  const admin = await makeUser('ADMIN');
  const marketing = await makeUser('MANAGER', ['leads', 'marketing']);
  const cashier = await makeUser('MANAGER', ['students', 'finance']);

  const s = await prisma.student.create({ data: { name: `${TAG} balans`, balance: -300000 } });
  track('student', s.id);

  // Ssenariy: oyna ochilgan (balans -300000), shu orada to'lov kiritildi
  let r = await api('POST', '/finance/transactions', cashier.token, { type: 'income', amount: 300000, category: "Kurs to'lovi", date: '2026-09-20', method: 'Naqd', studentId: s.id, studentName: s.name });
  check('to\'lov kiritildi', r.status === 200, r);
  if (r.data?.id) track('transaction', r.data.id);
  const payRow = await prisma.payment.findFirst({ where: { studentId: s.id } });
  if (payRow) track('payment', payRow.id);
  // Administrator eski formani saqlaydi — eski balans bilan
  r = await api('PUT', `/students/${s.id}`, admin.token, { name: `${TAG} balans (tahrir)`, phone: '+998900000001', balance: -300000, paymentStatus: 'Qarzdorlik' });
  const after = await prisma.student.findUnique({ where: { id: s.id } });
  check('QT-44 tahrir to\'lov ta\'sirini o\'chirmaydi (balans 0)', r.status === 200 && after.balance === 0, { status: r.status, balance: after?.balance });
  check('QT-45 PUT paymentStatus ni o\'zgartirmaydi', after.paymentStatus !== 'Qarzdorlik', after.paymentStatus);

  r = await api('PUT', `/students/${s.id}`, marketing.token, { name: 'x' });
  check('QT-50 students ruxsatisiz MANAGER PUT → 403', r.status === 403, r);

  r = await api('POST', `/students/${s.id}/balance-adjustments`, admin.token, { amount: -150000 });
  check('QT-45 sababsiz tuzatish → 400', r.status === 400, r);
  r = await api('POST', `/students/${s.id}/balance-adjustments`, admin.token, { amount: -150000.5, reason: 'eski qarz' });
  check('kasr summa → 400', r.status === 400, r);
  r = await api('POST', `/students/${s.id}/balance-adjustments`, marketing.token, { amount: -150000, reason: 'eski qarz' });
  check('finance ruxsatisiz tuzatish → 403', r.status === 403, r);
  r = await api('POST', `/students/${s.id}/balance-adjustments`, cashier.token, { amount: -150000, reason: 'Eski daftardan avgust qarzi' });
  check('sababli tuzatish ishlaydi', r.status === 200 && r.data.balance === -150000 && r.data.paymentStatus === 'Qarzdorlik', r);
  const audit = await prisma.auditLog.findFirst({ where: { resourceId: s.id, action: 'balance_adjustment' } });
  check('tuzatish auditda (sabab bilan)', !!audit && (audit.metadata || '').includes('avgust'), audit?.metadata);
  if (audit) track('auditLog', audit.id);

  // Parallel tuzatishlar — yo'qolmaydi
  await Promise.all([1, 2, 3, 4, 5].map(() => api('POST', `/students/${s.id}/balance-adjustments`, cashier.token, { amount: 10000, reason: 'parallel sinov' })));
  const par = await prisma.student.findUnique({ where: { id: s.id } });
  check('5 ta parallel tuzatish atomar (−100000)', par.balance === -100000, par.balance);
} catch (e) {
  console.error(e);
  check('xatosiz ishladi', false, e.message);
} finally {
  const ok = summary();
  await prisma.auditLog.deleteMany({ where: { action: 'balance_adjustment', metadata: { contains: 'sinov' } } }).catch(() => {});
  await cleanup();
  process.exit(ok ? 0 : 1);
}
