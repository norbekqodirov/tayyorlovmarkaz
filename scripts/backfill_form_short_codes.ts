/**
 * Bir martalik tuzatish: TargetForm.shortCode maydoni endi CREATE vaqtida
 * server/routes/crud.ts tomonidan avtomatik generatsiya qilinadi (qisqa,
 * 6 belgili ommaviy havola — /l/{shortCode} — avvalgi /l/{to'liq UUID}
 * o'rniga). Bu skript shortCode qo'shilishidan OLDIN yaratilgan mavjud
 * formalarga ham shu kodni beradi.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomShortCode(len: number): string {
    const bytes = crypto.randomBytes(len);
    let code = '';
    for (let i = 0; i < len; i++) code += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
    return code;
}
async function generateUniqueShortCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const code = randomShortCode(6);
        const exists = await prisma.targetForm.findUnique({ where: { shortCode: code }, select: { id: true } });
        if (!exists) return code;
    }
    return randomShortCode(10);
}

async function run() {
    const forms = await prisma.targetForm.findMany({ where: { shortCode: null } });
    console.log(`Tekshirilmoqda: ${forms.length} ta forma (shortCode'siz)`);

    for (const form of forms) {
        const shortCode = await generateUniqueShortCode();
        await prisma.targetForm.update({ where: { id: form.id }, data: { shortCode } });
        console.log(`Tuzatildi: "${form.title}" (${form.id}) → /l/${shortCode}`);
    }

    console.log(`\nJami tuzatildi: ${forms.length} ta`);
}

run().finally(() => prisma.$disconnect());
