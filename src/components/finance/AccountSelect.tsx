/**
 * IP-22 — pul qaysi kassa/bank hisobiga tushdi yoki qaysi hisobdan chiqdi.
 * Formalardagi eski "To'lov usuli" (Naqd/Karta/Bank) tanlovi o'rnida: hisob tanlanadi,
 * backend'ga `accountId` va mos `method` yuboriladi (eski yo'llar `method` bilan ham ishlaydi).
 * Backend: GET /api/cash/accounts.
 */
import { useEffect, useState } from 'react';
import api from '../../api/client';

export interface CashAccountLite { id: string; name: string; type: string; method: string; isActive: boolean }

const TYPE_ICON: Record<string, string> = { cash: '💵', card: '💳', bank: '🏦', online: '📱' };

let cache: CashAccountLite[] | null = null;
let pending: Promise<CashAccountLite[]> | null = null;
function loadAccounts(): Promise<CashAccountLite[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = api.get('/cash/accounts')
      .then(r => { cache = (Array.isArray(r.data) ? r.data : []).filter((a: CashAccountLite) => a.isActive); return cache!; })
      .catch(() => [])
      .finally(() => { pending = null; });
  }
  return pending;
}
/** Hisoblar ro'yxati o'zgarganda (Kassa sahifasida) keshni tozalash. */
export function invalidateCashAccounts() { cache = null; }

export function useCashAccounts() {
  const [accounts, setAccounts] = useState<CashAccountLite[]>(cache ?? []);
  useEffect(() => { let alive = true; void loadAccounts().then(a => { if (alive) setAccounts(a); }); return () => { alive = false; }; }, []);
  return accounts;
}

const selectCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500';

/**
 * `value` — tanlangan hisob id'si. Bo'sh bo'lsa, `method` ga mos birinchi hisob (yoki birinchi naqd kassa)
 * avtomatik tanlanadi va `onChange` orqali qaytariladi.
 */
export function AccountSelect({ value, method, onChange, label = "Qaysi hisob", types, className = '' }: {
  value?: string | null;
  method?: string | null;
  onChange: (accountId: string, method: string) => void;
  label?: string;
  /** Faqat shu turdagi hisoblar (masalan xarajat uchun hammasi, kassir uchun naqd/karta) */
  types?: string[];
  className?: string;
}) {
  const all = useCashAccounts();
  const accounts = types ? all.filter(a => types.includes(a.type)) : all;

  useEffect(() => {
    if (value || !accounts.length) return;
    const byMethod = method ? accounts.find(a => a.method.toLowerCase() === String(method).toLowerCase()) : null;
    const pick = byMethod ?? accounts.find(a => a.type === 'cash') ?? accounts[0];
    onChange(pick.id, pick.method);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, accounts.length]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</label>}
      <select aria-label={label || 'Hisob'} value={value || ''} onChange={e => { const a = accounts.find(x => x.id === e.target.value); if (a) onChange(a.id, a.method); }} className={selectCls}>
        {!accounts.length && <option value="">{method || 'Naqd'}</option>}
        {accounts.map(a => <option key={a.id} value={a.id}>{TYPE_ICON[a.type] || '•'} {a.name}</option>)}
      </select>
    </div>
  );
}
