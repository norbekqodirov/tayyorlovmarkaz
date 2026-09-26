import { useState, useEffect, useRef } from 'react';
import { TrendingUp, Users, DollarSign, Target, Award, FileDown, RefreshCw } from 'lucide-react';
import api from '../../../api/client';
import { MetricsDictionary } from '../../../components/analytics/MetricsDictionary';

export default function CrmExecutiveReport() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => { void load(); return () => request.current?.abort(); }, []);

  const load = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setExportError('');
    try {
      const res = await api.get('/reports/executive', { signal: controller.signal });
      if (!controller.signal.aborted) setData(res.data);
    } catch { if (!controller.signal.aborted) setData(null); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };

  const exportPDF = async () => {
    if (!data || exporting) return;
    setExportError('');
    const content = document.getElementById('executive-report');
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) {
      setExportError("PDF uchun yangi oynaga ruxsat bering va qayta urinib ko'ring.");
      return;
    }
    setExporting(true);
    try {
      win.opener = null;
      win.document.title = 'Direktor hisoboti';
      win.document.documentElement.lang = 'uz';
      const stylesReady = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(node => {
        const clone = node.cloneNode(true) as HTMLElement;
        const ready = node instanceof HTMLLinkElement ? new Promise<void>((resolve, reject) => {
          clone.onload = () => resolve();
          clone.onerror = () => reject(new Error('Stylesheet failed'));
        }) : Promise.resolve();
        win.document.head.appendChild(clone);
        return ready;
      });
      const style = win.document.createElement('style');
      style.textContent = '@page { margin: 12mm; } body { color: #111; background: white; padding: 16px; } h1 { font-size: 22px; font-weight: bold; } header { margin-bottom: 24px; } #executive-report > div { break-inside: avoid; }';
      win.document.head.appendChild(style);
      const header = win.document.createElement('header');
      const title = win.document.createElement('h1');
      title.textContent = 'Investor/Direktor Hisoboti';
      const period = win.document.createElement('p');
      period.textContent = String(data.period?.month ?? '') + ' · ' + String(data.period?.year ?? '') + '-yil';
      header.append(title, period);
      win.document.body.append(header, content.cloneNode(true));
      await Promise.all(stylesReady);
      await win.document.fonts.ready;
      if (!win.closed) { win.focus(); win.print(); }
    } catch {
      win.close();
      setExportError("PDF tayyorlanmadi. Qayta urinib ko'ring.");
    } finally { setExporting(false); }
  };

  if (loading) return (
    <div role="status" aria-label="Hisobot yuklanmoqda" className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div role="alert" className="text-center py-16">
      <p className="text-zinc-500">Hisobot yuklashda xatolik</p>
      <button onClick={load} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">Qayta urinish</button>
    </div>
  );

  const growthPositive = (data.revenue?.growthPct || 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Investor/Direktor Hisoboti</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{data.period?.month} · {data.period?.year}-yil</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} aria-label="Hisobotni yangilash" className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
            <RefreshCw size={15} />
          </button>
          <button onClick={exportPDF} disabled={exporting} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold">
            <FileDown size={15} /> {exporting ? "Tayyorlanmoqda..." : "PDF yuklab olish"}
          </button>
        </div>
      </div>

      {exportError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{exportError}</p>}
      <div id="executive-report" className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* IP-24: kartalar metrikalar lug'atidan — BI, KPI va hisobotlar bilan bir xil */}
          <KpiCard label="Jami O'quvchi" value={data.students?.total || 0} icon={Users} color="blue" sub={<span className="text-zinc-500">ro'yxatda</span>} />
          <KpiCard label="Guruhda o'qiydi" value={data.students?.active || 0} icon={Users} color="emerald" sub={<span className="text-zinc-500">{data.students?.new || 0} yangi (bu oy)</span>} />
          <KpiCard label="Kassa kirimi (bu oy)" value={`${((data.revenue?.thisMonth || 0) / 1000000).toFixed(1)}M`} icon={DollarSign} color="green"
            sub={<span className={growthPositive ? 'text-emerald-600' : 'text-rose-600'}>
              {growthPositive ? '▲' : '▼'} {Math.abs(data.revenue?.growthPct || 0)}% o'tgan oyga
            </span>} />
          <KpiCard label="Hisoblangan (bu oy)" value={`${((data.revenue?.accrual || 0) / 1000000).toFixed(1)}M`} icon={TrendingUp} color="indigo" sub={<span className="text-zinc-500">o'quvchi hisoblari</span>} />
          <KpiCard label="Lid konversiyasi" value={`${data.leads?.conversionRate || 0}%`} icon={Target} color="violet" sub={<span className="text-zinc-500">bu oy lidlari</span>} />
          <KpiCard label="Muddati o'tgan qarz" value={`${((data.debt?.overdue || 0) / 1000000).toFixed(1)}M`} icon={Award} color="rose" sub={<span className="text-zinc-500">{data.overduePayments || 0} qarzdor o'quvchi</span>} />
        </div>

        {/* Revenue section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Daromad tahlili</h2>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bu oy kassa kirimi</span>
                <span className="font-black text-slate-900 dark:text-white">{(data.revenue?.thisMonth || 0).toLocaleString()} so'm</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center text-xs text-zinc-500">
                <span>shundan kurs to'lovi / boshqa kirim</span>
                <span className="tabular-nums">{(data.revenue?.tuitionCash || 0).toLocaleString()} / {(data.revenue?.otherIncome || 0).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bu oy hisoblangan (o'quvchi hisoblari)</span>
                <span className="font-black text-slate-900 dark:text-white">{(data.revenue?.accrual || 0).toLocaleString()} so'm</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">O'tgan oy</span>
                <span className="font-black text-slate-900 dark:text-white">{(data.revenue?.prevMonth || 0).toLocaleString()} so'm</span>
              </div>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">O'sish</span>
                <span className={`font-black text-lg ${growthPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {growthPositive ? '+' : ''}{data.revenue?.growthPct || 0}%
                </span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Yil davomida</span>
                <span className="font-black text-indigo-600">{(data.revenue?.yearToDate || 0).toLocaleString()} so'm</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Lidlar (bu oy)</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bu oy kelgan lidlar</span>
                <span className="font-black text-slate-900 dark:text-white">{data.leads?.total || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">O'quvchiga aylangan</span>
                <span className="font-black text-emerald-600">{data.leads?.won || 0}</span>
              </div>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex justify-between">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Konversiya</span>
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

        <MetricsDictionary />

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
                  <span className="min-w-0 break-words flex-1 text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
                  <span className="shrink-0 text-sm font-black text-zinc-500">{c.groups} guruh</span>
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
      <p className="text-2xl break-words font-black text-slate-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs mt-0.5">{sub}</p>}
    </div>
  );
}
