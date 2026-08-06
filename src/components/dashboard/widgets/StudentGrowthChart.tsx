import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { CHART_TOOLTIP_STYLE } from '../registry';

export function StudentGrowthChart({ data }: { data: any[] }) {
  const latest = data[data.length - 1]?.students || 0;
  const prev = data[data.length - 2]?.students || 0;
  const growth = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white mb-0.5">O'quvchi O'sishi</p>
          <p className="text-[10px] text-zinc-400">Oylik kumulativ dinamika</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold text-right">Jami</p>
            <p className="text-lg font-black text-slate-900 dark:text-white text-right">{latest}</p>
          </div>
          {growth !== 0 && (
            <span className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold ${growth > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10'}`}>
              {growth > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {Math.abs(growth)}%
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="dbStudents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} dy={5} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} width={30} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="students" name="O'quvchilar" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#dbStudents)" dot={false} activeDot={{ r: 5, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
