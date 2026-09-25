import { api, makeUser, check, summary, cleanup, prisma, track, TAG } from './testkit.mjs';
try {
  const admin = await makeUser('ADMIN');
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'attendance']);
  const managerNoFinance = await makeUser('MANAGER', ['dashboard', 'students', 'leads']);
  const managerFinance = await makeUser('MANAGER', ['dashboard', 'finance', 'communication']);

  let r = await api('GET', '/announcements');
  check('e\'lonlar ro\'yxati login\'siz → 401', r.status === 401, r.status);
  r = await api('GET', '/announcements', teacher.token);
  check('e\'lonlar ro\'yxati communication ruxsatisiz → 403', r.status === 403, r.status);
  r = await api('GET', '/announcements', managerFinance.token);
  check('e\'lonlar ro\'yxati communication bilan → 200', r.status === 200, r.status);

  for (const p of ['/telegram/settings', '/telegram/stats', '/telegram/status', '/staff-telegram/webhook-info']) {
    r = await api('GET', p, teacher.token);
    check(`${p} ustozga → 403`, r.status === 403, r.status);
  }
  r = await api('GET', '/telegram/settings', admin.token);
  check('/telegram/settings ADMIN → 200', r.status === 200, r.status);

  const s = await prisma.student.create({ data: { name: `${TAG} havola` } });
  track('student', s.id);
  r = await api('GET', `/payments/generate-links?studentId=${s.id}&amount=100000`, managerNoFinance.token);
  check('to\'lov havolasi finance ruxsatisiz → 403', r.status === 403, r.status);
  r = await api('GET', `/payments/generate-links?studentId=${s.id}&amount=100000`, managerFinance.token);
  check('to\'lov havolasi finance bilan → 200', r.status === 200, r.status);

  // RX-04: ustoz ro'yxatlarda ham o'quvchi moliyasini ko'rmaydi
  const course = await prisma.course.create({ data: { name: `${TAG} kurs6`, price: 600000 } });
  track('course', course.id);
  const group = await prisma.group.create({ data: { name: `${TAG} guruh6`, courseId: course.id, teacherId: teacher.user.id } });
  track('group', group.id);
  const st = await prisma.student.create({ data: { name: `${TAG} qarzdor`, balance: -250000, paymentStatus: 'Qarzdorlik' } });
  track('student', st.id);
  const en = await prisma.enrollment.create({ data: { studentId: st.id, groupId: group.id } });
  track('enrollment', en.id);
  r = await api('GET', '/students', teacher.token);
  const mine = Array.isArray(r.data) ? r.data.find(x => x.id === st.id) : null;
  check('ustoz /students: o\'z o\'quvchisi ko\'rinadi, balans/to\'lov holati yo\'q', mine && !('balance' in mine) && !('paymentStatus' in mine), mine);
  r = await api('GET', `/enrollments/group/${group.id}`, teacher.token);
  check('ustoz /enrollments/group: balans yo\'q', r.status === 200 && r.data.length === 1 && !('balance' in r.data[0].student), r.data);
  r = await api('GET', '/students', admin.token);
  const adm = Array.isArray(r.data) ? r.data.find(x => x.id === st.id) : null;
  check('admin /students: balans bor', adm && adm.balance === -250000, adm);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally { const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1); }
