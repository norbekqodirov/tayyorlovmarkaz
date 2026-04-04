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
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
        // Redirect to login only if currently in CRM
        if (window.location.pathname.startsWith('/crmtayyorlovmarkaz') &&
            !window.location.pathname.includes('/login')) {
            window.location.href = '/crmtayyorlovmarkaz/login';
        }
    }
    return Promise.reject(error);
});

export default api;
