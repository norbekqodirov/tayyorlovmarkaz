// IP-22 (QT-80): kassa/bank hisoblari — qoldiq, ichki o'tkazma (daromad emas), komissiya,
// kunni yopish (boshlanish + kirim − chiqim = sanalgan, farq sababi bilan), yopilgan kun qulfi,
// qayta ochish (faqat ADMIN), eski yozuvlar usul bo'yicha hisobga tushishi, oylik solishtirish.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const month = today.slice(0, 7);
const accIds = [];
const txIds = [];
const expenseIds = [];

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'finance']);

  let r = await api('GET', '/cash/accounts', manager.token);
  check('standart hisoblar mavjud (naqd, karta, bank, Payme, Click)', r.status === 200 && ['cash', 'card', 'bank', 'online'].every(t => r.data.some(a => a.type === t)), r.data);

  r = await api('POST', '/cash/accounts', manager.token, { name: `${TAG} kassa`, type: 'cash', method: 'Naqd' });
  check('MANAGER hisob yarata olmaydi (403)', r.status === 403, r.status);
  r = await api('POST', '/cash/accounts', admin.token, { name: `${TAG} kassa`, type: 'cash', method: 'Naqd', openingBalance: 100000, openingDate: today, sortOrder: 99 });
  const A = r.data; accIds.push(A?.id);
  check('ADMIN naqd kassa yaratdi (boshlang\'ich 100 000)', r.status === 201 && A.openingBalance === 100000, r.data);
  r = await api('POST', '/cash/accounts', admin.token, { name: `${TAG} bank`, type: 'bank', method: 'Bank', sortOrder: 99 });
  const B = r.data; accIds.push(B?.id);
  check('ADMIN bank hisobi yaratdi', r.status === 201, r.data);

  // ── Harakatlar A hisobiga
  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 50000, category: `${TAG} boshqa kirim`, date: today, accountId: A.id });
  const inc = r.data; txIds.push(inc?.id);
  check('boshqa kirim tanlangan hisobga yozildi (usul hisob yorlig\'i)', r.status === 200 && inc.accountId === A.id && inc.method === 'Naqd', r.data);
  r = await api('POST', '/finance/expenses', manager.token, { category: `${TAG} kanselyariya`, amount: 20000, date: today, description: `${TAG} xarajat`, accountId: A.id });
  expenseIds.push(r.data?.id);
  const expTx = await prisma.transaction.findFirst({ where: { sourceType: 'expense', sourceId: r.data?.id } });
  txIds.push(expTx?.id);
  check('xarajat tanlangan hisobdan (endi har doim "Naqd" emas)', r.status === 201 && expTx?.accountId === A.id, expTx);
  const S = await prisma.student.create({ data: { name: `${TAG} Kassa O'quvchi` } });
  track('student', S.id);
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 30000, date: today, accountId: A.id });
  const rcTx = await prisma.transaction.findFirst({ where: { sourceType: 'receipt', sourceId: r.data?.payment?.id } });
  txIds.push(rcTx?.id);
  check('kurs to\'lovi (kvitansiya) hisobga yozildi — Payment va Transaction', r.status === 201 && r.data.payment?.accountId === A.id && rcTx?.accountId === A.id, r.data?.payment);

  r = await api('GET', `/cash/day?accountId=${A.id}&date=${today}`, manager.token);
  check('kun ko\'rinishi: boshlang\'ich 100 000 + kirim 80 000 − chiqim 20 000 = 160 000', r.status === 200 && r.data.openingAdded === 100000 && r.data.income === 80000 && r.data.expense === 20000 && r.data.expected === 160000 && r.data.entries.length === 3, r.data);

  // ── Ichki o'tkazma: daromad emas; komissiya — manba hisobidan xarajat
  r = await api('POST', '/cash/transfers', manager.token, { fromAccountId: A.id, toAccountId: B.id, amount: 60000, date: today, note: `${TAG} bankka topshirildi` });
  const T1 = r.data;
  check('o\'tkazma kassadan bankka 60 000 — kassa yozuvi (kirim/chiqim) yaratilmaydi', r.status === 201 && (await prisma.transaction.count({ where: { sourceId: T1.id } })) === 0, r.data);
  r = await api('POST', '/cash/transfers', manager.token, { fromAccountId: B.id, toAccountId: A.id, amount: 10000, fee: 1000, date: today });
  const T2 = r.data;
  const feeTx = await prisma.transaction.findUnique({ where: { id: T2?.feeTransactionId || '' } });
  check('bankdan naqdga 10 000, komissiya 1 000 — manba hisobidan xarajat', r.status === 201 && feeTx?.type === 'expense' && feeTx.amount === 1000 && feeTx.accountId === B.id && feeTx.category === 'Bank komissiyasi', feeTx);
  r = await api('POST', '/cash/transfers', manager.token, { fromAccountId: A.id, toAccountId: A.id, amount: 5000 });
  check('bir xil hisobga o\'tkazma yo\'q (400)', r.status === 400, r.data);

  r = await api('GET', '/cash/accounts', manager.token);
  const bal = id => r.data.find(a => a.id === id)?.balance;
  check('qoldiq: kassa 160 000 − 60 000 + 9 000 = 109 000; bank 60 000 − 10 000 = 50 000', bal(A.id) === 109000 && bal(B.id) === 50000, { A: bal(A.id), B: bal(B.id) });

  // ── Kunni yopish
  r = await api('POST', '/cash/close', manager.token, { accountId: A.id, date: today, counted: 108000 });
  check('farq bo\'lsa sabab majburiy (400 NOTE_REQUIRED)', r.status === 400 && r.data.code === 'NOTE_REQUIRED', r.data);
  r = await api('POST', '/cash/close', manager.token, { accountId: A.id, date: today, counted: 108000, note: 'Qaytim xatosi' });
  const S1 = r.data;
  const adj = await prisma.transaction.findUnique({ where: { id: S1?.adjustmentTransactionId || '' } });
  check('kun yopildi: kutilgan 109 000, sanalgan 108 000, farq −1 000 → "Kassa farqi" chiqimi', r.status === 200 && S1.expected === 109000 && S1.difference === -1000 && adj?.type === 'expense' && adj.amount === 1000 && adj.accountId === A.id, { S1, adj });
  r = await api('POST', '/cash/close', manager.token, { accountId: A.id, date: today, counted: 108000 });
  check('ikkinchi marta yopilmaydi (409)', r.status === 409 && r.data.code === 'ALREADY_CLOSED', r.data);
  r = await api('POST', '/cash/close', manager.token, { accountId: B.id, date: today, counted: 50000 });
  check('bank hisobi kunlik yopilmaydi (400)', r.status === 400 && r.data.code === 'NO_DAY_CLOSE', r.data);

  // ── Qulf: yopilgan kunga yozuv, bekor qilish, o'chirish, o'tkazma yo'q
  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 1000, category: `${TAG} boshqa kirim`, date: today, accountId: A.id });
  check('yopilgan kunga yangi yozuv yo\'q (409 DAY_CLOSED)', r.status === 409 && r.data.code === 'DAY_CLOSED', r.data);
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 1000, date: today, accountId: A.id });
  check('yopilgan kunga kurs to\'lovi yo\'q (409)', r.status === 409 && r.data.code === 'DAY_CLOSED', r.data);
  r = await api('POST', `/finance/transactions/${inc.id}/void`, manager.token, { reason: 'test bekor' });
  check('bekor qilish qarshi yozuvi bugungi yopilgan kunga tushmaydi (409)', r.status === 409 && r.data.code === 'DAY_CLOSED', r.data);
  r = await api('DELETE', `/finance/expenses/${expenseIds[0]}`, manager.token);
  check('yopilgan kundagi xarajat o\'chirilmaydi (409 VOID_REQUIRED)', r.status === 409 && r.data.code === 'VOID_REQUIRED', r.data);
  r = await api('POST', '/cash/transfers', manager.token, { fromAccountId: A.id, toAccountId: B.id, amount: 1000, date: today });
  check('yopilgan kunga o\'tkazma yo\'q (409)', r.status === 409 && r.data.code === 'DAY_CLOSED', r.data);
  r = await api('DELETE', `/finance/${adj?.id}`, admin.token);
  check('"Kassa farqi" yozuvi Moliya\'dan o\'chirilmaydi', r.status >= 400, r.data);

  // ── Qayta ochish
  r = await api('POST', `/cash/sessions/${S1.id}/reopen`, manager.token, { reason: 'qayta sanash' });
  check('MANAGER qayta ocha olmaydi (403)', r.status === 403, r.status);
  r = await api('POST', `/cash/sessions/${S1.id}/reopen`, admin.token, {});
  check('sababsiz qayta ochilmaydi (400)', r.status === 400, r.data);
  r = await api('POST', `/cash/sessions/${S1.id}/reopen`, admin.token, { reason: 'Qayta sanash kerak' });
  const adjGone = !(await prisma.transaction.findUnique({ where: { id: S1.adjustmentTransactionId } }));
  r = await api('GET', '/cash/accounts', manager.token);
  check('ADMIN qayta ochdi: farq yozuvi olib tashlandi, qoldiq yana 109 000', adjGone && bal(A.id) === 109000 && !r.data.find(a => a.id === A.id)?.todayClosed, { bal: bal(A.id) });

  // ── O'tkazmani bekor qilish: komissiya o'sha sana bilan qarshi yozuv
  r = await api('POST', `/cash/transfers/${T2.id}/void`, manager.token, { reason: 'Xato kiritilgan' });
  const feeAfter = await prisma.transaction.findUnique({ where: { id: T2.feeTransactionId } });
  const feeRev = await prisma.transaction.findFirst({ where: { sourceType: 'reversal', sourceId: T2.feeTransactionId } });
  r = await api('GET', '/cash/accounts', manager.token);
  check('o\'tkazma bekor: kassa 100 000, bank 60 000, komissiya qarshi yozuv bilan', bal(A.id) === 100000 && bal(B.id) === 60000 && !!feeAfter?.voidedAt && feeRev?.amount === -1000 && feeRev.accountId === B.id && feeRev.date === today, { A: bal(A.id), B: bal(B.id), feeRev });
  if (feeRev) txIds.push(feeRev.id);
  txIds.push(T2.feeTransactionId);

  // ── Eski yozuvlar (accountId yo'q) usul bo'yicha; noma'lum usul — alohida qator
  r = await api('GET', `/cash/report?month=${month}`, admin.token);
  const cardAcc = r.data.accounts.find(a => a.type === 'card' && a.isActive);
  const cardBefore = cardAcc?.income ?? 0;
  const legacy = await prisma.transaction.create({ data: { type: 'income', amount: 7000, category: `${TAG} eski`, date: today, method: 'Terminal' } });
  const odd = await prisma.transaction.create({ data: { type: 'income', amount: 5000, category: `${TAG} eski`, date: today, method: `${TAG}usul` } });
  txIds.push(legacy.id, odd.id);
  r = await api('GET', `/cash/report?month=${month}`, admin.token);
  const cardAfter = r.data.accounts.find(a => a.id === cardAcc?.id)?.income ?? 0;
  check('eski yozuv "Terminal" usuli → karta hisobi (+7 000)', cardAfter - cardBefore === 7000, { cardBefore, cardAfter });
  check('noma\'lum usul "hisobi aniqlanmagan" qatorida', r.data.unassigned.some(u => u.method === `${TAG}usul` && u.income === 5000), r.data.unassigned);
  const repA = r.data.accounts.find(a => a.id === A.id);
  check('oylik solishtirish (kassa): boshlang\'ich 100 000 + 80 000 − 20 000 − 60 000 = 100 000', repA?.openingAdded === 100000 && repA.income === 80000 && repA.expense === 20000 && repA.transfersOut === 60000 && repA.transfersIn === 0 && repA.closing === 100000, repA);

  r = await api('GET', `/cash/accounts/${A.id}/book?month=${month}`, manager.token);
  const day = r.data.days?.find(d => d.date === today);
  check('kassa daftari: bugun yakun 100 000', r.status === 200 && day?.closing === 100000 && r.data.closing === 100000, day);

  // ── Farqsiz yopish; yopilgan kun bor hisobda boshlang'ich qoldiq o'zgarmaydi
  r = await api('POST', '/cash/close', manager.token, { accountId: A.id, date: today, counted: 100000 });
  check('farqsiz yopish (sabab shart emas, tuzatma yo\'q)', r.status === 200 && r.data.difference === 0 && !r.data.adjustmentTransactionId, r.data);
  r = await api('PUT', `/cash/accounts/${A.id}`, admin.token, { openingBalance: 500000 });
  check('yopilgan kunlari bor hisobda boshlang\'ich qoldiq o\'zgarmaydi (409)', r.status === 409 && r.data.code === 'HAS_SESSIONS', r.data);
  r = await api('PUT', `/cash/accounts/${A.id}`, admin.token, { name: `${TAG} kassa 2` });
  check('nomini o\'zgartirish mumkin', r.status === 200 && r.data.name === `${TAG} kassa 2`, r.data);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  const ids = accIds.filter(Boolean);
  await prisma.cashSession.deleteMany({ where: { accountId: { in: ids } } }).catch(() => {});
  await prisma.cashTransfer.deleteMany({ where: { OR: [{ fromAccountId: { in: ids } }, { toAccountId: { in: ids } }] } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { OR: [{ id: { in: txIds.filter(Boolean) } }, { accountId: { in: ids } }, { category: { startsWith: TAG } }] } }).catch(() => {});
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds.filter(Boolean) } } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.transaction.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.setting.deleteMany({ where: { key: { in: ids.map(id => `cash_close_lock:${id}`) } } }).catch(() => {});
  await prisma.cashAccount.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
