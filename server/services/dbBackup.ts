import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import prisma from '../db.js';
import { todayDateStr, nowTimeStr } from '../utils/timezone.js';

export type PgConfig = { type: 'postgres'; user: string; password: string; host: string; port: string; database: string };
export type SqliteConfig = { type: 'sqlite'; filePath: string; database: string };

// DATABASE_URL ikki shaklda bo'lishi mumkin: postgresql://... (lokal/production Postgres)
// yoki file:./prod.db (production serverda root yo'qligi sababli SQLite'ga moslashtirilgan
// deploy — deploy.sh schema.prisma'ni SQLite'ga almashtiradi, docs/PROJECT_STATUS.md §0 ga q.).
export function getDbConfig(): PgConfig | SqliteConfig | null {
    const url = process.env.DATABASE_URL || '';

    if (url.startsWith('file:')) {
        // Prisma "file:" URL'lari prisma/ papkasiga nisbatan hisoblanadi
        const relative = url.slice('file:'.length);
        const filePath = path.isAbsolute(relative)
            ? relative
            : path.join(process.cwd(), 'prisma', relative);
        return { type: 'sqlite', filePath, database: path.basename(filePath) };
    }

    // postgresql://user:password@host:port/dbname?schema=public
    // URL parser query (?schema=...) va kodlangan belgilarni to'g'ri ajratadi
    try {
        const u = new URL(url);
        if (!u.protocol.startsWith('postgres')) return null;
        const database = decodeURIComponent(u.pathname.replace(/^\//, '')).split('?')[0];
        if (!database) return null;
        return {
            type: 'postgres',
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

// ─── IP-05 (PL-01, FA:DATA-04): izchil backup ─────────────────────────────────
//
// Ilgari SQLite backup faol baza faylini `copyFileSync` bilan nusxalardi —
// shu payt yozuv bo'lsa nusxa buzilgan/yarim bo'lishi mumkin edi (SQLite
// hujjati: https://www.sqlite.org/backup.html). Endi `VACUUM INTO` — SQLite'ning
// o'zi izchil (bir onlik) nusxa yaratadi, keyin nusxa `PRAGMA integrity_check`
// bilan tekshiriladi. Avtomatik: har kuni (scheduler) va har deploy oldidan
// (deploy.sh → scripts/backup_db.ts). `BACKUP_COPY_DIR` o'rnatilsa, nusxa
// ikkinchi joyga (masalan boshqa disk/ulangan papka) ham ko'chiriladi.

export const BACKUP_DIR = path.join(process.cwd(), 'backups');
const KEEP_PER_KIND = 14;
const execFileAsync = promisify(execFile);

export type BackupReason = 'manual' | 'daily' | 'pre-deploy' | 'download';

export interface BackupResult {
    name: string;
    path: string;
    size: number;
    engine: 'sqlite' | 'postgres';
    integrity: 'ok' | 'unchecked' | string;
    uploads: { name: string; size: number } | null;
    copiedTo: string | null;
    createdAt: string;
}

/** Fayl nomi uchun Toshkent vaqti: 2026-09-25T03-30-07 */
function stamp(d = new Date()) {
    return `${todayDateStr(d)}T${nowTimeStr(d).replace(':', '-')}-${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** SQLite nusxasini mustaqil tekshirish (Node 22.5+ `node:sqlite` bo'lsa). */
async function checkSqliteFile(file: string): Promise<'ok' | 'unchecked' | string> {
    try {
        const mod: any = await import('node:sqlite');
        const db = new mod.DatabaseSync(file, { readOnly: true });
        try {
            const rows = db.prepare('PRAGMA integrity_check').all() as any[];
            const first = rows?.[0] ? Object.values(rows[0])[0] : null;
            return first === 'ok' ? 'ok' : String(first ?? 'noma\'lum');
        } finally {
            db.close();
        }
    } catch {
        return 'unchecked';
    }
}

async function archiveUploads(ts: string, reason: BackupReason): Promise<{ name: string; size: number } | null> {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) return null;
    const { ZipArchive } = await import('archiver');
    const name = `uploads-${ts}-${reason}.zip`;
    const out = path.join(BACKUP_DIR, name);
    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(out);
        const archive = new ZipArchive({ zlib: { level: 6 } });
        output.on('close', () => resolve());
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(uploadsDir, false);
        archive.finalize();
    });
    return { name, size: fs.statSync(out).size };
}

/**
 * Eng eski nusxalarni o'chirish — har tur va sabab bo'yicha oxirgi KEEP_PER_KIND
 * tasi qoladi. Faqat shu modul yaratgan nomlar (`...-daily.db`, `...-manual.zip`
 * kabi) hisobga olinadi: eski formatdagi (`backup-2026-06-20T21-00-00.db`) va
 * qo'lda olingan (`prod.db.bak*`) nusxalarga hech qachon tegilmaydi.
 */
export function pruneBackups(dir = BACKUP_DIR, keep = KEEP_PER_KIND) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    const reasons: BackupReason[] = ['manual', 'daily', 'pre-deploy'];
    const kinds: Array<(f: string) => boolean> = reasons.flatMap(r => [
        (f: string) => f.startsWith('backup-') && (f.endsWith(`-${r}.db`) || f.endsWith(`-${r}.sql`)),
        (f: string) => f.startsWith('uploads-') && f.endsWith(`-${r}.zip`),
    ]);
    for (const match of kinds) {
        files.filter(match).sort().reverse().slice(keep).forEach(f => {
            try { fs.unlinkSync(path.join(dir, f)); } catch { /* jim */ }
        });
    }
}

/**
 * Izchil baza nusxasi (+ ixtiyoriy yuklangan fayllar arxivi). Xato bo'lsa
 * istisno otadi — chaqiruvchi (deploy, scheduler) buni ko'rsatishi shart.
 */
export async function createConsistentBackup(reason: BackupReason, opts: { includeUploads?: boolean; dir?: string } = {}): Promise<BackupResult> {
    const db = getDbConfig();
    if (!db) throw new Error('DATABASE_URL konfiguratsiya qilinmagan');
    const dir = opts.dir || BACKUP_DIR;
    ensureDir(dir);
    const ts = stamp();

    let name: string;
    let file: string;
    let integrity: BackupResult['integrity'] = 'unchecked';

    if (db.type === 'sqlite') {
        name = `backup-${ts}-${reason}.db`;
        file = path.join(dir, name);
        // VACUUM INTO — SQLite o'zi bir onlik izchil nusxa yaratadi (faol
        // yozuvlar bilan to'qnashmaydi). Mavjud faylga yozmaydi.
        await prisma.$executeRawUnsafe('VACUUM INTO ?', file.split(path.sep).join('/'));
        integrity = await checkSqliteFile(file);
        if (integrity !== 'ok' && integrity !== 'unchecked') {
            throw new Error(`Backup nusxasi yaxlitlik tekshiruvidan o'tmadi: ${integrity}`);
        }
    } else {
        name = `backup-${ts}-${reason}.sql`;
        file = path.join(dir, name);
        await execFileAsync('pg_dump', ['-h', db.host, '-p', db.port, '-U', db.user, '-F', 'p', '-f', file, db.database], {
            env: { ...process.env, PGPASSWORD: db.password },
        });
        const size = fs.statSync(file).size;
        integrity = size > 0 ? 'ok' : "bo'sh fayl";
        if (size === 0) throw new Error("pg_dump bo'sh fayl qaytardi");
    }

    const uploads = opts.includeUploads
        ? await archiveUploads(ts, reason).catch((e: any) => { console.error('[Backup] uploads arxivi yaratilmadi:', e?.message); return null; })
        : null;

    let copiedTo: string | null = null;
    const copyDir = process.env.BACKUP_COPY_DIR;
    if (copyDir) {
        try {
            ensureDir(copyDir);
            fs.copyFileSync(file, path.join(copyDir, name));
            if (uploads) fs.copyFileSync(path.join(dir, uploads.name), path.join(copyDir, uploads.name));
            pruneBackups(copyDir);
            copiedTo = copyDir;
        } catch (e: any) {
            console.error('[Backup] BACKUP_COPY_DIR ga nusxalab bo\'lmadi:', e.message);
        }
    }

    if (dir === BACKUP_DIR) pruneBackups(dir);

    return {
        name, path: file, size: fs.statSync(file).size, engine: db.type,
        integrity, uploads, copiedTo, createdAt: new Date().toISOString(),
    };
}

/** Bugun (Toshkent) uchun kunlik backup allaqachon bormi — restart'da takrorlanmasligi uchun. */
export function hasBackupForDate(dateStr: string, reason: BackupReason = 'daily'): boolean {
    if (!fs.existsSync(BACKUP_DIR)) return false;
    return fs.readdirSync(BACKUP_DIR).some(f => f.startsWith(`backup-${dateStr}`) && f.includes(`-${reason}.`));
}
