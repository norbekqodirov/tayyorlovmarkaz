import { Wallet, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatNumber } from '../../../utils/formatters';

export function RecentPayments({ payments }: { payments: any[] }) {
  const recent = [...payments]
    .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
    .slice(0, 8);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">So'nggi To'lovlar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">Oxirgi moliyaviy harakatlar</p>
        </div>
        <Wallet size={14} className="text-zinc-400" />
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <CreditCard size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Hali to'lov yo'q</p>
          </div>
        ) : recent.map(p => (
          <div key={p.id} className="flex items-center gap-2.5 py-2 border-b border-zinc-50 dark:border-white/[0.03] last:border-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${p.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600'}`}>
              {p.type === 'income' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                {p.studentName || p.description || p.category || 'Tranzaksiya'}
              </p>
              <p className="text-[9px] text-zinc-400">{p.date} • {p.method || ''}</p>
            </div>
            <span className={`text-[12px] font-black shrink-0 ${p.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {p.type === 'income' ? '+' : '-'}{formatNumber(p.amount || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
