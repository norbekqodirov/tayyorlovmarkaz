import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';

let io: Server | null = null;

interface AuthSocket extends Socket {
    data: {
        user?: { id: string; name: string; role: string };
    };
}

// Track online users for presence
const onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

export function initRealtime(httpServer: HttpServer) {
    const allowedOrigins = [
        process.env.APP_URL || 'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
    ].filter(Boolean);

    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
                callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
        },
        path: '/api/socket.io',
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    // JWT auth middleware
    io.use(async (socket: AuthSocket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
            if (!token) return next(new Error('No token'));

            const secret = process.env.JWT_SECRET || 'dev-only-secret-key';
            const decoded: any = jwt.verify(token, secret);

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId || decoded.id },
                select: { id: true, name: true, role: true, isActive: true },
            });

            if (!user || !user.isActive) return next(new Error('Unauthorized'));

            socket.data.user = { id: user.id, name: user.name, role: user.role };
            next();
        } catch (err: any) {
            next(new Error('Auth failed: ' + err.message));
        }
    });

    io.on('connection', (socket: AuthSocket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }

        // Join personal & role rooms
        socket.join(`user:${user.id}`);
        socket.join(`role:${user.role}`);
        if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') {
            socket.join('admins');
        }

        // Track presence
        if (!onlineUsers.has(user.id)) onlineUsers.set(user.id, new Set());
        onlineUsers.get(user.id)!.add(socket.id);
        broadcastPresence();

        // Heartbeat & manual ping
        socket.on('ping', () => socket.emit('pong'));

        // Subscribe/unsubscribe to channels
        socket.on('subscribe', (channel: string) => {
            if (typeof channel === 'string' && /^[a-zA-Z0-9:_-]+$/.test(channel)) {
                socket.join(channel);
            }
        });
        socket.on('unsubscribe', (channel: string) => {
            socket.leave(channel);
        });

        socket.on('disconnect', () => {
            const set = onlineUsers.get(user.id);
            if (set) {
                set.delete(socket.id);
                if (set.size === 0) onlineUsers.delete(user.id);
            }
            broadcastPresence();
        });
    });

    console.log('[Realtime]: WebSocket server initialized');
    return io;
}

function broadcastPresence() {
    if (!io) return;
    const userIds = Array.from(onlineUsers.keys());
    io.emit('presence:update', {
        online: userIds.length,
        userIds,
    });
}

// ─── Helpers for emitting events ──────────────────────────────────────────────

export function emitToUser(userId: string, event: string, data: any) {
    if (!io) return;
    io.to(`user:${userId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: any) {
    if (!io) return;
    io.to(`role:${role}`).emit(event, data);
}

export function emitToAdmins(event: string, data: any) {
    if (!io) return;
    io.to('admins').emit(event, data);
}

export function emitToAll(event: string, data: any) {
    if (!io) return;
    io.emit(event, data);
}

export function emitToChannel(channel: string, event: string, data: any) {
    if (!io) return;
    io.to(channel).emit(event, data);
}

export function getOnlineUserCount(): number {
    return onlineUsers.size;
}

export function isUserOnline(userId: string): boolean {
    return onlineUsers.has(userId);
}

export function getOnlineUserIds(): string[] {
    return Array.from(onlineUsers.keys());
}

export function getSocketIO(): Server | null {
    return io;
}
