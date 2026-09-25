// O'qishni boshlagan sana (adminlar belgilaydi): yozishda standart sana, tahrirlash (hammasi yoki
// hech biri), davomat himoyasi, e'lon qilingan hisobga tuzatma, guruh boshlanishi o'zgarishi,
// hisob e'lon qilinganda avansning avtomatik biriktirilishi (RS-38).
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const groupIds = [];
const periodOf = (studentId, groupId) => prisma.enrollmentPeriod.findFirst({ where: { studentId, groupId }, orderBy: { createdAt: 'desc' } });

async function mkGroup(name, startDate, price = 600000) {
  const course = await prisma.course.create({ data: { name: `${TAG} kurs ${name}`, price } });
  track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} ${name}`, courseId: course.id, price, maxSize: 30, startDate } });
  track('group', g.id); groupIds.push(g.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  return g;
}
async function mkStudent(name) {
  const s = await prisma.student.create({ data: { name: `${TAG} ${name}` } });
  track('student', s.id);
  return s;
}

try {
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  await setMode('shadow');
  const G = await mkGroup('Start', '2026-09-10');
  const [S1, S2] = [await mkStudent('Start-1'), await mkStudent('Start-2')];

  // ── Yozish: sanasiz — bugun (guruh o'tmishda boshlangan); guruh boshlanishidan oldin — rad
  let r = await api('POST', '/enrollments', manager.token, { studentId: S1.id, groupId: G.id });
  check('sanasiz yozish — bugungi sana', r.status === 201 && (await periodOf(S1.id, G.id))?.startDate === today, r);
  r = await api('POST', '/enrollments', manager.token, { studentId: S2.id, groupId: G.id, startDate: '2026-09-05' });
  check('guruh boshlanishidan oldin — 400 BEFORE_GROUP_START', r.status === 400 && r.data.code === 'BEFORE_GROUP_START', r);
  r = await api('POST', '/enrollments', manager.token, { studentId: S2.id, groupId: G.id, startDate: '2026-09-14' });
  check('o\'tgan sanadan yozish — 201', r.status === 201, r);
  const G2future = await mkGroup('Kelajak', '2026-12-01');
  const S4 = await mkStudent('Start-4');
  r = await api('POST', '/enrollments', manager.token, { studentId: S4.id, groupId: G2future.id });
  check('hali boshlanmagan guruh — sanasiz yozishda guruh boshlanishi', r.status === 201 && (await periodOf(S4.id, G2future.id))?.startDate === '2026-12-01', r);

  const p1 = await periodOf(S1.id, G.id), p2 = await periodOf(S2.id, G.id);
  // ── Hammasi yoki hech biri
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p1.id, startDate: '2026-09-10' }, { periodId: p2.id, startDate: '2026-09-01' }] });
  check('bitta xato sana — 400, xato qator details\'da, hech narsa o\'zgarmadi', r.status === 400 && r.data.code === 'INVALID_DATES' && r.data.details?.[0]?.periodId === p2.id && (await periodOf(S1.id, G.id)).startDate === today, r.data);
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p1.id, startDate: '2026-09-10' }, { periodId: p2.id, startDate: '2026-09-11' }] });
  check('ikkala sana saqlandi', r.status === 200 && r.data.changed === 2 && (await periodOf(S1.id, G.id)).startDate === '2026-09-10' && (await periodOf(S2.id, G.id)).startDate === '2026-09-11', r.data);

  // ── Davomat himoyasi
  const att = await prisma.attendanceRecord.create({ data: { studentId: S2.id, groupId: G.id, date: '2026-09-16', status: 'present' } });
  track('attendanceRecord', att.id);
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p2.id, startDate: '2026-09-18' }] });
  check('davomatdan keyinga surish — 400', r.status === 400 && /davomat/.test(r.data.message), r.data);

  // ── E'lon qilingan hisob → farq tuzatma bo'lib yoziladi
  await api('POST', '/billing/2026-09/generate', manager.token, { groupId: G.id });
  r = await api('POST', '/billing/2026-09/post', manager.token, { groupId: G.id });
  const ch1 = await prisma.charge.findFirst({ where: { studentId: S1.id, groupId: G.id, month: '2026-09', type: 'tuition' } });
  check('sentabr hisobi e\'lon qilindi (guruh 10-sentabrdan, o\'quvchi birinchi darsdan — to\'liq oy 600 000)', ch1?.status === 'posted' && ch1.net === 600000, ch1 && { net: ch1.net, calc: JSON.parse(ch1.calc).billableLessons });
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p1.id, startDate: '2026-09-21' }] });
  const adj = await prisma.charge.findFirst({ where: { reversesChargeId: ch1.id, status: 'posted' } });
  check('boshlanish 21-sentabrga surildi — tuzatma −350 000 (5/12 dars → 250 000)', r.status === 200 && r.data.adjustments?.[0]?.delta === -350000 && adj?.net === -350000, { data: r.data, adj: adj?.net });
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p1.id, startDate: '2026-09-21' }] });
  check('o\'zgarishsiz qayta yuborish — tuzatma takrorlanmaydi', r.status === 200 && r.data.changed === 0 && (await prisma.charge.count({ where: { reversesChargeId: ch1.id } })) === 1, r.data);

  // ── Guruh boshlanishi o'zgarishi: undan oldin boshlanganlar suriladi; davomatdan keyinga — rad
  r = await api('PUT', `/groups/${G.id}`, manager.token, { startDate: '2026-09-15' });
  check('guruh 15-sentabrdan: S2 (11-sentabr) 15-ga surildi, S1 (21) o\'zgarmadi', r.status === 200 && (await periodOf(S2.id, G.id)).startDate === '2026-09-15' && (await periodOf(S1.id, G.id)).startDate === '2026-09-21', r);
  r = await api('PUT', `/groups/${G.id}`, manager.token, { startDate: '2026-09-20' });
  check('davomat (16-sentabr) dan keyinga surish — 400, guruh o\'zgarmadi', r.status === 400 && (await prisma.group.findUnique({ where: { id: G.id } })).startDate === '2026-09-15', r);

  // ── RS-38: to'lov hisobdan OLDIN kiritilgan — e'lon qilinganda avtomatik biriktiriladi
  await setMode('live');
  const G3 = await mkGroup('Avans', '2026-08-01');
  const S3 = await mkStudent('Start-3');
  await prisma.enrollmentPeriod.create({ data: { studentId: S3.id, groupId: G3.id, startDate: '2026-08-01' } });
  await prisma.enrollment.create({ data: { studentId: S3.id, groupId: G3.id } });
  r = await api('POST', '/receipts', manager.token, { studentId: S3.id, amount: 300000, date: today });
  check('hisobsiz to\'lov — avans 300 000', r.status === 201 && r.data.unallocated === 300000, r.data);
  await api('POST', '/billing/2026-09/generate', manager.token, { groupId: G3.id });
  r = await api('POST', '/billing/2026-09/post', manager.token, { groupId: G3.id });
  const ch3 = await prisma.charge.findFirst({ where: { studentId: S3.id, month: '2026-09', type: 'tuition' } });
  const al3 = await prisma.paymentAllocation.aggregate({ where: { chargeId: ch3.id, reversedAt: null }, _sum: { amount: true } });
  const bal3 = (await prisma.student.findUnique({ where: { id: S3.id } })).balance;
  check('e\'lon qilinganda avans hisobga biriktirildi, balans −300 000', r.status === 200 && r.data.creditApplied >= 1 && al3._sum.amount === 300000 && bal3 === -300000, { post: r.data, al: al3._sum.amount, bal3 });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.paymentAllocation.deleteMany({ where: { payment: { studentId: { in: studs } } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
