// IP-17 — pul qaytarish (refund), kvitansiyani bekor qilish (void), kassa yozuvini
// o'chirish siyosati (OQ-12), maosh o'chirish/qayta ochish, invoice holat mashinasi (QT-26/27/74).
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const refundRoleRow = await prisma.setting.findUnique({ where: { key: 'refund_approval_min_role' } });
const groupIds = [];
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 5 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const bal = async (id) => Math.round((await prisma.student.findUnique({ where: { id } })).balance ?? 0);
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const incomeSum = async (studentId) => Math.round((await prisma.transaction.aggregate({ where: { studentId, type: 'income' }, _sum: { amount: true } }))._sum.amount ?? 0);

try {
  await prisma.setting.deleteMany({ where: { key: 'refund_approval_min_role' } });
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups', 'finance']);
  const course = await prisma.course.create({ data: { name: `${TAG} kurs refund`, price: 600000 } });
  track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} refund`, courseId: course.id, price: 600000, maxSize: 30, startDate: '2026-01-01' } });
  track('group', G.id); groupIds.push(G.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: G.id, groupName: G.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
  track('groupSchedule', sc.id);
  const S = await prisma.student.create({ data: { name: `${TAG} Refund O'quvchi` } });
  track('student', S.id);
  await prisma.enrollmentPeriod.create({ data: { studentId: S.id, groupId: G.id, startDate: '2026-08-01' } });

  await setMode('live');
  await api('POST', '/billing/2026-10/generate', manager.token, { groupId: G.id });
  await api('POST', '/billing/2026-10/post', manager.token, { groupId: G.id });
  const oct = await prisma.charge.findFirst({ where: { studentId: S.id, month: '2026-10', type: 'tuition' } });

  let r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 800000, date: today });
  const pay = r.data.payment;
  check('kvitansiya 800 000: 600 000 hisobga, 200 000 avans, balans +200 000', r.status === 201 && r.data.unallocated === 200000 && await bal(S.id) === 200000, { st: r.status, bal: await bal(S.id) });

  r = await api('GET', `/receipts/refundable/${S.id}`, manager.token);
  check('qaytarish mumkin: 200 000, talab — ADMIN', r.status === 200 && r.data.available === 200000 && r.data.minRole === 'ADMIN', r.data);

  // ── OQ-07: faqat avansdan, ADMIN tasdig'i bilan
  r = await api('POST', '/receipts/refunds', manager.token, { studentId: S.id, amount: 50000, reason: 'Ota-ona so\'radi' });
  check('MANAGER qaytara olmaydi — 403 ROLE', r.status === 403 && r.data.code === 'ROLE', r);
  r = await api('POST', '/receipts/refunds', admin.token, { studentId: S.id, amount: 250000, reason: 'Ota-ona so\'radi' });
  check('avansdan ko\'p — 409 NO_CREDIT', r.status === 409 && r.data.code === 'NO_CREDIT', r);
  r = await api('POST', '/receipts/refunds', admin.token, { studentId: S.id, amount: 150000, reason: 'x' });
  check('sababsiz — 400', r.status === 400, r);

  r = await api('POST', '/receipts/refunds', admin.token, { studentId: S.id, amount: 150000, method: 'Naqd', reason: 'Ota-ona ortiqcha to\'lagan' });
  const refund1 = r.data?.refunds?.[0];
  const rfTx = r.data?.transaction;
  check('qaytarish 150 000: Refund kvitansiyaga bog\'langan, kassada −150 000 "To\'lov qaytarish" kirim', r.status === 201 && refund1?.paymentId === pay.id && rfTx?.amount === -150000 && rfTx?.type === 'income' && rfTx?.category === "To'lov qaytarish", r.data);
  check('balans +50 000 (avans kamaydi)', await bal(S.id) === 50000, await bal(S.id));
  const octAfter = await prisma.paymentAllocation.aggregate({ where: { chargeId: oct.id, reversedAt: null }, _sum: { amount: true } });
  check('QT-27: naqd qaytarish hisob/taqsimotga tegmaydi (oktabr hali to\'liq yopilgan)', octAfter._sum.amount === 600000, octAfter._sum.amount);
  check('QT-26: sof tushum (kirimlar yig\'indisi) 800 000 − 150 000 = 650 000', await incomeSum(S.id) === 650000, await incomeSum(S.id));
  check('qisman qaytarilgan to\'lov holati \'paid\' qoladi', (await prisma.payment.findUnique({ where: { id: pay.id } })).status === 'paid');

  r = await api('POST', `/receipts/${pay.id}/void`, manager.token, { reason: 'Xato kiritilgan' });
  check('qaytarish qilingan kvitansiyani bekor qilish — 409 HAS_REFUNDS', r.status === 409 && r.data.code === 'HAS_REFUNDS', r);

  // ── Qaytarishni bekor qilish (xato yozilgan qaytarish)
  r = await api('POST', `/receipts/refunds/${refund1.id}/void`, manager.token, { reason: 'Xato' });
  check('qaytarishni bekor qilish ham ADMIN — MANAGER 403', r.status === 403, r.status);
  r = await api('POST', `/receipts/refunds/${refund1.id}/void`, admin.token, { reason: 'Pul aslida berilmadi' });
  const rv = await prisma.transaction.findFirst({ where: { sourceType: 'reversal', sourceId: rfTx.id } });
  check('qaytarish bekor: Refund void, kassada +150 000 qarshi yozuv, balans +200 000', r.status === 200 && (await prisma.refund.findUnique({ where: { id: refund1.id } })).status === 'void' && rv?.amount === 150000 && await bal(S.id) === 200000, { st: r.status, rv: rv?.amount, bal: await bal(S.id) });
  r = await api('POST', `/receipts/refunds/${refund1.id}/void`, admin.token, { reason: 'Yana' });
  check('ikkinchi marta bekor qilish — 409', r.status === 409, r.status);
  r = await api('DELETE', `/finance/${rv.id}`, manager.token);
  check('qarshi yozuvni o\'chirib bo\'lmaydi — 400 REVERSAL', r.status === 400 && r.data.code === 'REVERSAL', r);

  // ── To'liq qaytarish → 'refunded'
  const S2 = await prisma.student.create({ data: { name: `${TAG} Refund To'liq` } });
  track('student', S2.id);
  r = await api('POST', '/receipts', manager.token, { studentId: S2.id, amount: 100000, date: today });
  const pay2 = r.data.payment;
  r = await api('POST', `/receipts/${pay2.id}/refund`, admin.token, { amount: 100000, reason: 'Kursga kelmadi' });
  const pay2After = await prisma.payment.findUnique({ where: { id: pay2.id } });
  const pos2 = await api('GET', `/receipts/position/${S2.id}`, manager.token);
  check('to\'liq qaytarish: to\'lov \'refunded\', avans 0, balans 0', r.status === 201 && pay2After.status === 'refunded' && pos2.data.credit === 0 && await bal(S2.id) === 0, { st: r.status, status: pay2After.status, pos: pos2.data });

  // ── Kvitansiyani shu kuni bekor qilish (void)
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 100000, date: today });
  const pay3 = r.data.payment;
  const tx3 = r.data.transaction;
  check('yangi kvitansiya: balans +300 000', await bal(S.id) === 300000, await bal(S.id));
  r = await api('POST', `/receipts/${pay3.id}/void`, manager.token, { reason: 'Summa xato yozildi' });
  const p3 = await prisma.payment.findUnique({ where: { id: pay3.id } });
  const tx3After = await prisma.transaction.findUnique({ where: { id: tx3.id } });
  const rv3 = await prisma.transaction.findFirst({ where: { sourceType: 'reversal', sourceId: tx3.id } });
  check('shu kuni void (MANAGER): to\'lov void, kassa yozuvi belgilandi + qarshi yozuv −100 000, balans +200 000', r.status === 200 && p3.status === 'void' && !!tx3After.voidedAt && rv3?.amount === -100000 && rv3?.date === today && await bal(S.id) === 200000, { st: r.status, data: r.data, bal: await bal(S.id) });
  r = await api('POST', `/receipts/${pay3.id}/void`, manager.token, { reason: 'Yana' });
  check('takroriy void — 409', r.status === 409, r.status);

  // ── Kechagi kvitansiya: MANAGER — 403, ADMIN — sabab bilan
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 70000, date: yesterday });
  const pay4 = r.data.payment;
  r = await api('POST', `/receipts/${pay4.id}/void`, manager.token, { reason: 'Kecha xato' });
  check('kechagi kvitansiya: MANAGER — 403 SAME_DAY_ONLY', r.status === 403 && r.data.code === 'SAME_DAY_ONLY', r);
  r = await api('POST', `/receipts/${pay4.id}/void`, admin.token, { reason: 'Kecha xato — karta qaytdi' });
  check('kechagi kvitansiya: ADMIN void qila oladi, balans +200 000', r.status === 200 && await bal(S.id) === 200000, { st: r.status, bal: await bal(S.id) });

  // ── Reconcile: live'da kesh = formula
  r = await api('GET', '/billing/reconcile', manager.token);
  check('solishtirish: test o\'quvchilarda farq yo\'q', !r.data.rows.some(x => [S.id, S2.id].includes(x.studentId)), r.data.rows.filter(x => [S.id, S2.id].includes(x.studentId)));

  // ── OQ-12: bog'liqliksiz, ochiq oydagi yozuv — o'chiriladi
  r = await api('POST', '/finance/transactions', manager.token, { type: 'expense', amount: 12000, category: 'Kanselyariya', date: today, method: 'Naqd', description: `${TAG} test xarajat` });
  const plain = r.data;
  r = await api('DELETE', `/finance/${plain.id}`, manager.token);
  check('bog\'liqliksiz ochiq oy yozuvi — jismonan o\'chirildi', r.status === 200 && !(await prisma.transaction.findUnique({ where: { id: plain.id } })), r);

  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 5000, category: "To'lov qaytarish", date: today, method: 'Naqd' });
  check('qo\'lda "To\'lov qaytarish" kirimi — 400 (faqat refund komandasi)', r.status === 400, r);

  // ── Yopilgan oy: o'chirilmaydi — qarshi yozuv bugungi sana bilan, yopilgan oy raqami o'zgarmaydi
  const closedMonth = '2025-03';
  const hadPeriod = await prisma.billingPeriod.findUnique({ where: { month: closedMonth } });
  if (!hadPeriod) await prisma.billingPeriod.create({ data: { month: closedMonth, status: 'closed' } });
  const oldTx = await prisma.transaction.create({ data: { type: 'expense', amount: 33000, category: 'Kommunal', date: `${closedMonth}-15`, method: 'Naqd', description: `${TAG} yopilgan oy` } });
  track('transaction', oldTx.id);
  const monthSum = async () => Math.round((await prisma.transaction.aggregate({ where: { date: { startsWith: closedMonth }, type: 'expense' }, _sum: { amount: true } }))._sum.amount ?? 0);
  const before = await monthSum();
  r = await api('POST', '/finance/transactions', manager.token, { type: 'expense', amount: 1000, category: 'Kommunal', date: `${closedMonth}-20`, method: 'Naqd' });
  check('yopilgan oyga yangi yozuv — 409 PERIOD_CLOSED', r.status === 409 && r.data.code === 'PERIOD_CLOSED', r);
  r = await api('DELETE', `/finance/${oldTx.id}`, manager.token);
  check('yopilgan oy yozuvini o\'chirish — 409 VOID_REQUIRED', r.status === 409 && r.data.code === 'VOID_REQUIRED', r);
  r = await api('POST', `/finance/transactions/${oldTx.id}/void`, manager.token, { reason: 'Ikki marta kiritilgan' });
  const rvOld = await prisma.transaction.findFirst({ where: { sourceType: 'reversal', sourceId: oldTx.id } });
  if (rvOld) track('transaction', rvOld.id);
  check('yopilgan oy: qarshi yozuv bugun (−33 000), yopilgan oy yig\'indisi o\'zgarmadi', r.status === 200 && rvOld?.date === today && rvOld?.amount === -33000 && await monthSum() === before, { st: r.status, rv: rvOld, before, after: await monthSum() });
  if (!hadPeriod) await prisma.billingPeriod.delete({ where: { month: closedMonth } }).catch(() => {});

  // ── Maosh: to'lov berilgan — o'chirilmaydi; to'lov bekor → qayta ochish → o'chirish
  const T = await makeUser('TEACHER', ['dashboard', 'journal']);
  const payroll = await prisma.teacherPayroll.create({ data: { teacherId: T.user.id, month: '2026-10', basis: 'accrual', accruedAmount: 500000, status: 'approved', approvedAt: new Date() } });
  r = await api('POST', `/finance/teacher-payroll/${payroll.id}/pay`, manager.token, { amount: 200000, method: 'Naqd' });
  const payoutTx = await prisma.transaction.findFirst({ where: { sourceType: 'teacher_payroll', sourceId: payroll.id } });
  check('maosh to\'lovi 200 000 berildi', r.status === 200 && !!payoutTx, r);
  r = await api('DELETE', `/finance/teacher-payroll/${payroll.id}`, manager.token);
  check('to\'lov berilgan maoshni o\'chirish — 409 PAYOUTS_EXIST', r.status === 409 && r.data.code === 'PAYOUTS_EXIST', r);
  r = await api('POST', `/finance/teacher-payroll/${payroll.id}/reopen`, manager.token, { reason: 'Summa xato' });
  check('to\'lov berilgan maoshni qayta ochish — 409', r.status === 409, r);
  r = await api('DELETE', `/finance/${payoutTx.id}`, manager.token);
  check('maosh to\'lovi yozuvini o\'chirish — 409 VOID_REQUIRED', r.status === 409 && r.data.code === 'VOID_REQUIRED', r);
  r = await api('POST', `/finance/transactions/${payoutTx.id}/void`, manager.token, { reason: 'Noto\'g\'ri ustozga berilgan' });
  const pAfter = await prisma.teacherPayroll.findUnique({ where: { id: payroll.id } });
  const payoutRv = await prisma.transaction.findFirst({ where: { sourceType: 'reversal', sourceId: payoutTx.id } });
  check('to\'lov bekor: paidAmount 0, holat approved, qarshi yozuv −200 000', r.status === 200 && pAfter.paidAmount === 0 && pAfter.status === 'approved' && payoutRv?.amount === -200000, { st: r.status, p: pAfter, rv: payoutRv?.amount });
  r = await api('GET', `/finance/teacher-payroll/${payroll.id}/payouts`, manager.token);
  check('to\'lovlar tarixida bekor qilingan to\'lov ko\'rinmaydi', r.status === 200 && !r.data.some(e => e.kind === 'payout'), r.data);
  r = await api('POST', `/finance/teacher-payroll/${payroll.id}/reopen`, manager.token, { reason: 'Summa xato' });
  check('qayta ochish: approved → draft', r.status === 200 && r.data.status === 'draft', r);
  r = await api('DELETE', `/finance/teacher-payroll/${payroll.id}`, manager.token);
  check('to\'lovsiz qoralama maosh o\'chirildi; kassa izi (asl + qarshi yozuv) qoldi', r.status === 200 && !(await prisma.teacherPayroll.findUnique({ where: { id: payroll.id } })) && !!(await prisma.transaction.findUnique({ where: { id: payoutTx.id } })), r);
  await prisma.transaction.deleteMany({ where: { id: { in: [payoutTx.id, payoutRv?.id].filter(Boolean) } } });

  // ── Invoice holat mashinasi (QT-74)
  r = await api('POST', '/finance/invoices', manager.token, { studentId: S.id, amount: 100000, dueDate: today, items: [{ name: 'Kitob', quantity: 2, price: 30000 }] });
  check('invoice: bandlar yig\'indisi summaga teng emas — 400', r.status === 400, r);
  r = await api('POST', '/finance/invoices', manager.token, { studentId: S.id, amount: 60000, dueDate: today, items: [{ name: 'Kitob', quantity: 2, price: 30000 }] });
  const inv1 = r.data; if (inv1?.id) track('invoice', inv1.id);
  r = await api('POST', '/finance/invoices', manager.token, { studentId: S.id, amount: 50000, dueDate: today });
  const inv2 = r.data; if (inv2?.id) track('invoice', inv2.id);
  const n1 = Number(inv1.number.split('-')[2]), n2 = Number(inv2.number.split('-')[2]);
  check('invoice raqamlari ketma-ket (count() emas)', n2 === n1 + 1, [inv1.number, inv2.number]);
  r = await api('PATCH', `/finance/invoices/${inv1.id}`, manager.token, { status: 'cancelled' });
  check('bekor qilish sababsiz — 400', r.status === 400, r);
  r = await api('PATCH', `/finance/invoices/${inv1.id}`, manager.token, { status: 'cancelled', reason: 'Ota-ona rad etdi' });
  check('bekor qilindi (sabab saqlandi)', r.status === 200 && r.data.status === 'cancelled' && r.data.cancelReason === 'Ota-ona rad etdi', r.data);
  r = await api('PATCH', `/finance/invoices/${inv1.id}`, manager.token, { status: 'paid' });
  check('QT-74: bekor qilingan invoice → to\'landi — 409 CANCELLED, to\'lov yaratilmadi', r.status === 409 && r.data.code === 'CANCELLED' && !(await prisma.transaction.findFirst({ where: { sourceType: 'invoice', sourceId: inv1.id } })), r);
  r = await api('PATCH', `/finance/invoices/${inv1.id}`, manager.token, { status: 'pending' });
  check('bekor qilingan → kutilmoqda — 409 BAD_TRANSITION', r.status === 409 && r.data.code === 'BAD_TRANSITION', r);
  r = await api('PATCH', `/finance/invoices/${inv2.id}`, manager.token, { status: 'paid' });
  r = await api('PATCH', `/finance/invoices/${inv2.id}`, manager.token, { status: 'cancelled', reason: 'Xato' });
  check('to\'langan invoice → bekor — 409 (faqat «Pul qaytarish» orqali)', r.status === 409 && r.data.code === 'BAD_TRANSITION', r);
  const invTx = await prisma.transaction.findFirst({ where: { sourceType: 'invoice', sourceId: inv2.id } });
  r = await api('DELETE', `/finance/${invTx.id}`, manager.token);
  check('invoice to\'lovi kassa yozuvi — o\'chirilmaydi (400 INVOICE)', r.status === 400 && r.data.code === 'INVOICE', r);

  // ── Kategoriya turi (TQ-E): sahifadan tanlanadi; "kurs puli" nomi — kurs to'lovi
  r = await api('POST', '/transactionCategories', admin.token, { name: `${TAG} Kitob`, type: 'income', kind: 'REFUND' });
  check('kirim kategoriyasiga REFUND turi — 400', r.status === 400, r);
  r = await api('POST', '/transactionCategories', admin.token, { name: `${TAG} O'quvchi kurs puli to'ladi`, type: 'income', isActive: true });
  const autoCat = r.data; if (autoCat?.id) track('transactionCategory', autoCat.id);
  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 40000, category: autoCat.name, date: today, method: 'Naqd', studentId: S.id });
  check('"kurs puli to\'ladi" (tur tanlanmagan) + o\'quvchi — kurs to\'lovi sifatida kvitansiya', r.status === 200 && r.data?.sourceType === 'receipt', r);
  r = await api('POST', '/transactionCategories', admin.token, { name: `${TAG} Forma`, type: 'income', kind: 'OTHER_INCOME', isActive: true });
  const otherCat = r.data; if (otherCat?.id) track('transactionCategory', otherCat.id);
  r = await api('PUT', `/transactionCategories/${otherCat.id}`, admin.token, { name: otherCat.name, type: 'income', isActive: true, kind: 'TUITION' });
  check('kategoriya turini tahrirlash — TUITION saqlandi', r.status === 200 && (await prisma.transactionCategory.findUnique({ where: { id: otherCat.id } })).kind === 'TUITION', r);

  // ── Legacy rejim: qaytarish musbat balansdan
  await setMode('legacy');
  const L = await prisma.student.create({ data: { name: `${TAG} Legacy Refund`, balance: 70000 } });
  track('student', L.id);
  r = await api('POST', '/receipts/refunds', admin.token, { studentId: L.id, amount: 50000, reason: 'Kursdan chiqdi' });
  check('legacy: qaytarish balansdan (70 000 → 20 000)', r.status === 201 && await bal(L.id) === 20000, { st: r.status, bal: await bal(L.id) });
  r = await api('POST', '/receipts/refunds', admin.token, { studentId: L.id, amount: 30000, reason: 'Yana' });
  check('legacy: balansdan ko\'p — 409', r.status === 409 && r.data.code === 'NO_CREDIT', r);

  // ── Sozlama: refund_approval_min_role = MANAGER
  await prisma.setting.upsert({ where: { key: 'refund_approval_min_role' }, create: { key: 'refund_approval_min_role', value: 'MANAGER' }, update: { value: 'MANAGER' } });
  r = await api('POST', '/receipts/refunds', manager.token, { studentId: L.id, amount: 10000, reason: 'Sozlama tekshiruvi' });
  check('refund_approval_min_role=MANAGER — menejer qaytara oladi', r.status === 201, r);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  if (refundRoleRow) await prisma.setting.upsert({ where: { key: 'refund_approval_min_role' }, create: { key: 'refund_approval_min_role', value: refundRoleRow.value }, update: { value: refundRoleRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'refund_approval_min_role' } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  const users = (await prisma.user.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(u => u.id);
  await prisma.refund.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { description: { contains: TAG } } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { staffId: { in: users } } }).catch(() => {});
  await prisma.teacherPayroll.deleteMany({ where: { teacherId: { in: users } } }).catch(() => {});
  await prisma.invoice.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
