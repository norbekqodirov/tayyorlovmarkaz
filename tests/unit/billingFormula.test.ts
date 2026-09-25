/**
 * Hisob formulalari — referens misollar (reja G.4, qabul sinovlari QT-01…QT-07,
 * QT-19…QT-22). Ishga tushirish: `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    roundSom, allocateLargestRemainder, computeBase, computeAbsenceDiscount, computeCharge,
    splitNetByTeachers, salaryFromBase, payrollRemaining,
} from '../../server/domain/billingFormula.ts';

test('QT-01 / Misol 1: 600 000, N=12, qolgan 6 dars → 300 000; ustoz 40% → 120 000', () => {
    const base = computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 6, fullMonth: false });
    assert.equal(base, 300000);
    assert.equal(salaryFromBase(base, 4000), 120000);
});

test('QT-02: oy boshidan — to\'liq narx (13 darsli oyda ham)', () => {
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 13, fullMonth: true }), 600000);
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 10, fullMonth: true }), 600000);
});

test('QT-03: qisman oyda R > N bo\'lsa ham N bilan cheklanadi', () => {
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 12, fullMonth: false }), 600000);
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 13, fullMonth: false }), 600000);
    assert.equal(computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 11, fullMonth: false }), 550000);
});

test('QT-05: A=2/M=3 — chegirma yo\'q; A=3/M=3 — 3 dars chegirmasi', () => {
    assert.equal(computeAbsenceDiscount({ price: 600000, lessonsPerPackage: 12, absences: 2, threshold: 3, base: 600000 }), 0);
    assert.equal(computeAbsenceDiscount({ price: 600000, lessonsPerPackage: 12, absences: 3, threshold: 3, base: 600000 }), 150000);
    // M=0 bo'lsa ham 0 ta qoldirishda chegirma yo'q
    assert.equal(computeAbsenceDiscount({ price: 600000, lessonsPerPackage: 12, absences: 0, threshold: 0, base: 600000 }), 0);
});

test('Misol 2: qisman oyda 6 darsdan 3 qoldirildi → net 150 000, ustoz 60 000', () => {
    const r = computeCharge({ price: 600000, lessonsPerPackage: 12, billableLessons: 6, fullMonth: false, absences: 3, threshold: 3 });
    assert.equal(r.gross, 300000);
    assert.equal(r.net, 150000);
    assert.equal(salaryFromBase(r.net, 4000), 60000);
    assert.deepEqual(r.lines.map(l => l.amount), [300000, -150000]);
});

test('Chegirma bazadan oshmaydi, net manfiy bo\'lmaydi', () => {
    const r = computeCharge({ price: 600000, lessonsPerPackage: 12, billableLessons: 2, fullMonth: false, absences: 5, threshold: 3,
        otherDiscounts: [{ kind: 'promo', amount: 999999, description: 'promo' }] });
    assert.equal(r.gross, 100000);
    assert.equal(r.net, 0);
    assert.equal(r.lines.reduce((a, l) => a + l.amount, 0), 0);
});

test('QT-06: N=0 — avtomatik hisob chiqmaydi (xato)', () => {
    assert.throws(() => computeBase({ price: 600000, lessonsPerPackage: 0, billableLessons: 6, fullMonth: false }));
});

test('QT-07 / Misol 3: ikki guruh — mustaqil hisoblar va maosh', () => {
    const math = computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 6, fullMonth: false });
    const eng = computeBase({ price: 400000, lessonsPerPackage: 12, billableLessons: 12, fullMonth: true });
    assert.equal(math + eng, 700000);
    assert.equal(salaryFromBase(math, 4000) + salaryFromBase(eng, 4000), 280000);
});

test('QT-22 / Misol 6: oy o\'rtasida ustoz almashdi — 5/7 dars bo\'yicha, jami takrorlanmaydi', () => {
    const split = splitNetByTeachers(600000, { A: 5, B: 7 });
    assert.deepEqual(split, { A: 250000, B: 350000 });
    assert.equal(salaryFromBase(split.A, 4000), 100000);
    assert.equal(salaryFromBase(split.B, 4500), 157500);
});

test('Misol 9: eng katta qoldiq — 100 so\'m uch teng qismga 34/33/33', () => {
    assert.deepEqual(allocateLargestRemainder(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(allocateLargestRemainder(700000, [600000, 400000]), [420000, 280000]);
    for (const total of [1, 99, 100001, 599999]) {
        const parts = allocateLargestRemainder(total, [3, 7, 11]);
        assert.equal(parts.reduce((a, b) => a + b, 0), total);
    }
    assert.deepEqual(allocateLargestRemainder(10, [0, 0]), [0, 0]);
});

test('Misol 7: maosh qoldig\'i = hisoblangan − avans − berilgan', () => {
    assert.equal(payrollRemaining(2000000, 500000, 0), 1500000);
    assert.equal(payrollRemaining(2000000, 500000, 1000000), 500000);
    assert.equal(payrollRemaining(2000000, 500000, 1500000), 0);
});

test('Misol 10: 4 darsdan keyin chiqish — 200 000, kredit 400 000, ustoz tuzatmasi −160 000', () => {
    const base = computeBase({ price: 600000, lessonsPerPackage: 12, billableLessons: 4, fullMonth: false });
    assert.equal(base, 200000);
    assert.equal(600000 - base, 400000);
    assert.equal(salaryFromBase(base, 4000) - salaryFromBase(600000, 4000), -160000);
});

test('roundSom: half-up, manfiyda nosimmetrik', () => {
    assert.equal(roundSom(0.5), 1);
    assert.equal(roundSom(1.49), 1);
    assert.equal(roundSom(-0.5), -1);
    assert.equal(roundSom(46153.846), 46154);
});
