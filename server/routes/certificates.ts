import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateCertificate, generateBatch } from '../services/certificateService.js';
import { emitToAdmins, emitToUser } from '../services/realtime.js';
import { logAudit } from '../middleware/audit.js';
import * as archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ─── Certificate Templates ────────────────────────────────────────────────────

router.get('/templates', requireAuth, async (_req, res) => {
    try {
        const templates = await prisma.certificateTemplate.findMany({
            orderBy: { createdAt: 'desc' },
        });
        res.json(templates.map(t => ({
            ...t,
            config: (() => { try { return JSON.parse(t.config); } catch { return { elements: [] }; } })(),
        })));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/templates/:id', requireAuth, async (req, res) => {
    try {
        const t = await prisma.certificateTemplate.findUnique({ where: { id: req.params.id } });
        if (!t) return res.status(404).json({ message: 'Topilmadi' });
        res.json({
            ...t,
            config: (() => { try { return JSON.parse(t.config); } catch { return { elements: [] }; } })(),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/templates', requireAuth, requireRole, async (req, res) => {
    try {
        const { name, type, background, config, width, height, isActive } = req.body;
        const template = await prisma.certificateTemplate.create({
            data: {
                name: name || 'Yangi shablon',
                type: type || 'certificate',
                background: background || null,
                config: typeof config === 'string' ? config : JSON.stringify(config || { elements: [] }),
                width: width || 842,
                height: height || 595,
                isActive: isActive !== false,
            },
        });
        res.json(template);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/templates/:id', requireAuth, requireRole, async (req, res) => {
    try {
        const { config, ...rest } = req.body;
        const data: any = { ...rest };
        if (config !== undefined) {
            data.config = typeof config === 'string' ? config : JSON.stringify(config);
        }
        const template = await prisma.certificateTemplate.update({
            where: { id: req.params.id },
            data,
        });
        res.json(template);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/templates/:id', requireAuth, requireRole, async (req, res) => {
    try {
        await prisma.certificateTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Certificates (Issued) ────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
    try {
        const { studentId, courseId, templateId, page = '1', limit = '20' } = req.query as Record<string, string>;
        const where: any = {};
        if (studentId) where.studentId = studentId;
        if (courseId) where.courseId = courseId;
        if (templateId) where.templateId = templateId;
        const pageN = parseInt(page) || 1;
        const limitN = Math.min(parseInt(limit) || 20, 100);

        const [total, data] = await Promise.all([
            prisma.certificate.count({ where }),
            prisma.certificate.findMany({
                where,
                orderBy: { issuedAt: 'desc' },
                skip: (pageN - 1) * limitN,
                take: limitN,
                include: {
                    student: { select: { id: true, name: true, phone: true } },
                    course: { select: { id: true, name: true } },
                    template: { select: { id: true, name: true } },
                },
            }),
        ]);
        res.json({ total, page: pageN, limit: limitN, data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/generate', requireAuth, requireRole, async (req, res) => {
    try {
        const { templateId, studentIds, courseId, grade, signature, metadata } = req.body;
        if (!templateId || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ message: 'templateId va studentIds kerak' });
        }

        const user = (req as any).user;

        if (studentIds.length === 1) {
            const r = await generateCertificate({
                templateId, studentId: studentIds[0], courseId, grade, signature, metadata,
                issuedBy: user?.id,
            });
            await logAudit({
                userId: user?.id, userName: user?.name || 'system',
                action: 'create', resource: 'certificate', resourceId: r.id,
                after: r,
            });
            return res.json({ generated: 1, results: [r] });
        }

        // Batch generation with progress via WebSocket
        const results = await generateBatch({
            templateId,
            studentIds,
            courseId,
            grade,
            signature,
            metadata,
            issuedBy: user?.id,
            onProgress: (current, total, result) => {
                emitToUser(user?.id || '', 'certificate:progress', { current, total, result });
                if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') {
                    emitToAdmins('certificate:progress', { current, total });
                }
            },
        });
        const successCount = results.filter(r => !r.error).length;

        await logAudit({
            userId: user?.id, userName: user?.name || 'system',
            action: 'create', resource: 'certificate-batch',
            metadata: { count: successCount, total: studentIds.length },
        });

        res.json({ generated: successCount, total: studentIds.length, results });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Download single PDF
router.get('/:id/pdf', requireAuth, async (req, res) => {
    try {
        const cert = await prisma.certificate.findUnique({ where: { id: req.params.id } });
        if (!cert || !cert.pdfUrl) return res.status(404).json({ message: 'Topilmadi' });
        const filePath = path.join(process.cwd(), cert.pdfUrl.startsWith('/') ? cert.pdfUrl.substring(1) : cert.pdfUrl);
        if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Fayl yo\'q' });
        res.download(filePath, `cert-${cert.serialNumber}.pdf`);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk ZIP download
router.post('/zip', requireAuth, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids kerak' });

        const certs = await prisma.certificate.findMany({
            where: { id: { in: ids } },
            include: { student: { select: { name: true } } },
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="certificates-${Date.now()}.zip"`);

        const archive = (archiver as any).default
            ? (archiver as any).default('zip', { zlib: { level: 6 } })
            : (archiver as any)('zip', { zlib: { level: 6 } });
        archive.on('error', (err: any) => {
            console.error('ZIP error:', err);
            res.status(500).end();
        });
        archive.pipe(res);

        for (const cert of certs) {
            if (!cert.pdfUrl) continue;
            const filePath = path.join(process.cwd(), cert.pdfUrl.startsWith('/') ? cert.pdfUrl.substring(1) : cert.pdfUrl);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: `${cert.serialNumber}_${cert.student.name}.pdf` });
            }
        }

        archive.finalize();
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Revoke certificate
router.put('/:id/revoke', requireAuth, requireRole, async (req, res) => {
    try {
        const { reason } = req.body;
        const cert = await prisma.certificate.update({
            where: { id: req.params.id },
            data: { revokedAt: new Date(), revokedReason: reason || 'Bekor qilindi' },
        });
        res.json(cert);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Delete
router.delete('/:id', requireAuth, requireRole, async (req, res) => {
    try {
        const cert = await prisma.certificate.findUnique({ where: { id: req.params.id } });
        if (cert?.pdfUrl) {
            try {
                const filePath = path.join(process.cwd(), cert.pdfUrl.startsWith('/') ? cert.pdfUrl.substring(1) : cert.pdfUrl);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch {}
        }
        await prisma.certificate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Public verification (no auth required) ──────────────────────────────────
router.get('/verify/:serial', async (req, res) => {
    try {
        const cert = await prisma.certificate.findUnique({
            where: { serialNumber: req.params.serial },
            include: {
                student: { select: { name: true } },
                course: { select: { name: true } },
                template: { select: { name: true, type: true } },
            },
        });
        if (!cert) return res.status(404).json({ valid: false, message: 'Sertifikat topilmadi' });
        if (cert.revokedAt) {
            return res.json({
                valid: false,
                revoked: true,
                serialNumber: cert.serialNumber,
                revokedAt: cert.revokedAt,
                revokedReason: cert.revokedReason,
            });
        }
        res.json({
            valid: true,
            serialNumber: cert.serialNumber,
            studentName: cert.student.name,
            courseName: cert.course?.name || null,
            templateName: cert.template.name,
            templateType: cert.template.type,
            issuedAt: cert.issuedAt,
            grade: cert.grade,
        });
    } catch (err: any) {
        res.status(500).json({ valid: false, error: err.message });
    }
});

export default router;
