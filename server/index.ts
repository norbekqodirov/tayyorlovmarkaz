import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import crudRoutes from './routes/crud.js';
import uploadRoutes from './routes/upload.js';
import analyticsRoutes from './routes/analytics.js';
import telegramRoutes from './routes/telegram.js';
import reportsRoutes from './routes/reports.js';
import path from 'path';
import fs from 'fs';
import { startScheduler } from './services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    process.env.APP_URL || 'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Login: max 10 ta urinish 15 daqiqada
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Juda ko'p login urinish. 15 daqiqadan keyin qayta urining." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Umumiy API: max 200 so'rov/daqiqa
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { message: "So'rovlar chegarasi oshib ketdi. Bir oz kuting." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Production da production limitlash qil
        if (!IS_PROD) return true;
        return false;
    },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);

// Health check (rate limitdan tashqari)
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        message: 'API is running!',
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});

// Static files
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);  // Login uchun alohida limit
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api', crudRoutes);

// ── Production: serve Vite build & SPA fallback ───────────────────────────────
if (IS_PROD) {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            const indexPath = path.join(distPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).json({ message: 'Frontend build not found. Run `npm run build` first.' });
            }
        });
    } else {
        console.warn('[Server] WARNING: dist/ folder not found. Run `npm run build` to create it.');
    }
}

// ── Start server & scheduler ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Server]: Running in ${IS_PROD ? 'PRODUCTION' : 'development'} mode`);
    console.log(`[Server]: http://localhost:${PORT}`);

    // Scheduler (cron jobs) ni ishga tushirish
    startScheduler();
});
