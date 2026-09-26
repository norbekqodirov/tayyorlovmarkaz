import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { toTashkentDate } from '../../../utils/tashkentDate';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import {
  TrendingUp, Users, GraduationCap,
  Download, Target,
  CheckCircle2, AlertTriangle,
  Activity, Layers, DollarSign, Maximize2, Zap, RefreshCw, Loader2
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useCrmData } from '../../../hooks/useCrmData';
import { exportToExcel } from '../../../utils/export';
import { STAGES } from '../../../components/leads/types';
import api from '../../../api/client';
import { formatNumber } from '../../../utils/formatters';
import { StatCard, type StatCardProps } from '../../../components/ui/StatCard';
import { ErrorState } from '../../../components/States';
import { studentStatusToUi } from '../../../utils/statusBadge';

const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

// Safe number helper preventing NaN, null, undefined errors
const safeNum = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const fN = (v: any) => formatNumber(safeNum(v));
const fM = (v: any) => {
  const n = safeNum(v);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
};
const fPct = (v: any) => `${safeNum(v)}%`;

const TOOLTIP_STYLE = {
  borderRadius: '14px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
  fontSize: 11,
  fontWeight: 700,
  padding: '10px 14px',
};

function ChartCard({ title, desc, children, onExport }: {
  title: string; desc?: string; children: ReactNode; onExport?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-4 sm:p-5 shadow-sm flex flex-col transition-all duration-200 hover:shadow-md
      ${expanded ? 'fixed inset-2 sm:inset-4 z-[100] shadow-2xl overflow-auto' : 'relative h-full'}`}>
      {expanded && <div className="fixed inset-0 bg-black/50 -z-10" onClick={() => setExpanded(false)} />}
      <div className="flex items-start justify-between mb-4 shrink-0 gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">{title}</h3>
          {desc && <p className="text-[9px] sm:text-[10px] font-medium text-zinc-400 mt-0.5 uppercase tracking-wider">{desc}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
      <div className="flex-1 min-h-[220px] w-full">{children}</div>
    </div>
  );
}

export default function CrmAdvancedBI() {
  const [period, setPeriod] = useState<'week' | 'month' | 'year' | '3' | '6' | '12'>('6');
  const [activeSection, setActiveSection] = useState<'overview' | 'finance' | 'students' | 'marketing' | 'teachers'>('overview');
  const [customFrom] = useState('');
  const [customTo] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: students = [] } = useFirestore<any>('students');
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: attendanceRecords = [] } = useFirestore<any>('attendanceRecords');
  const { teachers, groups } = useCrmData();

  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [managerSummary, setManagerSummary] = useState<any>(null);
  const [leadSourcesApi, setLeadSourcesApi] = useState<{ name: string; value: number }[]>([]);
  const [teacherPerfApi, setTeacherPerfApi] = useState<{ name: string; guruhlar: number; oquvchilar: number; davomat: number }[]>([]);

  const getDateRange = () => {
    const now = new Date();
    if (period === 'week') {
      const from = new Date(now); from.setDate(now.getDate() - 7);
      return { from: toTashkentDate(from), to: toTashkentDate(now) };
    }
    if (period === 'month') {
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: toTashkentDate(now) };
    }
    if (period === 'year') {
      return { from: `${now.getFullYear()}-01-01`, to: toTashkentDate(now) };
    }
    return { from: customFrom || '', to: customTo || '' };
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = getDateRange();
      const params = range.from && range.to ? `?from=${range.from}&to=${range.to}` : '';

      const [dashRes, monthlyRes, summaryRes, sourcesRes, teacherRes] = await Promise.allSettled([
        api.get('/analytics/dashboard'),
        api.get('/analytics/monthly'),
        api.get(`/analytics/reports/manager-summary${params}`),
        api.get('/analytics/lead-sources'),
        api.get('/analytics/teacher-performance'),
      ]);

      if (dashRes.status === 'fulfilled') {
        setAnalyticsData(dashRes.value.data);
      }
      if (monthlyRes.status === 'fulfilled') {
        setMonthlyData(monthlyRes.value.data || []);
      }
      if (summaryRes.status === 'fulfilled') {
        setManagerSummary(summaryRes.value.data);
      }
      if (sourcesRes.status === 'fulfilled' && Array.isArray(sourcesRes.value.data)) {
        setLeadSourcesApi(sourcesRes.value.data.map((s: any) => ({
          name: String(s.name || 'Boshqa'),
          value: safeNum(s.count ?? s.value),
        })));
      }
      if (teacherRes.status === 'fulfilled' && Array.isArray(teacherRes.value.data)) {
        setTeacherPerfApi(teacherRes.value.data.map((t: any) => ({
          name: String(t.name || '').split(' ')[0] || 'Ustoz',
          guruhlar: safeNum(t.groups ?? t.guruhlar),
          oquvchilar: safeNum(t.students ?? t.oquvchilar),
          davomat: safeNum(t.attendanceRate ?? t.davomat),
        })));
      }

      // Check if critical core request failed
      if (dashRes.status === 'rejected' && monthlyRes.status === 'rejected') {
        throw new Error('BI analitika ma\'lumotlarini serverdan yuklab bo\'mladi');
      }
    } catch (err: any) {
      console.error('BI analytics fetch error:', err);
      setError(err?.response?.data?.error || err?.message || 'Analitika ma\'lumotlarini yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, customFrom, customTo]);

  const currentMonth = new Date().getMonth();
  const periodNum = safeNum(period) || 6;

  // ── Revenue chart data ───────────────────────────────────────────────
  const revenueChartData = useMemo(() => {
    if (monthlyData.length > 0) {
      const sliced = monthlyData.slice(Math.max(0, currentMonth - periodNum + 1), currentMonth + 1);
      return sliced.map(m => ({
        name: String(m.month || ''),
        kirim: safeNum(m.income),
        chiqim: safeNum(m.expense),
        foyda: safeNum(m.profit),
      }));
    }
    return Array.from({ length: periodNum }, (_, i) => {
      const mi = (currentMonth - periodNum + 1 + i + 12) % 12;
      const inc = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + safeNum(t.amount), 0);
      const exp = transactions.filter((t: any) => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + safeNum(t.amount), 0);
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
      const left = students.filter((s: any) => studentStatusToUi(s.status) === 'Tark etgan').length;
      return { name: MONTHS[mi], yangi: n, jami: cumulative || students.length, chiqdi: left };
    });
  }, [students, currentMonth, periodNum]);

  // ── Lead funnel data ─────────────────────────────────────────────────
  const leadFunnelData = useMemo(() => {
    return STAGES.map(s => ({
      stage: s.short,
      count: leads.filter((l: any) => l.stage === s.id).length,
      color: s.hex,
    }));
  }, [leads]);

  // ── Lead source ──────────────────────────────────────────────────────
  const leadSourceData = useMemo(() => {
    if (leadSourcesApi.length > 0) return leadSourcesApi;
    const sources: Record<string, number> = {};
    leads.forEach((l: any) => { const s = String(l.source || 'Boshqa'); sources[s] = (sources[s] || 0) + 1; });
    return Object.entries(sources).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [leads, leadSourcesApi]);

  // ── Payment category ─────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    transactions.filter((t: any) => t.type === 'income').forEach((t: any) => {
      const cat = String(t.category || 'Boshqa');
      cats[cat] = (cats[cat] || 0) + safeNum(t.amount);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  // ── Attendance rate monthly ──────────────────────────────────────────
  const attendanceData = useMemo(() => {
    return Array.from({ length: periodNum }, (_, i) => {
      const mi = (currentMonth - periodNum + 1 + i + 12) % 12;
      const monthStr = `${new Date().getFullYear()}-${String(mi + 1).padStart(2, '0')}`;
      const allRec = attendanceRecords.filter((r: any) => (r.date || '').startsWith(monthStr));
      const present = allRec.filter((r: any) => r.status === 'present').length;
      const rate = allRec.length > 0 ? Math.round((present / allRec.length) * 100) : 0;
      return { name: MONTHS[mi], rate, present, absent: allRec.length - present };
    });
  }, [attendanceRecords, currentMonth, periodNum]);

  // ── Teacher performance ───────────────────────────────────────────────
  const teacherPerformance = useMemo(() => {
    if (teacherPerfApi.length > 0) return teacherPerfApi;
    return teachers.slice(0, 6).map(teacher => {
      const tGroups = groups.filter(g => (g as any).teacherId === teacher.id || (g as any).teacher === teacher.name);
      const studentCount = tGroups.reduce((a, g: any) => {
        const count = g._count?.enrollments ?? (g.enrollments?.length ?? students.filter((s: any) => s.groupId === g.id || s.group === g.name).length);
        return a + count;
      }, 0);
      const groupIds = tGroups.map(g => g.id);
      const allRec = attendanceRecords.filter((r: any) => groupIds.includes(r.groupId));
      const present = allRec.filter((r: any) => r.status === 'present').length;
      const attRate = allRec.length > 0 ? Math.round((present / allRec.length) * 100) : 0;
      return {
        name: (teacher.name || '').split(' ')[0] || 'Ustoz',
        guruhlar: tGroups.length,
        oquvchilar: studentCount,
        davomat: attRate,
      };
    });
  }, [teachers, groups, attendanceRecords, students, teacherPerfApi]);

  // ── KPI aggregates ───────────────────────────────────────────────────
  const ad = analyticsData;
  const totalIncome = safeNum(ad?.revenue?.total_income) || transactions.filter((t: any) => t.type === 'income').reduce((a: number, t: any) => a + safeNum(t.amount), 0);
  const totalExpense = safeNum(ad?.revenue?.total_expense) || transactions.filter((t: any) => t.type === 'expense').reduce((a: number, t: any) => a + safeNum(t.amount), 0);
  const thisMonthIncome = safeNum(ad?.revenue?.this_month) || transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === currentMonth).reduce((a: number, t: any) => a + safeNum(t.amount), 0);
  const debtorCount = safeNum(ad?.students?.debtors) || students.filter((s: any) => safeNum(s.balance) < 0).length;
  const totalStudentsCount = safeNum(ad?.students?.total) || students.length;
  const activeStudents = safeNum(ad?.students?.active) || students.filter((s: any) => studentStatusToUi(s.status) === 'Faol').length;
  const wonLeads = safeNum(ad?.leads?.won) || leads.filter((l: any) => l.stage === 'won').length;
  const totalLeads = safeNum(ad?.leads?.total) || leads.length;
  const convRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  const totalPayingStudents = students.filter((s: any) => transactions.some((t: any) => t.studentId === s.id)).length || Math.max(1, activeStudents);
  const LTV = totalPayingStudents > 0 ? Math.round(totalIncome / totalPayingStudents) : 0;

  let expectedNextMonthRevenue = 0;
  students.filter((s: any) => studentStatusToUi(s.status) === 'Faol').forEach((s: any) => {
    const sGroup = groups.find((g: any) => g.name === s.group);
    expectedNextMonthRevenue += sGroup ? safeNum(sGroup.price) : 400000;
  });

  const kpis: StatCardProps[] = [
    {
      label: "Jami O'quvchilar",
      value: `${fN(totalStudentsCount)} ta`,
      sub: `${activeStudents} faol o'quvchi`,
      icon: <GraduationCap size={18} strokeWidth={2.5} />,
      color: 'blue',
      variant: 'gradient',
      trend: { value: activeStudents, direction: 'up', label: 'faol' },
      sparkline: studentGrowthData.map(s => s.yangi),
    },
    {
      label: 'Oylik Daromad',
      value: `${fM(thisMonthIncome)} so'm`,
      sub: 'Joriy oy kirimi',
      icon: <DollarSign size={18} strokeWidth={2.5} />,
      color: 'emerald',
      variant: 'gradient',
      trend: ad?.revenue?.growth_pct !== undefined
        ? { value: safeNum(ad.revenue.growth_pct), direction: safeNum(ad.revenue.growth_pct) >= 0 ? 'up' : 'down', label: "o'tgan oyga" }
        : managerSummary?.income_growth !== undefined
        ? { value: safeNum(managerSummary.income_growth), direction: safeNum(managerSummary.income_growth) >= 0 ? 'up' : 'down', label: "o'tgan oyga" }
        : undefined,
      sparkline: revenueChartData.map(r => r.kirim),
    },
    {
      label: 'Umumiy LTV',
      value: `${fM(LTV)} so'm`,
      sub: "so'm / mijoz (o'rtacha)",
      icon: <Target size={18} strokeWidth={2.5} />,
      color: 'indigo',
      variant: 'gradient',
      trend: { value: 'Mijoz qadri', direction: 'up' },
    },
    {
      label: 'Prognoz Daromad',
      value: `${fM(expectedNextMonthRevenue)} so'm`,
      sub: 'Keyingi oy kutilmoqda',
      icon: <Zap size={18} strokeWidth={2.5} />,
      color: 'violet',
      variant: 'gradient',
      trend: { value: 'Keyingi oy', direction: 'up' },
    },
    {
      label: 'Sof Foyda',
      value: `${fM(totalIncome - totalExpense)} so'm`,
      sub: 'Jami kirim - chiqim',
      icon: <TrendingUp size={18} strokeWidth={2.5} />,
      color: 'cyan',
      variant: 'gradient',
      trend: {
        value: totalIncome >= totalExpense ? '+' : '–',
        direction: totalIncome >= totalExpense ? 'up' : 'down',
        label: totalIncome >= totalExpense ? 'Foydada' : 'Zararda',
      },
      sparkline: revenueChartData.map(r => r.foyda),
    },
    {
      label: 'Qarzdorlar',
      value: `${fN(debtorCount)} ta`,
      sub: debtorCount > 0 ? "To'lov kechikkan" : "Qarzdorlik yo'q",
      icon: <AlertTriangle size={18} strokeWidth={2.5} />,
      color: debtorCount > 0 ? 'amber' : 'emerald',
      variant: 'gradient',
      trend: {
        value: debtorCount,
        direction: debtorCount > 0 ? 'down' : 'up',
        label: debtorCount > 0 ? 'qarzdor' : 'hammasi toza',
      },
    },
    {
      label: 'Faol Guruhlar',
      value: `${fN(safeNum(ad?.groups?.active) || groups.filter((g: any) => g.status === 'Faol' || g.status === 'active').length)} ta`,
      sub: `${safeNum(ad?.groups?.total) || groups.length} ta jami guruh`,
      icon: <Layers size={18} strokeWidth={2.5} />,
      color: 'blue',
      variant: 'gradient',
      trend: { value: `${safeNum(ad?.groups?.total) || groups.length} jami`, direction: 'up' },
    },
    {
      label: 'Lid Konversiya',
      value: `${convRate}%`,
      sub: `${wonLeads} ta o'quvchiga aylandi`,
      icon: <Target size={18} strokeWidth={2.5} />,
      color: 'rose',
      variant: 'gradient',
      trend: {
        value: convRate,
        direction: convRate >= 15 ? 'up' : 'down',
        label: `${wonLeads}/${totalLeads}`,
      },
    },
  ];

  const sections = [
    { id: 'overview', label: 'Umumiy' },
    { id: 'finance', label: 'Moliya' },
    { id: 'students', label: "O'quvchilar" },
    { id: 'marketing', label: 'Marketing' },
    { id: 'teachers', label: 'Ustozlar' },
  ] as const;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-sm font-bold text-zinc-400">BI Analitika ma'lumotlari yuklanmoqda...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <ErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">BI Analitika</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Real vaqtli biznes ko'rsatkichlar va tahlil</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-between md:justify-end">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 flex-wrap">
            {([
              { key: 'week', label: 'Hafta' },
              { key: 'month', label: 'Oy' },
              { key: 'year', label: 'Yil' },
              { key: '3', label: '3 oy' },
              { key: '6', label: '6 oy' },
              { key: '12', label: '12 oy' },
            ] as const).map(p => (
              <button key={p.key} onClick={() => { setPeriod(p.key); }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black transition-all ${period === p.key ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {managerSummary && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/30 text-xs font-black text-emerald-700 dark:text-emerald-400">
                <TrendingUp size={12} />
                {safeNum(managerSummary.income_growth) >= 0 ? '+' : ''}{safeNum(managerSummary.income_growth)}% o'tgan oyga
              </div>
            )}
            <button onClick={loadData} className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl hover:bg-zinc-200 transition-colors border border-zinc-200 dark:border-zinc-700" title="Yangilash">
              <RefreshCw size={14} />
            </button>
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
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-full sm:w-fit border border-zinc-200 dark:border-zinc-700">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`px-4 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap transition-all ${
              activeSection === s.id ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* KPI Grid - Responsive grid cols */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => <StatCard key={i} {...k} size="sm" />)}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, name: string) => [fM(v) + ' so\'m', name]} />
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
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, name: string) => [fM(v) + ' so\'m', name]} />
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
              <div className="flex flex-col sm:flex-row items-center gap-4 h-full">
                <div className="w-[160px] h-[160px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                        {categoryData.map((_e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fM(v) + ' so\'m'} contentStyle={{ borderRadius: '10px', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-2.5">
                  {categoryData.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 truncate max-w-[120px] sm:max-w-[150px]">{c.name}</span>
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
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-4 sm:p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Moliyaviy Xulosa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard variant="minimal" color="emerald" label="Jami Kirim" value={`${fM(totalIncome)} so'm`} sub="Barcha kirimlar" icon={<DollarSign size={18} />} size="sm" />
              <StatCard variant="minimal" color="rose" label="Jami Chiqim" value={`${fM(totalExpense)} so'm`} sub="Barcha xarajatlar" icon={<TrendingUp size={18} className="rotate-180" />} size="sm" />
              <StatCard variant="minimal" color="blue" label="Sof Foyda" value={`${fM(totalIncome - totalExpense)} so'm`} sub="Kirim - Chiqim" icon={<TrendingUp size={18} />} size="sm" />
              <StatCard variant="minimal" color="violet" label="Bu Oy" value={`${fM(thisMonthIncome)} so'm`} sub="Joriy oy tushumi" icon={<DollarSign size={18} />} size="sm" />
            </div>
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
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${safeNum(v)}%`, 'Davomat']} />
                <Line type="monotone" dataKey="rate" name="Davomat %" stroke="#8b5cf6" strokeWidth={2.5}
                  dot={{ fill: '#8b5cf6', r: 4, stroke: 'white', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#8b5cf6', stroke: 'white', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Student status breakdown */}
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-4 sm:p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">O'quvchilar Holati</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard variant="minimal" color="emerald" label="Faol" value={`${students.filter((s: any) => studentStatusToUi(s.status) === 'Faol').length} ta`} sub="O'qishni davom ettirmoqda" icon={<GraduationCap size={18} />} size="sm" />
              <StatCard variant="minimal" color="blue" label="To'lov qilgan" value={`${students.filter((s: any) => s.paymentStatus !== 'Hisobsiz' && safeNum(s.balance) >= 0).length} ta`} sub="Hisobi bor, qarzi yo'q" icon={<CheckCircle2 size={18} />} size="sm" />
              <StatCard variant="minimal" color="rose" label="Qarzdor" value={`${students.filter((s: any) => safeNum(s.balance) < 0).length} ta`} sub="Qarzdorlik mavjud" icon={<AlertTriangle size={18} />} size="sm" />
              <StatCard variant="minimal" color="amber" label="Muzlatilgan" value={`${students.filter((s: any) => studentStatusToUi(s.status) === 'Muzlatilgan').length} ta`} sub="Vaqtincha to'xtatilgan" icon={<Activity size={18} />} size="sm" />
            </div>
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
                  const pct = totalLeads > 0 ? Math.round((s.value / totalLeads) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">{s.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-slate-900 dark:text-white">{s.value} ta</span>
                          <span className="text-[9px] text-zinc-400">({pct}%)</span>
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
          <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-4 sm:p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Marketing Samaradorligi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard variant="minimal" color="blue" label="Jami Lidlar" value={`${totalLeads} ta`} sub="Barcha ro'yxatdagilar" icon={<Target size={18} />} size="sm" />
              <StatCard variant="minimal" color="emerald" label="O'quvchiga aylandi" value={`${wonLeads} ta`} sub="Muvaffaqiyatli qabul" icon={<CheckCircle2 size={18} />} size="sm" />
              <StatCard variant="minimal" color={convRate >= 20 ? 'emerald' : 'amber'} label="Konversiya" value={`${convRate}%`} sub="O'rtacha konversiya" trend={{ value: convRate, direction: convRate >= 20 ? 'up' : 'down' }} icon={<TrendingUp size={18} />} size="sm" />
              <StatCard variant="minimal" color="rose" label="Rad etildi" value={`${leads.filter((l: any) => l.stage === 'lost').length} ta`} sub="Yo'qotilgan lidlar" icon={<AlertTriangle size={18} />} size="sm" />
            </div>
          </div>
        </div>
      )}

      {/* Teachers Section */}
      {activeSection === 'teachers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {teacherPerformance.length === 0 ? (
            <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 p-12 shadow-sm text-center">
              <Users size={40} className="mx-auto text-zinc-300 mb-3" />
              <p className="text-sm font-bold text-zinc-400">O'qituvchilar yo'q</p>
            </div>
          ) : (
            <>
              <ChartCard title="Ustoz KPI — Guruhlar va O'quvchilar" desc="Har bir ustoz bo'yicha">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teacherPerformance} barGap={3} barCategoryGap="30%">
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
                  <RadarChart data={teacherPerformance}>
                    <PolarGrid stroke="rgba(0,0,0,0.06)" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                    <Radar name="Davomat %" dataKey="davomat" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${safeNum(v)}%`, 'Davomat']} />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Teacher table */}
              <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-2xl border border-zinc-200/80 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-white/[0.05]">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Ustoz Reytingi</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-white/[0.02]">
                        {['#', 'Ustoz', 'Guruhlar', "O'quvchilar", 'Davomat %', 'Reyting'].map((h, i) => (
                          <th key={i} className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {teacherPerformance.map((t, i) => (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] font-black text-zinc-400">{i + 1}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-black text-[10px]">
                                {(t.name || 'U').charAt(0)}
                              </div>
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5"><span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{t.guruhlar}</span></td>
                          <td className="px-5 py-3.5"><span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{t.oquvchilar}</span></td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-zinc-100 dark:bg-white/5 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.min(100, Math.max(0, safeNum(t.davomat)))}%` }} />
                              </div>
                              <span className="text-[11px] font-black text-slate-900 dark:text-white">{safeNum(t.davomat)}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(star => (
                                <span key={star} className={star <= Math.round(safeNum(t.davomat) / 20) ? 'text-amber-400' : 'text-zinc-200'}>★</span>
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
      )}
    </div>
  );
}
