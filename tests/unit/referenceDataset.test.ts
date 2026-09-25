/**
 * IP-07 referens dataset — tests/reference/billing_scenarios.json dagi har
 * ssenariy (qo'lda hisoblangan kutilgan natijalar) domen formulalari bilan
 * solishtiriladi. Qarorlar: docs/ADR_HISOB_QOIDALARI.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    computeCharge, splitNetByTeachers, salaryFromBase, applyPayment, chargeDebt, studentPosition,
    autoApplyCredit, chargeDueDate, isOverdue, correctionDelta, payrollRemaining,
    type ChargeInput, type ChargeState,
} from '../../server/domain/billingFormula.ts';

const dataset = JSON.parse(fs.readFileSync(path.resolve('tests/reference/billing_scenarios.json'), 'utf8'));

function toInput(c: any): ChargeInput {
    return {
        price: c.price, lessonsPerPackage: c.N, billableLessons: c.R, fullMonth: c.fullMonth,
        absences: c.absences ?? 0, threshold: c.threshold ?? 3,
        extraLessons: c.extraLessons, otherDiscounts: c.discounts,
    };
}

function runMonth(s: any) {
    const perCharge: Record<string, any> = {};
    let states: Record<string, ChargeState> = {};
    let salaryTotal = 0;
    for (const c of s.charges) {
        const r = computeCharge(toInput(c));
        const lessons = Object.fromEntries(Object.entries(c.teachers || {}).map(([t, v]: any) => [t, v.lessons]));
        const shares = splitNetByTeachers(r.teacherBase, lessons);
        const salary: Record<string, number> = Object.fromEntries(Object.entries(c.teachers || {}).map(([t, v]: any) => [t, salaryFromBase(shares[t], v.rateBp)]));
        salaryTotal += Object.values(salary).reduce((a, b) => a + b, 0);
        perCharge[c.id] = { ...r, salary };
        states[c.id] = { net: r.net, allocated: 0 };
    }
    let paymentsTotal = 0;
    for (const p of s.payments || []) {
        states = applyPayment(p.amount, p.allocations.map((a: any) => ({ chargeId: a.charge, amount: a.amount })), states).charges;
        paymentsTotal += p.amount;
    }
    for (const id of Object.keys(perCharge)) perCharge[id].debt = chargeDebt(states[id]);
    return { perCharge, position: studentPosition(Object.values(states), paymentsTotal, s.refunds ?? 0), salaryTotal };
}

test('dataset kamida 25 ssenariy va noyob ID', () => {
    const ids = dataset.scenarios.map((s: any) => s.id);
    assert.ok(ids.length >= 25);
    assert.equal(new Set(ids).size, ids.length);
});

for (const s of dataset.scenarios) {
    test(`${s.id}: ${s.title}`, () => {
        const e = s.expect;
        switch (s.type) {
            case 'month': {
                const { perCharge, position, salaryTotal } = runMonth(s);
                for (const [id, ex] of Object.entries<any>(e.charges || {})) {
                    const got = perCharge[id];
                    for (const k of ['gross', 'net', 'teacherBase', 'debt']) if (k in ex) assert.equal(got[k], ex[k], `${id}.${k}`);
                    if (ex.lines) assert.deepEqual(got.lines.map((l: any) => l.amount), ex.lines, `${id}.lines`);
                    if (ex.salary) assert.deepEqual(got.salary, ex.salary, `${id}.salary`);
                }
                assert.equal(position.debt, e.debt, 'debt');
                assert.equal(position.credit, e.credit, 'credit');
                assert.equal(position.balance, e.balance, 'balance');
                assert.equal(salaryTotal, e.salaryTotal, 'salaryTotal');
                break;
            }
            case 'correction': {
                const d = correctionDelta(toInput(s.original), toInput(s.corrected));
                assert.equal(d.studentDelta, e.studentDelta, 'studentDelta');
                assert.equal(salaryFromBase(d.teacherBaseDelta, s.rateBp), e.teacherDelta, 'teacherDelta');
                break;
            }
            case 'due': {
                const i = s.input;
                const due = chargeDueDate({ year: i.year, month: i.month, fullMonth: i.fullMonth, startDate: i.startDate });
                assert.equal(due, e.dueDate);
                assert.equal(isOverdue(due, i.today, i.debt), e.overdue);
                break;
            }
            case 'payroll':
                assert.equal(payrollRemaining(s.input.accrued, s.input.advanceApplied, s.input.paid), e.remaining);
                break;
            case 'credit':
                assert.equal(autoApplyCredit(s.input.credit, s.input.debt), e.applied);
                break;
            case 'invalid':
                assert.throws(() => (s.charge ? computeCharge(toInput(s.charge)) : runMonth(s)));
                break;
            default:
                assert.fail(`Noma'lum ssenariy turi: ${s.type}`);
        }
    });
}
