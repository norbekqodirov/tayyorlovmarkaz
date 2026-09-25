// IP-12 — kvitansiya, taqsimot (FIFO/qo'lda), qarz/avans invariantlari, idempotency, kategoriya turi (TQ-D/TQ-E).
import { prisma, api, makeUser, track, check, summary, cleanup, TAG, BASE } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const groupIds = [];
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

const post = async (path, token, body, key) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null), replay: r.headers.get('idempotent-replay') };
};
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });

try {
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'journal']);
  const course = await prisma.course.create({ data: { name: `${TAG} kurs kv`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} kvitansiya`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-01-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const S = await prisma.student.create({ data: { name: `${TAG} Kvitansiya Oluvchi`, phone: '+998 91 234 56 78' } });
  track('student', S.id);
  const S2 = await prisma.student.create({ data: { name: `${TAG} Ikkinchi` } });
  track('student', S2.id);
  for (const s of [S, S2]) await prisma.enrollmentPeriod.create({ data: { studentId: s.id, groupId: G.id, startDate: '2026-08-01' } });
  await prisma.enrollment.create({ data: { studentId: S.id, groupId: G.id } });
  await prisma.student.update({ where: { id: S.id }, data: { code: 'S-777001', phoneNorm: '912345678' } });

  await setMode('shadow');
  for (const m of ['2026-10', '2026-11']) {
    await api('POST', `/billing/${m}/generate`, manager.token, { groupId: G.id });
    await api('POST', `/billing/${m}/post`, manager.token, { groupId: G.id });
  }
  const [oct, nov] = await Promise.all(['2026-10', '2026-11'].map(m => prisma.charge.findFirst({ where: { studentId: S.id, month: m, type: 'tuition' } })));
  check('tayyorlov: oktyabr va noyabr hisoblari 600 000 dan', oct?.net === 600000 && nov?.net === 600000, { oct: oct?.net, nov: nov?.net });

  // ── Qidiruv (TQ-D)
  let r = await api('GET', `/students/search?q=${encodeURIComponent('kvitansiya')}`, manager.token);
  check('qidiruv: ism bo\'yicha', r.status === 200 && r.data.some(x => x.id === S.id), r.data);
  r = await api('GET', '/students/search?q=S-777001', manager.token);
  check('qidiruv: kod bo\'yicha', r.data.length === 1 && r.data[0].id === S.id, r.data);
  r = await api('GET', '/students/search?q=2345678', manager.token);
  check('qidiruv: telefon raqamlari bo\'yicha', r.data.some(x => x.id === S.id), r.data);
  r = await api('GET', '/students/search?q=kv', teacher.token);
  check('qidiruv: ustoz — 403', r.status === 403, r.status);

  // ── FIFO taklif va avtomatik taqsimot
  r = await api('GET', `/receipts/suggest?studentId=${S.id}&amount=700000`, manager.token);
  check('taklif: avval oktyabr 600 000, keyin noyabr 100 000', r.data.plan.length === 2 && r.data.plan[0].month === '2026-10' && r.data.plan[0].amount === 600000 && r.data.plan[1].amount === 100000 && r.data.credit === 0, r.data);
  const key1 = `k-${Date.now()}-a`;
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 700000, method: 'Naqd', date: today }, key1);
  const p1 = r.data?.payment;
  check('kvitansiya: 201, raqam Q-YYYY-…, auto_fifo, 2 taqsimot', r.status === 201 && /^Q-\d{4}-\d{6}$/.test(p1?.receiptNo || '') && r.data.allocationMode === 'auto_fifo' && r.data.allocations.length === 2 && r.data.unallocated === 0, r.data);
  const tx1 = await prisma.transaction.findFirst({ where: { sourceType: 'receipt', sourceId: p1?.id } });
  check('kassa yozuvi: kirim, Kurs to\'lovi, to\'lovga bog\'langan', tx1?.type === 'income' && tx1.amount === 700000 && tx1.studentId === S.id, tx1);

  // ── Idempotency
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 700000, method: 'Naqd', date: today }, key1);
  check('idempotency: xuddi shu kalit — qayta bajarilmaydi, birinchi javob', r.status === 201 && r.replay === 'true' && r.data.payment.id === p1.id && (await prisma.payment.count({ where: { studentId: S.id } })) === 1, { replay: r.replay, count: await prisma.payment.count({ where: { studentId: S.id } }) });
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 1000, method: 'Naqd', date: today }, key1);
  check('idempotency: kalit boshqa tana bilan — 409', r.status === 409 && r.data.code === 'IDEMPOTENCY_MISMATCH', r);
  const key2 = `k-${Date.now()}-par`;
  const par = await Promise.all([1, 2, 3].map(() => post('/receipts', manager.token, { studentId: S2.id, amount: 50000, method: 'Karta', date: today }, key2)));
  check('idempotency: 3 ta parallel bir kalit — faqat 1 ta to\'lov', (await prisma.payment.count({ where: { studentId: S2.id } })) === 1 && par.some(x => x.status === 201), par.map(x => x.status));

  // ── Qarz / avans pozitsiyasi
  r = await api('GET', `/receipts/position/${S.id}`, manager.token);
  check('pozitsiya: qarz 500 000 (noyabr), avans 0', r.data.debt === 500000 && r.data.credit === 0 && r.data.balance === -500000, r.data);

  // ── Qo'lda taqsimot invariantlari
  const key3 = `k-${Date.now()}-over`;
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 600000, date: today, allocations: [{ chargeId: nov.id, amount: 600000 }] }, key3);
  check('taqsimot hisob qarzidan katta — 409, hech narsa yozilmadi', r.status === 409 && r.data.code === 'OVER_DEBT' && (await prisma.payment.count({ where: { studentId: S.id } })) === 1, r);
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 100000, date: today, allocations: [{ chargeId: nov.id, amount: 200000 }] });
  check('taqsimotlar to\'lovdan katta — 400', r.status === 400 && r.data.code === 'OVER_PAYMENT', r);

  // Bitta qarzga parallel ikki to'lov: noyabr qarzi 500 000 — ikkalasi ham to'liq yopmoqchi
  const [x1, x2] = await Promise.all([
    post('/receipts', manager.token, { studentId: S.id, amount: 500000, date: today, allocations: [{ chargeId: nov.id, amount: 500000 }] }),
    post('/receipts', manager.token, { studentId: S.id, amount: 500000, date: today, allocations: [{ chargeId: nov.id, amount: 500000 }] }),
  ]);
  const allocSum = (await prisma.paymentAllocation.aggregate({ where: { chargeId: nov.id, reversedAt: null }, _sum: { amount: true } }))._sum.amount;
  check('parallel: bittasi 201, bittasi 409; noyabr ortiqcha yopilmadi', [x1.status, x2.status].sort().join(',') === '201,409' && allocSum === 600000, { st: [x1.status, x2.status], allocSum });

  // Ortiqcha to'lov → avans; keyin taqsimlash
  r = await post('/receipts', manager.token, { studentId: S.id, amount: 250000, date: today });
  const p3 = r.data.payment;
  check('ortiqcha to\'lov: taqsimlanmagan 250 000 → avans', r.status === 201 && r.data.unallocated === 250000 && r.data.allocations.length === 0, r.data);
  r = await api('GET', `/receipts/position/${S.id}`, manager.token);
  check('pozitsiya: qarz 0, avans 250 000', r.data.debt === 0 && r.data.credit === 250000 && r.data.balance === 250000, r.data);

  // Taqsimotni bekor qilish → qarz qaytadi; so'ng avansdan qayta taqsimlash
  const novAlloc = await prisma.paymentAllocation.findFirst({ where: { chargeId: nov.id, paymentId: p1.id, reversedAt: null } });
  r = await api('POST', `/receipts/allocations/${novAlloc.id}/reverse`, manager.token, { reason: 'Xato guruhga' });
  check('taqsimot bekor: 200', r.status === 200 && !!r.data.reversedAt, r);
  r = await api('POST', `/receipts/allocations/${novAlloc.id}/reverse`, manager.token, { reason: 'Qayta' });
  check('ikkinchi marta bekor — 409', r.status === 409, r.status);
  r = await api('GET', `/receipts/position/${S.id}`, manager.token);
  check('pozitsiya: noyabr qarzi 100 000 qaytdi, avans 350 000', r.data.debt === 100000 && r.data.credit === 350000, r.data);
  r = await post(`/receipts/${p3.id}/allocate`, manager.token, { auto: true });
  check('avansdan avtomatik taqsimlash — 100 000', r.status === 201 && r.data.allocations[0]?.amount === 100000 && r.data.unallocated === 150000, r.data);

  // ── Legacy rejim
  await setMode('legacy');
  r = await post('/receipts', manager.token, { studentId: S2.id, amount: 30000, date: today });
  check('legacy rejim: allocationMode=legacy, taqsimot yo\'q', r.status === 201 && r.data.allocationMode === 'legacy' && r.data.allocations.length === 0, r.data);
  r = await post('/receipts', manager.token, { studentId: S2.id, amount: 30000, date: today, allocations: [{ chargeId: nov.id, amount: 1000 }] });
  check('legacy rejimda qo\'lda taqsimot — 400', r.status === 400 && r.data.code === 'LEGACY_MODE', r);
  await setMode('shadow');

  // ── Moliya formasi: kategoriya turi (TQ-D, TQ-E)
  r = await post('/finance/transactions', manager.token, { type: 'income', amount: 100000, category: "Kurs to'lovi", date: today, method: 'Naqd' });
  check('TQ-D: o\'quvchisiz kurs to\'lovi — 400', r.status === 400, r);
  r = await post('/finance/transactions', manager.token, { type: 'income', amount: 50000, category: `${TAG} Kitob`, date: today, method: 'Naqd', studentId: S2.id });
  check('TQ-E: o\'quvchili "boshqa kirim" — 400', r.status === 400, r);
  const balBefore = (await prisma.student.findUnique({ where: { id: S2.id } })).balance;
  r = await post('/finance/transactions', manager.token, { type: 'income', amount: 120000, category: "Kurs to'lovi", date: today, method: 'Karta', studentId: S2.id, description: 'Forma orqali' });
  const fp = await prisma.payment.findFirst({ where: { studentId: S2.id, amount: 120000 } });
  const balAfter = (await prisma.student.findUnique({ where: { id: S2.id } })).balance;
  check('forma orqali kurs to\'lovi — kvitansiya xizmati (raqam, rejim), balans +120 000', r.status === 200 && r.data.sourceType === 'receipt' && /^Q-/.test(fp?.receiptNo || '') && fp?.allocationMode === 'auto_fifo' && balAfter - balBefore === 120000, { r: r.data, fp, balBefore, balAfter });
  r = await post('/finance/transactions', manager.token, { type: 'income', amount: 70000, category: `${TAG} Kitob`, date: today, method: 'Naqd' });
  check('boshqa kirim o\'quvchisiz — 200, to\'lov yaratilmaydi', r.status === 200 && !(await prisma.payment.findFirst({ where: { amount: 70000, studentId: { in: [S.id, S2.id] } } })), r.data);
  if (r.data?.id) track('transaction', r.data.id);

  // ── Ruxsat
  r = await post('/receipts', teacher.token, { studentId: S.id, amount: 1000 });
  check('ustoz kvitansiya yarata olmaydi — 403', r.status === 403, r.status);
  r = await api('GET', `/billing/students/${S.id}/account`, manager.token);
  // To'lovlar 700 000 + 500 000 + 250 000 = 1 450 000; faol taqsimotlar 600 000 + 500 000 + 100 000 = 1 200 000
  check('o\'quvchi hisobi: qarz 0, avans 250 000, taqsimotlar bilan', r.status === 200 && r.data.position?.debt === 0 && r.data.position?.credit === 250000 && r.data.charges.some(c => c.allocations?.length), r.data.position);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  await prisma.idempotencyRecord.deleteMany({ where: { key: { startsWith: 'k-' } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
