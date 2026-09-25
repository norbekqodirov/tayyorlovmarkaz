// IP-09 — a'zolik davrlari, sig'im, transfer, pauza, tarif/ustoz/foiz tarixi, o'quvchi kodi.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); // Toshkent
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const monthStart = today.slice(0, 8) + '01';
const nextMonth = (() => { const [y, m] = today.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); })();

async function mkGroup(name, extra = {}, days = [1, 3, 5]) {
  const course = await prisma.course.create({ data: { name: `${TAG} kurs ${name}`, price: 600000 } });
  track('course', course.id);
  const g = await prisma.group.create({ data: { name: `${TAG} ${name}`, courseId: course.id, price: 600000, maxSize: 2, startDate: '2026-01-01', ...extra } });
  track('group', g.id);
  const sc = await prisma.groupSchedule.create({ data: { groupId: g.id, groupName: g.name, teacher: '-', room: '1', startTime: '09:00', endTime: '10:30', days: JSON.stringify(days) } });
  track('groupSchedule', sc.id);
  return g;
}
async function mkStudent(n, extra = {}) {
  const s = await prisma.student.create({ data: { name: `${TAG} o'quvchi ${n}`, ...extra } });
  track('student', s.id);
  return s;
}
const periods = (where) => prisma.enrollmentPeriod.findMany({ where, orderBy: { createdAt: 'asc' } });

try {
  const admin = await makeUser('ADMIN');
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups']);
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'attendance'], { salaryPercent: 40 });
  const A = await mkGroup('A', { teacherId: teacher.user.id });
  const B = await mkGroup('B', { maxSize: 1 });
  const C = await mkGroup('C', { maxSize: 10 });
  const D = await mkGroup('D', { maxSize: 10 });
  const s = [];
  for (let i = 1; i <= 9; i++) s.push(await mkStudent(i));

  // ── Preview (TQ-A): noyabr 2026, Du/Chor/Juma — 13 dars; 16-noyabrdan 7 dars → 350 000
  let r = await api('POST', '/enrollments/preview', manager.token, { groupId: A.id, studentId: s[0].id, startDate: '2026-11-16' });
  check('preview: qisman oy — 7/13 dars, 350 000', r.status === 200 && r.data.ok && r.data.billableLessons === 7 && r.data.groupLessonsInMonth === 13 && r.data.fullMonth === false && r.data.firstMonthAmount === 350000, r.data);
  r = await api('POST', '/enrollments/preview', manager.token, { groupId: A.id, startDate: '2026-11-02' });
  check('QT-02 preview: birinchi darsdan — to\'liq oy 600 000', r.data.fullMonth === true && r.data.firstMonthAmount === 600000, r.data);
  r = await api('POST', '/enrollments/preview', manager.token, { groupId: A.id, startDate: '2025-12-01' });
  check('QT-06 preview: guruh boshlanishidan oldin — xato', r.data.ok === false && r.data.errors.length > 0, r.data);
  r = await api('POST', '/enrollments/preview', manager.token, { groupId: A.id, startDate: '2026-13-40' });
  check('QT-06 preview: noto\'g\'ri sana — xato', r.data.ok === false, r.data);

  // ── Yozish
  r = await api('POST', '/enrollments', manager.token, { studentId: s[0].id, groupId: A.id, startDate: today });
  const p1 = r.data.period;
  check('yozish: 201, davr bugundan, joriy a\'zolik bor', r.status === 201 && p1?.startDate === today && !!(await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: s[0].id, groupId: A.id } } })), r);
  const st0 = await prisma.student.findUnique({ where: { id: s[0].id } });
  check('kesh: Student.group va kod (S-xxxxxx)', st0.group === A.name && /^S-\d{6}$/.test(st0.code || ''), { group: st0.group, code: st0.code });
  r = await api('POST', '/enrollments', manager.token, { studentId: s[0].id, groupId: A.id });
  check('takroriy yozish — idempotent (alreadyEnrolled), yangi davr yo\'q', r.status === 200 && r.data.alreadyEnrolled === true && (await periods({ studentId: s[0].id })).length === 1, r.data);
  r = await api('POST', '/enrollments', manager.token, { studentId: s[1].id, groupId: A.id });
  check('eski shakl (startDate\'siz) — bugun', r.status === 201 && r.data.period.startDate === today, r.data);
  r = await api('POST', '/enrollments', manager.token, { studentId: s[2].id, groupId: A.id });
  check('sig\'im to\'ldi — 409 GROUP_FULL', r.status === 409 && r.data.code === 'GROUP_FULL', r);
  r = await api('POST', '/enrollments', teacher.token, { studentId: s[2].id, groupId: C.id });
  check('ustoz yoza olmaydi — 403', r.status === 403, r.status);

  // ── QT-62: oxirgi o'ringa 2 ta parallel yozish
  const [x1, x2] = await Promise.all([
    api('POST', '/enrollments', manager.token, { studentId: s[3].id, groupId: B.id }),
    api('POST', '/enrollments', manager.token, { studentId: s[4].id, groupId: B.id }),
  ]);
  const codes = [x1.status, x2.status].sort();
  check('QT-62: bittasi 201, bittasi 409; guruhda 1 a\'zo', codes[0] === 201 && codes[1] === 409 && (await prisma.enrollment.count({ where: { groupId: B.id } })) === 1, { codes, n: await prisma.enrollment.count({ where: { groupId: B.id } }) });

  // ── Yakunlash va qayta kirish (QT-23)
  r = await api('POST', `/enrollments/periods/${p1.id}/end`, manager.token, { endDate: today, reason: 'left' });
  const p1after = await prisma.enrollmentPeriod.findUnique({ where: { id: p1.id } });
  check('yakunlash: davr ended, joriy a\'zolik o\'chdi, kesh bo\'sh', r.status === 200 && p1after.status === 'ended' && p1after.endDate === today
    && !(await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: s[0].id, groupId: A.id } } }))
    && (await prisma.student.findUnique({ where: { id: s[0].id } })).group === null, { r: r.data, p1after });
  r = await api('POST', '/enrollments', manager.token, { studentId: s[0].id, groupId: A.id, startDate: today });
  check('QT-23: tugagan kuni qayta kirish — 400 (ustma-ust)', r.status === 400 && r.data.code === 'OVERLAP', r);
  r = await api('POST', '/enrollments', manager.token, { studentId: s[0].id, groupId: A.id, startDate: addDays(today, 1) });
  const hist = await periods({ studentId: s[0].id, groupId: A.id });
  check('QT-23: qayta kirish — yangi davr, eski tarix qoladi', r.status === 201 && hist.length === 2 && hist[0].status === 'ended' && hist[1].status === 'active', hist.map(h => [h.startDate, h.endDate, h.status]));
  r = await api('POST', `/enrollments/periods/${p1.id}/end`, manager.token, { endDate: today, reason: 'left' });
  check('yakunlangan davrni qayta yakunlash — 409', r.status === 409, r.status);
  r = await api('POST', `/enrollments/periods/${hist[1].id}/end`, manager.token, { endDate: addDays(today, 5), reason: 'left' });
  check('kelajak sanasi bilan yakunlash — 400', r.status === 400, r);

  // ── Transfer (QT-61): oy boshidan C guruhida → bugundan D guruhiga
  r = await api('POST', '/enrollments', manager.token, { studentId: s[5].id, groupId: C.id, startDate: monthStart });
  const pc = r.data.period;
  r = await api('POST', `/enrollments/periods/${pc.id}/transfer`, manager.token, { toGroupId: D.id, date: today });
  const old = await prisma.enrollmentPeriod.findUnique({ where: { id: pc.id } });
  const neu = r.data.newPeriod;
  const contiguous = monthStart === today ? true : addDays(old.endDate, 1) === neu?.startDate;
  check('QT-61: bitta so\'rov — eski davr kechagacha, yangisi bugundan, bo\'shliqsiz', r.status === 200 && (monthStart === today || (old.status === 'ended' && old.endReason === 'transfer' && contiguous)) && neu?.transferFromId === (monthStart === today ? null : pc.id), { old, neu });
  check('QT-61: joriy a\'zolik faqat D da', !(await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: s[5].id, groupId: C.id } } })) && !!(await prisma.enrollment.findUnique({ where: { studentId_groupId: { studentId: s[5].id, groupId: D.id } } })));
  r = await api('POST', `/enrollments/periods/${neu.id}/transfer`, manager.token, { toGroupId: D.id, date: today });
  check('transfer o\'sha guruhga — 400', r.status === 400, r);

  // ── Pauza (OQ-06)
  r = await api('POST', `/enrollments/periods/${neu.id}/pause`, manager.token, { fromDate: addDays(today, 1), toDate: addDays(today, 6), reason: 'Sayohat' });
  check('pauza 6 kun — 400 (min 7)', r.status === 400 && r.data.code === 'BAD_LENGTH', r);
  r = await api('POST', `/enrollments/periods/${neu.id}/pause`, manager.token, { fromDate: addDays(today, 1), toDate: addDays(today, 61), reason: 'Sayohat' });
  check('pauza 61 kun — 400 (max 60)', r.status === 400, r);
  r = await api('POST', `/enrollments/periods/${neu.id}/pause`, manager.token, { fromDate: addDays(today, 1), toDate: addDays(today, 14), reason: 'Sayohat' });
  const pause = r.data;
  check('pauza 14 kun — 201', r.status === 201 && pause.status === 'active', r);
  r = await api('POST', `/enrollments/periods/${neu.id}/pause`, manager.token, { fromDate: addDays(today, 10), toDate: addDays(today, 20), reason: 'Kasallik' });
  check('ustma-ust pauza — 409', r.status === 409, r);
  r = await api('POST', `/enrollments/periods/${neu.id}/pause`, manager.token, { fromDate: addDays(today, 1), toDate: addDays(today, 10), reason: '' });
  check('sababsiz pauza — 400', r.status === 400, r);
  r = await api('POST', `/enrollments/pauses/${pause.id}/stop`, manager.token);
  check('boshlanmagan pauzani to\'xtatish — bekor qilinadi', r.status === 200 && r.data.status === 'cancelled', r);

  // ── Xato qo'shilgan (admin_fix): davr butunlay olib tashlanadi
  r = await api('POST', '/enrollments', manager.token, { studentId: s[6].id, groupId: C.id, startDate: today });
  const pf = r.data.period;
  r = await api('POST', `/enrollments/periods/${pf.id}/end`, manager.token, { reason: 'admin_fix' });
  check('admin_fix: davr o\'chirildi, a\'zolik yo\'q', r.status === 200 && r.data.removed === true && !(await prisma.enrollmentPeriod.findUnique({ where: { id: pf.id } })), r);

  // ── Eski a'zolik (davrsiz) → DELETE /remove: dalildan tiklangan va yakunlangan davr
  const legacyEnr = await prisma.enrollment.create({ data: { studentId: s[7].id, groupId: C.id, createdAt: new Date(Date.now() - 20 * 86400e3) } });
  track('enrollment', legacyEnr.id);
  const att = await prisma.attendanceRecord.create({ data: { studentId: s[7].id, groupId: C.id, date: addDays(today, -25), status: 'present' } });
  track('attendanceRecord', att.id);
  r = await api('DELETE', '/enrollments/remove', manager.token, { studentId: s[7].id, groupId: C.id });
  const lp = (await periods({ studentId: s[7].id }))[0];
  check('eski remove: yakunlangan davr (davomat dalili), a\'zolik o\'chdi', r.status === 200 && lp?.status === 'ended' && lp.startDate === addDays(today, -25) && lp.startSource === 'backfill_attendance' && lp.endDate === today, { r: r.data, lp });

  // ── Ustoz ko'rinishi
  r = await api('GET', `/enrollments/group/${A.id}`, teacher.token);
  check('ustoz o\'z guruhi: 200, davr bor, balans yo\'q', r.status === 200 && r.data.length >= 1 && r.data.every(e => e.period && !('balance' in e.student)), r.data);
  r = await api('GET', `/enrollments/group/${C.id}`, teacher.token);
  check('ustoz boshqa guruh — 403', r.status === 403, r.status);

  // ── Tarif tarixi (QT-21)
  r = await api('PUT', `/groups/${A.id}`, admin.token, { price: 650000 });
  let tv = await prisma.tariffVersion.findMany({ where: { groupId: A.id }, orderBy: { effectiveFrom: 'asc' } });
  check('guruh narxi tahriri — tarix: eski narx guruh boshidan, yangisi bugundan', r.status === 200 && tv.length === 2 && tv[0].monthlyPrice === 600000 && tv[0].effectiveFrom === '2026-01-01' && tv[0].effectiveTo === addDays(today, -1) && tv[1].monthlyPrice === 650000 && tv[1].effectiveFrom === today, tv);
  r = await api('POST', `/history/groups/${A.id}/tariff`, admin.token, { monthlyPrice: 700000, effectiveFrom: '2026-01-15' });
  check('QT-21: o\'tgan oyga tarif — 400', r.status === 400, r);
  r = await api('POST', `/history/groups/${A.id}/tariff`, admin.token, { monthlyPrice: 700000, effectiveFrom: nextMonth });
  const g1 = await prisma.group.findUnique({ where: { id: A.id } });
  check('kelajak tarifi — 201, joriy kesh o\'zgarmaydi (650 000)', r.status === 201 && g1.price === 650000, { r: r.data, price: g1.price });
  r = await api('POST', '/enrollments/preview', manager.token, { groupId: A.id, startDate: nextMonth });
  check('preview kelajak oy — yangi tarif (700 000, version)', r.data.tariff?.monthlyPrice === 700000 && r.data.tariff?.source === 'version', r.data.tariff);
  r = await api('POST', `/history/groups/${A.id}/tariff`, manager.token, { monthlyPrice: 1, effectiveFrom: nextMonth });
  check('tarif: finance ruxsatisiz menejer — 403', r.status === 403, r.status);

  // ── Ustoz foizi tarixi
  r = await api('PUT', `/auth/users/${teacher.user.id}`, admin.token, { salaryPercent: 45 });
  const rates = await prisma.teacherRate.findMany({ where: { teacherId: teacher.user.id }, orderBy: { effectiveFrom: 'asc' } });
  const expectRates = monthStart < today ? 2 : 1;
  check('foiz tahriri — TeacherRate tarixi (bugundan 4500)', r.status === 200 && rates.length === expectRates && rates.at(-1).rateBp === 4500 && rates.at(-1).effectiveFrom === today && (expectRates === 1 || rates[0].rateBp === 4000), rates);
  r = await api('POST', `/history/teachers/${teacher.user.id}/rate`, manager.token, { ratePercent: 50, effectiveFrom: nextMonth });
  check('foiz: menejer — 403', r.status === 403, r.status);

  // ── Yangi guruh (generic POST) — boshlang'ich tarix
  const course = await prisma.course.create({ data: { name: `${TAG} kurs E`, price: 500000 } });
  track('course', course.id);
  r = await api('POST', '/groups', admin.token, { name: `${TAG} E`, courseId: course.id, teacherId: teacher.user.id, startDate: '2026-09-01' });
  if (r.data?.id) track('group', r.data.id);
  const [etv, eta] = await Promise.all([
    prisma.tariffVersion.findMany({ where: { groupId: r.data?.id } }),
    prisma.groupTeacherAssignment.findMany({ where: { groupId: r.data?.id } }),
  ]);
  check('yangi guruh — kurs narxidan tarif + ustoz tayinlash (guruh boshidan)', etv.length === 1 && etv[0].monthlyPrice === 500000 && etv[0].effectiveFrom === '2026-09-01' && eta.length === 1 && eta[0].teacherId === teacher.user.id, { etv, eta });

  // ── Yangi o'quvchi (generic POST) — kod va phoneNorm
  r = await api('POST', '/students', admin.token, { name: `${TAG} yangi`, phone: '+998 (90) 123-45-67' });
  if (r.data?.id) track('student', r.data.id);
  const ns = await prisma.student.findUnique({ where: { id: r.data?.id } });
  check('yangi o\'quvchi — kod va phoneNorm', /^S-\d{6}$/.test(ns?.code || '') && ns?.phoneNorm === '901234567' && ns.code !== st0.code, { code: ns?.code, norm: ns?.phoneNorm });

  // ── Lid konversiyasi — lead_convert davri
  const lead = await prisma.lead.create({ data: { name: `${TAG} lid`, phone: '+998900009911', stage: 'contacted' } });
  track('lead', lead.id);
  r = await api('POST', `/leads/${lead.id}/convert`, admin.token, { groupId: C.id });
  if (r.data?.student?.id) track('student', r.data.student.id);
  const lperiod = r.data?.student ? (await periods({ studentId: r.data.student.id }))[0] : null;
  check('lid konversiyasi — lead_convert davri va kod', r.status === 201 && lperiod?.startSource === 'lead_convert' && lperiod.startDate === today && /^S-/.test((await prisma.student.findUnique({ where: { id: r.data.student.id } })).code || ''), { status: r.status, lperiod });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally { const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1); }
