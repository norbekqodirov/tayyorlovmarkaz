import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true,
});

// Request interceptor to attach JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('crm_token');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor to handle 401 Unauthorized
api.interceptors.response.use((response) => response, (error) => {
    if (error.response && error.response.status === 401) {
        // Dispatch custom event for React Router to handle
        window.dispatchEvent(new Event('auth-unauthorized'));
    }
    return Promise.reject(error);
});

/**
 * IP-12: pul komandalari uchun Idempotency-Key. Forma OCHILGANDA bitta kalit
 * yarating va shu formaning har bir yuborishida ishlating — ikki marta bosish
 * yoki tarmoq qayta yuborishi ikkinchi to'lov yaratmaydi (server birinchi javobni qaytaradi).
 */
export function newIdempotencyKey(): string {
    try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* eski brauzer */ }
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function idempotencyHeaders(key: string) {
    return { headers: { 'Idempotency-Key': key } };
}

export default api;
