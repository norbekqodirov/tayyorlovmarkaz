import express from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();
const execFileAsync = promisify(execFile);

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 7;

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

function getDbConfig() {
    const url = process.env.DATABASE_URL || '';
    // postgresql://user:password@host:port/dbname?schema=public
    // URL parser query (?schema=...) va kodlangan belgilarni to'g'ri ajratadi
    try {
        const u = new URL(url);
        if (!u.protocol.startsWith('postgres')) return null;
        const database = decodeURIComponent(u.pathname.replace(/^\//, '')).split('?')[0];
        if (!database) return null;
        return {
            user: decodeURIComponent(u.username),
            password: decodeURIComponent(u.password),
            host: u.hostname,
            port: u.port || '5432',
            database,
        };
    } catch {
        return null;
    }
}

// GET /api/backup/status
router.get('/status', requireAuth, requireMinRole('ADMIN'), (_req, res) => {
    try {
        ensureBackupDir();
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql') || f.endsWith('.backup'))
            .map(f => {
                const stat = fs.statSync(path.join(BACKUP_DIR, f));
                return { name: f, size: stat.size, sizeMB: (stat.size / 1024 / 1024).toFixed(2), createdAt: stat.birthtime };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const db = getDbConfig();
        res.json({
            database: db?.database || 'unknown',
            host: db?.host || 'unknown',
            backups: files,
            backupCount: files.length,
            maxBackups: MAX_BACKUPS,
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/backup/create
router.post('/create', requireAuth, requireMinRole('ADMIN'), async (_req, res) => {
    try {
        const db = getDbConfig();
        if (!db) return res.status(500).json({ message: 'DATABASE_URL konfiguratsiya qilinmagan' });

        ensureBackupDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);

        const env = { ...process.env, PGPASSWORD: db.password };
        await execFileAsync(
            'pg_dump',
            ['-h', db.host, '-p', db.port, '-U', db.user, '-F', 'p', '-f', backupPath, db.database],
            { env }
        );

        // Eski backuplarni o'chirish
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
            .sort().reverse();
        if (files.length > MAX_BACKUPS) {
            files.slice(MAX_BACKUPS).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
        }

        const stat = fs.statSync(backupPath);
        res.json({
            message: 'Backup muvaffaqiyatli yaratildi',
            backup: {
                name: `backup-${timestamp}.sql`,
                size: stat.size,
                sizeMB: (stat.size / 1024 / 1024).toFixed(2),
                createdAt: new Date(),
            },
        });
    } catch (err: any) {
        res.status(500).json({ message: `pg_dump xatoligi: ${err.message}` });
    }
});

// GET /api/backup/backups/:filename/download
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
