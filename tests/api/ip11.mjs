// IP-11 — oylik hisob dvigateli: generatsiya, e'lon, oy yakuni tuzatmasi, qo'lda tuzatma, rejim, shadow hisobot.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const NOV = '2026-11';
const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
let groupIds = [];

async function mkGroup(name) {
  const course = await prisma.course.create({ data: { name: `${TAG} kurs ${name}`, price: 600000 } });
  track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} ${name}`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-01-01' } });
  track('group', g.id);
  groupIds.push(g.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  return g;
}

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance', 'discounts']);
  const managerNoFin = await makeUser('MANAGER', ['dashboard', 'students', 'groups']);
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal']);
  const G = await mkGroup('hisob');
  await prisma.group.update({ where: { id: G.id }, data: { teacherId: teacher.user.id } });
  const st = {};
  for (const k of ['a', 'b', 'c', 'd', 'e']) { const s = await prisma.student.create({ data: { name: `${TAG} hisob-${k}` } }); track('student', s.id); st[k] = s; }

  // A'zoliklar: a, c, d — oktyabrdan; b — 16-noyabrdan; e — oktyabr..10-noyabr (yakunlangan)
  for (const k of ['a', 'c', 'd']) await api('POST', '/enrollments', admin.token, { studentId: st[k].id, groupId: G.id, startDate: '2026-10-01' });
  await api('POST', '/enrollments', admin.token, { studentId: st.b.id, groupId: G.id, startDate: '2026-11-16' });
  await prisma.enrollmentPeriod.create({ data: { studentId: st.e.id, groupId: G.id, startDate: '2026-10-01', endDate: '2026-11-10', status: 'ended', endReason: 'left' } });
  const dPeriod = await prisma.enrollmentPeriod.findFirst({ where: { studentId: st.d.id, groupId: G.id } });
  let r = await api('POST', `/enrollments/periods/${dPeriod.id}/pause`, admin.token, { fromDate: '2026-11-09', toDate: '2026-11-22', reason: 'Sayohat' });

  // Noyabr rejasi: 13 dars; 4-noyabr markaz sababli bekor (kompensatsiya); 12-noyabr pullik qo'shimcha (80 000)
  await api('POST', '/lesson-plan/generate', admin.token, { groupId: G.id, month: NOV });
  const nov4 = await prisma.lessonSession.findFirst({ where: { groupId: G.id, date: '2026-11-04', kind: 'regular' } });
  await api('POST', `/lesson-plan/sessions/${nov4.id}/cancel`, admin.token, { reason: 'center', compensate: true });
  r = await api('POST', '/lesson-plan/sessions', admin.token, { groupId: G.id, date: '2026-11-12', kind: 'extra', price: 80000 });
  await prisma.lessonAttendance.create({ data: { sessionId: r.data.id, studentId: st.a.id, status: 'present' } });
  // b 16, 18, 20-noyabr kelmagan (kelajak sana — test uchun to'g'ridan-to'g'ri)
  for (const d of ['2026-11-16', '2026-11-18', '2026-11-20']) await prisma.attendanceRecord.create({ data: { studentId: st.b.id, groupId: G.id, date: d, status: 'absent' } });
  // c — aka-uka 10%
  r = await api('POST', '/billing/discounts', manager.token, { studentId: st.c.id, kind: 'sibling', percent: 10, amount: 5000, fromMonth: NOV, reason: 'Aka-uka' });
  check('chegirma: foiz VA summa birga — 400', r.status === 400, r);
  r = await api('POST', '/billing/discounts', manager.token, { studentId: st.c.id, kind: 'sibling', percent: 10, fromMonth: NOV, reason: 'Aka-uka' });
  check('chegirma yaratildi', r.status === 201, r);

  // ── Ruxsatlar
  r = await api('POST', `/billing/${NOV}/generate`, managerNoFin.token, { groupId: G.id });
  check('finance ruxsatisiz — 403', r.status === 403, r.status);
  r = await api('GET', `/billing/${NOV}/charges?groupId=${G.id}`, teacher.token);
  check('ustoz hisoblarni ko\'rmaydi — 403', r.status === 403, r.status);

  // ── Generatsiya
  r = await api('POST', `/billing/${NOV}/generate`, manager.token, { groupId: G.id });
  check('generatsiya: 5 ta draft hisob', r.status === 200 && r.data.created === 5 && r.data.skipped.length === 0, r.data);
  const charges = await prisma.charge.findMany({ where: { groupId: G.id, month: NOV, type: 'tuition' }, include: { lines: true } });
  const by = Object.fromEntries(Object.entries(st).map(([k, s]) => [k, charges.find(c => c.studentId === s.id)]));
  const lines = (c) => c.lines.map(l => `${l.kind}:${l.amount}`).sort().join(' ');
  check('A: to\'liq oy 600 000 + qo\'shimcha 80 000 − bekor krediti 50 000 = 630 000', by.a.net === 630000 && by.a.gross === 680000 && by.a.teacherBase === 630000 && lines(by.a) === 'base:600000 cancel_credit:-50000 extra_lesson:80000', { net: by.a.net, lines: lines(by.a) });
  const aCalc = JSON.parse(by.a.calc);
  check('A calc: R=F=12 (bekor qilingan chiqarilgan), to\'liq oy, reja ishlatilgan', aCalc.R === 12 && aCalc.F === 12 && aCalc.fullMonth === true && aCalc.planUsed === true, aCalc);
  check('B: 16-noyabrdan 7 dars → 350 000, 3 qoldirish −150 000 = 200 000', by.b.net === 200000 && by.b.gross === 350000 && JSON.parse(by.b.calc).R === 7, { net: by.b.net, calc: JSON.parse(by.b.calc) });
  check('C: 600 000 − 50 000 − aka-uka 10% (55 000) = 495 000; ustoz bazasi 550 000 (OQ-05)', by.c.net === 495000 && by.c.teacherBase === 550000, { net: by.c.net, tb: by.c.teacherBase, lines: lines(by.c) });
  check('D: pauza (9–22) — 6 dars → 300 000, kredit yo\'q (qisman oy)', by.d.net === 300000 && JSON.parse(by.d.calc).R === 6, { net: by.d.net, calc: JSON.parse(by.d.calc) });
  check('E: 10-noyabrda chiqqan — 3 dars → 150 000', by.e.net === 150000, { net: by.e.net });
  check('muddat: to\'liq oy 10-noyabr, qisman (16-dan) — 23-noyabr', by.a.dueDate === '2026-11-10' && by.b.dueDate === '2026-11-23', { a: by.a.dueDate, b: by.b.dueDate });

  r = await api('POST', `/billing/${NOV}/generate`, manager.token, { groupId: G.id });
  check('QT-65: qayta generatsiya — dublikat yo\'q, o\'zgarmagan', r.data.created === 0 && r.data.unchanged === 5 && (await prisma.charge.count({ where: { groupId: G.id, month: NOV, type: 'tuition' } })) === 5, r.data);

  // Parallel generatsiya (boshqa guruh)
  const G2 = await mkGroup('parallel');
  for (let i = 0; i < 4; i++) { const s = await prisma.student.create({ data: { name: `${TAG} par-${i}` } }); track('student', s.id); await api('POST', '/enrollments', admin.token, { studentId: s.id, groupId: G2.id, startDate: '2026-10-01' }); }
  await Promise.all([1, 2, 3].map(() => api('POST', `/billing/${NOV}/generate`, manager.token, { groupId: G2.id })));
  check('QT-65: 3 ta parallel generatsiya — har davr×oy uchun bitta hisob', (await prisma.charge.count({ where: { groupId: G2.id, month: NOV } })) === 4);

  // ── E'lon qilish va QT-66
  r = await api('POST', `/billing/${NOV}/post`, manager.token, { groupId: G.id });
  check('e\'lon: 5 ta hisob posted', r.data.posted === 5, r.data);
  r = await api('POST', `/billing/charges/${by.a.id}/void`, manager.token);
  check('e\'lon qilingan hisobni bekor qilib bo\'lmaydi — 409', r.status === 409, r.status);
  r = await api('POST', `/history/groups/${G.id}/tariff`, admin.token, { monthlyPrice: 700000, effectiveFrom: '2026-11-01' });
  check('tarif 1-noyabrdan 700 000', r.status === 201, r);
  r = await api('POST', `/billing/${NOV}/generate`, manager.token, { groupId: G.id });
  const aAfter = await prisma.charge.findUnique({ where: { id: by.a.id } });
  check('QT-66: e\'londan keyin tarif o\'zgardi — hisob o\'zgarmaydi, farq ro\'yxatda', aAfter.net === 630000 && r.data.postedDiffs.length > 0, r.data.postedDiffs);
  r = await api('POST', `/billing/${NOV}/settle`, manager.token, { groupId: G.id });
  const aAdj = r.data.adjustments.find(x => x.chargeId === by.a.id);
  // A yangi: 700 000 + 80 000 − round(700 000/12)=58 333 → 721 667; farq 91 667
  check('oy yakuni tuzatmasi: A uchun +91 667 (noyabr ochiq — shu oyga)', aAdj?.delta === 91667 && aAdj.month === NOV, r.data);
  r = await api('POST', `/billing/${NOV}/settle`, manager.token, { groupId: G.id });
  check('settle qayta — idempotent (yangi tuzatma yo\'q)', r.data.adjustments.length === 0, r.data);

  // ── Qo'lda tuzatma
  r = await api('POST', `/billing/charges/${by.b.id}/adjust`, manager.token, { amount: -30000, reason: 'Kasallik — rahbar qarori' });
  check('qo\'lda tuzatma −30 000 — 201', r.status === 201 && r.data.net === -30000 && r.data.reversesChargeId === by.b.id, r);
  r = await api('POST', `/billing/charges/${by.b.id}/adjust`, manager.token, { amount: -10000000, reason: 'Katta' });
  check('hisobni manfiy qiladigan tuzatma — 400', r.status === 400 && r.data.code === 'NEGATIVE', r);
  r = await api('POST', `/billing/charges/${by.b.id}/adjust`, manager.token, { amount: 1000, reason: '' });
  check('sababsiz tuzatma — 400', r.status === 400, r);

  // Yopilgan oy (OQ-10): noyabr yopilsa, tuzatma dekabrga tushadi
  await prisma.billingPeriod.update({ where: { month: NOV }, data: { status: 'closed' } });
  r = await api('POST', `/billing/charges/${by.e.id}/adjust`, manager.token, { amount: -10000, reason: 'Kechikkan hujjat' });
  check('OQ-10: yopilgan noyabr hisobiga tuzatma — dekabrga', r.status === 201 && r.data.month === '2026-12', r.data);
  r = await api('POST', `/billing/${NOV}/generate`, manager.token, { groupId: G.id });
  check('yopilgan oyga generatsiya — 409', r.status === 409 && r.data.code === 'CLOSED', r);
  await prisma.billingPeriod.update({ where: { month: NOV }, data: { status: 'open' } });

  // ── O'quvchi hisobi va shadow hisobot
  r = await api('GET', `/billing/students/${st.a.id}/account`, manager.token);
  check('o\'quvchi hisobi: e\'lon qilingan jami 630 000 + 91 667', r.status === 200 && r.data.totals.posted === 721667, r.data.totals);
  r = await api('GET', `/billing/${NOV}/shadow-report`, manager.token);
  const bRow = r.data.rows?.find(x => x.studentId === st.b.id);
  check('shadow hisobot: B farqi "qisman oy (TQ-A)" deb izohlangan', r.status === 200 && bRow?.reason === 'qisman oy (TQ-A)', { bRow, totals: r.data.totals });

  // ── Rejim
  r = await api('GET', '/billing/mode', manager.token);
  const modeBefore = r.data.mode;
  r = await api('PUT', '/billing/mode', manager.token, { mode: 'shadow' });
  check('rejim: menejer o\'zgartira olmaydi — 403', r.status === 403, r.status);
  r = await api('PUT', '/billing/mode', admin.token, { mode: 'bad' });
  check('rejim: noto\'g\'ri qiymat — 400', r.status === 400, r.status);
  r = await api('PUT', '/billing/mode', admin.token, { mode: 'shadow' });
  check('rejim: admin — shadow', r.status === 200 && r.data.mode === 'shadow', r.data);
  await api('PUT', '/billing/mode', admin.token, { mode: modeBefore });

  // ── Arxiv: hisobi bor o'quvchi o'chirilmaydi, arxivlanadi
  r = await api('DELETE', `/students/${st.e.id}`, admin.token);
  check('hisobi bor o\'quvchi — arxivlanadi (o\'chirilmaydi)', r.status === 200 && r.data.archived === true, r.data);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
