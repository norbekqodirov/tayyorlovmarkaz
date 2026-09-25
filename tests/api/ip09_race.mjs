// QT-62 stress: 1 o'rinli guruhga 8 ta parallel yozish, 5 marta — har safar aynan 1 muvaffaqiyat.
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';
try {
  const manager = await makeUser('MANAGER', ['dashboard', 'students', 'groups']);
  const course = await prisma.course.create({ data: { name: `${TAG} poyga`, price: 600000 } });
  track('course', course.id);
  for (let round = 1; round <= 5; round++) {
    const g = await prisma.group.create({ data: { name: `${TAG} poyga ${round}`, courseId: course.id, maxSize: 1 } });
    track('group', g.id);
    const students = [];
    for (let i = 0; i < 8; i++) { const s = await prisma.student.create({ data: { name: `${TAG} p${round}-${i}` } }); track('student', s.id); students.push(s); }
    const res = await Promise.all(students.map(s => api('POST', '/enrollments', manager.token, { studentId: s.id, groupId: g.id })));
    const ok = res.filter(r => r.status === 201).length;
    const full = res.filter(r => r.status === 409).length;
    const members = await prisma.enrollment.count({ where: { groupId: g.id } });
    const periods = await prisma.enrollmentPeriod.count({ where: { groupId: g.id } });
    check(`${round}-raund: 1 × 201, 7 × 409, guruhda 1 a'zo va 1 davr`, ok === 1 && full === 7 && members === 1 && periods === 1, { ok, full, members, periods, other: res.filter(r => ![201, 409].includes(r.status)).map(r => r.status) });
  }
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally { const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1); }
