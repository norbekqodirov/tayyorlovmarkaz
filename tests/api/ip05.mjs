import { api, makeUser, check, summary, cleanup, BASE } from './testkit.mjs';
try {
  const admin = await makeUser('ADMIN');
  const r = await api('GET', '/backup/status', admin.token);
  check('backup/status 200 va kunlik jadval ko\'rsatiladi', r.status === 200 && r.data.dailySchedule, r.data);
  const c = await api('POST', '/backup/create', admin.token);
  // pg_dump o'rnatilmagan mashinada — aniq xato (jim emas); o'rnatilganda — muvaffaqiyat
  check('backup/create — muvaffaqiyat yoki aniq pg_dump xatosi', (c.status === 200 && c.data.success !== false) || (c.status === 500 && /pg_dump/.test(c.data.message)), c);
  const z = await fetch(`${BASE}/certificates/zip`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000000'] }) });
  const buf = Buffer.from(await z.arrayBuffer());
  check('certificates/zip endi ZIP qaytaradi (PK imzosi)', z.status === 200 && buf.slice(0, 2).toString() === 'PK', { status: z.status, head: buf.slice(0, 20).toString() });
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally { const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1); }
