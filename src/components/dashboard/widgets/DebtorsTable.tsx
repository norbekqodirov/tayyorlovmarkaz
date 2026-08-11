import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../../utils/formatters';

export function DebtorsTable({ students }: { students: any[] }) {
  const navigate = useNavigate();
  const debtors = students
    .filter(s => (s.balance || 0) < 0 || s.paymentStatus === 'Qarzdorlik')
    .sort((a, b) => (a.balance || 0) - (b.balance || 0))
    .slice(0, 7);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
              <AlertTriangle size={11} className="text-rose-600" />
            </div>
            <p className="text-xs font-black text-slate-900 dark:text-white">Qarzdorlar</p>
          </div>
          <p className="text-[9px] text-zinc-400 mt-0.5 ml-7">{debtors.length} ta to'lov qilmagan o'quvchi</p>
        </div>
        <button
          onClick={() => navigate('/crmtayyorlovmarkaz/students')}
          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
        >
          Barchasi <ChevronRight size={10} />
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {debtors.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Barcha to'lovlar amalga oshirilgan!</p>
          </div>
        ) : debtors.map(s => (
          <div key={s.id} className="flex items-center gap-2.5 p-2.5 bg-rose-50/50 dark:bg-rose-500/5 rounded-xl border border-rose-100 dark:border-rose-500/10">
            <div className="w-8 h-8 rounded-full bg-rose-200 dark:bg-rose-500/20 flex items-center justify-center text-rose-700 dark:text-rose-400 font-black text-[11px] shrink-0">
              {(s.name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-zinc-400">{s.phone}</span>
                {s.group && <span className="text-[9px] text-zinc-400">• {s.group}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] font-black text-rose-600">
                -{formatNumber(Math.abs(s.balance || 0))}
              </p>
              <p className="text-[9px] text-zinc-400">so'm</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
