// IP-24 (QT-81, QT-82): metrikalar lug'ati — referens oy (2019-03, boshqa ma'lumot yo'q) uchun
// API = qo'lda hisob; joriy oy uchun Dashboard/BI = ijroiya hisobot = umumiy hisobot = KPI (bir xil raqam).
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const M = '2019-03';
const txIds = [], chargeIds = [], payrollIds = [], salaryIds = [], attIds = [], leadIds = [], periodIds = [];
let goalId = null, staffId = null;

try {
  const admin = await makeUser('ADMIN');

  // ── Kassa yozuvlari (kategoriya turi bo'yicha)
  const tx = async (type, amount, category, date, extra = {}) => { const t = await prisma.transaction.create({ data: { type, amount, category, date, method: 'Naqd', ...extra } }); txIds.push(t.id); return t; };
  await tx('income', 600000, "Kurs to'lovi", `${M}-05`);
  await tx('income', 400000, "Kurs to'lovi", `${M}-12`);
  await tx('income', -100000, "To'lov qaytarish", `${M}-15`);           // qaytarish (manfiy kirim)
  await tx('income', 70000, `${TAG} kitob`, `${M}-07`);                // boshqa kirim
  const b = await tx('income', 50000, `${TAG} kitob`, `${M}-08`);      // bekor qilingan kirim
  await prisma.transaction.update({ where: { id: b.id }, data: { voidedAt: new Date() } });
  await tx('income', -50000, `${TAG} kitob`, `${M}-09`, { sourceType: 'reversal', sourceId: b.id });
  await tx('expense', 200000, `${TAG} ijara`, `${M}-10`);              // operatsion
  await tx('expense', 300000, 'Oylik', `${M}-25`);                     // oylik
  await tx('expense', 50000, 'Avans', `${M}-20`);                      // avans

  // ── Hisoblar (hisoblangan tushum): tuition 500 000 + tuzatma −100 000; qoralama va boshlang'ich qoldiq kirmaydi
  const course = await prisma.course.create({ data: { name: `${TAG} kurs metrika`, price: 500000 } }); track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Metrika guruhi`, courseId: course.id, maxSize: 10, status: 'active' } }); track('group', G.id);
  const mkS = async (n) => { const s = await prisma.student.create({ data: { name: `${TAG} Metrika ${n}` } }); track('student', s.id); return s; };
  const [A, B, C] = [await mkS('A'), await mkS('B'), await mkS('C')];
  const ch = async (data) => { const c = await prisma.charge.create({ data: { chargeKey: `${TAG}:${Date.now()}:${Math.random()}`, studentId: A.id, groupId: G.id, month: M, gross: data.net, teacherBase: 0, ...data } }); chargeIds.push(c.id); return c; };
  const base = await ch({ type: 'tuition', status: 'posted', net: 500000, dueDate: `${M}-10` });
  await ch({ type: 'adjustment', status: 'posted', net: -100000, reversesChargeId: base.id });
  await ch({ type: 'tuition', status: 'draft', net: 999 });
  await ch({ type: 'opening_balance', status: 'posted', net: 77777 });

  // ── Oylik (hisoblangan): tasdiqlangan ustoz 250 000 (+ qoralama 99 999 kirmaydi) + xodim 150 000
  const teacher = await makeUser('TEACHER');
  for (const [status, amt] of [['approved', 250000], ['draft', 99999]]) {
    const p = await prisma.teacherPayroll.create({ data: { teacherId: teacher.user.id, month: M, basis: status === 'draft' ? 'ledger' : 'accrual', accruedAmount: amt, status } });
    payrollIds.push(p.id);
  }
  const staff = await prisma.staffMember.create({ data: { name: `${TAG} Xodim`, role: 'Kassir' } }); staffId = staff.id;
  const sal = await prisma.salary.create({ data: { staffId: staff.id, month: M, baseSalary: 150000, total: 150000 } }); salaryIds.push(sal.id);

  // ── A'zoliklar: A (fevraldan), B (martda boshlagan — yangi), C (yanvardan, 20-martda ketdi)
  const per = async (studentId, startDate, extra = {}) => { const p = await prisma.enrollmentPeriod.create({ data: { studentId, groupId: G.id, startDate, ...extra } }); periodIds.push(p.id); };
  await per(A.id, '2019-02-10'); await per(B.id, `${M}-05`); await per(C.id, '2019-01-01', { endDate: `${M}-20`, endReason: 'left', status: 'ended' });

  // ── Davomat: keldi 6, kechikdi 2, kelmadi 2, sababli 3 → (6+2)/(6+2+2) = 80%
  let d = 1;
  for (const [st, n] of [['present', 6], ['late', 2], ['absent', 2], ['excused', 3]]) for (let i = 0; i < n; i++) {
    const r = await prisma.attendanceRecord.create({ data: { studentId: A.id, groupId: G.id, date: `${M}-${String(d++).padStart(2, '0')}`, status: st } }); attIds.push(r.id);
  }
  // ── Lidlar: martda 4 ta, 1 tasi o'quvchiga aylangan → 25%
  for (let i = 0; i < 4; i++) {
    const l = await prisma.lead.create({ data: { name: `${TAG} Lid ${i}`, phone: `+99890${String(Date.now()).slice(-7)}${i}`, stage: i === 0 ? 'won' : 'new', status: 'new', createdAt: new Date(`${M}-1${i}T10:00:00+05:00`), ...(i === 0 ? { convertedAt: new Date(`${M}-20T10:00:00+05:00`) } : {}) } });
    leadIds.push(l.id);
  }

  // ── API = qo'lda hisob
  const r = await api('GET', `/analytics/metrics?month=${M}`, admin.token);
  const v = r.data?.values || {};
  check('kurs to\'lovi (kassa) = 600 000 + 400 000 − 100 000 = 900 000', r.status === 200 && v.tuitionCash === 900000, v.tuitionCash);
  check('boshqa kirim = 70 000 (bekor qilingan 50 000 va qarshi yozuvi 0)', v.otherIncome === 70000, v.otherIncome);
  check('operatsion 200 000, oylik 300 000, avans 50 000 (alohida)', v.operatingExpense === 200000 && v.payrollCash === 300000 && v.advancesCash === 50000, v);
  check('sof pul oqimi = 900 000 + 70 000 − 200 000 − 300 000 − 50 000 = 420 000', v.netCashFlow === 420000, v.netCashFlow);
  check('hisoblangan tushum = 500 000 − 100 000 = 400 000 (qoralama, boshlang\'ich qoldiq kirmaydi)', v.accrualRevenue === 400000, v.accrualRevenue);
  check('hisoblangan oylik = 250 000 (tasdiqlangan) + 150 000 (xodim) = 400 000', v.payrollAccrual === 400000, v.payrollAccrual);
  check('davomat = 80% (sababli alohida)', v.attendanceRate === 80 && r.data.details.attendance.excused === 3, { rate: v.attendanceRate, d: r.data.details.attendance });
  check('lid konversiyasi = 1/4 = 25%', v.leadConversion === 25 && r.data.details.leads.created === 4, { conv: v.leadConversion, l: r.data.details.leads });
  check('faol o\'quvchilar (31.03) = 2, yangi = 1, churn = 1/2 = 50%', v.activeStudents === 2 && v.newStudents === 1 && v.churnRate === 50, { a: v.activeStudents, n: v.newStudents, c: v.churnRate });
  const cap = (await prisma.group.findMany({ where: { deletedAt: null, status: { in: ['active', 'Faol'] } }, select: { maxSize: true } })).reduce((s, g) => s + (g.maxSize || 0), 0);
  check('guruhlar to\'liqligi = faol a\'zolik / faol guruhlar sig\'imi', v.groupFill === Math.round(2 / cap * 1000) / 10, { v: v.groupFill, cap });
  const bk = r.data.details.overdueBuckets;
  check('muddati o\'tgan qarz guruhlari yig\'indisi = muddati o\'tgan qarz ≤ jami qarz', bk.d1_7 + bk.d8_30 + bk.d31_60 + bk.d60 === v.overdueDebt && v.overdueDebt <= v.receivables && v.overdueDebt >= 400000, { bk, o: v.overdueDebt });
  check('har metrika ta\'rifi bilan (formula, vaqt asosi, manba)', r.data.definitions?.length >= 17 && r.data.definitions.every(x => x.formula && x.basis && x.source) && !!r.data.generatedAt);

  const s = await api('GET', `/analytics/metrics/series?year=2019`, admin.token);
  const mar = s.data?.find?.(x => x.month === M);
  check('yillik qator: mart — hisoblangan 400 000, kirim 970 000, chiqim 550 000', s.status === 200 && mar?.accrualRevenue === 400000 && mar.income === 970000 && mar.expense === 550000, mar);

  const sum = await api('GET', `/reports/summary?from=${M}-01&to=${M}-31`, admin.token);
  check('umumiy hisobot (davr) kirim/chiqim = metrikalar', sum.status === 200 && sum.data.finance.income === 970000 && sum.data.finance.expense === 550000 && sum.data.attendance.rate === 80, sum.data?.finance);

  // ── Joriy oy: har ekranda bir xil raqam
  const cur = await api('GET', '/analytics/metrics', admin.token);
  const cv = cur.data.values;
  const dash = await api('GET', '/analytics/dashboard', admin.token);
  const exe = await api('GET', '/reports/executive', admin.token);
  const inc = cv.tuitionCash + cv.otherIncome;
  check('Dashboard/BI daromadi = ijroiya hisobot = metrikalar (kassa kirimi)', dash.data.revenue.this_month === inc && exe.data.revenue.thisMonth === inc, { m: inc, dash: dash.data.revenue.this_month, exe: exe.data.revenue.thisMonth });
  check('faol o\'quvchilar: BI = ijroiya = metrikalar', dash.data.students.active === cv.activeStudents && exe.data.students.active === cv.activeStudents, { m: cv.activeStudents, d: dash.data.students.active, e: exe.data.students.active });
  check('hisoblangan tushum: BI = ijroiya = metrikalar', dash.data.revenue.accrual_this_month === cv.accrualRevenue && exe.data.revenue.accrual === cv.accrualRevenue);

  // KPI avtomatik: daromad maqsadi = kassa kirimi
  const now = cur.data.month;
  const goal = await prisma.goal.create({ data: { title: `${TAG} daromad`, type: 'revenue', target: 1, current: 0, period: 'monthly', year: Number(now.slice(0, 4)), month: Number(now.slice(5, 7)), status: 'active' } });
  goalId = goal.id;
  const g = await api('POST', '/goals/auto-sync', admin.token, {});
  const gAfter = await prisma.goal.findUnique({ where: { id: goal.id } });
  check('KPI (daromad) avtomatik = metrikalar', g.status === 200 && gAfter.current === inc, { g: gAfter?.current, inc });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (goalId) await prisma.goal.deleteMany({ where: { id: goalId } }).catch(() => {});
  await prisma.transaction.deleteMany({ where: { id: { in: txIds } } }).catch(() => {});
  await prisma.charge.deleteMany({ where: { id: { in: chargeIds } } }).catch(() => {});
  await prisma.teacherPayroll.deleteMany({ where: { id: { in: payrollIds } } }).catch(() => {});
  await prisma.salary.deleteMany({ where: { id: { in: salaryIds } } }).catch(() => {});
  if (staffId) await prisma.staffMember.deleteMany({ where: { id: staffId } }).catch(() => {});
  await prisma.attendanceRecord.deleteMany({ where: { id: { in: attIds } } }).catch(() => {});
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }).catch(() => {});
  await prisma.enrollmentPeriod.deleteMany({ where: { id: { in: periodIds } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
