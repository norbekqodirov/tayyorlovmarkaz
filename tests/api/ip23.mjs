// IP-23 (QT-16): kategoriya nomini o'zgartirish tarix, formalar va hisobotlarni buzmaydi; tizim
// kategoriyalari o'chirilmaydi va turi o'zgarmaydi; ishlatilgan kategoriya arxivlanadi; eski
// (ID'siz) yozuvlar nom o'zgarganda bog'lanadi; erkin matnli nomlar "noaniqlar"da.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const month = today.slice(0, 7);
let tuitionId = null, tuitionName = null;
const catIds = [], budgetIds = [], txIds = [], expenseIds = [];

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'finance', 'transaction_categories']);

  let r = await api('GET', '/transactionCategories', admin.token);
  const tuition = (Array.isArray(r.data) ? r.data : r.data?.data || []).find(c => c.systemKey === 'tuition');
  tuitionId = tuition?.id; tuitionName = tuition?.name;
  check('tizim kategoriyalari mavjud (kurs to\'lovi — systemKey)', !!tuitionId && tuition.kind === 'TUITION', tuition);

  const S = await prisma.student.create({ data: { name: `${TAG} Kategoriya O'quvchi` } }); track('student', S.id);
  const m0 = (await api('GET', `/analytics/metrics?month=${month}`, admin.token)).data.values.tuitionCash;
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 10000, date: today });
  let t1 = await prisma.transaction.findFirst({ where: { sourceType: 'receipt', sourceId: r.data?.payment?.id } });
  check('kvitansiya — tizim kategoriyasi ID bilan', r.status === 201 && t1?.categoryId === tuitionId && t1.category === tuitionName, t1);

  // ── Nomini o'zgartirish
  const newName = `${TAG} O'quvchi to'lovi`;
  r = await api('PUT', `/transactionCategories/${tuitionId}`, manager.token, { name: newName });
  t1 = await prisma.transaction.findUnique({ where: { id: t1.id } });
  check('nom o\'zgardi: eski yozuvda ham yangi nom (kesh), ID o\'sha', r.status === 200 && r.data.renamed?.transactions >= 1 && t1.category === newName && t1.categoryId === tuitionId, { st: r.status, renamed: r.data?.renamed, t1: t1?.category });
  r = await api('POST', '/finance/transactions', manager.token, { type: 'income', amount: 20000, category: newName, date: today, studentId: S.id });
  check('forma: yangi nomli kurs to\'lovi — kvitansiya bilan (tur bo\'yicha aniqlandi)', r.status === 200 && /^Q-/.test(r.data.receiptNo || '') && r.data.categoryId === tuitionId, r.data);
  r = await api('POST', '/receipts', manager.token, { studentId: S.id, amount: 30000, date: today });
  const t3 = await prisma.transaction.findFirst({ where: { sourceType: 'receipt', sourceId: r.data?.payment?.id } });
  check('avtomatik kurs to\'lovi yangi nom bilan yoziladi', t3?.category === newName && t3.categoryId === tuitionId, t3?.category);
  const m1 = (await api('GET', `/analytics/metrics?month=${month}`, admin.token)).data.values.tuitionCash;
  check('hisobot (kurs to\'lovi tushumi) nom o\'zgargandan keyin ham to\'g\'ri: +60 000', m1 - m0 === 60000, { m0, m1 });

  // ── Tizim kategoriyasi himoyasi
  r = await api('PUT', `/transactionCategories/${tuitionId}`, manager.token, { kind: 'OTHER_INCOME' });
  check('tizim kategoriyasi turini o\'zgartirib bo\'lmaydi (409)', r.status === 409 && r.data.code === 'SYSTEM', r.data);
  r = await api('PUT', `/transactionCategories/${tuitionId}`, manager.token, { isActive: false });
  check('tizim kategoriyasini nofaol qilib bo\'lmaydi (409)', r.status === 409, r.data);
  r = await api('DELETE', `/transactionCategories/${tuitionId}`, admin.token);
  check('tizim kategoriyasini o\'chirib bo\'lmaydi (409)', r.status === 409 && r.data.code === 'SYSTEM', r.data);

  // ── Oddiy kategoriya: xarajat, byudjet, nom o'zgarishi, arxiv
  r = await api('POST', '/transactionCategories', manager.token, { name: `${TAG} Ijara`, type: 'expense', kind: 'OPERATING_EXPENSE', isActive: true });
  const ijara = r.data; catIds.push(ijara?.id);
  r = await api('POST', '/finance/expenses', manager.token, { category: `${TAG} Ijara`, amount: 5000, date: today, description: `${TAG} xarajat` });
  expenseIds.push(r.data?.id);
  const expTx = await prisma.transaction.findFirst({ where: { sourceType: 'expense', sourceId: r.data?.id } });
  check('xarajat kategoriya ID bilan', r.status === 201 && expTx?.categoryId === ijara.id, expTx);
  const b = await prisma.budget.create({ data: { month: Number(month.slice(5)), year: Number(month.slice(0, 4)), category: `${TAG} Ijara`, planned: 100000 } }); budgetIds.push(b.id);
  r = await api('PUT', `/transactionCategories/${ijara.id}`, manager.token, { name: `${TAG} Ijara (ofis)` });
  const [e2, b2, tx2] = await Promise.all([prisma.expense.findUnique({ where: { id: expenseIds[0] } }), prisma.budget.findUnique({ where: { id: b.id } }), prisma.transaction.findUnique({ where: { id: expTx.id } })]);
  check('nom o\'zgardi: xarajat, byudjet va kassa yozuvida ham', r.status === 200 && e2.category === `${TAG} Ijara (ofis)` && b2.category === `${TAG} Ijara (ofis)` && tx2.category === `${TAG} Ijara (ofis)`, { e: e2?.category, b: b2?.category, t: tx2?.category });
  r = await api('PUT', `/transactionCategories/${ijara.id}`, manager.token, { name: newName, type: 'expense' });
  r = await api('POST', '/transactionCategories', manager.token, { name: `${TAG} Band`, type: 'expense', isActive: true }); catIds.push(r.data?.id);
  r = await api('PUT', `/transactionCategories/${ijara.id}`, manager.token, { name: `${TAG} Band` });
  check('band nomga o\'zgartirib bo\'lmaydi (409)', r.status === 409 && r.data.code === 'NAME_TAKEN', r.data);
  r = await api('DELETE', `/transactionCategories/${ijara.id}`, manager.token);
  const ijaraAfter = await prisma.transactionCategory.findUnique({ where: { id: ijara.id } });
  check('ishlatilgan kategoriya o\'chirilmaydi — arxivlanadi', r.status === 200 && r.data.archived === true && ijaraAfter?.isActive === false, r.data);
  r = await api('DELETE', `/transactionCategories/${catIds[1]}`, manager.token);
  check('ishlatilmagan kategoriya o\'chiriladi', r.status === 200 && r.data.deleted === true && !(await prisma.transactionCategory.findUnique({ where: { id: catIds[1] } })), r.data);

  // ── Eski (ID'siz) yozuvlar va erkin matn
  const legacy = await prisma.transaction.create({ data: { type: 'expense', amount: 700, category: `${TAG} Eski`, date: today, method: 'Naqd' } }); txIds.push(legacy.id);
  const free = await prisma.transaction.create({ data: { type: 'income', amount: 300, category: `${TAG} Erkin`, date: today, method: 'Naqd' } }); txIds.push(free.id);
  r = await api('GET', '/transactionCategories/orphans', manager.token);
  check('noaniqlar ro\'yxatida erkin matnli nomlar', r.status === 200 && r.data.some(o => o.name === `${TAG} Erkin` && o.type === 'income') && r.data.some(o => o.name === `${TAG} Eski`), r.data?.length);
  r = await api('POST', '/transactionCategories', manager.token, { name: `${TAG} Eski`, type: 'expense', isActive: true }); catIds.push(r.data?.id);
  r = await api('PUT', `/transactionCategories/${r.data?.id}`, manager.token, { name: `${TAG} Eski (yangi)` });
  const legacyAfter = await prisma.transaction.findUnique({ where: { id: legacy.id } });
  check('eski ID\'siz yozuv nom o\'zgarganda kategoriyaga bog\'landi va nomi yangilandi', legacyAfter.categoryId === catIds[2] && legacyAfter.category === `${TAG} Eski (yangi)`, legacyAfter);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  // Asl nomni qaytarish (kesh ham qaytadi)
  if (tuitionId && tuitionName) {
    const cur = await prisma.transactionCategory.findUnique({ where: { id: tuitionId } });
    if (cur && cur.name !== tuitionName) {
      const admin2 = await makeUser('ADMIN');
      const r = await api('PUT', `/transactionCategories/${tuitionId}`, admin2.token, { name: tuitionName });
      if (r.status !== 200) console.log('TIKLASH XATOSI', r.status, r.data);
    }
  }
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.paymentAllocation.deleteMany({ where: { payment: { studentId: { in: studs } } } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { OR: [{ studentId: { in: studs } }, { id: { in: txIds } }, { category: { startsWith: TAG } }] } }).catch(() => {});
  await prisma.payment.deleteMany({ where: { studentId: { in: studs } } }).catch(() => {});
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds.filter(Boolean) } } }).catch(() => {});
  await prisma.budget.deleteMany({ where: { OR: [{ id: { in: budgetIds } }, { category: { startsWith: TAG } }] } }).catch(() => {});
  await prisma.transactionCategory.deleteMany({ where: { OR: [{ id: { in: catIds.filter(Boolean) } }, { name: { startsWith: TAG } }], systemKey: null } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
