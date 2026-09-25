import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
try {
  const { token } = await makeUser('ADMIN');

  // 1) Yangi, tarixsiz o'quvchi — haqiqatan o'chiriladi
  const s1 = await prisma.student.create({ data: { name: `${TAG} yangi` } });
  track('student', s1.id);
  let r = await api('DELETE', `/students/${s1.id}`, token);
  check('QT-41a tarixsiz yangi o\'quvchi o\'chiriladi', r.status === 200 && r.data.archived === false, r);
  check('QT-41a bazada yo\'q', !(await prisma.student.findUnique({ where: { id: s1.id } })));

  // 2) To'lovi bor o'quvchi — arxivlanadi, to'lov saqlanadi
  const course = await prisma.course.create({ data: { name: `${TAG} kurs`, price: 600000, createdAt: old } });
  track('course', course.id);
  const group = await prisma.group.create({ data: { name: `${TAG} guruh`, courseId: course.id, createdAt: old } });
  track('group', group.id);
  const s2 = await prisma.student.create({ data: { name: `${TAG} tarixli`, createdAt: old } });
  track('student', s2.id);
  const pay = await prisma.payment.create({ data: { studentId: s2.id, amount: 300000, date: '2026-09-10', status: 'paid' } });
  track('payment', pay.id);
  const enr = await prisma.enrollment.create({ data: { studentId: s2.id, groupId: group.id } });
  track('enrollment', enr.id);
  const att = await prisma.attendanceRecord.create({ data: { studentId: s2.id, groupId: group.id, date: '2026-09-11', status: 'present' } });
  track('attendanceRecord', att.id);

  r = await api('DELETE', `/students/${s2.id}`, token);
  check('QT-41 tarixli o\'quvchi arxivlanadi', r.status === 200 && r.data.archived === true, r);
  check('QT-41 to\'lov saqlandi', !!(await prisma.payment.findUnique({ where: { id: pay.id } })));
  check('QT-41 davomat saqlandi', !!(await prisma.attendanceRecord.findUnique({ where: { id: att.id } })));
  r = await api('GET', '/students', token);
  check('arxivlangan ro\'yxatda yo\'q', Array.isArray(r.data) && !r.data.some(x => x.id === s2.id), r.status);
  r = await api('GET', '/students?archived=1', token);
  check('arxiv ro\'yxatida bor', Array.isArray(r.data) && r.data.some(x => x.id === s2.id), r.status);
  r = await api('GET', `/enrollments/group/${group.id}`, token);
  check('guruh a\'zolari ro\'yxatida arxivlangan yo\'q', Array.isArray(r.data) && r.data.length === 0, r.data);
  r = await api('POST', '/enrollments', token, { studentId: s2.id, groupId: group.id });
  check('arxivlangan o\'quvchini guruhga yozib bo\'lmaydi', r.status === 400, r);

  r = await api('POST', `/students/${s2.id}/restore`, token);
  check('QT-43 tiklash', r.status === 200, r);
  r = await api('GET', '/students', token);
  check('QT-43 tiklangandan keyin ro\'yxatda', r.data.some(x => x.id === s2.id));

  // 3) Tarixli guruh — arxivlanadi
  r = await api('DELETE', `/groups/${group.id}`, token);
  check('QT-42 tarixli guruh arxivlanadi', r.status === 200 && r.data.archived === true, r);
  check('QT-42 guruh davomati saqlandi', !!(await prisma.attendanceRecord.findUnique({ where: { id: att.id } })));
  check('QT-42 a\'zolik saqlandi', !!(await prisma.enrollment.findUnique({ where: { id: enr.id } })));
  r = await api('GET', '/groups', token);
  check('arxivlangan guruh ro\'yxatda yo\'q', !r.data.some(x => x.id === group.id));

  // 4) Guruhi bor kurs — "Archived" holatiga o'tadi, guruh o'chmaydi
  r = await api('DELETE', `/courses/${course.id}`, token);
  const c2 = await prisma.course.findUnique({ where: { id: course.id } });
  check('QT-42 kurs arxivlanadi (status Archived)', r.data.archived === true && c2?.status === 'Archived', { r, c2 });
  check('QT-42 kurs guruhi saqlandi', !!(await prisma.group.findUnique({ where: { id: group.id } })));

  // 5) Oyligi bor xodim — arxivlanadi
  const staff = await prisma.staffMember.create({ data: { name: `${TAG} xodim`, role: 'Administrator', createdAt: old } });
  track('staffMember', staff.id);
  const sal = await prisma.salary.create({ data: { staffId: staff.id, month: '2026-08', baseSalary: 1000000, total: 1000000 } });
  track('salary', sal.id);
  r = await api('DELETE', `/staff/${staff.id}`, token);
  const st2 = await prisma.staffMember.findUnique({ where: { id: staff.id } });
  check('xodim arxivlanadi, oylik saqlanadi', r.data.archived === true && !!st2?.deletedAt && !!(await prisma.salary.findUnique({ where: { id: sal.id } })), r);

  // 6) Billing: joriy oyda arxivlangan guruh shu oy hisobida bor, keyingi oyda yo'q
  const now = new Date();
  const y = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric' }).format(now));
  const m = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', month: 'numeric' }).format(now));
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  r = await api('GET', `/finance/monthly-due/${s2.id}?year=${y}&month=${m}`, token);
  check('billing: arxivlangan oyida guruh hali hisobda', r.status === 200 && r.data.byGroup?.length === 1, r.data);
  r = await api('GET', `/finance/monthly-due/${s2.id}?year=${ny}&month=${nm}`, token);
  check('billing: keyingi oyda arxivlangan guruh hisobda yo\'q', r.status === 200 && r.data.byGroup?.length === 0, r.data);

  // Audit
  const audits = await prisma.auditLog.count({ where: { resourceId: { in: [s2.id, group.id, course.id, staff.id] }, action: { in: ['archive', 'restore'] } } });
  check('arxiv/tiklash audit jurnaliga yozildi', audits >= 5, audits);
} catch (e) {
  console.error(e);
  check('xatosiz ishladi', false, e.message);
} finally {
  const ok = summary();
  await cleanup();
  process.exit(ok ? 0 : 1);
}
