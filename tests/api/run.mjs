// Lokal API sinovlarini ketma-ket ishga tushiradi (backend :3001'da ishlab turgan
// bo'lishi kerak: `npm run server`). Ishlatish: `npm run test:api`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = fs.readdirSync(dir).filter(f => /^ip\d+(_\w+)?\.mjs$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  console.log(`\n── ${f} ──`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(`\n${files.length - failed}/${files.length} fayl muvaffaqiyatli`);
process.exit(failed ? 1 : 0);
