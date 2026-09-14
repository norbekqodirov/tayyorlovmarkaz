import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Ensure upload directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed extensions and corresponding MIME types (NO SVG — XSS vector)
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf'],
    '.doc': ['application/msword'],
    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    '.xls': ['application/vnd.ms-excel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
        const name = `${Date.now()}-${safeBase || 'file'}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        cb(null, name);
    }
});

// Rad etish sababini 400 (noto'g'ri so'rov) sifatida qaytarish uchun — oddiy
// Error status'siz bo'lgani sababli global xato handler (server/index.ts)
// buni standart 500'ga aylantirar edi, garchi bu mijoz xatosi bo'lsa ham.
class UploadRejectedError extends Error {
    status = 400;
}

// File filter: strict whitelist, explicitly reject SVG
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === '.svg' || file.mimetype === 'image/svg+xml') {
        return cb(new UploadRejectedError('SVG formati xavfsizlik sababli ruxsat etilmaydi'));
    }

    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
        return cb(new UploadRejectedError('Ruxsat etilmagan fayl formati yoki MIME turi (faqat jpg, png, gif, webp, pdf, doc, docx, xls, xlsx)'));
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

function isSafeUploadPath(filename: string): boolean {
    const base = path.basename(filename);
    if (base !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return false;
    }
    const resolved = path.resolve(UPLOAD_DIR, base);
    return resolved.startsWith(UPLOAD_DIR + path.sep);
}

// POST /api/upload - single file upload
router.post('/', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Fayl yuklanmadi' });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size });
});

// POST /api/upload/multiple - multiple files upload
router.post('/multiple', requireAuth, upload.array('files', 10), (req, res) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Fayllar yuklanmadi' });
    }
    const urls = files.map(f => ({
        url: `/uploads/${f.filename}`,
        filename: f.filename,
        size: f.size
    }));
    res.json(urls);
});

// DELETE /api/upload/:filename - delete file
router.delete('/:filename', requireAuth, (req, res) => {
    const user = (req as any).user;
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
    if (!user || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Faylni o\'chirish uchun ruxsat yetarli emas' });
    }

    const { filename } = req.params;
    if (!isSafeUploadPath(filename)) {
        return res.status(400).json({ error: 'Noto\'g\'ri fayl nomi (path traversal aniqlandi)' });
    }

    const filePath = path.resolve(UPLOAD_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Fayl topilmadi' });
});

export default router;
