import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOnlyPrisma } from '../../server/utils/readOnlyPrisma.ts';

const calls: string[] = [];
const fake = {
    student: {
        findMany: async () => { calls.push('findMany'); return []; },
        count: async () => 0,
        create: async () => { calls.push('create'); },
        update: async () => { calls.push('update'); },
        deleteMany: async () => { calls.push('deleteMany'); },
    },
    $queryRawUnsafe: async (sql: string) => { calls.push(sql); return []; },
    $executeRawUnsafe: async () => { calls.push('exec'); },
    $transaction: async () => { calls.push('tx'); },
    $disconnect: async () => {},
};

test('readOnlyPrisma: o\'qish ishlaydi, yozish bloklanadi', async () => {
    const db: any = readOnlyPrisma(fake);
    await db.student.findMany();
    assert.equal(await db.student.count(), 0);
    assert.throws(() => db.student.create({}));
    assert.throws(() => db.student.update({}));
    assert.throws(() => db.student.deleteMany({}));
    assert.throws(() => db.$executeRawUnsafe('DELETE FROM Student'));
    assert.throws(() => db.$transaction([]));
    await db.$queryRawUnsafe('PRAGMA journal_mode');
    await db.$queryRawUnsafe('SELECT 1');
    assert.throws(() => db.$queryRawUnsafe('PRAGMA journal_mode = WAL'));
    assert.throws(() => db.$queryRawUnsafe('DELETE FROM Student'));
    assert.throws(() => db.$queryRawUnsafe('SELECT 1; DROP TABLE Student'));
    await db.$disconnect();
    assert.deepEqual(calls, ['findMany', 'PRAGMA journal_mode', 'SELECT 1']);
});
