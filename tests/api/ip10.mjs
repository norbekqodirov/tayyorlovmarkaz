// IP-10 — dars rejasi (generatsiya, bayram, bekor/ko'chirish/qo'shimcha) va yagona davomat xizmati.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG, BASE } from './testkit.mjs';

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const month = today.slice(0, 7);
const monthStart = `${month}-01`;
const NOV = '2026-11';

async function mkGroup(name, days, extra = {}) {
  const course = await prisma.course.create({ data: { name: `${TAG} kurs ${name}`, price: 600000 } });
  track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} ${name}`, courseId: course.id, price: 600000, maxSize: 20, startDate: '2026-01-01', ...extra } });
  track('group', g.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: JSON.stringify(days) } });
  track('groupSchedule', sc.id);
  return g;
}
const staffPost = async (path, userId, body) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': userId }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const holidays = [];

try {
  const admin = await makeUser('ADMIN');
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal', 'schedule']);
  const G = await mkGroup('har-kun', [1, 2, 3, 4, 5, 6, 7], { teacherId: teacher.user.id });
  const N = await mkGroup('du-chor-ju', [1, 3, 5], { teacherId: teacher.user.id });
  const mk = async (i) => { const s = await prisma.student.create({ data: { name: `${TAG} d${i}` } }); track('student', s.id); return s; };
  const s1 = await mk(1), s2 = await mk(2), s3 = await mk(3);

  // ── Reja generatsiyasi: noyabr, Du/Chor/Ju = 13 dars; 18-noyabr bayram → 12 (QT-64)
  let r = await api('POST', '/lesson-plan/holidays', admin.token, { date: '2026-11-18', name: `${TAG} bayram` });
  if (r.data?.id) holidays.push(r.data.id);
  r = await api('POST', '/lesson-plan/generate', admin.token, { groupId: N.id, month: NOV });
  check('reja: 13 jadval kuni − 1 bayram = 12 dars yaratildi', r.status === 200 && r.data.planned === 12 && r.data.created === 12 && r.data.holidaysSkipped?.[0] === '2026-11-18', r.data);
  r = await api('POST', '/lesson-plan/generate', admin.token, { groupId: N.id, month: NOV });
  check('QT-64: qayta generatsiya — dublikat yo\'q', r.data.created === 0 && (await prisma.lessonSession.count({ where: { groupId: N.id, kind: 'regular' } })) === 12, r.data);
  r = await api('POST', '/lesson-plan/generate', teacher.token, { groupId: N.id, month: NOV });
  check('ustoz reja yarata olmaydi — 403', r.status === 403, r.status);

  // ── Ko'chirish: 4-noyabr (chor) → 5-noyabr (pay)
  const nov4 = await prisma.lessonSession.findFirst({ where: { groupId: N.id, date: '2026-11-04', kind: 'regular' } });
  r = await api('POST', `/lesson-plan/sessions/${nov4.id}/move`, admin.token, { toDate: '2026-11-05' });
  const moved = await prisma.lessonSession.findUnique({ where: { id: nov4.id } });
  check('ko\'chirish: eskisi moved/billable emas, yangisi billable va bog\'langan', r.status === 201 && moved.status === 'moved' && moved.billable === false && r.data.billable === true && r.data.replacesSessionId === nov4.id && r.data.date === '2026-11-05', { moved, neu: r.data });
  r = await api('POST', `/lesson-plan/sessions/${nov4.id}/move`, admin.token, { toDate: '2026-11-06' });
  check('ko\'chirilgan darsni qayta ko\'chirib bo\'lmaydi — 409', r.status === 409, r.status);

  // ── Bekor qilish (kompensatsiya bilan) va qoplash (QT-24)
  const nov9 = await prisma.lessonSession.findFirst({ where: { groupId: N.id, date: '2026-11-09', kind: 'regular' } });
  r = await api('POST', `/lesson-plan/sessions/${nov9.id}/cancel`, admin.token, { reason: 'center', compensate: true });
  check('bekor: billable emas, compensate=true', r.status === 200 && r.data.status === 'cancelled' && r.data.billable === false && r.data.compensate === true, r.data);
  r = await api('POST', '/lesson-plan/sessions', admin.token, { groupId: N.id, date: '2026-11-10', kind: 'makeup', replacesSessionId: nov9.id });
  const nov9b = await prisma.lessonSession.findUnique({ where: { id: nov9.id } });
  check('QT-24 qoplash: billable emas, asl darsning kompensatsiyasi olib tashlandi', r.status === 201 && r.data.billable === false && nov9b.compensate === false, { makeup: r.data, orig: nov9b });
  r = await api('POST', '/lesson-plan/sessions', admin.token, { groupId: N.id, date: '2026-11-12', kind: 'extra', price: 80000 });
  check('pullik qo\'shimcha dars: billable, narx 80 000', r.status === 201 && r.data.billable === true && r.data.price === 80000, r.data);
  r = await api('POST', '/lesson-plan/sessions', admin.token, { groupId: N.id, date: '2026-11-13', kind: 'trial', price: 50000 });
  check('sinov darsi pullik bo\'lmaydi — 400', r.status === 400, r);
  r = await api('POST', '/lesson-plan/sessions', admin.token, { groupId: N.id, date: '2026-11-13', kind: 'trial' });
  check('sinov darsi: billable emas', r.status === 201 && r.data.billable === false, r.data);

  // ── Yangi bayram mavjud rejadan o'tmagan darsni olib tashlaydi, ko'chirilgan dars qoladi
  r = await api('POST', '/lesson-plan/holidays', admin.token, { date: '2026-11-20', name: `${TAG} bayram 2` });
  if (r.data?.id) holidays.push(r.data.id);
  r = await api('POST', '/lesson-plan/generate', admin.token, { groupId: N.id, month: NOV });
  const nov5 = await prisma.lessonSession.findFirst({ where: { groupId: N.id, date: '2026-11-05', kind: 'regular' } });
  check('bayram qo\'shildi: 20-noyabr darsi olib tashlandi, ko\'chirilgan 5-noyabr darsi qoldi', r.data.removed === 1 && !(await prisma.lessonSession.findFirst({ where: { groupId: N.id, date: '2026-11-20', kind: 'regular' } })) && !!nov5, r.data);

  r = await api('GET', `/lesson-plan?groupId=${N.id}&month=${NOV}`, teacher.token);
  check('reja xulosasi (ustoz o\'z guruhi): 10 billable, 1 bekor, 1 ko\'chirilgan, 1 pullik qo\'shimcha', r.status === 200 && r.data.summary.billable === 10 && r.data.summary.cancelled === 1 && r.data.summary.moved === 1 && r.data.summary.paidExtra === 1, r.data.summary);

  // ── Preview reja bo'yicha: 16-noyabrdan — 16, 23, 25, 27, 30 (18 va 20 bayram) = 5; to'liq oyda 10
  r = await api('POST', '/enrollments/preview', admin.token, { groupId: N.id, startDate: '2026-11-16' });
  check('preview rejadan: F=10, R=5 → 600 000 × 5/12 = 250 000', r.data.groupLessonsInMonth === 10 && r.data.billableLessons === 5 && r.data.firstMonthAmount === 250000, r.data);

  // ── Davomat: joriy oy rejasi (har kun darslar)
  r = await api('POST', '/lesson-plan/generate', admin.token, { groupId: G.id, month });
  await api('POST', '/enrollments', admin.token, { studentId: s1.id, groupId: G.id, startDate: addDays(today, -1) });
  await api('POST', '/enrollments', admin.token, { studentId: s2.id, groupId: G.id, startDate: monthStart });
  await api('POST', '/enrollments', admin.token, { studentId: s3.id, groupId: G.id, startDate: monthStart });

  if (addDays(today, -2) >= monthStart) {
    r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: addDays(today, -2), records: [{ studentId: s1.id, status: 'absent' }] });
    check('QT-04/QT-63: a\'zolikdan oldingi sanaga "kelmadi" — 400', r.status === 400 && r.data.code === 'NOT_MEMBER_ON_DATE', r);
  }
  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: addDays(today, 1), records: [{ studentId: s1.id, status: 'present' }] });
  check('QT-63: kelajak sanasi — 400', r.status === 400 && r.data.code === 'FUTURE', r);
  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: today, records: [{ studentId: s1.id, status: 'presnt' }] });
  check('noto\'g\'ri holat — 400', r.status === 400, r);
  r = await api('POST', '/attendance-records', teacher.token, { groupId: G.id, date: today, records: [{ studentId: s1.id, status: 'present' }, { studentId: s2.id, status: 'late' }] });
  const rec = await prisma.attendanceRecord.findFirst({ where: { studentId: s1.id, groupId: G.id, date: today } });
  const sessToday = await prisma.lessonSession.findFirst({ where: { groupId: G.id, date: today, kind: 'regular' } });
  check('ustoz bugungi davomat: 200, muallif va sessiya yozildi, dars "o\'tildi"', r.status === 200 && r.data.saved === 2 && rec?.markedById === teacher.user.id && rec.sessionId === sessToday?.id && sessToday?.status === 'held', { r: r.data, rec, sessToday });

  // Tuzatish oynasi (OQ-16): 5 kun oldin
  const old = addDays(today, -5);
  if (old >= monthStart) {
    r = await api('POST', '/attendance-records', teacher.token, { groupId: G.id, date: old, records: [{ studentId: s2.id, status: 'present' }] });
    check('OQ-16: ustoz 5 kunlik davomatni o\'zgartira olmaydi — 403 LOCKED', r.status === 403 && r.data.code === 'LOCKED', r);
    r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: old, records: [{ studentId: s2.id, status: 'present' }] });
    check('OQ-16: administrator — sababsiz 400', r.status === 400 && r.data.code === 'REASON_REQUIRED', r);
    r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: old, reason: 'Jurnal qog\'ozdan ko\'chirildi', records: [{ studentId: s2.id, status: 'present' }] });
    const oldRec = await prisma.attendanceRecord.findFirst({ where: { studentId: s2.id, groupId: G.id, date: old } });
    check('OQ-16: administrator sabab bilan — 200, sabab saqlandi', r.status === 200 && oldRec?.editReason === "Jurnal qog'ozdan ko'chirildi", oldRec);
  }

  // Pauza: s2 — kechadan 9 kun
  const pFrom = addDays(today, -1) >= monthStart ? addDays(today, -1) : today;
  const s2period = await prisma.enrollmentPeriod.findFirst({ where: { studentId: s2.id, groupId: G.id, status: 'active' } });
  r = await api('POST', `/enrollments/periods/${s2period.id}/pause`, admin.token, { fromDate: pFrom, toDate: addDays(pFrom, 8), reason: 'Kasallik' });
  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: pFrom, records: [{ studentId: s2.id, status: 'absent' }] });
  check('QT-63: pauza kuniga davomat — 400', r.status === 400 && /pauza/.test(r.data.message), r);

  // Bekor qilingan kun
  const cancelDay = addDays(today, -2) >= monthStart ? addDays(today, -2) : null;
  if (cancelDay) {
    const cs = await prisma.lessonSession.findFirst({ where: { groupId: G.id, date: cancelDay, kind: 'regular' } });
    r = await api('POST', `/lesson-plan/sessions/${cs.id}/cancel`, admin.token, { reason: 'teacher' });
    r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: cancelDay, records: [{ studentId: s3.id, status: 'present' }] });
    check('bekor qilingan kunga davomat — 409', r.status === 409 && r.data.code === 'CANCELLED', r);
  }

  // Telegram yo'li — aynan bir xil qoidalar (TL-08)
  r = await staffPost('/staff-portal/attendance', teacher.user.id, { groupId: G.id, date: addDays(today, 1), records: [{ studentId: s1.id, status: 'present' }] });
  check('Telegram: kelajak sanasi — 400 (xuddi CRM kabi)', r.status === 400 && !!r.data?.error, r);
  if (addDays(today, -2) >= monthStart) {
    r = await staffPost('/staff-portal/attendance', teacher.user.id, { groupId: G.id, date: addDays(today, -2), records: [{ studentId: s1.id, status: 'present' }] });
    check('Telegram: a\'zolikdan oldingi sana — 400', r.status === 400 && r.data?.code === 'NOT_MEMBER_ON_DATE', r);
  }
  r = await staffPost('/staff-portal/attendance', teacher.user.id, { groupId: G.id, date: today, records: [{ studentId: s3.id, status: 'present' }] });
  const tgRec = await prisma.attendanceRecord.findFirst({ where: { studentId: s3.id, groupId: G.id, date: today } });
  check('Telegram: bugun — 200, muallif yozildi', r.status === 200 && tgRec?.markedById === teacher.user.id, { r: r.data, tgRec });

  // Belgilanmagan darslar ro'yxati
  r = await api('GET', '/lesson-plan/unmarked', teacher.token);
  check('belgilanmagan darslar: ro\'yxat, bugungi (belgilangan) dars yo\'q', r.status === 200 && Array.isArray(r.data) && !r.data.some(x => x.groupId === G.id && x.date === today), r.data?.slice?.(0, 3));

  // Eski qo'shimcha dars yo'li — bepul extra
  r = await api('POST', '/lesson-sessions', teacher.token, { groupId: G.id, date: today, label: '2-smena' });
  check('eski /lesson-sessions: kind=extra, billable emas', r.status === 201 && r.data.kind === 'extra' && r.data.billable === false, r.data);

  // Davomatni o'chirish ham oyna qoidasiga bo'ysunadi
  if (old >= monthStart) {
    r = await api('DELETE', `/attendance-records/${s2.id}/${G.id}/${old}`, teacher.token);
    check('eski davomatni ustoz o\'chira olmaydi — 403', r.status === 403, r);
  }
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  await prisma.holiday.deleteMany({ where: { id: { in: holidays } } }).catch(() => {});
  const groups = await prisma.group.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groups.map(g => g.id) } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
