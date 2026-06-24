/**
 * MonthSelector.tsx
 * Shared month/year picker used across attendance, assessment, rating tabs.
 */
import React from 'react';

const MONTHS = [
  { name: 'Yan', i: 0 }, { name: 'Fev', i: 1 }, { name: 'Mar', i: 2 }, { name: 'Apr', i: 3 },
  { name: 'May', i: 4 }, { name: 'Iyun', i: 5 }, { name: 'Iyul', i: 6 }, { name: 'Avg', i: 7 },
  { name: 'Sen', i: 8 }, { name: 'Okt', i: 9 }, { name: 'Noy', i: 10 }, { name: 'Dek', i: 11 }
];

interface Props {
  currentDate: Date;
  onChange: (date: Date) => void;
  accentClass?: string; // e.g. 'bg-emerald-500' for attendance
}

const MonthSelector: React.FC<Props> = ({ currentDate, onChange, accentClass = 'bg-blue-500' }) => {
  const setYear = (year: number) => onChange(new Date(year, currentDate.getMonth(), 1));
  const setMonth = (month: number) => onChange(new Date(currentDate.getFullYear(), month, 1));

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={currentDate.getFullYear()}
        onChange={e => setYear(Number(e.target.value))}
        className="px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-xs"
      >
        {[2023, 2024, 2025, 2026, 2027].map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs font-bold divide-x divide-zinc-200 dark:divide-zinc-700">
        {MONTHS.map(mon => (
          <button
            key={mon.i}
            onClick={() => setMonth(mon.i)}
            className={`px-3 py-2 transition-colors ${
              currentDate.getMonth() === mon.i
                ? `${accentClass} text-white`
                : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {mon.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MonthSelector;
