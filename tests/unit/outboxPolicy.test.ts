import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAfterSend, parseQuietHours, quietUntil, MAX_ATTEMPTS } from '../../server/domain/outboxPolicy.ts';

const now = new Date('2026-09-26T10:00:00Z');

test('IP-29 (QT-90): 429 — retry_after qadar kutiladi, urinish hisoblanmaydi, butun ishchi to\'xtaydi', () => {
    const d = decideAfterSend({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } }, 2, now);
    assert.equal(d.action, 'retry');
    if (d.action !== 'retry') return;
    assert.equal(d.at.getTime() - now.getTime(), 7000);
    assert.equal(d.pauseAllMs, 7000);
    assert.equal(d.countAttempt, false);
});

test('IP-29: chat topilmadi / bot bloklangan — darhol xato (qayta urinish befoyda)', () => {
    assert.equal(decideAfterSend({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, 0, now).action, 'fail');
    assert.equal(decideAfterSend({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 0, now).action, 'fail');
});

test('IP-29: tarmoq xatosi — 30 s, 2 min, 10 min, 30 min, keyin xato', () => {
    const waits = [];
    for (let a = 0; a < MAX_ATTEMPTS - 1; a++) {
        const d = decideAfterSend({ ok: false, description: 'fetch failed' }, a, now);
        assert.equal(d.action, 'retry');
        if (d.action === 'retry') { waits.push((d.at.getTime() - now.getTime()) / 1000); assert.equal(d.countAttempt, true); }
    }
    assert.deepEqual(waits, [30, 120, 600, 1800]);
    assert.equal(decideAfterSend(null, MAX_ATTEMPTS - 1, now).action, 'fail');
    assert.equal(decideAfterSend({ ok: true }, 3, now).action, 'sent');
});

test('IP-29: sokin soatlar (Toshkent vaqti, tun orqali)', () => {
    const w = parseQuietHours('22:00-08:00');
    assert.deepEqual(w, { from: 1320, to: 480 });
    // 23:30 Toshkent (18:30 UTC) → ertasi 08:00 Toshkent (03:00 UTC)
    assert.equal(quietUntil(new Date('2026-09-26T18:30:00Z'), w)?.toISOString(), '2026-09-27T03:00:00.000Z');
    // 06:00 Toshkent (01:00 UTC) → shu kuni 08:00
    assert.equal(quietUntil(new Date('2026-09-26T01:00:00Z'), w)?.toISOString(), '2026-09-26T03:00:00.000Z');
    // 12:00 Toshkent — sokin emas
    assert.equal(quietUntil(new Date('2026-09-26T07:00:00Z'), w), null);
    assert.equal(parseQuietHours(''), null);
    assert.equal(parseQuietHours('25:00-08:00'), null);
});
