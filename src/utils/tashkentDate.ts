/**
 * Toshkent (UTC+5) kalendar sanasi — brauzer vaqt zonasidan mustaqil.
 *
 * IP-04 (ML-17): ilgari 40+ joyda `new Date().toISOString().split('T')[0]`
 * ishlatilardi — bu UTC sanasi. Toshkent vaqti bilan 00:00–04:59 oralig'ida
 * kiritilgan to'lov, davomat yoki ta'til KECHAGI sana bilan (oyning 1-sanasida
 * esa o'tgan OY bilan) saqlanardi. Server tomonidagi `server/utils/timezone.ts`
 * bilan bir xil qoida.
 */
const FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });

/** "YYYY-MM-DD" — berilgan onning Toshkentdagi kalendar sanasi (standart: hozir). */
export function toTashkentDate(d: Date = new Date()): string {
  return FORMATTER.format(d);
}

/** "YYYY-MM-DD" — bugun, Toshkent vaqti bo'yicha. */
export function tashkentToday(): string {
  return toTashkentDate(new Date());
}

/** "YYYY-MM" — joriy oy, Toshkent vaqti bo'yicha. */
export function tashkentMonth(): string {
  return tashkentToday().slice(0, 7);
}

/** Bugundan `days` kun keyingi (manfiy — oldingi) Toshkent sanasi. */
export function tashkentDatePlusDays(days: number): string {
  const [y, m, d] = tashkentToday().split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}
