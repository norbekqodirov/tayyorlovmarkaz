import path from 'path';

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
