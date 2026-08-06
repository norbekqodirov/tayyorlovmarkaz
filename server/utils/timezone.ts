// Server VPS odatda UTC vaqt zonasida ishlaydi (TZ sozlanmagan), lekin O'zbekiston
// UTC+5 (Asia/Tashkent, DST yo'q). `new Date().toISOString()` / `.toTimeString()` /
// `.getHours()` kabi usullar server vaqt zonasiga (demak ko'pincha UTC'ga) bog'liq —
// natijada Face ID orqali check-in/check-out qilganda soat 5 soatga siljib qoladi
// (masalan haqiqiy 14:00 Toshkent vaqti "09:00" bo'lib saqlanadi). Bu yordamchilar
// server TZ sozlamasidan qat'i nazar DOIM Toshkent vaqtini qaytaradi.

const TZ = 'Asia/Tashkent';

function tashkentParts(d: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
    // Ba'zi ICU versiyalarida hour12:false bilan yarim tunda "24" qaytishi mumkin
    const hour = get('hour') === '24' ? '00' : get('hour');
    return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute') };
}

/** "YYYY-MM-DD" — Toshkent (UZT, UTC+5) sanasi, server TZ sozlamasidan mustaqil */
export function todayDateStr(d: Date = new Date()): string {
    const p = tashkentParts(d);
    return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" — Toshkent vaqti, server TZ sozlamasidan mustaqil */
export function nowTimeStr(d: Date = new Date()): string {
    const p = tashkentParts(d);
    return `${p.hour}:${p.minute}`;
}

/** Kunning necha daqiqasi o'tgani (0-1439), Toshkent vaqti bo'yicha — "kechikdimi" solishtirish uchun */
export function nowMinutesOfDay(d: Date = new Date()): number {
    const p = tashkentParts(d);
    return Number(p.hour) * 60 + Number(p.minute);
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** Haftaning kuni (1=Dushanba ... 7=Yakshanba), Toshkent sanasi bo'yicha — server TZ'siga bog'liq emas */
export function tashkentDayOfWeek(d: Date = new Date()): number {
    const p = tashkentParts(d);
    // Date.UTC + getUTCDay() — sof taqvim hisobi, hech qanday TZ noaniqligisiz
    const utcDow = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
    return utcDow === 0 ? 7 : utcDow;
}

/** "YYYY-MM-DD" — Toshkent sanasidan `days` kun oldin/keyin (manfiy son ham bo'lishi mumkin) */
export function addDaysDateStr(days: number, d: Date = new Date()): string {
    const p = tashkentParts(d);
    const shifted = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + days));
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * Toshkent "joriy oy"idan `monthsOffset` oy siljigan oyning boshi va oxiri ("YYYY-MM-DD").
 * monthsOffset=0 — shu oy, -1 — o'tgan oy, va h.k.
 */
export function monthRangeStr(monthsOffset: number = 0, d: Date = new Date()): { start: string; end: string } {
    const p = tashkentParts(d);
    const targetMonthIndex = Number(p.month) - 1 + monthsOffset;
    const start = new Date(Date.UTC(Number(p.year), targetMonthIndex, 1));
    const end = new Date(Date.UTC(Number(p.year), targetMonthIndex + 1, 0));
    const fmt = (x: Date) => `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}`;
    return { start: fmt(start), end: fmt(end) };
}

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Asia/Tashkent, UTC+5, DST yo'q

/**
 * Berilgan "YYYY-MM-DD" Toshkent sanasining haqiqiy boshlanish onini (UTC instant/Date) qaytaradi.
 * `DateTime` maydonlar (masalan `createdAt`) bilan solishtirish uchun — sof sana satridan
 * `new Date(dateStr)` yasash UTC yarim tunini beradi, bu Toshkent yarim tunidan 5 soat keyin,
 * natijada kun boshidagi yozuvlar oraliqdan tushib qolishi mumkin.
 */
export function tashkentMidnightInstant(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MS);
}
