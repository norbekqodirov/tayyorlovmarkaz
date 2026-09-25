import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isValidDate, addDays, isoWeekday, monthRange, scheduledDates, monthLessons, planVersionInsert, versionAt, daysBetween, billingWindow,
} from '../../server/domain/lessonCalendar.ts';
import { computeBase } from '../../server/domain/billingFormula.ts';

test('sana yordamchilari', () => {
    assert.ok(isValidDate('2026-02-28'));
    assert.ok(!isValidDate('2026-02-30'));
    assert.ok(!isValidDate('2026-2-3'));
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(isoWeekday('2026-09-21'), 1); // dushanba
    assert.equal(isoWeekday('2026-09-27'), 7); // yakshanba
    assert.deepEqual(monthRange('2028-02'), { first: '2028-02-01', last: '2028-02-29' });
    assert.equal(daysBetween('2026-09-01', '2026-09-14'), 13);
});

test('jadval kunlari: sentabr 2026, Du/Chor/Juma — 13 dars', () => {
    const d = scheduledDates([1, 3, 5], '2026-09-01', '2026-09-30');
    assert.equal(d.length, 13);
    assert.equal(d[0], '2026-09-02');
    assert.equal(scheduledDates([1, 3, 5], '2026-09-01', '2026-09-30', new Set(['2026-09-02'])).length, 12);
});

test('TQ-A: 20-sentabrdan kirish (Du/Chor/Juma) — 5 billable dars, qisman oy', () => {
    const r = monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-09-20' });
    assert.deepEqual(r.billable, ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30']);
    assert.equal(r.fullMonth, false);
});

test('QT-02: oy boshidan (birinchi darsdan oldin) — to\'liq oy', () => {
    const r = monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-08-15' });
    assert.equal(r.fullMonth, true);
    assert.equal(r.billable.length, 13);
    // birinchi dars kuni qo'shilgan (OQ-02) — ham to'liq
    assert.equal(monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-09-02' }).fullMonth, true);
    // ikkinchi darsdan — qisman
    assert.equal(monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-09-03' }).fullMonth, false);
});

test('pauza (OQ-06) va chiqish oyni qisman qiladi; guruh oralig\'i hisobga olinadi', () => {
    const p = monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-08-01', pauses: [{ from: '2026-09-07', to: '2026-09-20' }] });
    assert.equal(p.billable.length, 7);
    assert.equal(p.fullMonth, false);
    const e = monthLessons({ month: '2026-09', days: [1, 3, 5], periodStart: '2026-08-01', periodEnd: '2026-09-09' });
    assert.equal(e.billable.length, 4);
    // Foydalanuvchi qarori (2026-09-25): guruhning o'zi oy o'rtasida boshlansa — o'quvchi birinchi
    // darsdan bo'lsa ham oy qisman, darslar bo'yicha
    const g = monthLessons({ month: '2026-09', days: [1, 3, 5], groupStart: '2026-09-14', periodStart: '2026-09-14' });
    assert.equal(g.fullMonth, false);
    assert.equal(g.billable.length, 8);
    // Production misoli: guruh 10-sentabrdan (payshanba), Du/Chor/Ju — 9 dars → 425 000 × 9/12
    const prod = monthLessons({ month: '2026-09', days: [1, 3, 5], groupStart: '2026-09-10', periodStart: '2026-09-10' });
    assert.equal(prod.billable.length, 9);
    assert.equal(computeBase({ price: 425000, lessonsPerPackage: 12, billableLessons: prod.billable.length, fullMonth: prod.fullMonth }), 318750);
    // Guruh oy o'rtasida tugasa ham — qisman; butun oy dars o'tsa — to'liq
    assert.equal(monthLessons({ month: '2026-09', days: [1, 3, 5], groupEnd: '2026-09-15', periodStart: '2026-08-01' }).fullMonth, false);
    assert.equal(monthLessons({ month: '2026-10', days: [1, 3, 5], groupStart: '2026-09-10', periodStart: '2026-09-10' }).fullMonth, true);
    assert.equal(monthLessons({ month: '2026-09', days: [], periodStart: '2026-09-01' }).fullMonth, false);
});

test('versiya kiritish rejasi — bo\'shliqsiz va ustma-ust tushmasdan', () => {
    const v = [{ id: 'a', from: '2026-01-01', to: null }];
    assert.deepEqual(planVersionInsert(v, '2026-10-01'), { kind: 'insert', newTo: null, close: { id: 'a', to: '2026-09-30' } });
    assert.deepEqual(planVersionInsert(v, '2026-01-01'), { kind: 'replace', id: 'a' });
    const two = [{ id: 'a', from: '2026-01-01', to: '2026-09-30' }, { id: 'b', from: '2026-10-01', to: null }];
    assert.deepEqual(planVersionInsert(two, '2026-06-01'), { kind: 'insert', newTo: '2026-09-30', close: { id: 'a', to: '2026-05-31' } });
    assert.deepEqual(planVersionInsert([], '2026-06-01'), { kind: 'insert', newTo: null });
    const vs = [{ effectiveFrom: '2026-01-01', effectiveTo: '2026-09-30', p: 1 }, { effectiveFrom: '2026-10-01', effectiveTo: null, p: 2 }];
    assert.equal(versionAt(vs, '2026-09-30')?.p, 1);
    assert.equal(versionAt(vs, '2026-10-01')?.p, 2);
    assert.equal(versionAt(vs, '2025-12-31'), undefined);
});

test("hisob davri: kalendar oy va guruh boshlangan kundan (billing_cycle_mode)", () => {
    // Kalendar oy (standart)
    assert.deepEqual(billingWindow('2026-09', 'calendar', '2026-09-15'), { from: '2026-09-01', to: '2026-09-30' });
    // Guruh boshlangan kundan: 15-sentabr → 15.09–14.10, 15.10–14.11
    assert.deepEqual(billingWindow('2026-09', 'group_anniversary', '2026-09-15'), { from: '2026-09-15', to: '2026-10-14' });
    assert.deepEqual(billingWindow('2026-10', 'group_anniversary', '2026-09-15'), { from: '2026-10-15', to: '2026-11-14' });
    // Guruh hali boshlanmagan oy — oyna yo'q
    assert.equal(billingWindow('2026-08', 'group_anniversary', '2026-09-15'), null);
    // 31-sana: qisqa oyda oxirgi kun
    assert.deepEqual(billingWindow('2027-01', 'group_anniversary', '2026-10-31'), { from: '2027-01-31', to: '2027-02-27' });
    assert.deepEqual(billingWindow('2027-02', 'group_anniversary', '2026-10-31'), { from: '2027-02-28', to: '2027-03-30' });
    // Guruh boshlanishi yo'q — kalendar oy
    assert.deepEqual(billingWindow('2026-09', 'group_anniversary', null), { from: '2026-09-01', to: '2026-09-30' });
    // Birinchi oyna guruh boshidan — o'quvchi birinchi darsdan bo'lsa to'liq oy
    const w = billingWindow('2026-09', 'group_anniversary', '2026-09-15')!;
    const ml = monthLessons({ month: '2026-09', window: w, days: [1, 3, 5], groupStart: '2026-09-15', periodStart: '2026-09-15' });
    assert.equal(ml.fullMonth, true);
    assert.equal(ml.billable.length, 13); // 16.09 (Chor) … 14.10: 13 dars (Du/Chor/Ju) — to'liq oy, paket narxi
    // Oyna o'rtasida qo'shilgan — qisman
    const late = monthLessons({ month: '2026-09', window: w, days: [1, 3, 5], groupStart: '2026-09-15', periodStart: '2026-10-01' });
    assert.equal(late.fullMonth, false);
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: late.billable.length, fullMonth: false }), 600000 * late.billable.length / 12);
});
