import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruneBackups } from '../../server/services/dbBackup.ts';

test('pruneBackups: eski formatdagi va qo\'lda olingan nusxalarga tegmaydi', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
    try {
        const legacy = ['backup-2026-06-20T21-00-00.db', 'backup-2026-09-07T16-55-22.db', 'prod.db.bak2', 'prod.db.bak-20260921-0742'];
        for (const f of legacy) fs.writeFileSync(path.join(dir, f), 'x');
        for (let d = 1; d <= 16; d++) {
            const day = String(d).padStart(2, '0');
            fs.writeFileSync(path.join(dir, `backup-2026-10-${day}T03-30-00-daily.db`), 'x');
        }
        fs.writeFileSync(path.join(dir, 'backup-2026-10-02T09-00-00-pre-deploy.db'), 'x');

        pruneBackups(dir, 14);
        const left = fs.readdirSync(dir);
        for (const f of legacy) assert.ok(left.includes(f), `${f} o'chirilmasligi kerak`);
        const daily = left.filter(f => f.endsWith('-daily.db')).sort();
        assert.equal(daily.length, 14);
        assert.equal(daily[0], 'backup-2026-10-03T03-30-00-daily.db'); // eng eski 2 tasi o'chdi
        assert.ok(left.includes('backup-2026-10-02T09-00-00-pre-deploy.db'), 'boshqa sabab alohida sanaladi');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
