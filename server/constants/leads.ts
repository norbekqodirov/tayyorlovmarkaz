/**
 * Lid moduli uchun umumiy konstantalar va sof (side-effect'siz) yordamchi
 * funksiyalar — server/routes/public.ts, server/services/leadIntake.ts va
 * (Faza 3) server/routes/leads.ts orasida bir xil bo'lishi shart bo'lgan
 * qadriyatlar. Frontend tomonidagi ekvivalenti: src/components/leads/types.ts
 * (u yerda ham xuddi shu bosqich id/nomlar bor — ikkalasi qo'lda sinxron
 * tutilishi kerak, chunki backend TypeScript frontendni import qila olmaydi).
 */

export const STAGES = ['new', 'contacted', 'meeting', 'won', 'lost'] as const;
export type Stage = typeof STAGES[number];
export const OPEN_STAGES: Stage[] = ['new', 'contacted', 'meeting'];
export const CLOSED_STAGES: Stage[] = ['won', 'lost'];

export const STATUSES = ['hot', 'warm', 'cold'] as const;
export type LeadStatus = typeof STATUSES[number];

export const ACTIVITY_TYPES = ['call', 'message', 'meeting', 'note', 'form'] as const;
export const ACTIVITY_OUTCOMES = ['answered', 'no_answer', 'busy', 'wrong_number', 'interested', 'not_interested'] as const;
export const ACTIVITY_DIRECTIONS = ['out', 'in'] as const;

export const LOST_REASONS = [
    'Narx mos kelmadi',
    'Boshqa markazni tanladi',
    'Vaqt/jadval mos kelmadi',
    'Aloqaga chiqmadi',
    'Fikridan qaytdi',
    'Boshqa',
];

// Reklama manbasi (SOURCES) — src/components/leads/types.ts dagi ro'yxat bilan bir xil.
export const SOURCES = ['Instagram', 'Facebook', 'Telegram', 'Vebsayt', 'Tavsiya', 'Banner', 'Boshqa'];

// utm_source qiymatlarini SOURCES ro'yxatidagi kanonik nomga moslashtirish —
// shu orqali "instagram", "ig", "IG" kabi turli yozuvlar bitta manba sifatida
// hisoblanadi (avval har bir forma o'z matnini yasab, manba diagrammasini
// ifloslantirar edi).
const UTM_SOURCE_ALIASES: Record<string, string> = {
    instagram: 'Instagram', ig: 'Instagram',
    facebook: 'Facebook', fb: 'Facebook',
    telegram: 'Telegram', tg: 'Telegram',
    google: 'Vebsayt', adwords: 'Vebsayt', 'google-ads': 'Vebsayt',
};

export function resolveSourceFromUtm(utmSource?: string | null): string | null {
    if (!utmSource) return null;
    const key = utmSource.trim().toLowerCase();
    return UTM_SOURCE_ALIASES[key] || (SOURCES.includes(utmSource) ? utmSource : null);
}

// Telefon raqamning oxirgi 9 raqami — dublikat aniqlash uchun format-mustasno kalit
// (+998901234567, 901234567, "90 123 45 67" — barchasi bir xil kalitga tushadi).
export function phoneLast9(raw: string): string {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-9);
}

export function isValidUzMobile(phoneNorm: string): boolean {
    return /^\d{9}$/.test(phoneNorm);
}

// Qidiruv kaliti — kichik harfli, bo'sh joylar bilan birlashtirilgan
// ism+telefon+kurs. `mode: 'insensitive'` ISHLATILMAYDI (production SQLite'da
// Prisma runtime'da yiqiladi — bu tip faqat PostgreSQL uchun generatsiya
// qilinadi); buning o'rniga shu maydon `contains` bilan qidiriladi.
export function buildSearchKey(name: string, phoneNorm: string, course?: string | null): string {
    return [name, phoneNorm, course || ''].join(' ').toLowerCase().trim();
}
