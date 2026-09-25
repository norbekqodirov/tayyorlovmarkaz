// IP-21 — oy yopish va davr qulfi (F.10, QT-78, QT-79): checklist, majburiy yopish,
// yopilgan oyga yozish rad, tuzatma keyingi ochiq oyga, kechikkan to'lov eski qarzni yopa oladi.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Map((await prisma.billingPeriod.findMany()).map(p => [p.month, p]));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const curMonth = today.slice(0, 7);
const groupIds = [];

try {
  const admin = await makeUser('ADMIN');
  const superAdmin = await makeUser('SUPER_ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance', 'schedule', 'journal']);
  await setMode('live');
  await prisma.billingPeriod.deleteMany({ where: { month: '2026-08' } });

  const course = await prisma.course.create({ data: { name: `${TAG} kurs yopish`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Yopish`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-08-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const S = await prisma.student.create({ data: { name: `${TAG} Yopish O'quvchi` } });
  track('student', S.id);
  let r = await api('POST', '/enrollments', manager.token, { studentId: S.id, groupId: G.id, startDate: '2026-08-01' });
  const aug = await prisma.charge.findFirst({ where: { studentId: S.id, month: '2026-08', type: 'tuition' } });
  const S2 = await prisma.student.create({ data: { name: `${TAG} Yopish Ikkinchi` } });
  track('student', S2.id);
  await api('POST', '/enrollments', manager.token, { studentId: S2.id, groupId: G.id, startDate: '2026-08-01' });
  const aug2 = await prisma.charge.findFirst({ where: { studentId: S2.id, month: '2026-08', type: 'tuition' } });
  check('avgust hisobi avtomatik (to\'liq oy 600 000)', aug?.status === 'posted' && aug.net === 600000, aug && { st: aug.status, net: aug.net });

  // ── QT-78: davomati olinmagan dars — yopish bloklanadi
  r = await api('GET', '/billing/2026-08/close-check', manager.token);
  const att = r.data.items?.find(i => i.key === 'attendance');
  const myMissing = att?.details?.find(d => d.groupId === G.id)?.dates.length;
  check('checklist: avgustda 13 dars davomatsiz — bloklangan', r.status === 200 && att?.status === 'block' && myMissing === 13 && !r.data.canClose, { st: r.status, myMissing, canClose: r.data.canClose });

  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: '2026-08-03', reason: 'Qog\'ozdan kiritildi', records: [{ studentId: S.id, status: 'present' }] });
  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: '2026-08-05', reason: 'Qog\'ozdan kiritildi', records: [{ studentId: S.id, status: 'present' }] });
  r = await api('GET', '/billing/2026-08/close-check', manager.token);
  check('2 ta davomat kiritildi — 11 ta qoldi', r.data.items.find(i => i.key === 'attendance').details.find(d => d.groupId === G.id)?.dates.length === 11);

  r = await api('POST', '/billing/2026-08/close', manager.token, {});
  check('MANAGER oyni yopa olmaydi — 403', r.status === 403, r.status);
  r = await api('POST', '/billing/2026-08/close', admin.token, {});
  check('blokerlar bilan oddiy yopish — 409 CHECKLIST', r.status === 409 && r.data.code === 'CHECKLIST', r.data?.code);
  r = await api('POST', '/billing/2026-08/close', admin.token, { force: true });
  check('majburiy yopish sababsiz — 400', r.status === 400, r.status);
  r = await api('POST', '/billing/2026-08/close', admin.token, { force: true, reason: 'Birinchi oy — davomat qog\'ozda yuritilgan' });
  const bp = await prisma.billingPeriod.findUnique({ where: { month: '2026-08' } });
  check('majburiy yopildi: holat closed, checklist va sabab saqlandi', r.status === 200 && bp?.status === 'closed' && JSON.parse(bp.checklist).forced === true && !!bp.closedById, { st: r.status, bp: bp?.status });
  r = await api('POST', '/billing/2026-08/close', admin.token, {});
  check('takroriy yopish — o\'sha natija', r.status === 200 && r.data.alreadyClosed === true, r.data);

  // ── QT-79: yopilgan oyga yozish rad
  r = await api('POST', '/attendance-records', admin.token, { groupId: G.id, date: '2026-08-07', reason: 'Kechikkan', records: [{ studentId: S.id, status: 'present' }] });
  check('yopilgan oyga davomat — 409 PERIOD_CLOSED', r.status === 409 && r.data.code === 'PERIOD_CLOSED', r);
  r = await api('POST', '/lesson-plan/sessions', manager.token, { groupId: G.id, date: '2026-08-20', kind: 'extra', price: 50000 });
  check('yopilgan oyga qo\'shimcha dars — 409', r.status === 409, r.status);
  r = await api('POST', '/finance/teacher-payroll', manager.token, { teacherId: admin.user.id, year: 2026, month: 8, basis: 'accrual' });
  check('yopilgan oy maoshini qayta hisoblash — 409', r.status === 409, r.status);
  r = await api('POST', '/finance/expenses', manager.token, { category: 'OTHER', amount: 10000, description: 'test', date: '2026-08-20' });
  check('yopilgan oyga xarajat — 409', r.status === 409, r.status);

  // ── Yopilgan oyga ta'sir qiluvchi o'zgarish — tuzatma keyingi ochiq oyga
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: (await prisma.enrollmentPeriod.findFirst({ where: { studentId: S.id, groupId: G.id } })).id, startDate: '2026-08-17' }] });
  check("davomati bor o'quvchini keyinga surib bo'lmaydi — 400", r.status === 400, r.status);
  const p = await prisma.enrollmentPeriod.findFirst({ where: { studentId: S2.id, groupId: G.id } });
  r = await api('POST', '/enrollments/periods/start-dates', manager.token, { groupId: G.id, items: [{ periodId: p.id, startDate: '2026-08-17' }] });
  const adj = await prisma.charge.findFirst({ where: { reversesChargeId: aug2.id, status: 'posted' } });
  check('boshlanish 17.08 ga surildi: avgust hisobi o\'zgarmadi, tuzatma sentabrga', r.status === 200 && adj && adj.month === '2026-09' && adj.net < 0 && (await prisma.charge.findUnique({ where: { id: aug2.id } })).net === 600000, { st: r.status, adj: adj && { month: adj.month, net: adj.net } });

  // ── Kechikkan to'lov yopilgan oy qarzini yopa oladi
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 100000, date: today });
  const al = await prisma.paymentAllocation.findFirst({ where: { chargeId: aug.id, reversedAt: null } });
  check('bugungi to\'lov avgust (yopilgan) qarziga biriktirildi', r.status === 201 && al?.amount === 100000, { st: r.status, al: al?.amount });

  r = await api('POST', `/billing/${curMonth}/close`, admin.token, {});
  check('joriy oyni yopib bo\'lmaydi — 409 NOT_ENDED', r.status === 409 && r.data.code === 'NOT_ENDED', r.data?.code);

  // ── Qayta ochish — faqat SUPER_ADMIN, sabab bilan
  r = await api('POST', '/billing/2026-08/reopen', admin.token, { reason: 'Xato' });
  check('ADMIN qayta ocholmaydi — 403', r.status === 403, r.status);
  r = await api('POST', '/billing/2026-08/reopen', superAdmin.token, {});
  check('sababsiz — 400', r.status === 400, r.status);
  r = await api('POST', '/billing/2026-08/reopen', superAdmin.token, { reason: 'Davomat qo\'shiladi' });
  check('SUPER_ADMIN sabab bilan qayta ochdi', r.status === 200 && (await prisma.billingPeriod.findUnique({ where: { month: '2026-08' } })).status === 'open', r.status);
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
  // Davr jadvali: test oldingi holatiga
  for (const bp of await prisma.billingPeriod.findMany()) {
    const before = periodsBefore.get(bp.month);
    if (!before) await prisma.billingPeriod.delete({ where: { month: bp.month } }).catch(() => {});
    else await prisma.billingPeriod.update({ where: { month: bp.month }, data: { status: before.status, closedAt: before.closedAt, closedById: before.closedById, checklist: before.checklist, reopenedAt: before.reopenedAt, reopenReason: before.reopenReason } }).catch(() => {});
  }
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
