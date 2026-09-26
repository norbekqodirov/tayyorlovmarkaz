/**
 * IP-24 — metrikalar lug'ati (H.9): tanlangan oy bo'yicha barcha asosiy ko'rsatkichlar, har biri
 * ta'rifi bilan (formula, vaqt asosi, manba). Ekran va Excel eksport bir xil server javobidan —
 * Dashboard, BI, KPI va hisobotlar ham shu metrikalardan foydalanadi.
 * Backend: GET /api/analytics/metrics?month=YYYY-MM (server/services/metrics.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, Info } from 'lucide-react';
import api from '../../api/client';
import { exportToExcel } from '../../utils/export';
import { formatNumber } from '../../utils/formatters';
import { tashkentMonth } from '../../utils/tashkentDate';

interface Def { key: string; label: string; formula: string; basis: string; source: string; unit: 'som' | 'count' | 'percent' }
interface Payload {
  month: string; asOf: string; generatedAt: string; definitions: Def[]; values: Record<string, number>;
  details: { overdueBuckets: Record<string, number> };
}

const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Tushum', keys: ['accrualRevenue', 'tuitionCash', 'otherIncome'] },
  { title: 'Xarajat va pul oqimi', keys: ['operatingExpense', 'payrollCash', 'advancesCash', 'payrollAccrual', 'netCashFlow'] },
  { title: "Qarz va avans (hozirgi holat)", keys: ['receivables', 'overdueDebt', 'studentCredit'] },
  { title: "O'quvchilar va o'qish", keys: ['activeStudents', 'newStudents', 'churnRate', 'groupFill', 'attendanceRate', 'leadConversion'] },
];

const fmt = (v: number | undefined, unit: Def['unit']) =>
  v == null ? '—' : unit === 'percent' ? `${v}%` : unit === 'som' ? `${formatNumber(v)} so'm` : formatNumber(v);
const stamp = (iso: string) => {
  const t = new Date(new Date(iso).getTime() + 5 * 3600e3).toISOString();
  return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)} ${t.slice(11, 16)}`;
};

export function MetricsDictionary() {
  const [month, setMonth] = useState(tashkentMonth());
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    api.get('/analytics/metrics', { params: { month } })
      .then(r => setData(r.data))
      .catch(e => { setData(null); setError(e?.response?.data?.message || e?.response?.data?.error || "Metrikalarni yuklab bo'lmadi"); });
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const defs = new Map((data?.definitions ?? []).map(d => [d.key, d]));
  const exportXlsx = () => {
    if (!data) return;
    const rows = data.definitions.map(d => ({
      label: d.label, value: data.values[d.key], unit: d.unit === 'som' ? "so'm" : d.unit === 'percent' ? '%' : 'ta',
      formula: d.formula, basis: d.basis, source: d.source,
    }));
    const b = data.details.overdueBuckets;
    rows.push(...[['1–7 kun', b.d1_7], ['8–30 kun', b.d8_30], ['31–60 kun', b.d31_60], ['60+ kun', b.d60]].map(([k, v]) => ({
      label: `Muddati o'tgan qarz: ${k}`, value: v as number, unit: "so'm", formula: "Muddati o'tganiga necha kun bo'lgani bo'yicha", basis: 'Hozirgi holat', source: 'Oylik hisoblar',
    })));
    rows.push({ label: 'Hisoblangan vaqti', value: stamp(data.generatedAt) as any, unit: '', formula: `Oy: ${data.month}; a'zolik ko'rsatkichlari ${data.asOf} holatiga`, basis: '', source: '' });
    exportToExcel(rows, [
      { header: 'Metrika', key: 'label', width: 30 }, { header: 'Qiymat', key: 'value', width: 16 }, { header: 'Birlik', key: 'unit', width: 8 },
      { header: 'Formula', key: 'formula', width: 60 }, { header: 'Vaqt asosi', key: 'basis', width: 22 }, { header: 'Manba', key: 'source', width: 20 },
    ], `Metrikalar-${data.month}`);
  };

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-black text-sm text-slate-900 dark:text-white">Ko'rsatkichlar (metrikalar lug'ati)</h2>
          <p className="text-[11px] text-zinc-500">
            Dashboard, BI, KPI maqsadlari va hisobotlar shu ta'riflar bo'yicha hisoblanadi.
            {data ? ` Hisoblangan: ${stamp(data.generatedAt)}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" aria-label="Oy" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold" />
          <button type="button" onClick={exportXlsx} disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 disabled:opacity-50">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {!data && !error && <p className="text-sm text-zinc-400">Yuklanmoqda…</p>}
      {data && GROUPS.map(g => (
        <div key={g.title} className="space-y-2">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{g.title}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {g.keys.map(k => {
              const d = defs.get(k);
              if (!d) return null;
              const v = data.values[k];
              return (
                <div key={k} className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{d.label}</p>
                    <button type="button" aria-label={`${d.label} — qanday hisoblanadi`} onClick={() => setOpen(o => (o === k ? null : k))}
                      className="text-zinc-400 hover:text-blue-600"><Info size={14} /></button>
                  </div>
                  <p className={`text-lg font-black tabular-nums mt-0.5 ${k === 'netCashFlow' && v < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{fmt(v, d.unit)}</p>
                  {k === 'overdueDebt' && v > 0 && (
                    <p className="text-[10px] text-zinc-500 tabular-nums">
                      1–7 kun {formatNumber(data.details.overdueBuckets.d1_7)} · 8–30 {formatNumber(data.details.overdueBuckets.d8_30)} · 31–60 {formatNumber(data.details.overdueBuckets.d31_60)} · 60+ {formatNumber(data.details.overdueBuckets.d60)}
                    </p>
                  )}
                  {open === k && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">{d.formula}. <span className="text-zinc-400">Vaqt asosi: {d.basis}; manba: {d.source}.</span></p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
