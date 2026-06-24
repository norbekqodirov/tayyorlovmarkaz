import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

/**
 * Get the singleton socket.io client.
 * Reads JWT token from localStorage and connects to the server.
 */
export function getSocket(): Socket {
    if (!socketInstance) {
        const token = localStorage.getItem('crm_token') || sessionStorage.getItem('crm_token');
        const baseUrl = (import.meta as any).env?.VITE_API_URL || window.location.origin.replace(':3000', ':3001');
        socketInstance = io(baseUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            timeout: 20000,
            autoConnect: true,
        });

        socketInstance.on('connect', () => {
            console.log('[Socket]: connected');
        });
        socketInstance.on('connect_error', (err) => {
            console.warn('[Socket]: connection error', err.message);
        });
        socketInstance.on('disconnect', (reason) => {
            console.log('[Socket]: disconnected', reason);
        });
    }
    return socketInstance;
}

export function disconnectSocket() {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
}

/**
 * Subscribe to a socket event with automatic cleanup.
 */
export function useSocket<T = any>(event: string, handler: (data: T) => void, deps: any[] = []) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const sock = getSocket();
        const wrapped = (data: T) => handlerRef.current(data);
        sock.on(event, wrapped);
        return () => { sock.off(event, wrapped); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event, ...deps]);
}

/**
 * Hook for tracking online users.
 */
export function usePresence(): { online: number; userIds: string[] } {
    const [state, setState] = useState<{ online: number; userIds: string[] }>({ online: 0, userIds: [] });
    useSocket<{ online: number; userIds: string[] }>('presence:update', (data) => setState(data));
    return state;
}

/**
 * Hook that auto-refreshes a list when its collection emits CRUD events.
 * Pass a refetch function or setter; it will be called on any of:
 * - `${collection}:created`, `${collection}:updated`, `${collection}:deleted`
 */
export function useLiveCollection(collection: string, refetch: () => void) {
    useSocket(`${collection}:created`, () => refetch(), [collection]);
    useSocket(`${collection}:updated`, () => refetch(), [collection]);
    useSocket(`${collection}:deleted`, () => refetch(), [collection]);
}

/**
 * Subscribe to multiple events with a single handler.
 */
export function useSocketEvents(events: Record<string, (data: any) => void>) {
    useEffect(() => {
        const sock = getSocket();
        const entries = Object.entries(events);
        entries.forEach(([ev, h]) => sock.on(ev, h));
        return () => {
            entries.forEach(([ev, h]) => sock.off(ev, h));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
