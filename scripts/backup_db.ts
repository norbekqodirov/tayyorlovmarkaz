/**
 * IP-05 (PL-01) — buyruq qatoridan izchil backup.
 *
 * deploy.sh har deploy oldidan chaqiradi (xato bo'lsa deploy to'xtaydi):
 *   node_modules/.bin/tsx scripts/backup_db.ts pre-deploy
 *
 * Qo'lda:
 *   npx tsx scripts/backup_db.ts            # 'manual' nusxa (+ uploads arxivi)
 *
 * Nusxa `backups/` papkasiga yoziladi; `BACKUP_COPY_DIR` o'rnatilgan bo'lsa,
 * ikkinchi joyga ham ko'chiriladi. Batafsil: docs/RUNBOOK_BACKUP_RESTORE.md
 */
import 'dotenv/config';
import prisma from '../server/db.js';
import { createConsistentBackup, type BackupReason } from '../server/services/dbBackup.js';

const arg = (process.argv[2] || 'manual') as BackupReason;
const reason: BackupReason = ['manual', 'daily', 'pre-deploy'].includes(arg) ? arg : 'manual';

createConsistentBackup(reason, { includeUploads: reason !== 'pre-deploy' })
    .then(r => {
        console.log(`Backup tayyor: backups/${r.name} — ${(r.size / 1024 / 1024).toFixed(2)} MB, yaxlitlik: ${r.integrity}${r.uploads ? `, fayllar: ${r.uploads.name}` : ''}${r.copiedTo ? `, tashqi nusxa: ${r.copiedTo}` : ''}`);
    })
    .catch(err => {
        console.error(`BACKUP XATOSI: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
