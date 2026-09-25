/**
 * TQ-D — to'lov qabul qilishda o'quvchini yozib qidirish (ism, telefon yoki S-000123 kodi).
 * Backend: GET /api/students/search?q= (kamida 2 belgi, 20 tagacha natija).
 */
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import api from '../../api/client';
import { formatNumber } from '../../utils/formatters';

export interface FoundStudent {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  status?: string | null;
  balance?: number | null;
  groups: Array<{ id: string; name: string }>;
}

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500';

function BalanceTag({ balance }: { balance?: number | null }) {
  if (balance === undefined || balance === null) return null;
  const debt = balance < 0;
  return (
    <span className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${debt ? 'text-rose-600' : balance > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
      {debt ? `Qarz ${formatNumber(-balance)}` : balance > 0 ? `Avans ${formatNumber(balance)}` : '0'} so'm
    </span>
  );
}

export function StudentSearchSelect({ value, onChange, autoFocus }: {
  value: FoundStudent | null;
  onChange: (s: FoundStudent | null) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoundStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.get('/students/search', { params: { q: term } })
        .then(r => { if (alive) { setResults(Array.isArray(r.data) ? r.data : []); setActive(0); } })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (s: FoundStudent) => { onChange(s); setQ(''); setResults([]); setOpen(false); };

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value.name}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {[value.code, value.phone, value.groups.map(g => g.name).join(', ') || "guruhsiz"].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1"><BalanceTag balance={value.balance} /></div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:bg-white dark:hover:bg-zinc-800" aria-label="Boshqa o'quvchini tanlash">
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      <input
        className={inputCls}
        value={q}
        autoFocus={autoFocus}
        placeholder="Ism, telefon yoki kod (S-000123) bo'yicha qidiring"
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || !results.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && q.trim().length >= 2 && (
        <div role="listbox" className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
          {loading && !results.length ? (
            <p className="px-4 py-3 text-sm text-zinc-400">Qidirilmoqda...</p>
          ) : !results.length ? (
            <p className="px-4 py-3 text-sm text-zinc-400">O'quvchi topilmadi</p>
          ) : results.map((s, i) => (
            <button type="button" role="option" aria-selected={i === active} key={s.id}
              onMouseEnter={() => setActive(i)} onClick={() => pick(s)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 ${i === active ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</span>
                <span className="block text-[11px] text-zinc-500 truncate">{[s.code, s.phone, s.groups.map(g => g.name).join(', ')].filter(Boolean).join(' · ')}</span>
              </span>
              <BalanceTag balance={s.balance} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
