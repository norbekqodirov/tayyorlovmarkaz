// IP-15 — ustoz maoshi e'lon qilingan hisoblardan (ledger): G.4 Misol 3, 6, 8; qatorlar, tuzatmalar, rejimlar.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const groupIds = [];
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });

async function mkGroup(name, price) {
  const course = await prisma.course.create({ data: { name: `${TAG} kurs ${name}`, price } });
  track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} ${name}`, courseId: course.id, price, maxSize: 30, startDate: '2026-01-01' } });
  track('group', g.id); groupIds.push(g.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  return g;
}
async function mkStudent(name, groupId, start) {
  const s = await prisma.student.create({ data: { name: `${TAG} ${name}` } });
  track('student', s.id);
  await prisma.enrollmentPeriod.create({ data: { studentId: s.id, groupId, startDate: start } });
  return s;
}

try {
  const admin = await makeUser('ADMIN');
  const fin = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance', 'schedule']);
  const T1 = await makeUser('TEACHER', ['dashboard', 'journal'], { salaryPercent: 40 });
  const T2 = await makeUser('TEACHER', ['dashboard', 'journal'], { salaryPercent: 45 });
  await prisma.teacherRate.create({ data: { teacherId: T1.user.id, rateBp: 4000, effectiveFrom: '2026-01-01' } });
  await prisma.teacherRate.create({ data: { teacherId: T2.user.id, rateBp: 4500, effectiveFrom: '2026-01-01' } });

  // Misol 3: A (T1, to'liq oy 600 000), B (T2, 16-noyabrdan: 7 dars → 350 000)
  const A = await mkGroup('A', 600000);
  const B = await mkGroup('B', 600000);
  await prisma.groupTeacherAssignment.create({ data: { groupId: A.id, teacherId: T1.user.id, fromDate: '2026-01-01' } });
  await prisma.groupTeacherAssignment.create({ data: { groupId: B.id, teacherId: T2.user.id, fromDate: '2026-01-01' } });
  const sA = await mkStudent('m3-a', A.id, '2026-08-01');
  const sB = await mkStudent('m3-b', B.id, '2026-11-16');
  // Misol 6: C — 10-noyabrgacha T1, 11-dan T2
  const C = await mkGroup('C', 600000);
  await prisma.groupTeacherAssignment.create({ data: { groupId: C.id, teacherId: T1.user.id, fromDate: '2026-01-01', toDate: '2026-11-10' } });
  await prisma.groupTeacherAssignment.create({ data: { groupId: C.id, teacherId: T2.user.id, fromDate: '2026-11-11' } });
  const sC = await mkStudent('m6-c', C.id, '2026-08-01');

  for (const g of [A, B, C]) await api('POST', '/lesson-plan/generate', fin.token, { groupId: g.id, month: '2026-11' });
  const cSess = await prisma.lessonSession.findMany({ where: { groupId: C.id, kind: 'regular' } });
  check('reja: C guruhda T1 — 4 dars, T2 — 9 dars (tayinlash tarixidan)', cSess.filter(s => s.teacherId === T1.user.id).length === 4 && cSess.filter(s => s.teacherId === T2.user.id).length === 9, cSess.map(s => [s.date, s.teacherId === T1.user.id ? 'T1' : 'T2']));

  await setMode('live');
  for (const g of [A, B, C]) {
    await api('POST', '/billing/2026-11/generate', fin.token, { groupId: g.id });
    await api('POST', '/billing/2026-11/post', fin.token, { groupId: g.id });
  }
  const cCharge = await prisma.charge.findFirst({ where: { studentId: sC.id, month: '2026-11', type: 'tuition' } });
  check('C hisobi: ustoz darslari calc\'da (T1:4, T2:9)', JSON.parse(cCharge.calc).teacherLessons[T1.user.id] === 4 && JSON.parse(cCharge.calc).teacherLessons[T2.user.id] === 9, JSON.parse(cCharge.calc).teacherLessons);

  // ── T1: A (600 000) + C ulushi (600 000 × 4/13 = 184 615) → 40%: 240 000 + 73 846 = 313 846
  let r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T1.user.id, year: 2026, month: 11, basis: 'accrual' });
  const p1 = r.data;
  let lines = await prisma.payrollLine.findMany({ where: { payrollId: p1.id } });
  check('T1 maoshi (Misol 3+6): 240 000 + 73 846 = 313 846, 2 qator', r.status === 200 && p1.accruedAmount === 313846 && lines.length === 2 && lines.some(l => l.chargeId === cCharge.id && l.baseAmount === 184615 && l.shareNum === 4 && l.shareDen === 13), { acc: p1.accruedAmount, lines: lines.map(l => [l.baseAmount, l.amount]) });
  r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T2.user.id, year: 2026, month: 11, basis: 'accrual' });
  const p2 = r.data;
  // T2: B 350 000 × 45% = 157 500; C ulushi 415 385 × 45% = 186 923.25 → 186 923 → jami 344 423
  check('T2 maoshi: 157 500 + 186 923 = 344 423 (bir hisob ikki ustozda takrorlanmaydi — 184 615 + 415 385 = 600 000)', p2.accruedAmount === 344423, p2.accruedAmount);
  r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T1.user.id, year: 2026, month: 11, basis: 'accrual' });
  check('qayta hisoblash: qatorlar almashtiriladi (dublikat yo\'q)', (await prisma.payrollLine.count({ where: { payrollId: p1.id } })) === 2, await prisma.payrollLine.count({ where: { payrollId: p1.id } }));

  // ── Shadow preview (ledger vs eski)
  r = await api('GET', `/finance/teacher-payroll/ledger-preview?teacherId=${T2.user.id}&year=2026&month=11`, fin.token);
  check('ledger-preview: ledger va eski formula yonma-yon', r.status === 200 && r.data.ledger.salary === 344423 && typeof r.data.legacy.salary === 'number', { ledger: r.data.ledger?.salary, legacy: r.data.legacy });

  // ── Misol 8: noyabr maoshi tasdiqlandi va oy yopildi; keyin B 3 marta qoldirgani aniqlandi → dekabrga
  await api('POST', `/finance/teacher-payroll/${p2.id}/approve`, fin.token, {});
  await prisma.billingPeriod.update({ where: { month: '2026-11' }, data: { status: 'closed' } });
  for (const d of ['2026-11-16', '2026-11-18', '2026-11-20']) await prisma.attendanceRecord.create({ data: { studentId: sB.id, groupId: B.id, date: d, status: 'absent' } });
  r = await api('POST', '/billing/2026-11/settle', fin.token, { groupId: B.id });
  check('oy yakuni: B uchun −150 000 tuzatma dekabrga', r.status === 200 && r.data.targetMonth === '2026-12' && r.data.adjustments[0]?.delta === -150000, r.data);
  r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T2.user.id, year: 2026, month: 12, basis: 'accrual' });
  const decLines = await prisma.payrollLine.findMany({ where: { payrollId: r.data.id } });
  check('Misol 8: T2 dekabr maoshida −150 000 × 45% = −67 500 tuzatma qatori', r.data.accruedAmount === -67500 && decLines.length === 1 && decLines[0].amount === -67500, { acc: r.data.accruedAmount, lines: decLines.map(l => l.amount) });
  const novP2 = await prisma.teacherPayroll.findUnique({ where: { id: p2.id } });
  check('tasdiqlangan noyabr maoshi o\'zgarmadi', novP2.accruedAmount === 344423 && novP2.status !== 'draft', novP2);

  // ── Qo'lda tuzatma
  r = await api('POST', '/finance/teacher-payroll/adjustments', fin.token, { teacherId: T2.user.id, month: '2026-11', amount: 10000, reason: 'Bonus' });
  check('tasdiqlangan oyga qo\'lda tuzatma — 409', r.status === 409, r.status);
  r = await api('POST', '/finance/teacher-payroll/adjustments', fin.token, { teacherId: T2.user.id, month: '2026-12', amount: 20000, reason: 'Qo\'shimcha dars bonusi' });
  check('ochiq oyga qo\'lda tuzatma — 201', r.status === 201, r);
  r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T2.user.id, year: 2026, month: 12, basis: 'accrual' });
  check('dekabr: −67 500 + 20 000 = −47 500', r.data.accruedAmount === -47500, r.data.accruedAmount);

  // ── Legacy rejim: eski formula, ledger qatorlari yo'q
  await setMode('legacy');
  await prisma.billingPeriod.update({ where: { month: '2026-11' }, data: { status: 'open' } });
  await prisma.teacherPayroll.deleteMany({ where: { teacherId: T1.user.id, month: '2026-10' } });
  r = await api('POST', '/finance/teacher-payroll', fin.token, { teacherId: T1.user.id, year: 2026, month: 10, basis: 'accrual' });
  check('legacy: eski formula (ledger qatorlari yo\'q)', r.status === 200 && (await prisma.payrollLine.count({ where: { payrollId: r.data.id } })) === 0 && !JSON.parse(r.data.sourceSnapshot).source, r.data);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  const users = (await prisma.user.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(u => u.id);
  await prisma.payrollAdjustment.deleteMany({ where: { personId: { in: users } } }).catch(() => {});
  await prisma.teacherPayroll.deleteMany({ where: { teacherId: { in: users } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
