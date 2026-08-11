import { formatNumber } from '../../utils/formatters';

interface Props {
  label?: string;
  value: number | undefined | null;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  suffix?: string;
  className?: string;
}

/**
 * Pul summasi input — 0 majburiy ko'rsatilmaydi (bo'sh boshlanadi, foydalanuvchi
 * darhol raqam yoza oladi) va yozayotganda har 3 xonadan ajratib ko'rsatadi
 * (800000 emas, 800 000 — tushunish oson bo'lishi uchun).
 */
export function MoneyInput({ label, value, onChange, placeholder = '0', required, disabled, suffix = "so'm", className = '' }: Props) {
  const displayValue = value ? formatNumber(value) : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    onChange(digits ? Number(digits) : 0);
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 pr-14 transition-all outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        />
        {suffix && (
          <span className="absolute right-3.5 text-xs font-bold text-zinc-400 pointer-events-none select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default MoneyInput;
