/**
 * Shared formatting utilities — single source of truth.
 * Import from here instead of duplicating inline.
 */

/** Format amount as Uzbek sum or other currency */
export function formatMoney(amount: number | null | undefined, currency = 'UZS'): string {
  if (amount == null) return `0 ${currency}`;
  return new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format compact large numbers: 1500000 → "1.5M", 250000 → "250K" */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000)     return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)         return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

/** Format date string. format: 'short' = DD.MM.YYYY, 'long' = full, 'time' = HH:MM */
export function formatDate(
  date: string | Date | null | undefined,
  format: 'short' | 'long' | 'time' = 'short',
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date).slice(0, 10);
    if (format === 'time')  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    if (format === 'long')  return d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });
    // short: DD.MM.YYYY
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return String(date).slice(0, 10);
  }
}

/** Format Uzbek phone number: +998901234567 → +998 90 123 45 67 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return phone;
}

/** Format percentage: 0.856 → "85.6%", 0.9 → "90%" */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Relative time: "2 soat oldin", "3 kun oldin" */
export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);
    if (mins < 1)   return 'Hozir';
    if (mins < 60)  return `${mins} daqiqa oldin`;
    if (hours < 24) return `${hours} soat oldin`;
    if (days < 7)   return `${days} kun oldin`;
    return formatDate(d, 'short');
  } catch {
    return '—';
  }
}
