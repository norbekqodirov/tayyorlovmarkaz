import { test } from 'node:test';
import assert from 'node:assert/strict';
import { methodKey, accountForMethod } from '../../server/domain/cashAccount.ts';

test("IP-22: to'lov usuli matni hisob kalitiga keltiriladi", () => {
    for (const m of ['Naqd', 'naqd pul', 'cash', '', null]) assert.equal(methodKey(m), 'naqd', String(m));
    for (const m of ['Karta', 'Terminal', 'Uzcard', 'HUMO', 'plastik']) assert.equal(methodKey(m), 'karta', m);
    for (const m of ['Bank', "O'tkazma", 'otkazma', 'Perechisleniye']) assert.equal(methodKey(m), 'bank', m);
    assert.equal(methodKey('Payme'), 'payme');
    assert.equal(methodKey('CLICK'), 'click');
    assert.equal(methodKey('Aralash'), 'aralash');
});

test('IP-22: hisobsiz eski yozuv mos birinchi faol hisobga tushadi', () => {
    const accounts = [
        { id: 'old', method: 'Naqd', isActive: false },
        { id: 'kassa', method: 'Naqd', isActive: true },
        { id: 'kassa2', method: 'naqd', isActive: true },
        { id: 'term', method: 'Karta', isActive: true },
    ];
    assert.equal(accountForMethod(accounts, 'Naqd')?.id, 'kassa');
    assert.equal(accountForMethod(accounts, 'Terminal')?.id, 'term');
    assert.equal(accountForMethod(accounts, 'Bank'), null);
    assert.equal(accountForMethod([{ id: 'x', method: 'Bank', isActive: false }], 'bank')?.id, 'x');
});
