import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const [ty, tm] = today.split('-').map(Number);
try {
  const admin = await makeUser('ADMIN');
  const teacher = await makeUser('TEACHER', ['students', 'groups', 'journal'], { subject: `${TAG} Matematika`, experience: '7 yil', bio: 'Tajribali ustoz' });

  // HB-01: xarajat ikki marta sanalmaydi
  const before = await api('GET', `/analytics/reports/expense-breakdown?year=${ty}&month=${tm}`, admin.token);
  let r = await api('POST', '/finance/expenses', admin.token, { category: `${TAG}xarajat`, amount: 100000, date: today, description: 'sinov' });
  check('xarajat yaratildi', r.status === 201, r);
  const exp = r.data; track('expense', exp.id);
  const linkedTx = await prisma.transaction.findFirst({ where: { sourceType: 'expense', sourceId: exp.id } }); if (linkedTx) track('transaction', linkedTx.id);
  const after = await api('GET', `/analytics/reports/expense-breakdown?year=${ty}&month=${tm}`, admin.token);
  check('QT-25 expense-breakdown +100000 (200000 emas)', after.data.total_actual - before.data.total_actual === 100000, [before.data.total_actual, after.data.total_actual]);
  const ms = await api('GET', `/analytics/reports/manager-summary`, admin.token);
  check('manager-summary 200', ms.status === 200, ms.status);

  // HB-02: teacher-performance haqiqiy davomatdan
  const course = await prisma.course.create({ data: { name: `${TAG} kurs`, price: 500000 } }); track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} G`, courseId: course.id, teacherId: teacher.user.id, price: 800000 } }); track('group', g.id);
  const s = await prisma.student.create({ data: { name: `${TAG} o'quvchi` } }); track('student', s.id);
  track('enrollment', (await prisma.enrollment.create({ data: { studentId: s.id, groupId: g.id } })).id);
  track('attendanceRecord', (await prisma.attendanceRecord.create({ data: { studentId: s.id, groupId: g.id, date: today, status: 'present' } })).id);
  r = await api('GET', '/analytics/teacher-performance', admin.token);
  const row = r.data.find(x => x.id === teacher.user.id);
  check('QT-81 teacher-performance: AttendanceRecord asosida 100%', row && row.attendanceRate === 100 && row.students === 1, row);

  // HB-03: group-profitability guruh narxi bilan
  r = await api('GET', '/analytics/reports/group-profitability', admin.token);
  const gp = r.data.find(x => x.id === g.id);
  check('group-profitability Group.price (800000) bilan', gp?.expectedMonthly === 800000, gp);

  // HB-04: LTV refund'ni sanamaydi
  const p1 = await prisma.payment.create({ data: { studentId: s.id, amount: 300000, date: today, status: 'paid' } }); track('payment', p1.id);
  const p2 = await prisma.payment.create({ data: { studentId: s.id, amount: 200000, date: today, status: 'refunded' } }); track('payment', p2.id);
  await prisma.student.update({ where: { id: s.id }, data: { status: 'active' } });
  r = await api('GET', '/analytics/reports/student-ltv', admin.token);
  const lt = r.data.students.find(x => x.id === s.id);
  check('QT-26 LTV faqat paid (300000)', lt?.totalPaid === 300000, lt);

  // SY-01: ommaviy ustozlar
  r = await api('GET', '/teachers', null);
  const pt = r.data.find(x => x.id === teacher.user.id);
  check('QT-56 ommaviy ustoz: fan va tajriba User ustunlaridan', pt?.role === `${TAG} Matematika` && pt?.exp === '7 yil' && pt?.desc === 'Tajribali ustoz', pt);
  await prisma.user.update({ where: { id: teacher.user.id }, data: { isActive: false } });
  r = await api('GET', '/teachers', null);
  check('nofaol ustoz ommaviy ro\'yxatda yo\'q', !r.data.some(x => x.id === teacher.user.id));
  await prisma.user.update({ where: { id: teacher.user.id }, data: { isActive: true } });

  // TL-13: holat lug'ati
  r = await api('POST', '/students', admin.token, { name: `${TAG} muzlatilgan`, status: 'Muzlatilgan' });
  if (r.data?.id) track('student', r.data.id);
  check('QT-57 yaratishda "Muzlatilgan" → frozen', r.data?.status === 'frozen', r.data?.status);
  r = await api('PUT', `/students/${r.data.id}`, admin.token, { status: 'Tark etgan' });
  check('QT-57 tahrirda "Tark etgan" → left', r.data?.status === 'left', r.data?.status);

  // ML-02 oraliq: dashboard/executive — paymentStatus emas, balans
  const s2 = await prisma.student.create({ data: { name: `${TAG} qarzsiz`, balance: 50000, paymentStatus: 'Qarzdorlik' } }); track('student', s2.id);
  r = await api('GET', '/analytics/debtors', admin.token);
  check('debtors: musbat balansli "Qarzdorlik" matni qarzdor emas', r.status === 200 && !(r.data.debtors || r.data).some?.(x => x.id === s2.id), r.status);
  r = await api('GET', '/reports/executive', admin.token);
  check('executive 200', r.status === 200, r.status);

  // TL-06: o'qituvchi profilida moliya yopiq, admin — to'lovlar o'zi
  r = await api('GET', `/students/${s.id}`, admin.token);
  check('profil: o\'quvchining o\'z to\'lovlari (2 ta)', r.data.payments.length === 2, r.data.payments.length);
} catch (e) {
  console.error(e);
  check('xatosiz ishladi', false, e.message);
} finally {
  const ok = summary();
  await prisma.expense.deleteMany({ where: { category: { startsWith: TAG } } }).catch(() => {});
  await cleanup();
  process.exit(ok ? 0 : 1);
}
