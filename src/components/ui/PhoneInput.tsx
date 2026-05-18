interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const PREFIX = '+998';

function extractDigits(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length >= 12) return digits.slice(3, 12);
  if (digits.startsWith('998') && digits.length > 3) return digits.slice(3);
  return digits.slice(0, 9);
}

export function PhoneInput({ label, value, onChange, placeholder = '90 123 45 67', required, disabled }: Props) {
  const digits = extractDigits(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    onChange(raw ? PREFIX + raw : '');
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="flex">
        <span className="inline-flex items-center px-3 bg-zinc-100 dark:bg-zinc-700/50 border border-r-0 border-zinc-200 dark:border-zinc-600 rounded-l-xl text-sm font-black text-zinc-500 dark:text-zinc-400 select-none whitespace-nowrap">
          +998
        </span>
        <input
          type="tel"
          value={digits}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={9}
          disabled={disabled}
          className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-r-xl px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
        />
      </div>
    </div>
  );
}
