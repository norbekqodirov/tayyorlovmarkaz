// Yagona qarz ko'rinishi (jonli rejim): CRM hisob varag'i, ota-ona portali va analitika
// bir xil manbadan — e'lon qilingan hisoblar, taqsimotlar va qarz (receivables).
import { createRequire } from 'node:module';
import path from 'node:path';
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const require = createRequire(path.resolve('package.json'));
const jwt = require('jsonwebtoken');
const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const cycleRow = await prisma.setting.findUnique({ where: { key: 'billing_cycle_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const groupIds = [];

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  await setMode('live');
  await prisma.setting.deleteMany({ where: { key: 'billing_cycle_mode' } });

  const course = await prisma.course.create({ data: { name: `${TAG} kurs ledger`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Ledger`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-09-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const chatId = `zz-${Date.now()}`;
  const S = await prisma.student.create({ data: { name: `${TAG} Ledger O'quvchi`, parentTelegramId: chatId } });
  track('student', S.id);

  let r = await api('POST', '/enrollments', manager.token, { studentId: S.id, groupId: G.id, startDate: '2026-09-01' });
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 200000, date: today });

  // ── CRM: o'quvchi hisob varag'i
  r = await api('GET', `/billing/students/${S.id}/ledger`, manager.token);
  const c0 = r.data.charges?.[0];
  check('CRM hisob varag\'i: qarz 400 000, sentabr 600 000 / 200 000 to\'langan, muddati o\'tgan', r.status === 200 && r.data.mode === 'live' && r.data.debt === 400000 && c0?.amount === 600000 && c0.paid === 200000 && c0.debt === 400000 && c0.overdue === (today > '2026-09-10') && c0.windowFrom === '2026-09-01', r.data);

  // ── Ota-ona portali: xuddi shu raqamlar
  const token = jwt.sign({ chatId }, process.env.JWT_SECRET);
  r = await api('GET', '/portal/payments', null, undefined, { 'x-portal-token': token });
  check('portal: jami qarz 400 000 (CRM bilan bir xil), oylik hisob va kvitansiya ko\'rinadi', r.status === 200 && r.data.totalUnpaid === 400000 && r.data.ledger?.debt === 400000 && r.data.ledger.charges[0]?.amount === 600000 && r.data.ledger.charges[0]?.paid === 200000 && !!r.data.recent[0]?.receiptNo && !r.data.monthlyDue, r.data);
  const bal = Math.round((await prisma.student.findUnique({ where: { id: S.id } })).balance);
  check('kesh balans = −qarz (qarzdorlar ro\'yxati, bot /balance)', bal === -400000, bal);

  // ── Analitika: guruh rentabelligi — kutilgan tushum joriy oy hisoblaridan
  r = await api('GET', '/analytics/reports/group-profitability', admin.token);
  const row = Array.isArray(r.data) ? r.data.find(x => x.id === G.id) : null;
  check('analitika: kutilgan oylik tushum = sentabr hisobi 600 000, qarzdor 1', r.status === 200 && row?.expectedMonthly === 600000 && row.debtors === 1, row);

  // ── IP-19: kassir — kurs to'lovi javobida kvitansiya va taqsimot (chek uchun)
  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 150000, category: "Kurs to'lovi", date: today, method: 'Naqd', studentId: S.id });
  check('kurs to\'lovi javobi: kvitansiya raqami va taqsimot (150 000 → sentabr)', r.status === 200 && /^Q-\d{4}-\d{6}$/.test(r.data.receiptNo || '') && r.data.allocations?.[0]?.amount === 150000 && r.data.unallocated === 0, r.data);
  r = await api('GET', `/receipts/suggest?studentId=${S.id}&amount=400000`, manager.token);
  check('taklif: 400 000 dan 250 000 qarzga, 150 000 avansga', r.status === 200 && r.data.plan?.[0]?.amount === 250000 && r.data.credit === 150000, r.data);
  const tgBefore = await prisma.setting.findUnique({ where: { key: 'telegram_auto_receipt' } });
  r = await api('PUT', '/telegram/settings', admin.token, { autoReceipt: true });
  const tg = await api('GET', '/telegram/settings', admin.token);
  check('Telegram sozlamasi: kvitansiya yoqildi', r.status === 200 && tg.data.autoReceipt === true, tg.data);
  if (tgBefore) await prisma.setting.update({ where: { key: 'telegram_auto_receipt' }, data: { value: tgBefore.value } });
  else await prisma.setting.deleteMany({ where: { key: 'telegram_auto_receipt' } });

  // ── Legacy rejimda portal eskicha (orqaga moslik)
  await setMode('legacy');
  r = await api('GET', '/portal/payments', null, undefined, { 'x-portal-token': token });
  check('legacy rejim: portal eski javob shaklida (ledger yo\'q)', r.status === 200 && !r.data.ledger && 'monthlyDue' in r.data, Object.keys(r.data || {}));
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
