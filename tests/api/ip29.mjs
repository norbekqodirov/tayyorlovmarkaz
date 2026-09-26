// IP-29 (QT-90, QT-91): xabarlar navbati — dedup, 429 kutish, qayta urinish, restart'da yo'qolmaslik
// va takrorlanmaslik; ommaviy xabar navbat orqali (so'rov darhol qaytadi), bir chatga bitta xabar.
// Ishchi mantiqi shu jarayonda 'test' kanalida soxta yuboruvchi bilan sinaladi — haqiqiy Telegram'ga
// hech narsa ketmaydi, backend ishchisi 'test' kanaliga tegmaydi.
import { register } from 'tsx/esm/api';
import { prisma, api, makeUser, track, check, summary, cleanup, TAG } from './testkit.mjs';

register();
const outbox = await import('../../server/services/outbox.ts');
const tag = `${TAG}-${Date.now()}`;
const ids = [];
let bulkId = null;

const pending = (over = {}) => outbox.enqueueMessage({ channel: 'test', chatId: `${tag}-chat`, text: 'Salom', kind: 'manual', ...over });
const row = (id) => prisma.messageOutbox.findUnique({ where: { id } });
const later = (ms) => () => new Date(Date.now() + ms);

try {
  // ── Dedup
  let a = await pending({ dedupeKey: `${tag}:k1` });
  let b = await pending({ dedupeKey: `${tag}:k1` });
  ids.push(a.id);
  check('dedupeKey: ikkinchi marta navbatga qo\'yilmaydi', !!a.id && !a.duplicate && b.duplicate && b.id === a.id, { a, b });

  // ── 429: retry_after kutiladi, urinish hisoblanmaydi; keyin yuboriladi
  const calls = [];
  const fake = (results) => async (m) => { calls.push(m.chatId); return results.shift() ?? { ok: true }; };
  let st = await outbox.processOutbox({ channels: ['test'], send: fake([{ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } }]), spacingMs: 0 });
  let r = await row(a.id);
  check('429: navbatda qoldi, ~3 s keyin, urinish 0', st.retried === 1 && r.status === 'pending' && r.attempts === 0 && r.nextAttemptAt.getTime() - Date.now() > 1500, r);
  st = await outbox.processOutbox({ channels: ['test'], send: fake([]), spacingMs: 0 });
  check('retry_after tugamaguncha yuborilmaydi', st.sent === 0 && calls.length === 1, st);
  st = await outbox.processOutbox({ channels: ['test'], send: fake([{ ok: true }]), now: later(5000), spacingMs: 0 });
  r = await row(a.id);
  check('retry_after dan keyin yuborildi (bitta marta)', st.sent === 1 && r.status === 'sent' && !!r.sentAt && calls.length === 2, r);
  st = await outbox.processOutbox({ channels: ['test'], send: fake([{ ok: true }]), now: later(60_000), spacingMs: 0 });
  check('yuborilgan xabar qayta yuborilmaydi', st.sent === 0 && calls.length === 2, st);

  // ── Vaqtinchalik xato: 5 urinishdan keyin failed; 403 — darhol failed
  const c = await pending({ chatId: `${tag}-c` }); ids.push(c.id);
  let t = 0;
  for (let i = 0; i < 5; i++) { t += 3_600_000; await outbox.processOutbox({ channels: ['test'], send: fake([{ ok: false, description: 'fetch failed' }]), now: later(t), spacingMs: 0 }); }
  r = await row(c.id);
  check('tarmoq xatosi: 5 urinishdan keyin "failed"', r.status === 'failed' && r.attempts === 5, r);
  const d = await pending({ chatId: `${tag}-d` }); ids.push(d.id);
  await outbox.processOutbox({ channels: ['test'], send: fake([{ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }]), spacingMs: 0 });
  r = await row(d.id);
  check('403 (bot bloklangan): darhol "failed", 1 urinish', r.status === 'failed' && r.attempts === 1 && /blocked/.test(r.lastError), r);

  // ── Bir aylanishda bitta chatga bittadan
  const e1 = await pending({ chatId: `${tag}-same`, dedupeKey: `${tag}:e1` }); const e2 = await pending({ chatId: `${tag}-same`, dedupeKey: `${tag}:e2` });
  ids.push(e1.id, e2.id);
  st = await outbox.processOutbox({ channels: ['test'], send: fake([]), spacingMs: 0 });
  check('bitta chatga bir aylanishda bitta xabar (ikkinchisi keyingi aylanishga)', st.sent === 1 && st.deferred === 1, st);
  await outbox.processOutbox({ channels: ['test'], send: fake([]), spacingMs: 0 });

  // ── Restart: navbatdagi yo'qolmaydi; yuborish paytida uzilgani qayta yuborilmaydi
  const p1 = await pending({ chatId: `${tag}-p1` }); const s1 = await pending({ chatId: `${tag}-s1` });
  ids.push(p1.id, s1.id);
  // yuborish paytida server to'xtagan: egallangan (sending), egallash vaqti — bir soniya oldin
  await prisma.messageOutbox.update({ where: { id: s1.id }, data: { status: 'sending', nextAttemptAt: new Date(Date.now() - 1000) } });
  const n = await outbox.recoverInterrupted(0, ['test']);
  const [rp, rs] = [await row(p1.id), await row(s1.id)];
  check('restart: "pending" joyida, "sending" → "failed" (yetkazilgani noma\'lum, takror yuborilmaydi)', n === 1 && rp.status === 'pending' && rs.status === 'failed' && /noma'lum/.test(rs.lastError), { rp: rp.status, rs });
  const before = calls.length;
  await outbox.processOutbox({ channels: ['test'], send: fake([]), spacingMs: 0 });
  check('restart\'dan keyin navbatdagisi yuborildi, uzilgani yuborilmadi', calls.length === before + 1 && (await row(p1.id)).status === 'sent' && (await row(s1.id)).status === 'failed');

  // ── Qo'lda qayta yuborish va bekor qilish
  r = await outbox.retryMessage(d.id);
  check('xato xabar qayta navbatga (urinish 0)', r.status === 'pending' && r.attempts === 0, r);
  r = await outbox.cancelMessage(d.id);
  check('navbatdagi xabar bekor qilindi', r.status === 'cancelled', r);
  let err = null; try { await outbox.cancelMessage(a.id); } catch (x) { err = x; }
  check('yuborilgan xabarni bekor qilib bo\'lmaydi (409)', err?.status === 409, err?.message);

  // ── Ommaviy xabar (API): darhol qaytadi, bir ota-onaga ikki farzand — bitta xabar (QT-91)
  const manager = await makeUser('MANAGER', ['dashboard', 'communication']);
  const course = await prisma.course.create({ data: { name: `${TAG} kurs xabar`, price: 100000 } }); track('course', course.id);
  const G = await prisma.group.create({ data: { name: `${TAG} Xabar guruhi`, courseId: course.id, maxSize: 30 } }); track('group', G.id);
  const parentChat = `${tag}-parent`;
  const mk = async (name, data) => { const s = await prisma.student.create({ data: { name: `${TAG} ${name}`, ...data } }); track('student', s.id); await prisma.enrollment.create({ data: { studentId: s.id, groupId: G.id } }); return s; };
  await mk('Aka', { parentTelegramId: parentChat }); await mk('Uka', { parentTelegramId: parentChat });
  await mk('Boshqa', { telegramChatId: `${tag}-own` }); await mk('Telegramsiz', {});
  const t0 = Date.now();
  const res = await api('POST', '/communication/bulk-messages/send', manager.token, { content: `${TAG} test e'lon`, targetType: 'group', targetId: G.id });
  const took = Date.now() - t0;
  bulkId = res.data?.message?.id;
  const rows = bulkId ? await prisma.messageOutbox.findMany({ where: { batchId: bulkId } }) : [];
  check('ommaviy xabar: 2 ta navbatga (aka-uka — bitta), 1 dublikat, 1 Telegramsiz', res.status === 200 && res.data.queuedCount === 2 && res.data.duplicateCount === 1 && res.data.noTelegramCount === 1 && rows.length === 2 && new Set(rows.map(x => x.chatId)).size === 2, res.data);
  check('so\'rov yuborishni kutmaydi (navbat)', took < 3000, took);
  const list = await api('GET', `/telegram/outbox?batchId=${bulkId}`, manager.token);
  check('navbat ro\'yxati va holatlar soni (batch bo\'yicha)', list.status === 200 && list.data.total === 2 && Object.values(list.data.counts).reduce((x, y) => x + y, 0) === 2, list.data?.counts);
  const hist = await api('GET', '/communication/bulk-messages', manager.token);
  const hb = hist.data?.find?.(m => m.id === bulkId);
  check('ommaviy xabarlar tarixida yetkazish holati', !!hb?.delivery && Object.values(hb.delivery).reduce((x, y) => x + y, 0) === 2, hb?.delivery);
} catch (e) { console.error(e); check('xatosiz', false, e.message); }
finally {
  await prisma.messageOutbox.deleteMany({ where: { OR: [{ chatId: { startsWith: tag } }, ...(bulkId ? [{ batchId: bulkId }] : [])] } }).catch(() => {});
  if (bulkId) await prisma.bulkMessage.deleteMany({ where: { id: bulkId } }).catch(() => {});
  await prisma.telegramMessage.deleteMany({ where: { chatId: { startsWith: tag } } }).catch(() => {});
  const ok = summary(); await cleanup(); process.exit(ok ? 0 : 1);
}
