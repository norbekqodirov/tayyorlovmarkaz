import express from 'express';
import path from 'path';
import fs from 'fs';
import { requireAuth, requireMinRole } from '../middleware/auth.js';
import { getDbConfig, createConsistentBackup, BACKUP_DIR } from '../services/dbBackup.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();
const MAX_BACKUPS = 14;

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

// GET /api/backup/status
router.get('/status', requireAuth, requireMinRole('ADMIN'), (_req, res) => {
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql') || f.endsWith('.backup') || f.endsWith('.db') || f.endsWith('.zip'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return { name: f, size: stat.size, sizeMB: (stat.size / 1024 / 1024).toFixed(2), createdAt: stat.birthtime };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const db = getDbConfig();
        res.json({
            engine: db?.type || 'unknown',
            database: db?.database || 'unknown',
            host: db?.type === 'postgres' ? db.host : 'local file',
            backups: files,
            backupCount: files.length,
            maxBackups: MAX_BACKUPS,
            offsiteCopy: !!process.env.BACKUP_COPY_DIR,
            dailySchedule: process.env.BACKUP_DAILY === 'off' ? null : '03:30 (Toshkent)',
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/backup/create
// IP-05 (PL-01): izchil nusxa — SQLite uchun VACUUM INTO + integrity_check,
// PostgreSQL uchun pg_dump; yuklangan fayllar ham arxivlanadi.
router.post('/create', requireAuth, requireMinRole('ADMIN'), async (req, res) => {
    try {
        const result = await createConsistentBackup('manual', { includeUploads: true });
        const user = (req as any).user;
        await logAudit({ userId: user?.id, userName: user?.name || 'system', action: 'backup', resource: 'database', resourceId: result.name, metadata: { size: result.size, integrity: result.integrity, uploads: result.uploads?.name || null } });
        res.json({
            message: 'Backup muvaffaqiyatli yaratildi',
            backup: {
                name: result.name,
                size: result.size,
                sizeMB: (result.size / 1024 / 1024).toFixed(2),
                createdAt: result.createdAt,
                integrity: result.integrity,
                uploads: result.uploads,
                copiedTo: result.copiedTo ? 'offsite' : null,
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: `Backup xatoligi: ${err.message}` });
    }
});

router.get('/backups/:filename/download', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    try {
        const filename = req.params.filename.replace(/[/\\]/g, '');
        const filePath = path.join(BACKUP_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Backup topilmadi' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.sendFile(filePath);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/backup/backups/:filename
router.delete('/backups/:filename', requireAuth, requireMinRole('ADMIN'), (req, res) => {
    try {
        const filename = req.params.filename.replace(/[/\\]/g, '');
        const filePath = path.join(BACKUP_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'Backup topilmadi' });
        }

        fs.unlinkSync(filePath);
        res.json({ message: "Backup o'chirildi" });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
