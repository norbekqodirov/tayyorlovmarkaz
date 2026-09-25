// Lokal API sinovlari uchun yordamchi: fixture yaratish, login, so'rov, tozalash.
// Faqat LOKAL dev backend va lokal bazaga qarshi ishlaydi (fixture yozadi va
// oxirida o'chiradi) — production'ga qarshi ishga tushirilmaydi.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

export const prisma = new PrismaClient();
export const BASE = process.env.API_BASE || 'http://localhost:3001/api';
export const TAG = 'ZZTEST';

// Himoya: faqat localhost backend va lokal baza.
{
  const apiHost = new URL(BASE).hostname;
  const dbUrl = process.env.DATABASE_URL || '';
  const dbLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || dbUrl.startsWith('file:');
  if (!['localhost', '127.0.0.1'].includes(apiHost) || (dbUrl && !dbLocal)) {
    console.error(`API sinovlari faqat lokal muhitda: API_BASE=${BASE}`);
    process.exit(2);
  }
}

const created = [];
export function track(model, id) { created.push({ model, id }); return id; }

let results = [];
export function check(name, cond, extra) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : ''}`);
}
export function summary() {
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} o'tdi`);
  return failed.length === 0;
}

let phoneSeq = 900000000 + Math.floor(Math.random() * 90000);
export async function makeUser(role, permissions = [], extra = {}) {
  const phone = `+998${phoneSeq++}`;
  const password = 'Test12345!';
  const u = await prisma.user.create({
    data: { phone, name: `${TAG} ${role}`, role, password: await bcrypt.hash(password, 4), permissions: JSON.stringify(permissions), isActive: true, ...extra },
  });
  track('user', u.id);
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
  const j = await r.json();
  if (!j.token) throw new Error('login failed ' + JSON.stringify(j));
  return { user: u, token: j.token };
}

export async function api(method, path, token, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

// Teskari tartibda o'chirish (bog'liqlarini avval). Kaskadlar o'z-o'zidan.
export async function cleanup() {
  const order = ['auditLog', 'paymentAllocation', 'transaction', 'payment', 'attendanceRecord', 'enrollment', 'salary', 'staffAdvance', 'groupSchedule', 'group', 'courseTier', 'course', 'leaveRequest', 'student', 'staffMember', 'lead', 'test', 'user'];
  const byModel = {};
  for (const c of created) (byModel[c.model] ||= []).push(c.id);
  for (const m of order) {
    const ids = byModel[m];
    if (!ids || !prisma[m]) continue;
    try { await prisma[m].deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log('cleanup', m, e.message.slice(0, 120)); }
  }
  for (const m of Object.keys(byModel)) if (!order.includes(m)) {
    try { await prisma[m].deleteMany({ where: { id: { in: byModel[m] } } }); } catch (e) { console.log('cleanup', m, e.message.slice(0, 120)); }
  }
  // Test foydalanuvchilarining audit yozuvlari
  await prisma.auditLog.deleteMany({ where: { userName: { startsWith: TAG } } }).catch(() => {});
  await prisma.$disconnect();
}
