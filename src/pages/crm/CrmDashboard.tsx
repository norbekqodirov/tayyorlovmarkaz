import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Users, GraduationCap, Wallet, TrendingUp,
  ArrowUpRight, ArrowDownRight, Layers,
  Plus, X, Settings2, BarChart2, BookOpen, Calendar,
  Check, AlertCircle, CheckCircle2,
  Sparkles, Zap, ChevronRight, Clock, AlertTriangle,
  CreditCard, UserCheck, ListChecks, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFirestore } from '../../hooks/useFirestore';

// ─── Widget Registry ───────────────────────────────────────────────────────
export const WIDGET_REGISTRY = [
  { id: 'stat_students', title: "Jami O'quvchilar", category: 'Statistika', permission: 'students', size: 'sm' as const },
  { id: 'stat_groups', title: 'Faol Guruhlar', category: 'Statistika', permission: 'groups', size: 'sm' as const },
  { id: 'stat_revenue', title: 'Oylik Daromad', category: 'Moliya', permission: 'finance', size: 'sm' as const },
  { id: 'stat_leads', title: 'Yangi Lidlar', category: 'Marketing', permission: 'leads', size: 'sm' as const },
  { id: 'stat_debtors', title: 'Qarzdorlar', category: 'Moliya', permission: 'finance', size: 'sm' as const },
  { id: 'stat_teachers', title: "O'qituvchilar", category: 'HR', permission: 'teachers', size: 'sm' as const },
  { id: 'stat_attendance', title: 'Bugun Davomat', category: 'Statistika', permission: 'students', size: 'sm' as const },
  { id: 'stat_conversion', title: 'Konversiya', category: 'Marketing', permission: 'leads', size: 'sm' as const },
  { id: 'chart_revenue', title: 'Daromad Grafigi', category: 'Moliya', permission: 'finance', size: 'lg' as const },
  { id: 'chart_students', title: "O'quvchi O'sishi", category: 'Tahlil', permission: 'students', size: 'md' as const },
  { id: 'chart_leads', title: 'Lid Manbasi', category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'chart_lead_funnel', title: 'Lid Voronkasi', category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'table_upcoming', title: "Bugungi Darslar", category: "Ta'lim", permission: 'schedule', size: 'md' as const },
  { id: 'table_debtors', title: 'Qarzdorlar Ro\'yxati', category: 'Moliya', permission: 'finance', size: 'md' as const },
  { id: 'table_top_students', title: "Top O'quvchilar", category: "Ta'lim", permission: 'students', size: 'md' as const },
  { id: 'list_payments', title: "So'nggi To'lovlar", category: 'Moliya', permission: 'finance', size: 'md' as const },
  { id: 'list_recent_leads', title: "So'nggi Lidlar", category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'tasks', title: 'Vazifalar', category: 'Umumiy', permission: null, size: 'md' as const },
  { id: 'quick_links', title: 'Tezkor Havolalar', category: 'Umumiy', permission: null, size: 'sm' as const },
];

const DEFAULT_WIDGETS_ADMIN = [
  'stat_students', 'stat_revenue', 'stat_leads', 'stat_debtors',
  'chart_revenue', 'chart_students',
  'table_upcoming', 'table_debtors', 'list_payments', 'list_recent_leads'
];
const DEFAULT_WIDGETS_TEACHER = ['stat_students', 'stat_groups', 'stat_attendance', 'table_upcoming', 'chart_students'];
const DEFAULT_WIDGETS_MARKETING = ['stat_leads', 'stat_conversion', 'chart_lead_funnel', 'chart_leads', 'list_recent_leads'];

function getDefaultWidgets(role: string) {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return DEFAULT_WIDGETS_ADMIN;
  if (role === 'TEACHER') return DEFAULT_WIDGETS_TEACHER;
  return DEFAULT_WIDGETS_MARKETING;
}

// ─── Tooltip style ────────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  borderRadius: '14px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
  fontSize: 11,
  fontWeight: 700,
  padding: '10px 14px',
  background: 'white',
};

// ─── StatCard ────────────────────────────────────────────────────────────
function StatCard({ id, data }: { id: string; data: any }) {
  const configs: Record<string, any> = {
    stat_students: {
      label: "Jami O'quvchilar",
      value: data.studentsTotal,
      sub: `${data.studentsActive} faol, ${data.studentsLeft} tark etgan`,
      icon: GraduationCap,
      gradient: 'from-blue-600 to-indigo-700',
      trend: data.studentsGrowth,
      up: data.studentsGrowth >= 0,
    },
    stat_groups: {
      label: 'Faol Guruhlar',
      value: data.groupsActive,
      sub: `${data.groupsTotal} jami guruh`,
      icon: Layers,
      gradient: 'from-violet-600 to-purple-700',
      trend: '+' + data.groupsActive,
      up: true,
    },
    stat_revenue: {
      label: 'Oylik Daromad',
      value: formatCompact(data.monthRevenue),
      sub: `${data.monthRevenueGrowth > 0 ? '+' : ''}${data.monthRevenueGrowth}% o'tgan oyga nisbatan`,
      icon: Wallet,
      gradient: 'from-emerald-500 to-teal-600',
      trend: `${data.monthRevenueGrowth > 0 ? '+' : ''}${data.monthRevenueGrowth}%`,
      up: data.monthRevenueGrowth >= 0,
    },
    stat_leads: {
      label: 'Bu Oy Lidlar',
      value: data.monthLeads,
      sub: `${data.totalLeads} jami lid`,
      icon: TrendingUp,
      gradient: 'from-amber-500 to-orange-600',
      trend: `+${data.monthLeads}`,
      up: true,
    },
    stat_debtors: {
      label: 'Qarzdorlar',
      value: data.debtors,
      sub: `${formatCompact(data.debtTotal)} so'm jami qarz`,
      icon: AlertCircle,
      gradient: 'from-rose-500 to-red-600',
      trend: data.debtors > 0 ? `${data.debtors} ta` : '0 ta',
      up: data.debtors === 0,
    },
    stat_teachers: {
      label: "Faol O'qituvchilar",
      value: data.teachersTotal,
      sub: `${data.teachersTotal} ta o'qituvchi`,
      icon: Users,
      gradient: 'from-cyan-500 to-blue-600',
      trend: `+${data.teachersTotal}`,
      up: true,
    },
    stat_attendance: {
      label: 'Bugun Davomat',
      value: `${data.todayAttendanceRate}%`,
      sub: `${data.todayPresent} keldi, ${data.todayAbsent} kelmadi`,
      icon: UserCheck,
      gradient: 'from-teal-500 to-emerald-600',
      trend: `${data.todayAttendanceRate}%`,
      up: data.todayAttendanceRate >= 80,
    },
    stat_conversion: {
      label: 'Konversiya Darajasi',
      value: `${data.conversionRate}%`,
      sub: `Lid → O'quvchi`,
      icon: Target,
      gradient: 'from-indigo-500 to-blue-600',
      trend: `${data.conversionRate}%`,
      up: data.conversionRate >= 20,
    },
  };

  const cfg = configs[id];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className={`bg-gradient-to-br ${cfg.gradient} rounded-2xl p-4 h-full flex flex-col justify-between shadow-lg text-white relative overflow-hidden`}>
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white/5 -mr-10 -mt-10" />
      <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 -ml-8 -mb-8" />
      <div className="relative flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 shrink-0">
          <Icon size={17} strokeWidth={2.5} />
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20`}>
          {cfg.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {cfg.trend}
        </div>
      </div>
      <div className="relative mt-3">
        <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{cfg.label}</p>
        <p className="text-xl font-black text-white mt-0.5 truncate">{cfg.value}</p>
        <p className="text-[10px] text-white/60 mt-0.5 truncate">{cfg.sub}</p>
      </div>
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────
function RevenueChart({ data }: { data: any[] }) {
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
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(99,102,241,0.04)' } as any} formatter={(v: any) => new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'} />
            <Bar dataKey="income" name="Kirim" fill="url(#barIncome)" radius={[8, 8, 3, 3]} maxBarSize={24} />
            <Bar dataKey="expense" name="Chiqim" fill="url(#barExpense)" radius={[8, 8, 3, 3]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Student Growth ───────────────────────────────────────────────────────
function StudentGrowthChart({ data }: { data: any[] }) {
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
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="students" name="O'quvchilar" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#dbStudents)" dot={false} activeDot={{ r: 5, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Lead Source Pie ──────────────────────────────────────────────────────
function LeadSourceChart({ data }: { data: any[] }) {
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

// ─── Lead Funnel ──────────────────────────────────────────────────────────
function LeadFunnelChart({ leads }: { leads: any[] }) {
  const stages = [
    { id: 'new', name: 'Yangi', color: '#3b82f6' },
    { id: 'contacted', name: 'Aloqa', color: '#f59e0b' },
    { id: 'meeting', name: 'Uchrashuv', color: '#8b5cf6' },
    { id: 'won', name: "O'quvchi", color: '#10b981' },
    { id: 'lost', name: 'Rad', color: '#ef4444' },
  ];
  const data = stages.map(s => ({
    name: s.name,
    count: leads.filter(l => l.stage === s.id).length,
    color: s.color
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

// ─── Today's Schedule ─────────────────────────────────────────────────────
function UpcomingLessons({ groups, schedules }: { groups: any[], schedules: any[] }) {
  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon, 7=Sun
  const dayMap: Record<number, string> = { 1: 'Dush', 2: 'Sesh', 3: 'Chor', 4: 'Pay', 5: 'Jum', 6: 'Shan', 7: 'Yak' };
  const todayDay = dayMap[dayOfWeek];

  // Try from schedule data first, then fallback to groups
  const todaySchedule = schedules.filter(s => {
    const dow = s.dayOfWeek;
    return dow === dayOfWeek;
  }).slice(0, 6);

  const todayGroups = groups.filter(g =>
    (g.days || []).includes(todayDay) && (g.status === 'Faol' || g.status === 'active')
  ).slice(0, 5);

  const items = todaySchedule.length > 0
    ? todaySchedule.map(s => ({
        id: s.id,
        name: groups.find(g => g.id === s.groupId)?.name || s.groupId || 'Guruh',
        teacher: groups.find(g => g.id === s.groupId)?.teacher || '',
        time: `${s.startTime} - ${s.endTime}`,
        room: s.room || '',
      }))
    : todayGroups.map(g => ({
        id: g.id,
        name: g.name,
        teacher: g.teacher,
        time: g.time,
        room: g.room,
      }));

  const now = today.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Bugungi Darslar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">{today.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-zinc-50 dark:bg-white/[0.03] rounded-lg border border-zinc-100 dark:border-white/[0.04]">
          <Clock size={10} className="text-zinc-400" />
          <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{now}</span>
        </div>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Bugun dars yo'q</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">{todayDay} kuni bo'sh</p>
          </div>
        ) : items.map((g, i) => (
          <div key={g.id || i} className="flex items-center gap-2.5 p-2.5 bg-zinc-50 dark:bg-white/[0.03] rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <BookOpen size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{g.name}</p>
              <p className="text-[9px] text-zinc-400 truncate">{g.teacher}{g.room ? ` • ${g.room}` : ''}</p>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 shrink-0 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-100 dark:border-zinc-700">{g.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Debtors Table ────────────────────────────────────────────────────────
function DebtorsTable({ students }: { students: any[] }) {
  const navigate = useNavigate();
  const debtors = students
    .filter(s => (s.balance || 0) < 0 || s.paymentStatus === 'Qarzdorlik')
    .sort((a, b) => (a.balance || 0) - (b.balance || 0))
    .slice(0, 7);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center">
              <AlertTriangle size={11} className="text-rose-600" />
            </div>
            <p className="text-xs font-black text-slate-900 dark:text-white">Qarzdorlar</p>
          </div>
          <p className="text-[9px] text-zinc-400 mt-0.5 ml-7">{debtors.length} ta to'lov qilmagan o'quvchi</p>
        </div>
        <button
          onClick={() => navigate('/crmtayyorlovmarkaz/students')}
          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
        >
          Barchasi <ChevronRight size={10} />
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {debtors.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Barcha to'lovlar amalga oshirilgan!</p>
          </div>
        ) : debtors.map(s => (
          <div key={s.id} className="flex items-center gap-2.5 p-2.5 bg-rose-50/50 dark:bg-rose-500/5 rounded-xl border border-rose-100 dark:border-rose-500/10">
            <div className="w-8 h-8 rounded-full bg-rose-200 dark:bg-rose-500/20 flex items-center justify-center text-rose-700 dark:text-rose-400 font-black text-[11px] shrink-0">
              {(s.name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-zinc-400">{s.phone}</span>
                {s.group && <span className="text-[9px] text-zinc-400">• {s.group}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] font-black text-rose-600">
                -{new Intl.NumberFormat('uz-UZ').format(Math.abs(s.balance || 0))}
              </p>
              <p className="text-[9px] text-zinc-400">so'm</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Payments ──────────────────────────────────────────────────────
function RecentPayments({ payments }: { payments: any[] }) {
  const recent = [...payments]
    .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
    .slice(0, 8);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">So'nggi To'lovlar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">Oxirgi moliyaviy harakatlar</p>
        </div>
        <Wallet size={14} className="text-zinc-400" />
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <CreditCard size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Hali to'lov yo'q</p>
          </div>
        ) : recent.map(p => (
          <div key={p.id} className="flex items-center gap-2.5 py-2 border-b border-zinc-50 dark:border-white/[0.03] last:border-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${p.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600'}`}>
              {p.type === 'income' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                {p.studentName || p.description || p.category || 'Tranzaksiya'}
              </p>
              <p className="text-[9px] text-zinc-400">{p.date} • {p.method || ''}</p>
            </div>
            <span className={`text-[12px] font-black shrink-0 ${p.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {p.type === 'income' ? '+' : '-'}{new Intl.NumberFormat('uz-UZ').format(p.amount || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Leads ─────────────────────────────────────────────────────────
function RecentLeads({ leads }: { leads: any[] }) {
  const navigate = useNavigate();
  const recent = [...leads]
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime())
    .slice(0, 6);

  const stageConfig: Record<string, { label: string, color: string }> = {
    new: { label: 'Yangi', color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' },
    contacted: { label: 'Aloqa', color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
    meeting: { label: 'Uchrashuv', color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10' },
    won: { label: "O'quvchi", color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' },
    lost: { label: 'Rad', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
  };

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

// ─── Top Students ─────────────────────────────────────────────────────────
function TopStudents({ students }: { students: any[] }) {
  const top = students.filter(s => s.status === 'Faol').slice(0, 7);
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-black text-slate-900 dark:text-white">Faol O'quvchilar</p>
        <p className="text-[9px] text-zinc-400 mt-0.5">Hozir o'qiyotganlar</p>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {top.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">O'quvchilar yo'q</p>
        ) : top.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2.5 py-2 border-b border-zinc-50 dark:border-white/[0.03] last:border-0">
            <span className="text-[10px] font-black text-zinc-300 w-4 text-center shrink-0">{i + 1}</span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
              {(s.name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
              <p className="text-[9px] text-zinc-400 truncate">{s.course} {s.group ? `• ${s.group}` : ''}</p>
            </div>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
              s.paymentStatus === 'Tolov qilingan' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10'
            }`}>
              {s.paymentStatus === 'Tolov qilingan' ? '✓' : '!'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tasks Widget ─────────────────────────────────────────────────────────
function TasksWidget() {
  const [tasks, setTasks] = useState<{ id: string; text: string; done: boolean }[]>(() => {
    try { return JSON.parse(localStorage.getItem('crm_tasks') || '[]'); } catch { return []; }
  });
  const [newTask, setNewTask] = useState('');

  const saveTasks = (t: typeof tasks) => {
    setTasks(t);
    try { localStorage.setItem('crm_tasks', JSON.stringify(t)); } catch {}
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    saveTasks([...tasks, { id: Date.now().toString(), text: newTask.trim(), done: false }]);
    setNewTask('');
  };

  const toggle = (id: string) => saveTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id: string) => saveTasks(tasks.filter(t => t.id !== id));

  const pending = tasks.filter(t => !t.done).length;

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Vazifalar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">{pending} ta bajarilmagan</p>
        </div>
        <ListChecks size={14} className="text-zinc-400" />
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Yangi vazifa..."
          className="flex-1 text-[11px] px-3 py-2 bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] rounded-lg outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
        />
        <button onClick={addTask} className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors shrink-0">
          <Plus size={14} strokeWidth={3} />
        </button>
      </div>
      <div className="space-y-1.5 overflow-y-auto max-h-[220px] pr-0.5">
        {tasks.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">Vazifalar yo'q</p>
        ) : tasks.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 p-2 rounded-lg transition-all ${t.done ? 'opacity-50' : ''}`}>
            <button onClick={() => toggle(t.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600 hover:border-blue-500'}`}>
              {t.done && <Check size={10} strokeWidth={3} className="text-white" />}
            </button>
            <span className={`text-[11px] font-medium flex-1 ${t.done ? 'line-through text-zinc-400' : 'text-slate-800 dark:text-zinc-200'}`}>{t.text}</span>
            <button onClick={() => remove(t.id)} className="text-zinc-300 hover:text-rose-500 transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Links ──────────────────────────────────────────────────────────
function QuickLinks() {
  const navigate = useNavigate();
  const items = [
    { label: "O'quvchi", icon: GraduationCap, path: '/crmtayyorlovmarkaz/students', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' },
    { label: 'Guruh', icon: Layers, path: '/crmtayyorlovmarkaz/groups', color: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600' },
    { label: 'To\'lov', icon: Wallet, path: '/crmtayyorlovmarkaz/finance', color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' },
    { label: 'Lid', icon: TrendingUp, path: '/crmtayyorlovmarkaz/leads', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600' },
    { label: 'Davomat', icon: UserCheck, path: '/crmtayyorlovmarkaz/attendance', color: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600' },
    { label: 'Analitika', icon: BarChart2, path: '/crmtayyorlovmarkaz/bi', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600' },
  ];
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Tezkor O'tish</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-white/[0.03] hover:bg-zinc-100 dark:hover:bg-white/5 transition-all active:scale-95">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                <Icon size={14} strokeWidth={2.5} />
              </div>
              <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Widget Picker ────────────────────────────────────────────────────────
function WidgetPicker({ activeWidgets, role, onAdd, onClose }: {
  activeWidgets: string[];
  role: string;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const categories = Array.from(new Set(WIDGET_REGISTRY.map(w => w.category)));
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200/80 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Widget qo'shish</h2>
            <p className="text-[10px] text-zinc-400 mt-0.5">Dashboardga qo'shmoqchi bo'lgan widgetni tanlang</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {categories.map(cat => {
            const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat);
            return (
              <div key={cat}>
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">{cat}</p>
                <div className="space-y-1.5">
                  {catWidgets.map(w => {
                    const isActive = activeWidgets.includes(w.id);
                    return (
                      <button key={w.id} onClick={() => !isActive && onAdd(w.id)} disabled={isActive}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all border ${
                          isActive ? 'bg-zinc-50 dark:bg-white/5 opacity-60 cursor-not-allowed border-zinc-100 dark:border-white/[0.05]'
                          : 'bg-zinc-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-zinc-100 dark:border-white/[0.05] cursor-pointer'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{w.title}</p>
                          <p className="text-[9px] text-zinc-400 mt-0.5">{w.size === 'lg' ? 'Katta' : w.size === 'md' ? "O'rta" : 'Kichik'} widget</p>
                        </div>
                        {isActive
                          ? <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"><Check size={10} strokeWidth={3} className="text-zinc-500" /></div>
                          : <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 flex items-center justify-center"><Plus size={10} strokeWidth={3} /></div>
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatCompact(v: number): string {
  if (v >= 1000000000) return (v / 1000000000).toFixed(1) + 'B';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
  return new Intl.NumberFormat('uz-UZ').format(v);
}

const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function CrmDashboard() {
  const { data: students = [] } = useFirestore<any>('students');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: teachers = [] } = useFirestore<any>('teachers');
  const { data: schedule = [] } = useFirestore<any>('schedule');
  const { data: attendance = [] } = useFirestore<any>('attendance');

  const [userRole] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role || 'ADMIN'; } catch { return 'ADMIN'; }
  });
  const [userName] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').name || 'Admin'; } catch { return 'Admin'; }
  });

  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_widgets_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return getDefaultWidgets(userRole);
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const saveWidgets = (widgets: string[]) => {
    setActiveWidgets(widgets);
    try { localStorage.setItem('dashboard_widgets_v2', JSON.stringify(widgets)); } catch {}
  };
  const removeWidget = (id: string) => saveWidgets(activeWidgets.filter(w => w !== id));
  const addWidget = (id: string) => { saveWidgets([...activeWidgets, id]); setShowPicker(false); };
  const resetWidgets = () => saveWidgets(getDefaultWidgets(userRole));

  // ── Computed analytics ───────────────────────────────────────────────
  const currentMonth = new Date().getMonth();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const today = new Date().toISOString().split('T')[0];

  const revenueData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mi = (currentMonth - 5 + i + 12) % 12;
      const inc = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + (t.amount || 0), 0);
      const exp = transactions.filter((t: any) => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + (t.amount || 0), 0);
      return { name: MONTHS[mi], income: inc || 0, expense: exp || 0 };
    });
  }, [transactions, currentMonth]);

  const studentGrowthData = useMemo(() => {
    let cum = 0;
    return Array.from({ length: 6 }, (_, i) => {
      const mi = (currentMonth - 5 + i + 12) % 12;
      const n = students.filter((s: any) => {
        if (!s.joinedDate) return false;
        return new Date(s.joinedDate).getMonth() === mi;
      }).length;
      cum += n;
      return { name: MONTHS[mi], students: cum };
    });
  }, [students, currentMonth]);

  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    leads.forEach((l: any) => {
      const src = l.source || 'Boshqa';
      sources[src] = (sources[src] || 0) + 1;
    });
    return Object.entries(sources).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [leads]);

  const aggrData = useMemo(() => {
    const thisMonthIncome = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === currentMonth).reduce((a: number, t: any) => a + (t.amount || 0), 0);
    const prevMonthIncome = transactions.filter((t: any) => t.type === 'income' && t.date && new Date(t.date).getMonth() === prevMonth).reduce((a: number, t: any) => a + (t.amount || 0), 0);
    const monthRevenueGrowth = prevMonthIncome > 0 ? Math.round(((thisMonthIncome - prevMonthIncome) / prevMonthIncome) * 100) : 0;

    const activeStudents = students.filter((s: any) => s.status === 'Faol' || s.status === 'active');
    const prevMonthStudents = students.filter((s: any) => {
      if (!s.joinedDate) return false;
      return new Date(s.joinedDate).getMonth() === prevMonth;
    }).length;
    const thisMonthStudents = students.filter((s: any) => {
      if (!s.joinedDate) return false;
      return new Date(s.joinedDate).getMonth() === currentMonth;
    }).length;
    const studentsGrowth = prevMonthStudents > 0 ? Math.round(((thisMonthStudents - prevMonthStudents) / prevMonthStudents) * 100) : 0;

    // Today's attendance
    const todayAtt = attendance.find((a: any) => a.date === today);
    const todayRecords = todayAtt?.records || [];
    const todayPresent = todayRecords.filter((r: any) => r.status === 'present').length;
    const todayAbsent = todayRecords.filter((r: any) => r.status === 'absent').length;
    const todayTotal = todayRecords.length;
    const todayAttendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

    const debtors = students.filter((s: any) => (s.balance || 0) < 0 || s.paymentStatus === 'Qarzdorlik');
    const debtTotal = debtors.reduce((a: number, s: any) => a + Math.abs(s.balance || 0), 0);

    const monthLeads = leads.filter((l: any) => {
      if (!l.createdAt && !l.date) return false;
      const d = new Date(l.createdAt || l.date);
      return d.getMonth() === currentMonth;
    }).length;

    const wonLeads = leads.filter((l: any) => l.stage === 'won').length;
    const conversionRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

    return {
      studentsTotal: students.length,
      studentsActive: activeStudents.length,
      studentsLeft: students.filter((s: any) => s.status === 'Tark etgan').length,
      studentsGrowth,
      groupsTotal: groups.length,
      groupsActive: groups.filter((g: any) => g.status === 'Faol' || g.status === 'active').length,
      monthRevenue: thisMonthIncome,
      monthRevenueGrowth,
      monthLeads,
      totalLeads: leads.length,
      conversionRate,
      debtors: debtors.length,
      debtTotal,
      teachersTotal: teachers.length,
      todayPresent,
      todayAbsent,
      todayAttendanceRate,
    };
  }, [students, groups, leads, transactions, teachers, attendance, currentMonth, prevMonth, today]);

  const renderWidget = (id: string) => {
    switch (id) {
      case 'stat_students': case 'stat_groups': case 'stat_revenue':
      case 'stat_leads': case 'stat_debtors': case 'stat_teachers':
      case 'stat_attendance': case 'stat_conversion':
        return <StatCard id={id} data={aggrData} />;
      case 'chart_revenue':
        return <RevenueChart data={revenueData} />;
      case 'chart_students':
        return <StudentGrowthChart data={studentGrowthData} />;
      case 'chart_leads':
        return <LeadSourceChart data={leadSourceData} />;
      case 'chart_lead_funnel':
        return <LeadFunnelChart leads={leads} />;
      case 'table_upcoming':
        return <UpcomingLessons groups={groups} schedules={schedule} />;
      case 'table_debtors':
        return <DebtorsTable students={students} />;
      case 'table_top_students':
        return <TopStudents students={students} />;
      case 'list_payments':
        return <RecentPayments payments={transactions} />;
      case 'list_recent_leads':
        return <RecentLeads leads={leads} />;
      case 'tasks':
        return <TasksWidget />;
      case 'quick_links':
        return <QuickLinks />;
      default:
        return null;
    }
  };

  const getWidgetMeta = (id: string) => WIDGET_REGISTRY.find(w => w.id === id);
  const getSizeClass = (id: string) => {
    const meta = getWidgetMeta(id);
    if (meta?.size === 'lg') return 'col-span-2';
    return 'col-span-1';
  };

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Xayrli tun' : hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';

  return (
    <div className="space-y-4 page-enter">
      {/* ── Welcome Banner ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 shadow-xl shadow-blue-500/20">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute top-1/2 right-1/3 w-24 h-24 rounded-full bg-white/[0.03]" />
        </div>

        <div className="relative px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={13} className="text-yellow-300" />
              <span className="text-white/70 text-[11px] font-semibold uppercase tracking-widest">{greeting}</span>
            </div>
            <h1 className="text-xl font-black text-white leading-tight">
              {userName.split(' ')[0]}, <span className="text-white/80">bugun qanday ketmoqda?</span>
            </h1>
            <p className="text-white/60 text-[11px] mt-1">
              <Clock size={10} className="inline mr-1" />
              {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {[
              { label: "O'quvchi", value: aggrData.studentsTotal, icon: GraduationCap },
              { label: 'Guruh', value: aggrData.groupsActive, icon: Layers },
              { label: 'Lid', value: aggrData.totalLeads, icon: TrendingUp },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/10 border border-white/10 min-w-[58px]">
                <s.icon size={12} className="text-white/70 mb-1" />
                <span className="text-white font-black text-base leading-none">{s.value}</span>
                <span className="text-white/60 text-[9px] font-bold mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isEditMode && (
              <>
                <button onClick={() => setShowPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[11px] font-bold transition-all border border-white/20">
                  <Plus size={11} strokeWidth={3} /> Widget
                </button>
                <button onClick={resetWidgets}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 rounded-xl text-[11px] font-bold transition-all border border-white/10">
                  Standart
                </button>
              </>
            )}
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                isEditMode ? 'bg-white text-indigo-700 border-white shadow-sm' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
            >
              {isEditMode ? <><Check size={11} strokeWidth={3} /> Saqlash</> : <><Settings2 size={11} strokeWidth={2} /> Moslash</>}
            </button>
          </div>
        </div>

        {/* Revenue highlight */}
        <div className="relative border-t border-white/10 px-5 py-2.5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-yellow-300" />
              <span className="text-white/70 text-[10px] font-semibold">Bu oylik daromad:</span>
              <span className="text-white font-black text-[13px]">{formatCompact(aggrData.monthRevenue)} so'm</span>
            </div>
            {aggrData.debtors > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/30 rounded-lg border border-rose-400/30">
                <AlertTriangle size={11} className="text-rose-300" />
                <span className="text-white/90 text-[10px] font-bold">{aggrData.debtors} ta qarzdor</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${aggrData.todayAttendanceRate >= 80 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-white/60 text-[10px]">Bugun davomat: <span className="font-black text-white">{aggrData.todayAttendanceRate}%</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit mode banner */}
      <AnimatePresence>
        {isEditMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Settings2 size={13} className="text-blue-600" />
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              Moslash rejimi — widgetlarni olib tashlash yoki yangi qo'shishingiz mumkin
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-auto">
        <AnimatePresence>
          {activeWidgets.map(id => {
            const meta = getWidgetMeta(id);
            if (!meta) return null;
            const rendered = renderWidget(id);
            if (!rendered) return null;
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={`relative ${getSizeClass(id)} ${meta.size === 'sm' ? 'min-h-[130px]' : 'min-h-[280px]'}`}
              >
                {rendered}
                {isEditMode && (
                  <button
                    onClick={() => removeWidget(id)}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-all z-10"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isEditMode && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowPicker(true)}
            className="min-h-[160px] rounded-2xl border-2 border-dashed border-zinc-300 dark:border-white/10 flex flex-col items-center justify-center gap-2 text-zinc-400 hover:border-blue-400 hover:text-blue-500 transition-all"
          >
            <Plus size={20} strokeWidth={2} />
            <span className="text-xs font-bold">Widget qo'shish</span>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {showPicker && (
          <WidgetPicker
            activeWidgets={activeWidgets}
            role={userRole}
            onAdd={addWidget}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
