import { api, makeUser, check, summary, cleanup, prisma, track, TAG } from './testkit.mjs';
try {
  const admin = await makeUser('ADMIN');
  const teacher = await makeUser('TEACHER', ['dashboard', 'students', 'groups', 'attendance']);
  const managerNoFinance = await makeUser('MANAGER', ['dashboard', 'students', 'leads']);
  const managerFinance = await makeUser('MANAGER', ['dashboard', 'finance', 'communication']);

  let r = await api('GET', '/announcements');
  check('e\'lonlar ro\'yxati login\'siz → 401', r.status === 401, r.status);
  r = await api('GET', '/announcements', teacher.token);
  check('e\'lonlar ro\'yxati communication ruxsatisiz → 403', r.status === 403, r.status);
  r = await api('GET', '/announcements', managerFinance.token);
  check('e\'lonlar ro\'yxati communication bilan → 200', r.status === 200, r.status);

  for (const p of ['/telegram/settings', '/telegram/stats', '/telegram/status', '/staff-telegram/webhook-info']) {
    r = await api('GET', p, teacher.token);
    check(`${p} ustozga → 403`, r.status === 403, r.status);
  }
  r = await api('GET', '/telegram/settings', admin.token);
  check('/telegram/settings ADMIN → 200', r.status === 200, r.status);

  const s = await prisma.student.create({ data: { name: `${TAG} havola` } });
  track('student', s.id);
  r = await api('GET', `/payments/generate-links?studentId=${s.id}&amount=100000`, managerNoFinance.token);
  check('to\'lov havolasi finance ruxsatisiz → 403', r.status === 403, r.status);
  r = await api('GET', `/payments/generate-links?studentId=${s.id}&amount=100000`, managerFinance.token);
  check('to\'lov havolasi finance bilan → 200', r.status === 200, r.status);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally { const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1); }
