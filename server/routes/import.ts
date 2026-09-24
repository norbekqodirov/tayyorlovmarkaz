import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../db.js';
import { requireAuth, requireMinRole, ROLE_LEVEL } from '../middleware/auth.js';
import { can } from '../middleware/authorize.js';
import { createLeadFromIntake, LeadIntakeValidationError } from '../services/leadIntake.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();
const MAX_IMPORT_ROWS = 10000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// IP-03 (RX-07): import ilgari faqat MANAGER darajasini tekshirardi va mijoz
// yuborgan `mapping` bo'yicha ISTALGAN model maydonini (balans, telegram id,
// holat...) yozardi; lidlar umumiy qabul quvurini (telefon normallash,
// dublikat birlashtirish, SLA) chetlab o'tardi; o'quvchilar dublikati
// tekshirilmasdi. Endi: modul ruxsati, faqat fieldMap'dagi maydonlar,
// lidlar — createLeadFromIntake, o'quvchilar — telefon bo'yicha dublikat
// o'tkazib yuboriladi (qayta yuklangan fayl ikki nusxa yaratmaydi).
const IMPORT_PERMISSION: Record<string, string | null> = { students: 'students', leads: 'leads', staff: null };

async function importAllowed(user: any, collection: string): Promise<boolean> {
    if (collection === 'staff') return (ROLE_LEVEL[user.role] || 0) >= ROLE_LEVEL.ADMIN;
    const key = IMPORT_PERMISSION[collection];
    return !!key && can(user.id, user.role, key);
}

const last9 = (raw: string) => String(raw || '').replace(/\D/g, '').slice(-9);

// POST /api/import/:collection/preview — preview (ma'lumotlarni validate qilish)
router.post('/:collection/preview', requireAuth, requireMinRole('MANAGER'),
    upload.single('file'), async (req, res) => {
    try {
        const { collection } = req.params;
        const config = IMPORT_CONFIG[collection];

        if (!config) {
            return res.status(400).json({ message: `Import qo'llab-quvvatlanmaydi: ${collection}` });
        }
        if (!(await importAllowed((req as any).user, collection))) {
            return res.status(403).json({ message: "Sizda bu ma'lumotlarni import qilish ruxsati yo'q" });
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
        if (rows.length > MAX_IMPORT_ROWS) {
            return res.status(400).json({ message: `Fayldagi qatorlar soni (${rows.length}) ruxsat etilgan limitdan (${MAX_IMPORT_ROWS}) oshib ketdi` });
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

        if (!(await importAllowed((req as any).user, collection))) {
            return res.status(403).json({ message: "Sizda bu ma'lumotlarni import qilish ruxsati yo'q" });
        }

        const { mapping } = req.body; // JSON string: {ColName: fieldName}
        let columnMapping: Record<string, string> = {};
        try {
            columnMapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;
        } catch {
            return res.status(400).json({ message: 'mapping noto\'g\'ri format' });
        }
        // Faqat shu kolleksiya uchun ruxsat etilgan maydonlar (fieldMap qiymatlari).
        const allowedFields = new Set(Object.values(config.fieldMap));
        columnMapping = Object.fromEntries(Object.entries(columnMapping || {}).filter(([, field]) => allowedFields.has(field)));

        // O'quvchilar: mavjud (arxivlanmagan) telefonlar — dublikatni o'tkazib yuborish uchun
        const existingPhones = new Set<string>();
        if (config.model === 'student') {
            const rowsPh = await prisma.student.findMany({ where: { deletedAt: null, phone: { not: null } }, select: { phone: true } });
            rowsPh.forEach(r => { const k = last9(r.phone || ''); if (k.length === 9) existingPhones.add(k); });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length > MAX_IMPORT_ROWS) {
            return res.status(400).json({ message: `Fayldagi qatorlar soni (${rows.length}) ruxsat etilgan limitdan (${MAX_IMPORT_ROWS}) oshib ketdi` });
        }

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
                    const key = last9(data.phone || '');
                    if (key.length === 9 && existingPhones.has(key)) {
                        errors.push(`Qator ${i + 2}: bu telefon raqamli o'quvchi allaqachon bor — o'tkazib yuborildi`);
                        skipped++;
                        continue;
                    }
                    await prisma.student.create({ data: { ...data, status: 'active' } as any });
                    if (key.length === 9) existingPhones.add(key);
                } else if (config.model === 'staffMember') {
                    if (data.salary) data.salary = Number(data.salary) || 0;
                    await prisma.staffMember.create({ data: data as any });
                } else if (config.model === 'lead') {
                    // Umumiy qabul quvuri: telefon normallash, dublikat birlashtirish,
                    // avto-biriktirish, ball — formadan kelgan lid bilan bir xil.
                    await createLeadFromIntake({
                        name: data.name, phone: data.phone, email: data.email || null,
                        course: data.course || null, notes: data.notes || null, source: data.source || 'Import',
                    });
                }
                created++;
            } catch (err: any) {
                const msg = err instanceof LeadIntakeValidationError ? err.message : err.message;
                errors.push(`Qator ${i + 2}: ${msg}`);
                skipped++;
            }
        }

        const actor = (req as any).user;
        await logAudit({
            userId: actor?.id, userName: actor?.name || 'system',
            action: 'import', resource: collection, resourceId: null,
            metadata: { created, skipped, fields: Object.values(columnMapping) },
        });

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
