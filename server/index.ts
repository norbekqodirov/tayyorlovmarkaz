import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import crudRoutes from './routes/crud.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Public health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API is running successfully!', timestamp: new Date().toISOString() });
});

// Routers
app.use('/api/auth', authRoutes);
app.use('/api', crudRoutes);

app.listen(PORT, () => {
    console.log(`[Server]: Server is running at http://localhost:${PORT}`);
});
