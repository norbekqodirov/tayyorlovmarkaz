import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { CHART_TOOLTIP_STYLE } from '../registry';
import { formatNumber } from '../../../utils/formatters';

export function RevenueChart({ data }: { data: any[] }) {
  const formatM = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v);
  const totalIncome = data.reduce((a, d) => a + d.income, 0);
  const totalExpense = data.reduce((a, d) => a + d.expense, 0);
  const profit = totalIncome - totalExpense;
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Daromad Dinamikasi</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Oxirgi 6 oylik taqqoslash</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-zinc-500 font-bold">Kirim</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-400" /><span className="text-zinc-500 font-bold">Chiqim</span></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Jami kirim', value: formatM(totalIncome), color: 'text-emerald-600' },
          { label: 'Jami chiqim', value: formatM(totalExpense), color: 'text-rose-600' },
          { label: 'Sof foyda', value: formatM(profit), color: profit >= 0 ? 'text-blue-600' : 'text-rose-600' },
        ].map((s, i) => (
          <div key={i} className="bg-zinc-50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-zinc-100 dark:border-white/[0.04]">
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">{s.label}</p>
            <p className={`text-sm font-black ${s.color} mt-0.5`}>{s.value} so'm</p>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4} barCategoryGap="28%">
            <defs>
              <linearGradient id="barIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="barExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} tickFormatter={formatM} width={38} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.04)' } as any} formatter={(v: any) => formatNumber(v) + ' so\'m'} />
            <Bar dataKey="income" name="Kirim" fill="url(#barIncome)" radius={[8, 8, 3, 3]} maxBarSize={24} />
            <Bar dataKey="expense" name="Chiqim" fill="url(#barExpense)" radius={[8, 8, 3, 3]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
