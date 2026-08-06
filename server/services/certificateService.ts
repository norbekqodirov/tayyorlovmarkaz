import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'certificates');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface CertTemplateElement {
    type: 'text' | 'image' | 'qr' | 'signature';
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;       // for text: supports {{name}}, {{course}}, {{date}}, {{serial}}, {{grade}}
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    color?: string;      // hex like #000000
    align?: 'left' | 'center' | 'right';
    imageUrl?: string;
}

export interface CertTemplateConfig {
    elements: CertTemplateElement[];
}

/**
 * Generate a unique serial number for a certificate.
 * Format: CRT-YYYY-NNNN
 */
export async function generateSerialNumber(): Promise<string> {
    const year = todayDateStr().slice(0, 4);
    const count = await prisma.certificate.count({
        where: { serialNumber: { startsWith: `CRT-${year}-` } },
    });
    return `CRT-${year}-${String(count + 1).padStart(4, '0')}`;
}

function hexToRgb(hex?: string) {
    if (!hex) return rgb(0, 0, 0);
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return rgb(0, 0, 0);
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return rgb(r, g, b);
}

function interpolate(text: string, vars: Record<string, string>): string {
    let result = text || '';
    Object.entries(vars).forEach(([k, v]) => {
        result = result.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v ?? ''));
    });
    return result;
}

/**
 * Generate a certificate PDF and persist it to disk.
 * Returns the public URL of the saved PDF.
 */
export async function generateCertificate(params: {
    templateId: string;
    studentId: string;
    courseId?: string | null;
    issuedBy?: string | null;
    grade?: string | null;
    signature?: string | null;
    metadata?: any;
    appUrl?: string;
}): Promise<{ id: string; serialNumber: string; pdfUrl: string }> {
    const [template, student, course] = await Promise.all([
        prisma.certificateTemplate.findUnique({ where: { id: params.templateId } }),
        prisma.student.findUnique({ where: { id: params.studentId } }),
        params.courseId ? prisma.course.findUnique({ where: { id: params.courseId } }) : Promise.resolve(null),
    ]);

    if (!template) throw new Error('Sertifikat shabloni topilmadi');
    if (!student) throw new Error("O'quvchi topilmadi");

    const config: CertTemplateConfig = (() => {
        try { return JSON.parse(template.config); } catch { return { elements: [] }; }
    })();

    const serialNumber = await generateSerialNumber();
    const appUrl = params.appUrl || process.env.APP_URL || 'http://localhost:3000';
    const verifyUrl = `${appUrl}/verify/${serialNumber}`;

    // Variable substitution context
    const vars: Record<string, string> = {
        name: student.name,
        course: course?.name || '',
        date: new Date().toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }),
        serial: serialNumber,
        grade: params.grade || '',
    };

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([template.width, template.height]);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Background image
    if (template.background) {
        try {
            let bgBytes: Buffer | null = null;
            if (template.background.startsWith('http')) {
                const res = await fetch(template.background);
                bgBytes = Buffer.from(await res.arrayBuffer());
            } else {
                const localPath = path.join(process.cwd(), template.background.replace(/^\//, ''));
                if (fs.existsSync(localPath)) bgBytes = fs.readFileSync(localPath);
            }
            if (bgBytes) {
                let img;
                try { img = await pdfDoc.embedPng(bgBytes); } catch { img = await pdfDoc.embedJpg(bgBytes); }
                page.drawImage(img, { x: 0, y: 0, width: template.width, height: template.height });
            }
        } catch (e) {
            console.warn('Background embed failed:', e);
        }
    }

    // Elements
    for (const el of config.elements || []) {
        // pdf-lib uses bottom-left origin; convert from top-left UI coords
        const yPdf = template.height - el.y - (el.fontSize || 16);

        if (el.type === 'text' && el.text) {
            const text = interpolate(el.text, vars);
            const font: PDFFont = el.fontWeight === 'bold' ? fontBold : fontRegular;
            const fontSize = el.fontSize || 16;
            const color = hexToRgb(el.color);

            let drawX = el.x;
            if (el.align === 'center' || el.align === 'right') {
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                if (el.align === 'center') drawX = el.x - textWidth / 2;
                else drawX = el.x - textWidth;
            }

            page.drawText(text, { x: drawX, y: yPdf, size: fontSize, font, color });
        }

        if (el.type === 'qr') {
            try {
                const qrPng = await QRCode.toBuffer(verifyUrl, { type: 'png', margin: 1, width: 256 });
                const qrImg = await pdfDoc.embedPng(qrPng);
                const size = el.width || 80;
                page.drawImage(qrImg, {
                    x: el.x,
                    y: template.height - el.y - size,
                    width: size,
                    height: size,
                });
            } catch (e) {
                console.warn('QR embed failed:', e);
            }
        }

        if (el.type === 'image' && el.imageUrl) {
            try {
                let imgBytes: Buffer | null = null;
                if (el.imageUrl.startsWith('http')) {
                    const res = await fetch(el.imageUrl);
                    imgBytes = Buffer.from(await res.arrayBuffer());
                } else {
                    const localPath = path.join(process.cwd(), el.imageUrl.replace(/^\//, ''));
                    if (fs.existsSync(localPath)) imgBytes = fs.readFileSync(localPath);
                }
                if (imgBytes) {
                    let img;
                    try { img = await pdfDoc.embedPng(imgBytes); } catch { img = await pdfDoc.embedJpg(imgBytes); }
                    const w = el.width || 100;
                    const h = el.height || 100;
                    page.drawImage(img, { x: el.x, y: template.height - el.y - h, width: w, height: h });
                }
            } catch (e) { console.warn('Image embed failed:', e); }
        }

        if (el.type === 'signature' && params.signature) {
            try {
                let sigBytes: Buffer | null = null;
                if (params.signature.startsWith('data:image')) {
                    const base64 = params.signature.split(',')[1];
                    sigBytes = Buffer.from(base64, 'base64');
                } else if (params.signature.startsWith('http')) {
                    const res = await fetch(params.signature);
                    sigBytes = Buffer.from(await res.arrayBuffer());
                } else {
                    const localPath = path.join(process.cwd(), params.signature.replace(/^\//, ''));
                    if (fs.existsSync(localPath)) sigBytes = fs.readFileSync(localPath);
                }
                if (sigBytes) {
                    let img;
                    try { img = await pdfDoc.embedPng(sigBytes); } catch { img = await pdfDoc.embedJpg(sigBytes); }
                    const w = el.width || 120;
                    const h = el.height || 50;
                    page.drawImage(img, { x: el.x, y: template.height - el.y - h, width: w, height: h });
                }
            } catch (e) { console.warn('Signature embed failed:', e); }
        }
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const fileName = `cert-${serialNumber}.pdf`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, pdfBytes);
    const pdfUrl = `/uploads/certificates/${fileName}`;

    // Save certificate record
    const cert = await prisma.certificate.create({
        data: {
            templateId: template.id,
            studentId: student.id,
            courseId: params.courseId || null,
            serialNumber,
            issuedBy: params.issuedBy || null,
            signature: params.signature || null,
            qrCode: verifyUrl,
            pdfUrl,
            grade: params.grade || null,
            metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        },
    });

    return { id: cert.id, serialNumber, pdfUrl };
}

/**
 * Batch generation with progress.
 * Callback `onProgress(current, total)` is called after each certificate.
 */
export async function generateBatch(params: {
    templateId: string;
    studentIds: string[];
    courseId?: string | null;
    issuedBy?: string | null;
    grade?: string | null;
    signature?: string | null;
    metadata?: any;
    onProgress?: (current: number, total: number, result: any) => void;
}): Promise<Array<{ studentId: string; id?: string; serialNumber?: string; pdfUrl?: string; error?: string }>> {
    const results = [];
    const total = params.studentIds.length;
    for (let i = 0; i < total; i++) {
        const studentId = params.studentIds[i];
        try {
            const r = await generateCertificate({
                templateId: params.templateId,
                studentId,
                courseId: params.courseId,
                issuedBy: params.issuedBy,
                grade: params.grade,
                signature: params.signature,
                metadata: params.metadata,
            });
            const result = { studentId, ...r };
            results.push(result);
            params.onProgress?.(i + 1, total, result);
        } catch (err: any) {
            const result = { studentId, error: err.message };
            results.push(result);
            params.onProgress?.(i + 1, total, result);
        }
    }
    return results;
}
