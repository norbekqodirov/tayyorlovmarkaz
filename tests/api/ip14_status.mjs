// Live rejimda to'lov holati va qarzdorlar ro'yxati (2026-09-26 production hodisasi):
// guruhsiz (hisobsiz) o'quvchi "To'lov qilingan" emas, "Hisobsiz"; qarzdorlar ro'yxati hisoblardan,
// guruh nomi a'zolikdan; guruhsiz o'quvchilar alohida ro'yxatda.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const cycleRow = await prisma.setting.findUnique({ where: { key: 'billing_cycle_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const groupIds = [];
const status = async (id) => (await prisma.student.findUnique({ where: { id }, select: { paymentStatus: true } }))?.paymentStatus;

try {
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  await setMode('live');
  await prisma.setting.deleteMany({ where: { key: 'billing_cycle_mode' } });

  const course = await prisma.course.create({ data: { name: `${TAG} kurs holat`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Holat guruhi`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-09-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const mk = async (name) => { const s = await prisma.student.create({ data: { name: `${TAG} ${name}`, paymentStatus: 'Tolov qilingan' } }); track('student', s.id); return s; };
  const A = await mk('Holat A'); // guruhda, qarz
  const B = await mk('Holat B'); // guruhsiz
  const C = await mk('Holat C'); // xato qo'shilgan — hisob 0 ga tuzatiladi

  let r = await api('POST', '/enrollments', manager.token, { studentId: A.id, groupId: G.id, startDate: '2026-09-01' });
  check('guruhga yozildi — hisob chiqdi, holat "Qarzdorlik"', r.status < 300 && (await status(A.id)) === 'Qarzdorlik', { status: r.status, ps: await status(A.id) });

  r = await api('GET', '/billing/debtors', manager.token);
  const dA = r.data.debtors?.find(d => d.student.id === A.id);
  check('qarzdorlar (hisoblardan): A — 600 000, guruh nomi a\'zolikdan', r.status === 200 && r.data.mode === 'live' && dA?.debt === 600000 && dA.items?.[0]?.groupName === G.name, dA);
  check('qarzdorlar: guruhsiz B yo\'q', !r.data.debtors?.some(d => d.student.id === B.id));

  r = await api('GET', '/billing/without-group', manager.token);
  check('guruhsizlar ro\'yxati: B bor, A yo\'q', r.status === 200 && r.data.some(s => s.id === B.id) && !r.data.some(s => s.id === A.id), r.data?.length);

  r = await api('POST', '/receipts', manager.token, { studentId: A.id, amount: 600000, date: today });
  check('to\'liq to\'lov — "Tolov qilingan", qarzdorlardan chiqdi', r.status === 201 && (await status(A.id)) === 'Tolov qilingan'
    && !((await api('GET', '/billing/debtors', manager.token)).data.debtors || []).some(d => d.student.id === A.id), await status(A.id));

  r = await api('POST', '/enrollments', manager.token, { studentId: C.id, groupId: G.id, startDate: '2026-09-01' });
  const pc = await prisma.enrollmentPeriod.findFirst({ where: { studentId: C.id, groupId: G.id } });
  r = await api('POST', `/enrollments/periods/${pc?.id}/end`, manager.token, { reason: 'admin_fix' });
  check('xato qo\'shilgan (hisob 0) — "Hisobsiz", "To\'lov qilingan" emas', r.status === 200 && (await status(C.id)) === 'Hisobsiz', { status: r.status, ps: await status(C.id) });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  if (cycleRow) await prisma.setting.upsert({ where: { key: 'billing_cycle_mode' }, create: { key: 'billing_cycle_mode', value: cycleRow.value }, update: { value: cycleRow.value } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.paymentAllocation.deleteMany({ where: { payment: { studentId: { in: studs } } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
