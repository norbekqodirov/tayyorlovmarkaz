import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import crudRoutes from './routes/crud.js';
import uploadRoutes from './routes/upload.js';
import analyticsRoutes from './routes/analytics.js';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// CORS - allow both dev and production origins
const allowedOrigins = [
    process.env.APP_URL || 'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, mobile apps)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Public health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'API is running!', env: process.env.NODE_ENV, timestamp: new Date().toISOString() });
});

// Static files (uploaded images)
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Routers
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', crudRoutes);

// ── Production: serve Vite build & SPA fallback ─────────────────────────
if (IS_PROD) {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        // SPA fallback — all non-API routes serve index.html
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

app.listen(PORT, () => {
    console.log(`[Server]: Running in ${IS_PROD ? 'PRODUCTION' : 'development'} mode`);
    console.log(`[Server]: http://localhost:${PORT}`);
});
