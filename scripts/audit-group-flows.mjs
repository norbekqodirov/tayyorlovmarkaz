// Frontend regression checks with isolated API fixtures; no database writes.
// Run Vite on :3012, then: node scripts/audit-group-flows.mjs
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const artifactDir = join(tmpdir(), 'tayyorlov-group-audit');
page.on('pageerror', error => errors.push(error.message));
const course = { id: 'c1', name: 'Matematika', price: 500000, lessonDuration: 90 };
const group = { id: 'g1', name: 'Audit guruhi', courseId: 'c1', teacherId: 't1', course, teacher: { name: 'Audit ustoz' }, status: 'active', maxSize: 2, startDate: '2026-09-01', _count: { enrollments: 1 } };
const students = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, name: `Oquvchi ${i}`, phone: '+998901234567' }));
let enrolled = [students[0]];
const writes = [];
let fail = '';
let duplicate = false;
let delayPost = false;
let scheduleFailedOnce = false;
await page.addInitScript(() => {
  localStorage.setItem('crm_token', 'fixture');
  localStorage.setItem('crm_user', JSON.stringify({ id: 'u1', name: 'Audit', role: 'ADMIN' }));
});
await page.route('**/api/**', async route => {
  const req = route.request();
  if (!new URL(req.url()).pathname.startsWith('/api/')) return route.continue();
  const path = new URL(req.url()).pathname.replace('/api/', '');
  const method = req.method();
  const send = (body, status = 200) => route.fulfill({ status, json: body });
  if (path === fail) return send({ message: 'Sinov xatosi' }, 500);
  if (method !== 'GET') {
    const data = req.postDataJSON();
    writes.push({ path, method, data });
    if (path === 'enrollments') {
      if (delayPost) await new Promise(resolve => setTimeout(resolve, 600));
      enrolled.push(students.find(s => s.id === data.studentId));
      return send({ id: 'e1', ...data, alreadyEnrolled: duplicate });
    }
    if (path === 'enrollments/remove') { enrolled = enrolled.filter(s => s.id !== data.studentId); return send({ success: true }); }
    if (path === 'schedule' && scheduleFailedOnce) { scheduleFailedOnce = false; return send({}, 500); }
    return send({ id: path === 'groups' ? 'new-group' : 'sched-new', ...data });
  }
  if (path === 'groups') return send([group]);
  if (path === 'groups/g1') return send(group);
  if (path === 'courses') return send([course, { ...course, id: 'c2', name: 'Uzun dars', lessonDuration: 120 }]);
  if (path === 'auth/users') return send([{ id: 't1', name: 'Audit ustoz', role: 'TEACHER' }]);
  if (path === 'rooms') return send([{ id: 'r1', name: 'Xona 1' }, { id: 'r2', name: 'Xona 2' }]);
  if (path === 'students') return send(students);
  if (path === 'schedule') return send([{ id: 'sc1', groupId: 'g1', room: 'Xona 1', days: [1], startTime: '09:00', endTime: '10:30' }]);
  if (path === 'enrollments/group/g1') return send(enrolled.map(student => ({ studentId: student.id, student })));
  if (path === 'auth/me') return send({ id: 'u1', role: 'ADMIN', name: 'Audit' });
  return send([]);
});
const goto = async (suffix = '') => { await page.goto(`http://127.0.0.1:3012/crmtayyorlovmarkaz/groups${suffix}`); await page.waitForLoadState('networkidle'); };
const visible = async text => { await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible' }); };
const save = () => page.getByRole('button', { name: 'Saqlash', exact: true }).click();
try {
  fail = 'courses';
  await goto();
  await visible('Forma uchun zarur ma’lumotlar yuklanmadi. Yaratish/tahrirlash uchun qayta urinib ko‘ring.');
  fail = '';
  await page.getByRole('button', { name: 'Qayta urinish' }).click();
  await page.getByRole('button', { name: 'Yangi Guruh', exact: true }).click();
  await save();
  await visible('Guruh nomi kiritilishi shart');
  await visible('Kurs tanlanishi shart');
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('  Sinov guruhi  ');
  await dialog.locator('select').nth(0).selectOption('c1');
  assert.equal(await page.getByLabel('Tugash vaqti', { exact: true }).inputValue(), '10:30');
  await dialog.locator('select').nth(0).selectOption('c2');
  assert.equal(await page.getByLabel('Tugash vaqti', { exact: true }).inputValue(), '11:00');
  await dialog.locator('select').nth(1).selectOption('t1');
  await dialog.locator('select').nth(2).selectOption('Xona 1');
  await page.getByRole('button', { name: 'Dush', exact: true }).click();
  await save();
  assert.equal(writes.length, 0, 'Conflict must prevent saving');
  await visible('Bu xona tanlangan kun va vaqtda band. Boshqa xona yoki vaqtni tanlang');
  await dialog.locator('select').nth(2).selectOption('Xona 2');
  for (const value of ['', '0', '-1', '1.5']) {
    await dialog.locator('input[type=number]').fill(value); await save();
    assert.equal(writes.length, 0, `Invalid maxSize ${value}`);
  }
  await dialog.locator('input[type=number]').fill('15');
  await page.getByLabel('Boshlanish vaqti', { exact: true }).fill('23:30'); await save();
  assert.equal(writes.length, 0, 'Overnight lesson must be invalid');
  await page.getByLabel('Boshlanish vaqti', { exact: true }).fill(''); await save();
  assert.equal(writes.length, 0, 'Empty time must be invalid');
  await page.getByLabel('Boshlanish vaqti', { exact: true }).fill('11:00');
  await dialog.locator('input[type=date]').nth(0).fill('2026-09-07');
  await dialog.locator('input[type=date]').nth(1).fill('2026-09-01'); await save();
  assert.equal(writes.length, 0, 'Reversed dates must be invalid');
  await dialog.locator('input[type=date]').nth(1).fill('');
  await dialog.locator('input[inputmode=numeric]').fill('0');
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Mobile modal overflow');
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && [...el.querySelectorAll('input,select')].every(input => input.getBoundingClientRect().right <= el.getBoundingClientRect().right)), true, '320px modal controls overflow');
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: join(artifactDir, 'modal-320.png') });
  scheduleFailedOnce = true;
  await save();
  await visible('Guruh saqlandi, lekin dars jadvali saqlanmadi. Saqlash tugmasini bosib qayta urinib ko‘ring.');
  await save();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.filter(w => w.path === 'groups' && w.method === 'POST').length, 1, 'Retry must not create a second group');
  assert.equal(writes[0].data.name, 'Sinov guruhi');
  assert.equal(writes[0].data.price, 0);
  console.log('PASS: loading retry, required/maxSize/time/date validation, conflict, course duration, zero price, partial-save retry, mobile modal');

  group._count.enrollments = 2;
  await goto();
  await page.getByRole('button', { name: /guruhini tahrirlash/ }).first().click();
  await dialog.locator('input[type=number]').fill('1');
  await save();
  await visible("Guruhda 2 o'quvchi bor. Sig'im bundan kam bo'lmasligi kerak");
  await dialog.locator('input[type=number]').fill('2');
  await save();
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(writes.some(w => w.path === 'schedule/sc1' && w.method === 'PUT'), 'Edit must update existing schedule and exclude itself from conflicts');
  console.log('PASS: edit capacity floor and own-schedule conflict exclusion');

  fail = 'enrollments/group/g1';
  await goto('/g1');
  await page.getByRole('button', { name: /Guruh ma’lumotlari/ }).click();
  await visible("Guruh o'quvchilari ro'yxati yuklanmadi.");
  assert.equal(await page.getByRole('button', { name: "O'quvchi qo'shish", exact: true }).isDisabled(), true);
  fail = '';
  await page.getByRole('button', { name: 'Qayta urinish', exact: true }).first().click();
  await visible('Oquvchi 0');
  await page.getByRole('button', { name: "O'quvchi qo'shish", exact: true }).click();
  await page.getByRole('button', { name: /Oquvchi 24 / }).waitFor();
  duplicate = true; delayPost = true;
  await page.getByRole('button', { name: /Oquvchi 1 / }).click();
  assert.equal(await page.getByRole('button', { name: /Oquvchi 2 / }).isDisabled(), true);
  await visible("Bu o'quvchi allaqachon guruhga qo'shilgan");
  await visible("Guruhda bo'sh o'rin qolmagan.");
  await page.getByRole('button', { name: 'Oquvchi 0 — guruhdan chiqarish' }).click();
  assert.equal(writes.filter(w => w.method === 'DELETE').length, 0);
  await page.getByRole('button', { name: 'Bekor qilish', exact: true }).click();
  assert.equal(writes.filter(w => w.method === 'DELETE').length, 0);
  await page.getByRole('button', { name: 'Oquvchi 0 — guruhdan chiqarish' }).click();
  await page.getByRole('button', { name: 'Ha, chiqarish', exact: true }).click();
  await visible("O'quvchi guruhdan o'chirildi");
  await page.getByRole('button', { name: 'Ha, chiqarish', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(writes.filter(w => w.path === 'enrollments/remove' && w.method === 'DELETE').length, 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page overflow');
  await page.screenshot({ path: join(artifactDir, 'detail-320.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: enrollment retry, >20 candidates, duplicate message, mutation lock, capacity, ConfirmDialog cancel/confirm, DELETE contract, mobile detail');
  fail = 'students';
  await goto('/g1');
  await page.getByRole('button', { name: /Guruh ma’lumotlari/ }).click();
  await page.getByRole('button', { name: "O'quvchi qo'shish", exact: true }).click();
  await visible("O'quvchilar ro'yxati yuklanmadi.");
  fail = '';
  await page.getByRole('button', { name: 'Qayta urinish', exact: true }).click();
  await page.getByRole('button', { name: /Oquvchi 24 / }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(artifactDir, 'detail-desktop.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Desktop overflow');
  console.log('PASS: candidate list error/retry and desktop layout');
} catch (error) {
  console.error('Page:', await page.locator('body').innerText());
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
