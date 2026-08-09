import { STAGES } from '../../leads/types';

export function LeadFunnelChart({ leads }: { leads: any[] }) {
  const data = STAGES.map(s => ({
    name: s.short,
    count: leads.filter(l => l.stage === s.id).length,
    color: s.hex,
  }));
  const total = leads.length || 1;

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-black text-slate-900 dark:text-white mb-0.5">Lid Voronkasi</p>
        <p className="text-[10px] text-zinc-400">Bosqich bo'yicha taqsimot</p>
      </div>
      <div className="space-y-2.5 flex-1">
        {data.map((s, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">{s.name}</span>
              <span className="text-[11px] font-black text-slate-900 dark:text-white">{s.count} ta</span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-white/5 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] text-zinc-400 font-bold">Jami lid:</span>
        <span className="text-sm font-black text-slate-900 dark:text-white">{leads.length}</span>
      </div>
    </div>
  );
}
