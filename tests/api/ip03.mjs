import { prisma, api, makeUser, track, check, summary, cleanup, TAG, BASE } from './testkit.mjs';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
try {
  const admin = await makeUser('ADMIN');
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal', 'tests', 'schedule']);
  const teacher2 = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal', 'tests']);
  const mgrNoBi = await makeUser('MANAGER', ['leads']);
  const mgrBi = await makeUser('MANAGER', ['bi', 'reports']);
  const mgrLeadsA = await makeUser('MANAGER', ['leads']);
  const mgrLeadsB = await makeUser('MANAGER', ['leads']);
  const hr = await makeUser('MANAGER', ['leave_requests']);

  // ── QT-46/47: analytics ──
  const endpoints = ['/analytics/lead-sources', '/analytics/reports/manager-summary', '/analytics/reports/debtors', '/analytics/reports/attendance-journal', '/analytics/reports/student-ltv', '/analytics/reports/payment-methods', '/analytics/reports/expense-breakdown', '/analytics/teacher-performance'];
  let teacherBlocked = 0;
  for (const e of endpoints) if ((await api('GET', e, teacher.token)).status === 403) teacherBlocked++;
  check('QT-46 o\'qituvchi 8 analytics endpointida 403', teacherBlocked === 8, teacherBlocked);
  let r = await api('GET', '/analytics/reports/manager-summary', mgrNoBi.token);
  check('QT-47 bi ruxsatisiz MANAGER → 403', r.status === 403, r.status);
  r = await api('GET', '/analytics/reports/manager-summary', mgrBi.token);
  check('QT-47 bi ruxsatli MANAGER → 200', r.status === 200, r.status);
  r = await api('GET', '/analytics/reports/expense-breakdown', mgrBi.token);
  check('reports ruxsatli MANAGER → 200', r.status === 200, r.status);

  // Fixtures: guruhlar
  const course = await prisma.course.create({ data: { name: `${TAG} kurs`, price: 500000 } }); track('course', course.id);
  const g1 = await prisma.group.create({ data: { name: `${TAG} G1`, courseId: course.id, teacherId: teacher.user.id } }); track('group', g1.id);
  const g2 = await prisma.group.create({ data: { name: `${TAG} G2`, courseId: course.id, teacherId: teacher2.user.id } }); track('group', g2.id);
  const st = await prisma.student.create({ data: { name: `${TAG} o'quvchi`, phone: '+998901112233', balance: -200000 } }); track('student', st.id);
  const other = await prisma.student.create({ data: { name: `${TAG} begona`, phone: '+998901112244' } }); track('student', other.id);
  for (const g of [g1, g2]) track('enrollment', (await prisma.enrollment.create({ data: { studentId: st.id, groupId: g.id } })).id);
  track('enrollment', (await prisma.enrollment.create({ data: { studentId: other.id, groupId: g2.id } })).id);
  track('attendanceRecord', (await prisma.attendanceRecord.create({ data: { studentId: st.id, groupId: g2.id, date: '2026-09-02', status: 'absent' } })).id);
  const pay = await prisma.payment.create({ data: { studentId: st.id, amount: 100000, date: '2026-09-03' } }); track('payment', pay.id);

  // ── QT-51: o'qituvchi profili proyeksiyasi ──
  r = await api('GET', `/students/${st.id}`, teacher.token);
  check('QT-51 o\'qituvchi o\'z o\'quvchisini ko\'radi', r.status === 200, r.status);
  check('QT-51 to\'lov/balans yashirilgan', r.data && r.data.balance === undefined && Array.isArray(r.data.payments) && r.data.payments.length === 0, { b: r.data?.balance, p: r.data?.payments?.length });
  check('QT-51 boshqa guruh a\'zoligi/davomati yashirilgan', r.data?.enrollments?.length === 1 && r.data?.attendanceRecords?.length === 0, { e: r.data?.enrollments?.length, a: r.data?.attendanceRecords?.length });
  r = await api('GET', `/students/${other.id}`, teacher.token);
  check('begona o\'quvchi profili → 403', r.status === 403, r.status);
  r = await api('GET', `/students/${st.id}`, admin.token);
  check('admin to\'liq profilni ko\'radi', r.status === 200 && r.data.balance === -200000 && r.data.payments.length === 1, r.data?.balance);

  // ── QT-52: progress ──
  r = await api('GET', `/progress/${other.id}`, teacher.token);
  check('QT-52 begona o\'quvchi progress → 403', r.status === 403, r.status);
  r = await api('GET', `/progress/${st.id}`, teacher.token);
  check('o\'z o\'quvchisi progress → 200, to\'lovsiz', r.status === 200 && r.data.payments.count === 0 && r.data.attendance.total === 0, r.data?.payments);

  // ── QT-48/49: bulk ──
  r = await api('POST', '/bulk/students', admin.token, { action: 'update', ids: [st.id], data: { balance: 999 } });
  check('QT-48 bulk students update → 400', r.status === 400, r);
  r = await api('POST', '/bulk/payments', admin.token, { action: 'status', ids: [pay.id], data: { status: 'refunded' } });
  check('QT-48 bulk payments yo\'q → 400', r.status === 400 && (await prisma.payment.findUnique({ where: { id: pay.id } })).status === 'paid', r.status);
  r = await api('POST', '/bulk/students', mgrNoBi.token, { action: 'status', ids: [st.id], data: { status: 'left' } });
  check('bulk students — students ruxsatisiz 403', r.status === 403, r.status);
  const note = await prisma.notification.create({ data: { userId: admin.user.id, title: 'x', message: 'y' } });
  r = await api('POST', '/bulk/notifications', mgrNoBi.token, { action: 'delete', ids: [note.id] });
  check('QT-49 begona bildirishnoma o\'chmaydi', r.data?.updated === 0 && !!(await prisma.notification.findUnique({ where: { id: note.id } })), r.data);
  await prisma.notification.delete({ where: { id: note.id } });

  // ── QT-29 / ML-07: generic moliya ──
  r = await api('POST', '/finance', admin.token, { type: 'income', amount: 1000, category: 'x', date: today, studentId: st.id });
  check('QT-29 generic POST /finance → 400', r.status === 400, r.status);
  r = await api('POST', '/transactions', admin.token, { type: 'income', amount: 1000, category: 'x', date: today });
  check('QT-29 generic POST /transactions → 400', r.status === 400, r.status);

  // ── Leads: QT-30/33/32 ──
  const leadB = await prisma.lead.create({ data: { name: `${TAG} lid B`, phone: '+998909998877', phoneNorm: '909998877', assignedToId: mgrLeadsB.user.id } }); track('lead', leadB.id);
  r = await api('POST', `/leads/${leadB.id}/assign`, mgrLeadsA.token, { userId: mgrLeadsA.user.id });
  check('QT-30 begona lidni o\'ziga biriktirish → 403', r.status === 403, r.status);
  r = await api('DELETE', `/leads/${leadB.id}`, mgrLeadsA.token);
  check('begona lidni o\'chirish → 403', r.status === 403, r.status);
  r = await api('POST', `/leads/${leadB.id}/activities`, mgrLeadsA.token, { type: 'call', content: 'x' });
  check('begona lidga faoliyat → 403', r.status === 403, r.status);
  r = await api('PUT', `/leads/${leadB.id}`, mgrLeadsB.token, { stage: 'won' });
  check('QT-33 PUT stage=won → 400', r.status === 400, r.status);
  r = await api('PUT', `/leads/${leadB.id}`, mgrLeadsB.token, { stage: 'lost' });
  check('PUT stage=lost sababsiz → 400', r.status === 400, r.status);
  const [c1, c2] = await Promise.all([
    api('POST', `/leads/${leadB.id}/convert`, mgrLeadsB.token, { groupId: g1.id }),
    api('POST', `/leads/${leadB.id}/convert`, mgrLeadsB.token, { groupId: g1.id }),
  ]);
  const convStudents = await prisma.student.findMany({ where: { name: `${TAG} lid B` } });
  convStudents.forEach(s => track('student', s.id));
  const convEnr = await prisma.enrollment.findMany({ where: { studentId: { in: convStudents.map(s => s.id) } } });
  convEnr.forEach(e => track('enrollment', e.id));
  check('QT-32 ikki parallel konversiya → bitta o\'quvchi', convStudents.length === 1 && [c1.status, c2.status].includes(201), { n: convStudents.length, s: [c1.status, c2.status] });
  r = await api('POST', `/leads/${leadB.id}/convert`, mgrLeadsB.token, { groupId: g1.id });
  check('qayta konversiya — alreadyConverted', r.status === 200 && r.data.alreadyConverted === true, r.status);

  // ── Import (QT-53) ──
  const form = new FormData();
  const csv = 'Ism,Telefon\nImport Test,+998901112233\n';
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'x.csv');
  form.append('mapping', JSON.stringify({ Ism: 'name', Telefon: 'balance' }));
  let ir = await fetch(`${BASE}/import/students/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${mgrNoBi.token}` }, body: form });
  check('QT-53 import students ruxsatsiz → 403', ir.status === 403, ir.status);
  const form2 = new FormData();
  form2.append('file', new Blob([csv], { type: 'text/csv' }), 'x.csv');
  form2.append('mapping', JSON.stringify({ Ism: 'name', Telefon: 'phone' }));
  ir = await fetch(`${BASE}/import/students/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` }, body: form2 });
  const ij = await ir.json();
  check('import: mavjud telefonli o\'quvchi dublikat qilinmaydi', ir.status === 200 && ij.created === 0 && ij.skipped === 1, ij);
  const created = await prisma.student.findMany({ where: { name: 'Import Test' } });
  created.forEach(s => track('student', s.id));

  // ── Leave (QT-34) ──
  const staff = await prisma.staffMember.create({ data: { name: `${TAG} xodim`, role: 'Kassir' } }); track('staffMember', staff.id);
  r = await api('POST', '/leave', hr.token, { staffId: staff.id, type: 'annual', startDate: '2026-10-10', endDate: '2026-10-05' });
  check('ta\'til: tugash < boshlanish → 400', r.status === 400, r.status);
  r = await api('POST', '/leave', hr.token, { staffId: staff.id, type: 'annual', startDate: '2026-10-01', endDate: '2026-10-05' });
  const leaveId = r.data?.id; if (leaveId) track('leaveRequest', leaveId);
  check('ta\'til yaratildi', r.status === 201, r);
  r = await api('POST', '/leave', hr.token, { staffId: staff.id, type: 'sick', startDate: '2026-10-04', endDate: '2026-10-08' });
  check('ustma-ust ta\'til → 409', r.status === 409, r.status);
  r = await api('PATCH', `/leave/${leaveId}/approve`, admin.token, {});
  check('tasdiqlash', r.status === 200, r.status);
  r = await api('PATCH', `/leave/${leaveId}/approve`, admin.token, {});
  check('qayta tasdiqlash → 409', r.status === 409, r.status);
  r = await api('DELETE', `/leave/${leaveId}`, hr.token);
  check('QT-34 tasdiqlanganni HR o\'chira olmaydi → 403', r.status === 403, r.status);
  r = await api('DELETE', `/leave/${leaveId}`, admin.token);
  const lv = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
  check('admin tasdiqlanganni bekor qiladi (yozuv qoladi)', r.status === 200 && lv?.status === 'cancelled', lv?.status);

  // ── Tests (QT-55) ──
  r = await api('POST', '/tests', teacher2.token, { title: `${TAG} test`, groupId: g2.id, createdBy: teacher.user.id, deletedAt: new Date().toISOString() });
  const testId = r.data?.id; if (testId) track('test', testId);
  const t = testId ? await prisma.test.findUnique({ where: { id: testId } }) : null;
  check('test yaratish: createdBy/deletedAt e\'tiborsiz', r.status === 200 && t?.createdBy === teacher2.user.id && !t?.deletedAt, t);
  r = await api('PUT', `/tests/${testId}`, teacher.token, { title: 'buzildi' });
  check('QT-55 begona o\'qituvchi testni tahrirlay olmaydi → 403', r.status === 403, r.status);
  r = await api('POST', '/tests', teacher.token, { title: `${TAG} test2`, groupId: g2.id });
  check('begona guruhga test → 403', r.status === 403, r.status);

  // ── Staff portal davomati (QT-54) ──
  const devHdr = { 'x-dev-user-id': teacher.user.id };
  r = await api('POST', '/staff-portal/attendance', null, { groupId: g1.id, date: today, records: [{ studentId: other.id, status: 'present' }] }, devHdr);
  check('QT-54 a\'zo bo\'lmagan o\'quvchi → 400', r.status === 400, r);
  r = await api('POST', '/staff-portal/attendance', null, { groupId: g1.id, date: today, records: [{ studentId: st.id, status: 'absentt' }] }, devHdr);
  check('QT-54 noto\'g\'ri holat → 400', r.status === 400, r.status);
  r = await api('POST', '/staff-portal/attendance', null, { groupId: g1.id, date: '2099-01-01', records: [{ studentId: st.id, status: 'present' }] }, devHdr);
  check('kelajak sana → 400', r.status === 400, r.status);
  r = await api('POST', '/attendance-records', teacher.token, { groupId: g1.id, date: '2099-01-01', records: [{ studentId: st.id, status: 'present' }] });
  check('CRM yo\'li: kelajak sana → 400', r.status === 400, r.status);
  r = await api('POST', '/staff-portal/attendance', null, { groupId: g1.id, date: today, records: [{ studentId: st.id, status: 'present' }] }, devHdr);
  check('to\'g\'ri davomat → 200', r.status === 200, r);
  const ar = await prisma.attendanceRecord.findFirst({ where: { studentId: st.id, groupId: g1.id, date: today } });
  if (ar) track('attendanceRecord', ar.id);
} catch (e) {
  console.error(e);
  check('xatosiz ishladi', false, e.message);
} finally {
  const ok = summary();
  await prisma.leadActivity.deleteMany({ where: { lead: { name: { startsWith: TAG } } } }).catch(() => {});
  await cleanup();
  process.exit(ok ? 0 : 1);
}
