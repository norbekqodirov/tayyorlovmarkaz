import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Award, FileDown, RefreshCw } from 'lucide-react';
import api from '../../../api/client';

export default function CrmExecutiveReport() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/executive');
      setData(res.data);
    } catch { setData(null); }
    setLoading(false);
  };

  const exportPDF = () => {
    if (!data) return;
    const printContent = document.getElementById('executive-report');
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Executive Report</title><style>
      * { box-sizing: border-box; font-family: sans-serif; }
      body { margin: 20px; color: #111; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
      .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
      .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
      .value { font-size: 24px; font-weight: 900; color: #0f172a; margin-top: 4px; }
      .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
      h1 { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
      h2 { font-size: 14px; font-weight: 900; margin: 20px 0 10px; }
      .green { color: #16a34a; } .red { color: #dc2626; }
    </style></head><body>`);
    win.document.write(printContent.innerHTML);
    win.document.write(`</body></html>`);
    win.document.close();
    win.print();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-16">
      <p className="text-zinc-500">Hisobot yuklashda xatolik</p>
      <button onClick={load} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">Qayta urinish</button>
    </div>
  );

  const growthPositive = (data.revenue?.growthPct || 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Investor/Direktor Hisoboti</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{data.period?.month} · {data.period?.year}-yil</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
            <RefreshCw size={15} />
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold">
            <FileDown size={15} /> PDF Export
          </button>
        </div>
      </div>

      <div id="executive-report" className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Jami O'quvchi" value={data.students?.total || 0} icon={Users} color="blue" />
          <KpiCard label="Faol O'quvchi" value={data.students?.active || 0} icon={Users} color="emerald" />
          <KpiCard label="Bu oy daromad" value={`${((data.revenue?.thisMonth || 0) / 1000000).toFixed(1)}M`} icon={DollarSign} color="green"
            sub={<span className={growthPositive ? 'text-emerald-600' : 'text-rose-600'}>
              {growthPositive ? '▲' : '▼'} {Math.abs(data.revenue?.growthPct || 0)}%
            </span>} />
          <KpiCard label="Yil davomida" value={`${((data.revenue?.yearToDate || 0) / 1000000).toFixed(1)}M`} icon={TrendingUp} color="indigo" />
          <KpiCard label="Lead conversion" value={`${data.leads?.conversionRate || 0}%`} icon={Target} color="violet" />
          <KpiCard label="Muddati o'tgan" value={data.overduePayments || 0} icon={Award} color="rose" sub="to'lov" />
        </div>

        {/* Revenue section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Daromad tahlili</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bu oy</span>
                <span className="font-black text-slate-900 dark:text-white">{(data.revenue?.thisMonth || 0).toLocaleString()} so'm</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">O'tgan oy</span>
                <span className="font-black text-slate-900 dark:text-white">{(data.revenue?.prevMonth || 0).toLocaleString()} so'm</span>
              </div>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">O'sish</span>
                <span className={`font-black text-lg ${growthPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {growthPositive ? '+' : ''}{data.revenue?.growthPct || 0}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Yil davomida</span>
                <span className="font-black text-indigo-600">{(data.revenue?.yearToDate || 0).toLocaleString()} so'm</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Lead Funnel</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Jami lidlar</span>
                <span className="font-black text-slate-900 dark:text-white">{data.leads?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Muvaffaqiyatli (won)</span>
                <span className="font-black text-emerald-600">{data.leads?.won || 0}</span>
              </div>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Conversion rate</span>
                <span className="font-black text-violet-600 text-lg">{data.leads?.conversionRate || 0}%</span>
              </div>

              {/* Progress bar */}
              <div className="mt-2">
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                    style={{ width: `${data.leads?.conversionRate || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Courses */}
        {data.topCourses?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Top 3 Kurs</h2>
            <div className="space-y-3">
              {data.topCourses.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' : 'bg-orange-100 text-orange-700'
                  }`}>{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
                  <span className="text-sm font-black text-zinc-500">{c.groups} guruh</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }: any) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-600',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600',
    violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600',
    rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600',
  };
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className={`w-8 h-8 rounded-xl mb-3 flex items-center justify-center ${colors[color] || colors.blue}`}>
        <Icon size={15} />
      </div>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
