import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategoryKind } from '../../server/services/categories.ts';

test("TQ-E: production'dagi haqiqiy kategoriya nomlari to'g'ri turga tushadi", () => {
    // Production (2026-09-25): kurs to'lovi uchun ishlatiladigan kategoriya
    assert.equal(guessCategoryKind("O'quvchi kurs puli to'ladi", 'income'), 'TUITION');
    assert.equal(guessCategoryKind('O‘quvchi kurs puli to‘ladi', 'income'), 'TUITION'); // o‘ (U+2018) varianti
    assert.equal(guessCategoryKind("Kurs to'lovi", 'income'), 'TUITION');
    // Kitoblar — boshqa kirim (qarzga ta'sir qilmaydi)
    assert.equal(guessCategoryKind('A1 English book', 'income'), 'OTHER_INCOME');
    assert.equal(guessCategoryKind('Whimys , Enchanted 3-sinf', 'income'), 'OTHER_INCOME');
    // Kirimdagi "qarz qaytarildi" — o'quvchiga qaytarish emas
    assert.equal(guessCategoryKind('Qarz qaytarildi', 'income'), 'OTHER_INCOME');
    assert.equal(guessCategoryKind("To'lov qaytarish", 'income'), 'REFUND');
    assert.equal(guessCategoryKind('Oylik', 'expense'), 'PAYROLL_PAYOUT');
    assert.equal(guessCategoryKind('Avans', 'expense'), 'STAFF_ADVANCE');
    assert.equal(guessCategoryKind('Ijara', 'expense'), 'OPERATING_EXPENSE');
});
