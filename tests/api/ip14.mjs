// IP-13/14 (+IP-16 yadrosi) — live rejimda balans keshi formula bo'yicha, solishtirish, tashqi to'lov va o'chirish.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG, BASE } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const groupIds = [];
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const bal = async (id) => Math.round((await prisma.student.findUnique({ where: { id } })).balance ?? 0);
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  const course = await prisma.course.create({ data: { name: `${TAG} kurs kesh`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} kesh`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-01-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const S = await prisma.student.create({ data: { name: `${TAG} Kesh O'quvchi`, balance: -999 } });
  track('student', S.id);
  await prisma.enrollmentPeriod.create({ data: { studentId: S.id, groupId: G.id, startDate: '2026-08-01' } });

  await setMode('shadow');
  await api('POST', '/billing/2026-10/generate', manager.token, { groupId: G.id });
  await api('POST', '/billing/2026-10/post', manager.token, { groupId: G.id });
  let r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 200000, date: today });
  check('shadow: to\'lov taqsimlandi, balans eskicha (+200 000)', r.status === 201 && r.data.allocations.length === 1 && await bal(S.id) === 199001, { st: r.status, bal: await bal(S.id) });
  r = await api('GET', '/billing/reconcile', manager.token);
  const row = r.data.rows.find(x => x.studentId === S.id);
  check('solishtirish (shadow): kesh 199 001, formula −400 000', row?.cache === 199001 && row?.derived === -400000, row);

  // ── live'ga o'tish
  r = await api('PUT', '/billing/mode', admin.token, { mode: 'live' });
  check('live\'ga o\'tish — barcha balanslar qayta hisoblandi', r.status === 200 && r.data.synced > 0 && await bal(S.id) === -400000, { data: r.data, bal: await bal(S.id) });
  const st = await prisma.student.findUnique({ where: { id: S.id } });
  check('live: paymentStatus hosila (Qarzdorlik)', st.paymentStatus === 'Qarzdorlik', st.paymentStatus);

  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 450000, date: today });
  check('live: to\'lov → balans = avans − qarz = +50 000', r.status === 201 && await bal(S.id) === 50000, { bal: await bal(S.id), data: r.data?.unallocated });
  const pay = r.data.payment;
  const alloc = r.data.allocations[0];
  r = await api('POST', `/receipts/allocations/${alloc.id}/reverse`, manager.token, { reason: 'Tekshiruv' });
  check('live: taqsimot bekor — balans o\'zgarmaydi (avans oshdi, qarz oshdi) = +50 000', r.status === 200 && await bal(S.id) === 50000, await bal(S.id));
  await api('POST', `/receipts/${pay.id}/allocate`, manager.token, { auto: true });

  const oct = await prisma.charge.findFirst({ where: { studentId: S.id, month: '2026-10', type: 'tuition' } });
  r = await api('POST', `/billing/charges/${oct.id}/adjust`, manager.token, { amount: -100000, reason: 'Kompensatsiya' });
  check('live: hisob tuzatmasi −100 000 → balans +150 000', r.status === 201 && await bal(S.id) === 150000, await bal(S.id));

  await api('POST', '/billing/2026-11/generate', manager.token, { groupId: G.id });
  await api('POST', '/billing/2026-11/post', manager.token, { groupId: G.id });
  check('live: yangi oy e\'lon qilindi → balans 150 000 − 600 000 = −450 000', await bal(S.id) === -450000, await bal(S.id));

  // Qo'lda balans tuzatish live rejimda
  r = await api('POST', `/students/${S.id}/balance-adjustments`, manager.token, { amount: 50000, reason: 'Avans qo\'shish' });
  check('live: qo\'lda avans qo\'shish — 409 (faqat kvitansiya orqali)', r.status === 409 && r.data.code === 'LIVE_MODE', r);
  r = await api('POST', `/students/${S.id}/balance-adjustments`, manager.token, { amount: -30000, reason: 'Kitob uchun qarz' });
  const fee = await prisma.charge.findFirst({ where: { studentId: S.id, type: 'other_fee' } });
  check('live: qarz qo\'shish — other_fee hisobi, balans −480 000', r.status === 200 && fee?.net === 30000 && fee.status === 'posted' && await bal(S.id) === -480000, { st: r.status, fee: fee?.net, bal: await bal(S.id) });

  // Invoice "to'landi" (tashqi to'lov yo'li) — live'da taqsimlanadi
  r = await api('POST', '/finance/invoices', manager.token, { studentId: S.id, amount: 100000, dueDate: today, method: 'Naqd' });
  const inv = r.data;
  if (inv?.id) track('invoice', inv.id);
  r = await api('PATCH', `/finance/invoices/${inv.id}`, manager.token, { status: 'paid' });
  const invPay = await prisma.payment.findFirst({ where: { studentId: S.id, notes: { contains: inv.number } }, include: { allocations: true } });
  check('live: invoice to\'landi — auto_fifo taqsimot, balans −380 000', r.status === 200 && invPay?.allocationMode === 'auto_fifo' && invPay.allocations.length > 0 && await bal(S.id) === -380000, { st: r.status, mode: invPay?.allocationMode, bal: await bal(S.id) });

  // Kvitansiya kassa yozuvini o'chirish — to'lov bekor, taqsimot qaytadi, balans qayta hisoblanadi
  const rTx = await prisma.transaction.findFirst({ where: { sourceType: 'receipt', sourceId: pay.id } });
  r = await api('DELETE', `/finance/${rTx.id}`, manager.token);
  const payAfter = await prisma.payment.findUnique({ where: { id: pay.id }, include: { allocations: true } });
  check('kvitansiya o\'chirildi: to\'lov soft-delete, taqsimotlar bekor, balans −830 000', r.status === 200 && !!payAfter.deletedAt && payAfter.allocations.every(a => a.reversedAt) && await bal(S.id) === -830000, { st: r.status, bal: await bal(S.id), del: payAfter.deletedAt });

  r = await api('GET', '/billing/reconcile', manager.token);
  check('live: solishtirish — test o\'quvchida farq yo\'q', !r.data.rows.some(x => x.studentId === S.id), r.data.rows.filter(x => x.studentId === S.id));
  // Invariant: har hisob bo'yicha faol taqsimot ≤ tuzatilgan summa (ortiqcha yopish yo'q)
  const chs = await prisma.charge.findMany({ where: { studentId: S.id, status: 'posted', type: { in: ['tuition', 'other_fee'] } } });
  let bad = [];
  for (const c of chs) {
    const adj = (await prisma.charge.aggregate({ where: { reversesChargeId: c.id, status: 'posted' }, _sum: { net: true } }))._sum.net ?? 0;
    const al = (await prisma.paymentAllocation.aggregate({ where: { chargeId: c.id, reversedAt: null }, _sum: { amount: true } }))._sum.amount ?? 0;
    if (al > c.net + adj) bad.push({ id: c.id, al, adjusted: c.net + adj });
  }
  check('invariant: taqsimot hech bir hisobda tuzatilgan summadan oshmaydi', bad.length === 0, bad);

  // Legacy yo'l: shadow'ga qaytib to'lov — eskicha oshiriladi
  await setMode('shadow');
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 30000, date: today });
  check('shadow\'ga qaytildi: balans eskicha +30 000 (kesh saqlangan)', await bal(S.id) === -800000, await bal(S.id));
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
