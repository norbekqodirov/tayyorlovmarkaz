// 2026-09-26 hodisasi: guruh narxsiz yaratilib, narx keyin kiritilganda oy boshidagi hisoblar 0 bo'lib
// qolgan edi. Qoidalar: narx kiritilmagan (0) yoki guruh shu kuni yaratilib narx tuzatilsa — narx guruh
// boshidan qo'llanadi va hisoblar darhol tuzatiladi; oddiy narx o'zgarishi — bugundan (o'tgan hisoblar
// o'zgarmaydi); mavjud 0 so'mlik hisoblar avtomatik tuzatiladi (tariffRepair), qayta ishga tushsa takrorlanmaydi.
import { register } from 'tsx/esm/api';
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

register();
const { repairZeroTariffs } = await import('../../server/services/tariffRepair.ts');

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const month = today.slice(0, 7);
const start = `${month}-01`;
const periodsBefore = new Set((await prisma.billingPeriod.findMany({ select: { month: true } })).map(p => p.month));
const modeRow = await prisma.setting.findUnique({ where: { key: 'ledger_mode' } });
const cycleRow = await prisma.setting.findUnique({ where: { key: 'billing_cycle_mode' } });
const setMode = (mode) => prisma.setting.upsert({ where: { key: 'ledger_mode' }, create: { key: 'ledger_mode', value: mode }, update: { value: mode } });
const groupIds = [];

try {
  const admin = await makeUser('ADMIN');
  await setMode('live');
  await prisma.setting.deleteMany({ where: { key: 'billing_cycle_mode' } });
  const course = await prisma.course.create({ data: { name: `${TAG} kurs tarif`, price: 0 } }); track('course', course.id);

  const mkGroup = async (name, price) => {
    const r = await api('POST', '/groups', admin.token, { name: `${TAG} ${name}`, courseId: course.id, price, maxSize: 30, startDate: start, status: 'active' });
    const g = r.data; groupIds.push(g.id);
    const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: '[1,3,5]' } });
    track('groupSchedule', sc.id);
    return g;
  };
  const mkStudent = async (n) => { const s = await prisma.student.create({ data: { name: `${TAG} Tarif ${n}` } }); track('student', s.id); return s; };
  const enroll = (studentId, groupId) => api('POST', '/enrollments', admin.token, { studentId, groupId, startDate: start });
  const versions = (groupId) => prisma.tariffVersion.findMany({ where: { groupId }, orderBy: { effectiveFrom: 'asc' } });
  const posted = (groupId) => prisma.charge.findMany({ where: { groupId, month, status: 'posted' } });

  // ── A. Narxsiz yaratilgan guruhga narx kiritildi → guruh boshidan, hisob darhol tuzatiladi
  const GA = await mkGroup('Narxsiz', 0);
  const SA = await mkStudent('A');
  await enroll(SA.id, GA.id);
  const before = await posted(GA.id);
  check('narxsiz guruh: hisob 0 so\'m chiqdi (boshlanish holati)', before.length === 1 && before[0].net === 0, before.map(c => c.net));
  let r = await api('PUT', `/groups/${GA.id}`, admin.token, { price: 600000 });
  let vs = await versions(GA.id);
  const chA = await posted(GA.id);
  const sumA = chA.reduce((s, c) => s + c.net, 0);
  check('narx kiritilganda guruh boshidan qo\'llandi (0 versiya almashtirildi)', r.status === 200 && vs.length === 1 && vs[0].monthlyPrice === 600000 && vs[0].effectiveFrom === start, vs.map(v => [v.monthlyPrice, v.effectiveFrom]));
  check('hisob darhol tuzatildi: tuzatma +600 000 (to\'liq oy)', sumA === 600000 && chA.some(c => c.type === 'adjustment' && c.net === 600000), chA.map(c => [c.type, c.net]));
  const stA = await prisma.student.findUnique({ where: { id: SA.id }, select: { balance: true, paymentStatus: true } });
  check('o\'quvchi qarzi 600 000, holat "Qarzdorlik"', Math.round(stA.balance) === -600000 && stA.paymentStatus === 'Qarzdorlik', stA);

  // ── B. Guruh shu kuni yaratilib narx tuzatildi (500 000 → 550 000) → guruh boshidan
  const GB = await mkGroup('Tuzatish', 500000);
  const SB = await mkStudent('B');
  await enroll(SB.id, GB.id);
  r = await api('PUT', `/groups/${GB.id}`, admin.token, { price: 550000 });
  vs = await versions(GB.id);
  const sumB = (await posted(GB.id)).reduce((s, c) => s + c.net, 0);
  check('shu kuni tuzatilgan narx guruh boshidan: 550 000 (tuzatma +50 000)', vs.length === 1 && vs[0].monthlyPrice === 550000 && sumB === 550000, { vs: vs.map(v => [v.monthlyPrice, v.effectiveFrom]), sumB });

  // ── C. Oddiy narx o'zgarishi (tarif oldin yaratilgan) → bugundan, o'tgan hisob o'zgarmaydi
  const GC = await mkGroup('Oddiy', 400000);
  const SC = await mkStudent('C');
  await enroll(SC.id, GC.id);
  await prisma.tariffVersion.updateMany({ where: { groupId: GC.id }, data: { createdAt: new Date(Date.now() - 3 * 86400e3) } });
  r = await api('PUT', `/groups/${GC.id}`, admin.token, { price: 450000 });
  vs = await versions(GC.id);
  const sumC = (await posted(GC.id)).reduce((s, c) => s + c.net, 0);
  check('oddiy o\'zgarish: yangi versiya bugundan, bu oy hisobi o\'zgarmadi (400 000)',
    vs.length === 2 && vs[1].monthlyPrice === 450000 && vs[1].effectiveFrom === today && sumC === 400000, { vs: vs.map(v => [v.monthlyPrice, v.effectiveFrom]), sumC });

  // ── D. Mavjud xato (production'dagi kabi): 0 versiya + keyin kiritilgan narx bugundan → avtomatik tuzatish
  const GD = await mkGroup('Eski xato', 0);
  const SD1 = await mkStudent('D1'); const SD2 = await mkStudent('D2');
  await enroll(SD1.id, GD.id); await enroll(SD2.id, GD.id);
  const zero = (await versions(GD.id))[0];
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  await prisma.tariffVersion.update({ where: { id: zero.id }, data: { effectiveTo: yesterday } });
  await prisma.tariffVersion.create({ data: { groupId: GD.id, monthlyPrice: 450000, lessonsPerPackage: 12, effectiveFrom: today, source: 'legacy_edit' } });
  await prisma.group.update({ where: { id: GD.id }, data: { price: 450000 } });
  const beforeD = (await posted(GD.id)).reduce((s, c) => s + c.net, 0);
  const fixed = await repairZeroTariffs({ name: `${TAG} test` });
  const fixD = fixed.find(f => f.groupId === GD.id);
  const sumD = (await posted(GD.id)).reduce((s, c) => s + c.net, 0);
  vs = await versions(GD.id);
  check('avtomatik tuzatish: 2 o\'quvchi, har biriga +450 000 tuzatma', beforeD === 0 && fixD?.students === 2 && fixD.adjustments === 2 && sumD === 900000, { beforeD, fixD, sumD });
  check('0 so\'mlik versiya qolmadi', vs.every(v => v.monthlyPrice > 0), vs.map(v => [v.monthlyPrice, v.effectiveFrom, v.source]));
  const again = await repairZeroTariffs({ name: `${TAG} test` });
  const sumD2 = (await posted(GD.id)).reduce((s, c) => s + c.net, 0);
  check('qayta ishga tushsa hech narsa takrorlanmaydi', !again.some(f => f.groupId === GD.id) && sumD2 === 900000, { again, sumD2 });
  const audit = await prisma.auditLog.findFirst({ where: { action: 'tariff_auto_fix', resourceId: zero.id } });
  check('tuzatish audit jurnalida', !!audit, audit?.action);

  // ── E. Rejalashtirilgan bepul davr (narx 3 kundan keyin kiritilgan) — tegilmaydi
  const GE = await mkGroup('Bepul oy', 0);
  const SE = await mkStudent('E');
  await enroll(SE.id, GE.id);
  const zE = (await versions(GE.id))[0];
  await prisma.tariffVersion.update({ where: { id: zE.id }, data: { effectiveTo: yesterday, createdAt: new Date(Date.now() - 10 * 86400e3) } });
  await prisma.tariffVersion.create({ data: { groupId: GE.id, monthlyPrice: 300000, lessonsPerPackage: 12, effectiveFrom: today, source: 'manual' } });
  const fixedE = await repairZeroTariffs({ name: `${TAG} test` });
  check('rejalashtirilgan bepul davr avtomatik o\'zgartirilmaydi', !fixedE.some(f => f.groupId === GE.id) && (await posted(GE.id)).reduce((s, c) => s + c.net, 0) === 0);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  if (modeRow) await prisma.setting.update({ where: { key: 'ledger_mode' }, data: { value: modeRow.value } }).catch(() => {});
  else await prisma.setting.deleteMany({ where: { key: 'ledger_mode' } }).catch(() => {});
  if (cycleRow) await prisma.setting.upsert({ where: { key: 'billing_cycle_mode' }, create: { key: 'billing_cycle_mode', value: cycleRow.value }, update: { value: cycleRow.value } }).catch(() => {});
  const studs = (await prisma.student.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map(s => s.id);
  await prisma.charge.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.enrollmentPeriod.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.enrollment.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.tariffVersion.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.groupTeacherAssignment.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.lessonSession.deleteMany({ where: { groupId: { in: groupIds } } }).catch(() => {});
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } }).catch(() => {});
  await prisma.billingPeriod.deleteMany({ where: { month: { notIn: [...periodsBefore] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userName: { startsWith: TAG } } }).catch(() => {});
  void studs;
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
