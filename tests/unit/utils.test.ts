import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentStatus } from '../../server/utils/studentStatus.ts';
import { toTashkentDate, tashkentDatePlusDays } from '../../src/utils/tashkentDate.ts';
import { todayDateStr } from '../../server/utils/timezone.ts';

test('QT-57: o\'quvchi holati lug\'ati', () => {
    assert.equal(normalizeStudentStatus('Faol'), 'active');
    assert.equal(normalizeStudentStatus('Muzlatilgan'), 'frozen');
    assert.equal(normalizeStudentStatus('Tark etgan'), 'left');
    assert.equal(normalizeStudentStatus('Bitiruvchi'), 'graduated');
    assert.equal(normalizeStudentStatus('active'), 'active');
    assert.equal(normalizeStudentStatus(''), undefined);
});

test('QT-58 / ML-17: Toshkent 00:30 da sana — UTC kechasi emas, Toshkent kuni', () => {
    // 2026-10-01 00:30 Toshkent = 2026-09-30T19:30:00Z
    const instant = new Date('2026-09-30T19:30:00Z');
    assert.equal(toTashkentDate(instant), '2026-10-01');
    assert.equal(instant.toISOString().slice(0, 10), '2026-09-30'); // eski xato usul
    assert.equal(todayDateStr(instant), '2026-10-01'); // server bilan bir xil
});

test('tashkentDatePlusDays oy chegarasidan o\'tadi', () => {
    const d = tashkentDatePlusDays(0);
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(tashkentDatePlusDays(40).slice(5, 7), d.slice(5, 7));
});
