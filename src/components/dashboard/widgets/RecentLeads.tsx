import { useNavigate } from 'react-router-dom';
import { ChevronRight, Target } from 'lucide-react';
import { STAGES } from '../../leads/types';

export function RecentLeads({ leads }: { leads: any[] }) {
  const navigate = useNavigate();
  const recent = [...leads]
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
    .slice(0, 6);

  const stageConfig: Record<string, { label: string; color: string }> = Object.fromEntries(
    STAGES.map(s => [s.id, { label: s.short, color: s.badge }])
  );

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">So'nggi Lidlar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">Yangi so'rovlar</p>
        </div>
        <button onClick={() => navigate('/crmtayyorlovmarkaz/leads')} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">
          Barchasi <ChevronRight size={10} />
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <Target size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Hali lid yo'q</p>
          </div>
        ) : recent.map(l => {
          const sc = stageConfig[l.stage] || stageConfig.new;
          return (
            <div key={l.id} className="flex items-center gap-2.5 py-2 border-b border-zinc-50 dark:border-white/[0.03] last:border-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-black text-[10px] shrink-0">
                {(l.name || '?').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{l.name}</p>
                <p className="text-[9px] text-zinc-400">{l.phone} • {l.source || ''}</p>
              </div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${sc.color}`}>{sc.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
