// "1 oy" qanday hisoblanadi (billing_cycle_mode) va jonli rejimda avtomatik hisob:
// kalendar oy (standart) va guruh boshlangan kundan har oy; hisob darhol kuchga kiradi,
// hisob usuli guruhga "yopishadi", a'zolik o'zgarsa tuzatma o'zi yoziladi.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const cycleRow = await prisma.setting.findUnique({ where: { key: 'billing_cycle_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const groupIds = [];
const tuition = (studentId, month) => prisma.charge.findFirst({ where: { studentId, month, type: 'tuition' } });
const bal = async (id) => Math.round((await prisma.student.findUnique({ where: { id } })).balance ?? 0);

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
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  await setMode('live');
  await prisma.setting.deleteMany({ where: { key: 'billing_cycle_mode' } });

  // ── A. Kalendar oy (standart): guruh 15-sentabrdan → sentabr 7/12 dars, hisob darhol kuchga kiradi
  const G1 = await mkGroup('Kalendar', '2026-09-15');
  const S1 = await mkStudent('Kal-1');
  let r = await api('POST', '/enrollments', manager.token, { studentId: S1.id, groupId: G1.id, startDate: '2026-09-15' });
  let c = await tuition(S1.id, '2026-09');
  check('kalendar: yozilganda hisob darhol (e\'lon qilingan) — 7/12 → 350 000', r.status === 201 && c?.status === 'posted' && c.net === 350000 && JSON.parse(c.calc).cycleMode === 'calendar', c && { st: c.status, net: c.net });
  check('balans darhol −350 000 (qarzdorlar ro\'yxatida)', await bal(S1.id) === -350000, await bal(S1.id));

  r = await api('POST', '/receipts', manager.token, { studentId: S1.id, amount: 200000, date: today });
  r = await api('GET', '/billing/2026-09/summary', manager.token);
  const row1 = r.data.find(x => x.student.id === S1.id);
  check('oy jadvali: hisob 350 000, to\'langan 200 000, qarz 150 000, davr 01.09–30.09', row1?.amount === 350000 && row1.paid === 200000 && row1.debt === 150000 && row1.windowFrom === '2026-09-01' && row1.windowTo === '2026-09-30', row1);

  // ── B. Sozlama: guruh boshlangan kundan
  r = await api('PUT', '/finance/billing-settings', admin.token, { cycleMode: 'bogus' });
  check('noto\'g\'ri usul — 400', r.status === 400, r.status);
  r = await api('PUT', '/finance/billing-settings', manager.token, { cycleMode: 'group_anniversary' });
  check('usulni faqat ADMIN o\'zgartiradi', r.status === 403, r.status);
  r = await api('PUT', '/finance/billing-settings', admin.token, { cycleMode: 'group_anniversary' });
  check('usul saqlandi', r.status === 200 && r.data.cycleMode === 'group_anniversary', r.data);

  const G2 = await mkGroup('Sikl', '2026-08-15');
  const S2 = await mkStudent('Sikl-2');
  r = await api('POST', '/enrollments', manager.token, { studentId: S2.id, groupId: G2.id, startDate: '2026-08-15' });
  const aug = await tuition(S2.id, '2026-08'), sep = await tuition(S2.id, '2026-09');
  const ac = aug && JSON.parse(aug.calc), sc2 = sep && JSON.parse(sep.calc);
  check('guruh boshlangan kundan: avgust hisobi 15.08–14.09 to\'liq 600 000', aug?.status === 'posted' && aug.net === 600000 && ac.cycleMode === 'group_anniversary' && ac.windowFrom === '2026-08-15' && ac.windowTo === '2026-09-14', ac && { net: aug.net, w: [ac.windowFrom, ac.windowTo] });
  check('sentabr hisobi 15.09–14.10 to\'liq 600 000', sep?.status === 'posted' && sep.net === 600000 && sc2.windowFrom === '2026-09-15' && sc2.windowTo === '2026-10-14', sc2 && { net: sep.net, w: [sc2.windowFrom, sc2.windowTo] });
  check('keyingi oyna (15.10) hali boshlanmagan — oktabr hisobi yo\'q', !(await tuition(S2.id, '2026-10')));

  const S3 = await mkStudent('Sikl-3');
  r = await api('POST', '/enrollments', manager.token, { studentId: S3.id, groupId: G2.id, startDate: '2026-09-21' });
  const s3 = await tuition(S3.id, '2026-09');
  check('oyna o\'rtasida qo\'shildi (21.09): 11/12 dars → 550 000', s3?.status === 'posted' && s3.net === 550000, s3 && { net: s3.net, R: JSON.parse(s3.calc).R });

  r = await api('POST', '/enrollments/preview', manager.token, { groupId: G2.id, startDate: '2026-10-05' });
  check('preview: 05.10 — sentabr oynasi (15.09–14.10), 5 dars → 250 000', r.status === 200 && r.data.month === '2026-09' && r.data.windowFrom === '2026-09-15' && r.data.firstMonthAmount === 250000, r.data);

  // ── C. Usul guruhga yopishadi: sozlama qaytsa ham G2 o'z usulida
  await api('PUT', '/finance/billing-settings', admin.token, { cycleMode: 'calendar' });
  r = await api('POST', '/billing/2026-09/refresh', manager.token, {});
  const sepAfter = await tuition(S2.id, '2026-09');
  check('sozlama kalendarga qaytdi — G2 hisoblari o\'zgarmadi, tuzatma yo\'q', r.status === 200 && sepAfter.net === 600000 && JSON.parse(sepAfter.calc).windowFrom === '2026-09-15' && (await prisma.charge.count({ where: { reversesChargeId: sep.id } })) === 0, { st: r.status, data: r.data });
  r = await api('POST', '/billing/2026-12/refresh', manager.token, {});
  check('kelgusi oy hisobini oldindan chiqarib bo\'lmaydi — 400', r.status === 400, r.status);

  // ── D. A'zolik yakunlansa — tuzatma o'zi yoziladi (qo'lda e'lon/oy yakuni yo'q)
  const p3 = await prisma.enrollmentPeriod.findFirst({ where: { studentId: S3.id, groupId: G2.id } });
  r = await api('POST', `/enrollments/periods/${p3.id}/end`, manager.token, { endDate: '2026-09-25', reason: 'left' });
  const adj3 = await prisma.charge.findFirst({ where: { reversesChargeId: s3.id, status: 'posted' } });
  check('25.09 da ketdi: 3/12 dars → 150 000, tuzatma −400 000 avtomatik', r.status === 200 && adj3?.net === -400000, { st: r.status, adj: adj3?.net });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  if (cycleRow) await prisma.setting.upsert({ where: { key: 'billing_cycle_mode' }, create: { key: 'billing_cycle_mode', value: cycleRow.value }, update: { value: cycleRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'billing_cycle_mode' } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.paymentAllocation.deleteMany({ where: { payment: { studentId: { in: studs } } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
