import { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';

/**
 * Audit middleware factory.
 * Logs CRUD operations to the AuditLog table after a successful response.
 *
 * Usage:
 *   router.post('/students', withAudit('student'), createStudentHandler);
 *
 * Or wired automatically via the catch-all crud.ts router.
 */
export function withAudit(resource: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Only audit mutating methods
        if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
            return next();
        }

        const user = (req as any).user;
        const action = req.method === 'POST'
            ? 'create'
            : req.method === 'PUT' || req.method === 'PATCH'
            ? 'update'
            : req.method === 'DELETE'
            ? 'delete'
            : req.method.toLowerCase();

        // Snapshot the "before" state for updates/deletes
        let before: any = null;
        const id = req.params.id;
        if (id && (action === 'update' || action === 'delete')) {
            try {
                // @ts-ignore
                if (prisma[resource]) {
                    // @ts-ignore
                    before = await prisma[resource].findUnique({ where: { id } });
                }
            } catch {
                // Ignore — best-effort
            }
        }

        // Capture original res.json to log after success
        const origJson = res.json.bind(res);
        res.json = function (body: any) {
            const statusCode = res.statusCode;
            // Only log successful responses (2xx)
            if (statusCode >= 200 && statusCode < 300) {
                const after = action !== 'delete' ? body : null;
                const resourceId = id || body?.id || null;

                prisma.auditLog.create({
                    data: {
                        userId: user?.id || null,
                        userName: user?.name || 'system',
                        action,
                        resource,
                        resourceId,
                        before: before ? safeStringify(before) : null,
                        after: after ? safeStringify(after) : null,
                        ipAddress: getClientIp(req),
                        userAgent: req.headers['user-agent']?.toString() || null,
                        metadata: null,
                    },
                }).catch(err => {
                    console.error('Audit log failed:', err.message);
                });
            }
            return origJson(body);
        };

        next();
    };
}

/**
 * Manual audit log entry — for actions outside CRUD endpoints
 * (login, logout, restore, bulk operations, etc).
 */
export async function logAudit(opts: {
    userId?: string | null;
    userName: string;
    action: string;
    resource: string;
    resourceId?: string | null;
    before?: any;
    after?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: any;
}) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: opts.userId || null,
                userName: opts.userName,
                action: opts.action,
                resource: opts.resource,
                resourceId: opts.resourceId || null,
                before: opts.before ? safeStringify(opts.before) : null,
                after: opts.after ? safeStringify(opts.after) : null,
                ipAddress: opts.ipAddress || null,
                userAgent: opts.userAgent || null,
                metadata: opts.metadata ? safeStringify(opts.metadata) : null,
            },
        });
    } catch (err: any) {
        console.error('logAudit failed:', err.message);
    }
}

function safeStringify(obj: any): string {
    try {
        return JSON.stringify(obj, (_k, v) => {
            if (v instanceof Date) return v.toISOString();
            return v;
        });
    } catch {
        return '';
    }
}

function getClientIp(req: Request): string | null {
    const xfwd = req.headers['x-forwarded-for'];
    if (typeof xfwd === 'string') return xfwd.split(',')[0].trim();
    return req.socket?.remoteAddress || null;
}
