import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export function LeadSourceChart({ data }: { data: any[] }) {
  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899'];
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-black text-slate-900 dark:text-white mb-0.5">Lid Manbasi</p>
        <p className="text-[10px] text-zinc-400">Qayerdan kelmoqda</p>
      </div>
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-[130px] h-[130px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={4} dataKey="count" cornerRadius={4}>
                {data.map((_item, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-black text-slate-900 dark:text-white">{total}</span>
            <span className="text-[8px] font-bold text-zinc-400 uppercase">Lid</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {data.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 truncate max-w-[80px]">{s.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-black text-slate-900 dark:text-white">{s.count}</span>
                <span className="text-[9px] text-zinc-400">({total > 0 ? Math.round((s.count / total) * 100) : 0}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
