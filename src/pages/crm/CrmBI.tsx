import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import {
  TrendingUp, Users, GraduationCap,
  Download, ArrowUpRight, ArrowDownRight, Target,
  CheckCircle2, AlertTriangle,
  Activity, Layers, DollarSign, Maximize2, Zap
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';
import { exportToExcel } from '../../utils/export';
import api from '../../api/client';

const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const fN = (v: number) => new Intl.NumberFormat('uz-UZ').format(v);
const fM = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? (v / 1_000).toFixed(0) + 'K' : String(v);
const fPct = (v: number) => `${v}%`;

const TOOLTIP_STYLE = {
  borderRadius: '14px', border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 700, padding: '10px 14px',
};

function ChartCard({ title, desc, children, onExport }: {
  title: string; desc?: string; children: ReactNode; onExport?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-5 shadow-sm flex flex-col transition-all duration-200 hover:shadow-md
      ${expanded ? 'fixed inset-4 z-[100] shadow-2xl overflow-auto' : 'relative h-full'}`}>
      {expanded && <div className="fixed inset-0 bg-black/50 -z-10" onClick={() => setExpanded(false)} />}
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
          {desc && <p className="text-[10px] font-medium text-zinc-400 mt-0.5 uppercase tracking-wider">{desc}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {onExport && (
            <button onClick={onExport} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg text-zinc-400 transition-colors" title="Excel yuklash">
              <Download size={14} />
            </button>
          )}
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg text-zinc-400 transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-[220px]">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color, trend, up }: {
  label: string; value: string; sub: string; icon: any;
  color: string; trend: string; up: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-600 to-indigo-700', emerald: 'from-emerald-500 to-teal-600',
    violet: 'from-violet-600 to-purple-700', amber: 'from-amber-500 to-orange-600',
    rose: 'from-rose-500 to-red-600', cyan: 'from-cyan-500 to-blue-600',
    indigo: 'from-indigo-500 to-blue-600',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color] || colorMap.blue} rounded-2xl p-4 text-white relative overflow-hidden shadow-lg`}>
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/5" />
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
          <Icon size={16} strokeWidth={2.5} />
        </div>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[9px] font-bold`}>
          {up ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
          {trend}
        </div>
      </div>
      <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-white mt-0.5 truncate">{value}</p>
      <p className="text-[10px] text-white/60 mt-0.5 truncate">{sub}</p>
    </div>
  );
}

export default function CrmAdvancedBI() {
  const [period, setPeriod] = useState<'3' | '6' | '12'>('6');
  const [activeSection, setActiveSection] = useState<'overview' | 'finance' | 'students' | 'marketing' | 'teachers'>('overview');

  const { data: students = [] } = useFirestore<any>('students');
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: attendance = [] } = useFirestore<any>('attendance');
  const { courses, teachers, groups } = useCrmData();

  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any>(null);
  const [teacherReportData, setTeacherReportData] = useState<any[]>([]);
  const [courseRevenueData, setCourseRevenueData] = useState<Array<{ id: string; name: string; revenue: number }>>([]);
  const [cohortData, setCohortData] = useState<Array<{ month: string; total: number; active?: number; retention: number[] }>>([]);

  useEffect(() => {
    api.get('/analytics/dashboard').then(r => setAnalyticsData(r.data)).catch(() => {});
    api.get('/analytics/monthly').then(r => setMonthlyData(r.data || [])).catch(() => {});
    api.get('/analytics/forecast').then(r => setForecastData(r.data)).catch(() => {});
    api.get('/reports/teachers').then(r => setTeacherReportData(r.data?.teachers || [])).catch(() => {});
    api.get('/analytics/revenue-by-course').then(r => setCourseRevenueData(r.data || [])).catch(() => {});
    api.get('/analytics/cohort').then(r => setCohortData(r.data || [])).catch(() => {});
  }, []);

  const currentMonth = new Date().getMonth();
  const periodNum = Number(period);

  // ── Revenue chart data ───────────────────────────────────────────────
  const revenueChartData = useMemo(() => {
    if (monthlyData.length > 0) {
      const sliced = monthlyData.slice(Math.max(0, currentMonth - periodNum + 1), currentMonth + 1);
      return sliced.map(m => ({ name: m.month, kirim: m.income, chiqim: m.expense, foyda: m.profit }));
    }
    return Array.from({ length: periodNum }, (_, i) => {
      const mi = (currentMonth - periodNum + 1 + i + 12) % 12;
      const inc = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
      const exp = transactions.filter((t: any) => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
      return { name: MONTHS[mi], kirim: inc, chiqim: exp, foyda: inc - exp };
    });
  }, [transactions, monthlyData, currentMonth, periodNum]);

  // ── Student growth ───────────────────────────────────────────────────
  const studentGrowthData = useMemo(() => {
    let cumulative = 0;
    return Array.from({ length: periodNum }, (_, i) => {
      const mi = (currentMonth - periodNum + 1 + i + 12) % 12;
      const n = students.filter((s: any) => s.joinedDate && new Date(s.joinedDate).getMonth() === mi).length;
      cumulative += n;
      const left = students.filter((s: any) => s.status === 'Tark etgan').length;
      return { name: MONTHS[mi], yangi: n, jami: cumulative || students.length, chiqdi: left };
    });
  }, [students, currentMonth, periodNum]);

  // ── Lead funnel data ─────────────────────────────────────────────────
  const leadFunnelData = [
    { stage: 'Yangi', count: leads.filter((l: any) => l.stage === 'new').length, color: '#3b82f6' },
    { stage: 'Aloqa', count: leads.filter((l: any) => l.stage === 'contacted').length, color: '#f59e0b' },
    { stage: 'Uchrashuv', count: leads.filter((l: any) => l.stage === 'meeting').length, color: '#8b5cf6' },
    { stage: "O'quvchi", count: leads.filter((l: any) => l.stage === 'won').length, color: '#10b981' },
    { stage: 'Rad', count: leads.filter((l: any) => l.stage === 'lost').length, color: '#ef4444' },
  ];

  // ── Lead source ──────────────────────────────────────────────────────
  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    leads.forEach((l: any) => { const s = l.source || 'Boshqa'; sources[s] = (sources[s] || 0) + 1; });
    return Object.entries(sources).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [leads]);

  // ── Payment category ─────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    transactions.filter((t: any) => t.type === 'income').forEach((t: any) => { cats[t.category] = (cats[t.category] || 0) + (Number(t.amount) || 0); });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  // ── Attendance rate monthly ──────────────────────────────────────────
  const attendanceData = useMemo(() => {
    return Array.from({ length: periodNum }, (_, i) => {
      const mi = (currentMonth - periodNum + 1 + i + 12) % 12;
      const monthStr = `${new Date().getFullYear()}-${String(mi + 1).padStart(2, '0')}`;
      const monthRecords = attendance.filter((a: any) => (a.date || '').startsWith(monthStr));
      const allRec = monthRecords.flatMap((a: any) => a.records || []);
      const present = allRec.filter((r: any) => r.status === 'present').length;
      const rate = allRec.length > 0 ? Math.round((present / allRec.length) * 100) : 0;
      return { name: MONTHS[mi], rate, present, absent: allRec.length - present };
    });
  }, [attendance, currentMonth, periodNum]);

  // ── Churn risk students ───────────────────────────────────────────────
  const churnRiskStudents = useMemo(() => {
    const thisMonthStr = `${new Date().getFullYear()}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthDocs = attendance.filter((a: any) => (a.date || '').startsWith(thisMonthStr));

    return students
      .filter((s: any) => s.status !== 'Tark etgan')
      .map((s: any) => {
        let riskScore = 0;
        const reasons: string[] = [];

        // Overdue payment
        if ((Number(s.balance) || 0) < 0) { riskScore += 40; reasons.push('Qarzdor'); }

        // Low attendance this month
        let present = 0, total = 0;
        monthDocs.forEach((doc: any) => {
          const r = (doc.records || []).find((rec: any) => rec.studentId === s.id);
          if (r) { total++; if (r.status === 'present') present++; }
        });
        if (total > 0) {
          const rate = Math.round((present / total) * 100);
          if (rate < 50) { riskScore += 35; reasons.push(`Davomat ${rate}%`); }
          else if (rate < 70) { riskScore += 20; reasons.push(`Davomat ${rate}%`); }
        }

        // Frozen status
        if (s.status === 'Muzlatilgan') { riskScore += 25; reasons.push('Muzlatilgan'); }

        return { ...s, riskScore, reasons };
      })
      .filter((s: any) => s.riskScore >= 30)
      .sort((a: any, b: any) => b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [students, attendance, currentMonth]);

  // ── Teacher performance ───────────────────────────────────────────────
  const teacherPerformance = useMemo(() => {
    return teachers.slice(0, 6).map(teacher => {
      const tGroups = groups.filter(g => (g as any).teacherId === teacher.id || (g as any).teacher === teacher.name);
      const studentCount = tGroups.reduce((a, g: any) => a + (g.students?.length || 0), 0);
      const groupIds = tGroups.map(g => g.id);
      const attRecs = attendance.filter((a: any) => groupIds.includes(a.groupId));
      const allRec = attRecs.flatMap((a: any) => a.records || []);
      const present = allRec.filter((r: any) => r.status === 'present').length;
      const attRate = allRec.length > 0 ? Math.round((present / allRec.length) * 100) : 0;
      return {
        name: (teacher.name || '').split(' ')[0],
        guruhlar: tGroups.length,
        oquvchilar: studentCount,
        davomat: attRate,
      };
    });
  }, [teachers, groups, attendance]);

  // ── KPI aggregates ───────────────────────────────────────────────────
  const ad = analyticsData;
  const totalIncome = transactions.filter((t: any) => t.type === 'income').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
  const totalExpense = transactions.filter((t: any) => t.type === 'expense').reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
  const thisMonthIncome = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === currentMonth).reduce((a: number, t: any) => a + (Number(t.amount) || 0), 0);
  const debtorCount = students.filter((s: any) => (Number(s.balance) || 0) < 0 || s.paymentStatus === 'Qarzdorlik').length;
  const wonLeads = leads.filter((l: any) => l.stage === 'won').length;
  const convRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;
  const activeStudents = students.filter((s: any) => s.status === 'Faol' || s.status === 'active').length;

  const totalPayingStudents = students.filter((s: any) => transactions.some((t: any) => t.studentId === s.id)).length || Math.max(1, activeStudents);
  const LTV = totalIncome / totalPayingStudents;

  let expectedNextMonthRevenue = 0;
  students.filter((s:any) => s.status === 'Faol' || s.status === 'active').forEach((s: any) => {
    const sGroup = groups.find((g: any) => g.name === s.group);
    expectedNextMonthRevenue += sGroup ? Number(sGroup.price || 0) : 400000; // default to 400k if group not found
  });

  const kpis = [
    { label: "Jami O'quvchilar", value: fN(students.length), sub: `${activeStudents} faol`, icon: GraduationCap, color: 'blue', trend: `${activeStudents}`, up: true },
    { label: 'Oylik Daromad', value: fM(thisMonthIncome), sub: 'so\'m, joriy oy', icon: DollarSign, color: 'emerald', trend: ad ? `${ad.revenue?.growth_pct}%` : '–', up: (ad?.revenue?.growth_pct || 0) >= 0 },
    { label: 'Umumiy LTV', value: fM(LTV), sub: 'so\'m / mijoz', icon: Target, color: 'blue', trend: 'Mijoz qadri', up: true },
    { label: 'Prognoz Daromad', value: fM(expectedNextMonthRevenue), sub: 'kutilmoqda', icon: Zap, color: 'violet', trend: 'Keyingi oy', up: true },
    { label: 'Sof Foyda', value: fM(totalIncome - totalExpense), sub: 'so\'m, jami', icon: TrendingUp, color: 'cyan', trend: totalIncome > totalExpense ? '+' : '–', up: totalIncome > totalExpense },
    { label: 'Qarzdorlar', value: fN(debtorCount), sub: 'ta o\'quvchi', icon: AlertTriangle, color: debtorCount > 0 ? 'amber' : 'emerald', trend: debtorCount > 0 ? `${debtorCount} ta` : '0', up: debtorCount === 0 },
    { label: 'Faol Guruhlar', value: fN(groups.filter((g: any) => g.status === 'Faol' || g.status === 'active').length), sub: `${groups.length} ta jami`, icon: Layers, color: 'indigo', trend: `${groups.length}`, up: true },
    { label: 'Lid Konversiya', value: `${convRate}%`, sub: `${wonLeads} ta o'quvchiga aylandi`, icon: Target, color: 'violet', trend: `${convRate}%`, up: convRate >= 15 },
  ];

  const sections = [
    { id: 'overview', label: 'Umumiy' },
    { id: 'finance', label: 'Moliya' },
    { id: 'students', label: "O'quvchilar" },
    { id: 'marketing', label: 'Marketing' },
    { id: 'teachers', label: 'Ustozlar' },
  ] as const;

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">BI Analitika</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Real vaqtli biznes ko'rsatkichlar va tahlil</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
            {(['3', '6', '12'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${period === p ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400'}`}>
                {p} oy
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              exportToExcel(students, [
                { header: 'Ism', key: 'name', width: 25 },
                { header: 'Kurs', key: 'course', width: 20 },
                { header: 'Guruh', key: 'group', width: 15 },
                { header: 'Holat', key: 'status', width: 12 },
                { header: 'Balans', key: 'balance', width: 15 },
              ], 'BI_Hisobot');
            }}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors border border-zinc-200 dark:border-zinc-700">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`px-4 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${
              activeSection === s.id ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Forecast card */}
          {forecastData && (
            <div className="lg:col-span-3 bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Keyingi oy bashorati (AI)</p>
                  <p className="text-3xl font-black">{fM(forecastData.forecast_revenue || 0)} so'm</p>
                  <p className="text-sm text-white/70 mt-1">
                    {forecastData.trend_direction === 'up'
                      ? `📈 +${forecastData.trend_pct || 0}% o'sish kutilmoqda`
                      : forecastData.trend_direction === 'down'
                        ? `📉 ${Math.abs(forecastData.trend_pct || 0)}% kamayish mumkin`
                        : '➡️ Barqaror trend'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: 'So\'nggi 3 oy', value: (forecastData.last_3_months || []).map(fM).join(' → ') || '–' },
                    { label: 'Bashorat', value: fM(forecastData.forecast_revenue || 0) + ' so\'m' },
                    { label: 'O\'quvchi bashorat', value: (forecastData.student_forecast || 0) + ' ta' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white/10 rounded-xl p-3">
                      <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{s.label}</p>
                      <p className="text-sm font-black mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="lg:col-span-2">
            <ChartCard title="Daromad Dinamikasi" desc={`Oxirgi ${period} oy — kirim, chiqim, foyda`}
              onExport={() => exportToExcel(revenueChartData, [
                { header: 'Oy', key: 'name' }, { header: 'Kirim', key: 'kirim' },
                { header: 'Chiqim', key: 'chiqim' }, { header: 'Foyda', key: 'foyda' },
              ], 'Daromad')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChartData} barGap={3} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} tickFormatter={fM} width={40} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [fM(v) + ' so\'m', name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  <Bar dataKey="kirim" name="Kirim" fill="#10b981" radius={[6, 6, 2, 2]} maxBarSize={20} />
                  <Bar dataKey="chiqim" name="Chiqim" fill="#f43f5e" radius={[6, 6, 2, 2]} maxBarSize={20} />
                  <Bar dataKey="foyda" name="Foyda" fill="#3b82f6" radius={[6, 6, 2, 2]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div>
            <ChartCard title="Lid Voronkasi" desc="Bosqich bo'yicha taqsimot">
              <div className="space-y-3">
                {leadFunnelData.map((s, i) => {
                  const maxCount = Math.max(...leadFunnelData.map(x => x.count), 1);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">{s.stage}</span>
                        <span className="text-[11px] font-black text-slate-900 dark:text-white">{s.count}</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-white/5 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all duration-700"
                          style={{ width: `${(s.count / maxCount) * 100}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-zinc-100 dark:border-white/[0.04] flex justify-between text-[10px]">
                  <span className="text-zinc-400 font-bold">Konversiya</span>
                  <span className="font-black text-slate-900 dark:text-white">{convRate}%</span>
                </div>
              </div>
            </ChartCard>
          </div>
        </div>
      )}

      {/* Finance Section */}
      {activeSection === 'finance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Daromad Trendi" desc={`Oxirgi ${period} oylik kirim`}
            onExport={() => exportToExcel(revenueChartData, [
              { header: 'Oy', key: 'name' }, { header: 'Kirim', key: 'kirim' }, { header: 'Chiqim', key: 'chiqim' },
            ], 'Moliya_Trend')}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="gKirim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gChiqim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} tickFormatter={fM} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [fM(v) + ' so\'m', name]} />
                <Area type="monotone" dataKey="kirim" name="Kirim" stroke="#10b981" strokeWidth={2.5} fill="url(#gKirim)" dot={false} />
                <Area type="monotone" dataKey="chiqim" name="Chiqim" stroke="#f43f5e" strokeWidth={2} fill="url(#gChiqim)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Kirim Kategoriyalari" desc="Manba bo'yicha taqsimot">
            {categoryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-300">
                <DollarSign size={40} />
              </div>
            ) : (
              <div className="flex items-center gap-4 h-full">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                        {categoryData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fM(v) + ' so\'m'} contentStyle={{ borderRadius: '10px', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {categoryData.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">{c.name}</span>
                        </div>
                        <span className="text-[11px] font-black text-slate-900 dark:text-white">{fM(c.value)}</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-white/5 rounded-full h-1">
                        <div className="h-1 rounded-full" style={{ width: `${(c.value / (totalIncome || 1)) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          {/* Finance summary table */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Moliyaviy Xulosa</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Jami Kirim', value: fM(totalIncome), color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                { label: 'Jami Chiqim', value: fM(totalExpense), color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-500/10' },
                { label: 'Sof Foyda', value: fM(totalIncome - totalExpense), color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10' },
                { label: 'Bu Oy', value: fM(thisMonthIncome), color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-500/10' },
              ].map((s, i) => (
                <div key={i} className={`${s.bg} p-4 rounded-xl`}>
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">so'm</p>
                </div>
              ))}
            </div>
          </div>

          {/* Course profitability table */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05]">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Kurs Rentabelligi</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Kurs bo'yicha daromad tahlili</p>
              </div>
              <button
                onClick={() => exportToExcel(
                  courseRevenueData.map((c, i) => {
                    const courseGroups = groups.filter((g: any) => g.subject === c.name || g.course === c.name);
                    const studentCount = courseGroups.reduce((a: number, g: any) => a + (g.students?.length || 0), 0);
                    const avgPrice = courseGroups.length > 0 ? Math.round(courseGroups.reduce((a: number, g: any) => a + (Number(g.price) || 0), 0) / courseGroups.length) : 0;
                    return { rank: i + 1, name: c.name, groups: courseGroups.length, students: studentCount, monthlyExpected: avgPrice * studentCount, collected: c.revenue };
                  }),
                  [
                    { header: '#', key: 'rank' }, { header: 'Kurs', key: 'name' }, { header: 'Guruhlar', key: 'groups' },
                    { header: "O'quvchilar", key: 'students' }, { header: 'Oylik Kutilgan', key: 'monthlyExpected' }, { header: 'Yig\'ilgan', key: 'collected' },
                  ],
                  'Kurs_Rentabelligi'
                )}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg text-zinc-400 transition-colors"
                title="Excel yuklash"
              >
                <Download size={14} />
              </button>
            </div>
            {courseRevenueData.length === 0 && courses.length === 0 ? (
              <div className="py-12 text-center text-zinc-300">
                <Activity size={36} className="mx-auto mb-2" />
                <p className="text-sm">Kurs ma'lumoti yo'q</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-white/[0.02]">
                      {['#', 'Kurs', 'Guruhlar', "O'quvchilar", 'Oylik Kutilgan', "Yig'ilgan"].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {(() => {
                      // Merge API revenue data with local course/group data
                      const apiMap = new Map(courseRevenueData.map(c => [c.name, c.revenue]));
                      const allCourses = courseRevenueData.length > 0
                        ? courseRevenueData
                        : courses.map((c: any) => ({ id: c.id, name: c.name, revenue: 0 }));

                      return allCourses.map((c: any, i: number) => {
                        const courseGroups = (groups as any[]).filter(
                          (g: any) => g.subject === c.name || g.course === c.name
                        );
                        const studentCount = courseGroups.reduce(
                          (a: number, g: any) => a + (g.students?.length || 0), 0
                        );
                        const avgPrice = courseGroups.length > 0
                          ? Math.round(courseGroups.reduce((a: number, g: any) => a + (Number(g.price) || 0), 0) / courseGroups.length)
                          : 0;
                        const monthlyExpected = avgPrice * studentCount;
                        const collected = c.revenue || apiMap.get(c.name) || 0;
                        const efficiency = monthlyExpected > 0 ? Math.round((collected / monthlyExpected) * 100) : null;

                        return (
                          <tr key={c.id || i} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 text-xs font-black text-zinc-400">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                <span className="text-sm font-bold text-slate-900 dark:text-white">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-zinc-300">{courseGroups.length}</td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-zinc-300">{studentCount}</td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-black text-slate-900 dark:text-white">{fM(monthlyExpected)}</span>
                              <span className="text-[10px] text-zinc-400 ml-1">so'm</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-black ${collected > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                  {fM(collected)}
                                </span>
                                {efficiency !== null && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                    efficiency >= 80 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' :
                                    efficiency >= 50 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' :
                                    'bg-rose-100 dark:bg-rose-500/20 text-rose-600'
                                  }`}>{efficiency}%</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Students Section */}
      {activeSection === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="O'quvchi O'sishi" desc={`Oxirgi ${period} oy`}
            onExport={() => exportToExcel(studentGrowthData, [
              { header: 'Oy', key: 'name' }, { header: 'Yangi', key: 'yangi' }, { header: 'Jami', key: 'jami' },
            ], 'Oquvchilar_Osishi')}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studentGrowthData}>
                <defs>
                  <linearGradient id="gJami" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} width={30} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="jami" name="Jami" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gJami)" dot={false} />
                <Line type="monotone" dataKey="yangi" name="Yangi" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Davomat Dinamikasi" desc="Oylik davomat foizi">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} domain={[0, 100]} tickFormatter={fPct} width={35} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, 'Davomat']} />
                <Line type="monotone" dataKey="rate" name="Davomat %" stroke="#8b5cf6" strokeWidth={2.5}
                  dot={{ fill: '#8b5cf6', r: 4, stroke: 'white', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#8b5cf6', stroke: 'white', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Student status breakdown */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">O'quvchilar Holati</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Faol', count: students.filter((s: any) => s.status === 'Faol').length, color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700' },
                { label: "To'lov qilgan", count: students.filter((s: any) => s.paymentStatus === 'Tolov qilingan').length, color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700' },
                { label: 'Qarzdor', count: students.filter((s: any) => s.paymentStatus === 'Qarzdorlik').length, color: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700' },
                { label: 'Muzlatilgan', count: students.filter((s: any) => s.status === 'Muzlatilgan').length, color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700' },
              ].map((s, i) => (
                <div key={i} className={`${s.color} p-4 rounded-xl flex items-center justify-between`}>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{s.label}</p>
                    <p className="text-2xl font-black mt-1">{s.count}</p>
                  </div>
                  <CheckCircle2 size={24} className="opacity-30" />
                </div>
              ))}
            </div>
          </div>

          {/* Cohort retention heatmap */}
          {cohortData.length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">O'quvchi Retention (Cohort)</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Oylar bo'yicha o'quvchi saqlanishi</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="pr-4 pb-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest whitespace-nowrap">Cohort</th>
                      <th className="px-2 pb-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center">Jami</th>
                      {['Oy 0', 'Oy 1', 'Oy 2', 'Oy 3', 'Oy 4', 'Oy 5'].map((m, i) => (
                        <th key={i} className="px-2 pb-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-center whitespace-nowrap">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                    {cohortData.map((cohort, ci) => (
                      <tr key={ci}>
                        <td className="pr-4 py-2 text-xs font-bold text-slate-700 dark:text-zinc-300 whitespace-nowrap">{cohort.month}</td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-xs font-black text-slate-900 dark:text-white">{cohort.total}</span>
                        </td>
                        {Array.from({ length: 6 }).map((_, ri) => {
                          const pct = cohort.retention[ri];
                          if (pct === undefined) return (
                            <td key={ri} className="px-2 py-2 text-center">
                              <span className="text-[10px] text-zinc-300 dark:text-zinc-700">—</span>
                            </td>
                          );
                          const bg = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : pct >= 40 ? 'bg-orange-400' : 'bg-rose-500';
                          return (
                            <td key={ri} className="px-2 py-2 text-center">
                              <div className={`inline-flex items-center justify-center w-10 h-7 rounded-lg ${bg} text-white text-[10px] font-black`}>
                                {pct}%
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-100 dark:border-white/[0.04]">
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Rang:</span>
                {[
                  { label: '≥80%', color: 'bg-emerald-500' }, { label: '≥60%', color: 'bg-amber-400' },
                  { label: '≥40%', color: 'bg-orange-400' }, { label: '<40%', color: 'bg-rose-500' },
                ].map((l, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded-sm ${l.color}`} />
                    <span className="text-[9px] text-zinc-500">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Churn risk list */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.05]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
                  <AlertTriangle size={13} className="text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Ketish Xavfi (Churn Risk)</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Tark etishi mumkin bo'lgan o'quvchilar</p>
                </div>
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600">{churnRiskStudents.length} ta</span>
            </div>
            {churnRiskStudents.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-2" />
                <p className="text-sm font-bold text-zinc-400">Barcha o'quvchilar xavfsiz holatda!</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {churnRiskStudents.map((s: any, i: number) => (
                  <div key={s.id || i} className="flex items-center gap-3 px-5 py-3 hover:bg-rose-50/40 dark:hover:bg-rose-500/5 transition-colors">
                    {/* Risk badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                      s.riskScore >= 60 ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-600'
                    }`}>
                      {s.riskScore}
                    </div>
                    {/* Name & group */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{s.group || s.course || '—'}</p>
                    </div>
                    {/* Risk reasons */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[160px]">
                      {(s.reasons as string[]).map((r: string, ri: number) => (
                        <span key={ri} className={`text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                          r === 'Qarzdor' ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600' :
                          r === 'Muzlatilgan' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600' :
                          'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'
                        }`}>{r}</span>
                      ))}
                    </div>
                    {/* Risk level indicator */}
                    <div className={`w-2 h-8 rounded-full shrink-0 ${s.riskScore >= 60 ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Marketing Section */}
      {activeSection === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Lid Manbasi" desc="Qayerdan kelmoqda"
            onExport={() => exportToExcel(leadSourceData, [
              { header: 'Manba', key: 'name' }, { header: 'Soni', key: 'value' },
            ], 'Lid_Manbalari')}>
            {leadSourceData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-300"><Target size={40} /></div>
            ) : (
              <div className="space-y-3">
                {leadSourceData.map((s, i) => {
                  const maxV = Math.max(...leadSourceData.map(x => x.value), 1);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-slate-900 dark:text-white">{s.value} ta</span>
                          <span className="text-[9px] text-zinc-400">({Math.round((s.value / leads.length) * 100)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-white/5 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all duration-700"
                          style={{ width: `${(s.value / maxV) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Voronka Analizi" desc="Har bosqichdagi konversiya">
            <div className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadFunnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                  <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#71717a', fontWeight: 700 }} width={80} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Soni" radius={[0, 8, 8, 0]} maxBarSize={24}>
                    {leadFunnelData.map((_e, i) => <Cell key={i} fill={_e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Conversion summary */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Marketing Samaradorligi</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Jami Lidlar', value: leads.length, unit: 'ta', color: 'text-blue-600' },
                { label: "O'quvchiga aylandi", value: wonLeads, unit: 'ta', color: 'text-emerald-600' },
                { label: 'Konversiya', value: `${convRate}%`, unit: '', color: convRate >= 20 ? 'text-emerald-600' : 'text-amber-600' },
                { label: 'Rad etildi', value: leads.filter((l: any) => l.stage === 'lost').length, unit: 'ta', color: 'text-rose-600' },
              ].map((s, i) => (
                <div key={i} className="bg-zinc-50 dark:bg-white/[0.03] rounded-xl p-4 border border-zinc-100 dark:border-white/[0.05]">
                  <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}<span className="text-sm ml-1">{s.unit}</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Teachers Section */}
      {activeSection === 'teachers' && (() => {
        // Prefer API data over locally-computed data
        const displayTeachers = teacherReportData.length > 0
          ? teacherReportData.map((t: any) => ({
              name: (t.name || '').split(' ')[0],
              fullName: t.name || '',
              guruhlar: t.groups || 0,
              oquvchilar: t.students || 0,
              davomat: t.attendanceRate || 0,
              journal: t.journalEntries || 0,
            }))
          : teacherPerformance.map(t => ({ ...t, fullName: t.name, journal: 0 }));

        return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayTeachers.length === 0 ? (
            <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-12 shadow-sm text-center">
              <Users size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-bold text-zinc-400">O'qituvchilar yo'q</p>
            </div>
          ) : (
            <>
              <ChartCard title="Ustoz KPI — Guruhlar va O'quvchilar" desc="Har bir ustoz bo'yicha">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayTeachers} barGap={3} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} width={25} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="guruhlar" name="Guruhlar" fill="#3b82f6" radius={[6, 6, 2, 2]} maxBarSize={22} />
                    <Bar dataKey="oquvchilar" name="O'quvchilar" fill="#10b981" radius={[6, 6, 2, 2]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Davomat Darajasi" desc="Ustoz o'quvchilari bo'yicha">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={displayTeachers}>
                    <PolarGrid stroke="rgba(0,0,0,0.06)" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <Radar name="Davomat %" dataKey="davomat" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, 'Davomat']} />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Teacher table */}
              <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="p-5 border-b border-zinc-100 dark:border-white/[0.05]">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Ustoz Reytingi</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-white/[0.02]">
                        {['#', 'Ustoz', 'Guruhlar', "O'quvchilar", 'Davomat %', 'Reyting'].map((h: string, i: number) => (
                          <th key={i} className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {displayTeachers.map((t, i) => (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] font-black text-zinc-400">{i + 1}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-black text-[10px]">
                                {t.name.charAt(0)}
                              </div>
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{t.fullName || t.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5"><span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{t.guruhlar}</span></td>
                          <td className="px-5 py-3.5"><span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{t.oquvchilar}</span></td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-zinc-100 dark:bg-white/5 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${t.davomat >= 80 ? 'bg-emerald-500' : t.davomat >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${t.davomat}%` }} />
                              </div>
                              <span className="text-[11px] font-black text-slate-900 dark:text-white">{t.davomat}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(star => (
                                <span key={star} className={star <= Math.round(t.davomat / 20) ? 'text-amber-400' : 'text-zinc-200'}>★</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
        );
      })()}
    </div>
  );
}
