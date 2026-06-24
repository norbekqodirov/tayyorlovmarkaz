import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../db.js';
import { requireAuth, requireMinRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Collection → Prisma model va minimal required fields
const IMPORT_CONFIG: Record<string, {
    model: string;
    requiredFields: string[];
    fieldMap: Record<string, string>; // O'zbekcha ustun → DB field
}> = {
    students: {
        model: 'student',
        requiredFields: ['name'],
        fieldMap: {
            'Ism': 'name', 'Ismi': 'name', 'Name': 'name',
            'Telefon': 'phone', 'Phone': 'phone', 'Tel': 'phone',
            'Email': 'email',
            'Manzil': 'address', 'Address': 'address',
            'Tug\'ilgan sana': 'birthDate', 'Birthdate': 'birthDate',
            'Ota-ona ismi': 'parentName', 'Parent Name': 'parentName',
            'Ota-ona tel': 'parentPhone', 'Parent Phone': 'parentPhone',
            'Manba': 'source', 'Source': 'source',
            'Izoh': 'notes', 'Notes': 'notes',
        },
    },
    staff: {
        model: 'staffMember',
        requiredFields: ['name'],
        fieldMap: {
            'Ism': 'name', 'Ismi': 'name', 'Name': 'name',
            'Lavozim': 'role', 'Role': 'role', 'Position': 'role',
            'Telefon': 'phone', 'Phone': 'phone',
            'Email': 'email',
            'Bo\'lim': 'department', 'Department': 'department',
            'Oylik': 'salary', 'Salary': 'salary',
            'Ishga kirgan sana': 'joinedDate', 'Joined Date': 'joinedDate',
        },
    },
    leads: {
        model: 'lead',
        requiredFields: ['name', 'phone'],
        fieldMap: {
            'Ism': 'name', 'Ismi': 'name', 'Name': 'name',
            'Telefon': 'phone', 'Phone': 'phone',
            'Email': 'email',
            'Kurs': 'course', 'Course': 'course',
            'Manba': 'source', 'Source': 'source',
            'Izoh': 'notes', 'Notes': 'notes',
        },
    },
};

// POST /api/import/:collection/preview — preview (ma'lumotlarni validate qilish)
router.post('/:collection/preview', requireAuth, requireMinRole('MANAGER'),
    upload.single('file'), async (req, res) => {
    try {
        const { collection } = req.params;
        const config = IMPORT_CONFIG[collection];

        if (!config) {
            return res.status(400).json({ message: `Import qo'llab-quvvatlanmaydi: ${collection}` });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Fayl yuborilmadi' });
        }

        // Excel/CSV parsing
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Fayl bo\'sh yoki noto\'g\'ri format' });
        }

        // Ustun nomlari
        const columns = Object.keys(rows[0]);

        // Mapping aniqlash
        const detectedMapping: Record<string, string> = {};
        columns.forEach(col => {
            if (config.fieldMap[col]) {
                detectedMapping[col] = config.fieldMap[col];
            }
        });

        // Preview (first 5 rows)
        const preview = rows.slice(0, 5).map(row => {
            const mapped: Record<string, any> = {};
            Object.entries(detectedMapping).forEach(([col, field]) => {
                mapped[field] = row[col];
            });
            return { original: row, mapped };
        });

        // Validation
        const errors: string[] = [];
        const missingRequired = config.requiredFields.filter(
            f => !Object.values(detectedMapping).includes(f)
        );
        if (missingRequired.length > 0) {
            errors.push(`Majburiy ustunlar topilmadi: ${missingRequired.join(', ')}`);
        }

        res.json({
            totalRows: rows.length,
            columns,
            detectedMapping,
            preview,
            errors,
            canImport: errors.length === 0,
        });
    } catch (err: any) {
        res.status(500).json({ message: `Fayl o'qishda xatolik: ${err.message}` });
    }
});

// POST /api/import/:collection/confirm — import qilish
router.post('/:collection/confirm', requireAuth, requireMinRole('MANAGER'),
    upload.single('file'), async (req, res) => {
    try {
        const { collection } = req.params;
        const config = IMPORT_CONFIG[collection];

        if (!config) {
            return res.status(400).json({ message: `Import qo'llab-quvvatlanmaydi: ${collection}` });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'Fayl yuborilmadi' });
        }

        const { mapping } = req.body; // JSON string: {ColName: fieldName}
        let columnMapping: Record<string, string> = {};
        try {
            columnMapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;
        } catch {
            return res.status(400).json({ message: 'mapping noto\'g\'ri format' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        let created = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Batch insert
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const data: Record<string, any> = {};

            Object.entries(columnMapping).forEach(([col, field]) => {
                const val = row[col];
                if (val !== '' && val !== null && val !== undefined) {
                    data[field] = String(val).trim();
                }
            });

            // Required fields check
            const missingRequired = config.requiredFields.filter(f => !data[f]);
            if (missingRequired.length > 0) {
                errors.push(`Qator ${i + 2}: ${missingRequired.join(', ')} bo'sh`);
                skipped++;
                continue;
            }

            try {
                if (config.model === 'student') {
                    await prisma.student.create({ data: data as any });
                } else if (config.model === 'staffMember') {
                    if (data.salary) data.salary = Number(data.salary) || 0;
                    await prisma.staffMember.create({ data: data as any });
                } else if (config.model === 'lead') {
                    await prisma.lead.create({ data: data as any });
                }
                created++;
            } catch (err: any) {
                errors.push(`Qator ${i + 2}: ${err.message}`);
                skipped++;
            }
        }

        res.json({
            message: `Import yakunlandi: ${created} ta yaratildi, ${skipped} ta o'tkazib yuborildi`,
            created,
            skipped,
            errors: errors.slice(0, 20),
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
