import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  LayoutDashboard, Users, GraduationCap, Wallet, TrendingUp,
  TrendingDown, ArrowUpRight, ArrowDownRight, Target, Layers,
  Plus, X, Settings2, BarChart2, BookOpen, Calendar, Bell,
  GripVertical, Check, AlertCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';

// ─── Widget Registry ───────────────────────────────────────────────────────
export const WIDGET_REGISTRY = [
  {
    id: 'stat_students',
    title: "Jami O'quvchilar",
    category: 'Statistika',
    permission: 'students',
    size: 'sm' as const,
  },
  {
    id: 'stat_groups',
    title: 'Faol Guruhlar',
    category: 'Statistika',
    permission: 'groups',
    size: 'sm' as const,
  },
  {
    id: 'stat_revenue',
    title: 'Oylik Daromad',
    category: 'Moliya',
    permission: 'finance',
    size: 'sm' as const,
  },
  {
    id: 'stat_leads',
    title: 'Yangi Lidlar',
    category: 'Marketing',
    permission: 'leads',
    size: 'sm' as const,
  },
  {
    id: 'stat_debtors',
    title: 'Qarzdorlar',
    category: 'Moliya',
    permission: 'finance',
    size: 'sm' as const,
  },
  {
    id: 'stat_teachers',
    title: "O'qituvchilar",
    category: 'HR',
    permission: 'teachers',
    size: 'sm' as const,
  },
  {
    id: 'chart_revenue',
    title: 'Daromad Grafigi',
    category: 'Moliya',
    permission: 'finance',
    size: 'lg' as const,
  },
  {
    id: 'chart_students',
    title: "O'quvchi O'sishi",
    category: 'Tahlil',
    permission: 'students',
    size: 'md' as const,
  },
  {
    id: 'chart_leads',
    title: 'Lid Manbasi',
    category: 'Marketing',
    permission: 'leads',
    size: 'md' as const,
  },
  {
    id: 'table_upcoming',
    title: "Bugungi Darslar",
    category: "Ta'lim",
    permission: 'schedule',
    size: 'md' as const,
  },
  {
    id: 'table_top_students',
    title: 'Top O\'quvchilar',
    category: "Ta'lim",
    permission: 'students',
    size: 'md' as const,
  },
  {
    id: 'quick_links',
    title: 'Tezkor Havolalar',
    category: 'Umumiy',
    permission: null,
    size: 'sm' as const,
  },
];

// Default widgets per role
const DEFAULT_WIDGETS_ADMIN = [
  'stat_students', 'stat_groups', 'stat_revenue', 'stat_leads',
  'chart_revenue', 'chart_students', 'table_upcoming', 'table_top_students',
];
const DEFAULT_WIDGETS_TEACHER = ['stat_students', 'stat_groups', 'table_upcoming', 'chart_students'];
const DEFAULT_WIDGETS_MARKETING = ['stat_leads', 'chart_leads', 'stat_students'];

function getDefaultWidgets(role: string, permissions: string[]) {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return DEFAULT_WIDGETS_ADMIN;
  if (role === 'TEACHER') return DEFAULT_WIDGETS_TEACHER;
  if (permissions.includes('leads')) return DEFAULT_WIDGETS_MARKETING;
  return ['stat_students', 'table_upcoming'];
}

// ─── Individual Widget Components ──────────────────────────────────────────
function StatCard({ id, data }: { id: string; data: any }) {
  const configs: Record<string, any> = {
    stat_students: {
      label: "Jami O'quvchilar", value: data.studentsTotal, sub: `${data.studentsActive} faol`,
      icon: GraduationCap, bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400',
      trend: '+12%', up: true,
    },
    stat_groups: {
      label: 'Faol Guruhlar', value: data.groupsActive, sub: `${data.groupsTotal} jami`,
      icon: Layers, bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400',
      trend: '+2', up: true,
    },
    stat_revenue: {
      label: 'Oylik Daromad',
      value: new Intl.NumberFormat('uz-UZ').format(data.monthRevenue) + ' so\'m',
      sub: 'Bu oy',
      icon: Wallet, bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400',
      trend: '+8.4%', up: true,
    },
    stat_leads: {
      label: 'Yangi Lidlar', value: data.newLeads, sub: `${data.conversionRate}% konversiya`,
      icon: TrendingUp, bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400',
      trend: '+24', up: true,
    },
    stat_debtors: {
      label: 'Qarzdorlar', value: data.debtors, sub: `${data.debtTotal} so'm jami`,
      icon: AlertCircle, bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400',
      trend: '-3', up: true,
    },
    stat_teachers: {
      label: "O'qituvchilar", value: data.teachersTotal, sub: `${data.teachersActive} faol`,
      icon: Users, bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400',
      trend: '+1', up: true,
    },
  };

  const cfg = configs[id];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full flex flex-col justify-between shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg} ${cfg.text} shrink-0`}>
          <Icon size={17} strokeWidth={2.5} />
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
          {cfg.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {cfg.trend}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{cfg.label}</p>
        <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5 truncate">{cfg.value}</p>
        <p className="text-[10px] text-zinc-400 mt-0.5">{cfg.sub}</p>
      </div>
    </div>
  );
}

function RevenueChart({ data }: { data: any[] }) {
  const formatM = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v);
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Daromad Dinamikasi</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Oxirgi 6 oylik taqqoslash</p>
        </div>
        <div className="flex items-center gap-3 bg-zinc-50 dark:bg-white/5 py-1.5 px-3 rounded-full">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-[10px] text-zinc-500 font-bold uppercase">Kirim</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" /><span className="text-[10px] text-zinc-500 font-bold uppercase">Chiqim</span></div>
        </div>
      </div>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} tickFormatter={formatM} width={40} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 11 }} cursor={{fill: 'rgba(0,0,0,0.02)'}} formatter={(v: number) => new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'} />
            <Bar dataKey="income" name="Kirim" fill="#3b82f6" radius={[6, 6, 6, 6]} maxBarSize={24} />
            <Bar dataKey="expense" name="Chiqim" fill="#d4d4d8" radius={[6, 6, 6, 6]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StudentGrowthChart({ data }: { data: any[] }) {
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-black text-slate-900 dark:text-white mb-0.5">O'quvchi O'sishi</p>
        <p className="text-[10px] text-zinc-400">Oylik kumulativ ko'rsatkichlar</p>
      </div>
      <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="dbStudents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} dy={5} />
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 11 }} />
            <Area type="monotone" dataKey="students" name="O'quvchilar" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#dbStudents)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LeadSourceChart({ data }: { data: any[] }) {
  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#0ea5e9'];
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 h-full flex flex-col items-center justify-center shadow-sm">
      <div className="w-full text-left mb-4">
        <p className="text-sm font-black text-slate-900 dark:text-white mb-0.5">Lid Manbasi</p>
        <p className="text-[10px] text-zinc-400">Trafik kanal konversiyasi</p>
      </div>
      <div className="relative w-[180px] h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" cornerRadius={6}>
              {data.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 11 }} cursor={{fill:'transparent'}} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
           <span className="text-2xl font-black text-slate-900 dark:text-white">{data.reduce((a,b)=>a+b.value, 0)}%</span>
           <span className="text-[9px] font-bold text-zinc-400 uppercase">Jami Lid</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
        {data.map((s,i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300">{s.name} <span className="text-zinc-400 ml-1">{s.value}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}


function UpcomingLessons({ groups }: { groups: any[] }) {
  const today = new Date();
  const dayMap: Record<number, string> = { 0: 'Yak', 1: 'Dush', 2: 'Sesh', 3: 'Chor', 4: 'Pay', 5: 'Jum', 6: 'Shan' };
  const todayDay = dayMap[today.getDay()];
  const todayGroups = groups.filter(g => (g.days || []).includes(todayDay) && g.status === 'Faol').slice(0, 5);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">Bugungi Darslar</p>
      <p className="text-[9px] text-zinc-400 mb-3">{today.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="space-y-2">
        {todayGroups.length === 0 ? (
          <div className="py-6 text-center">
            <Calendar size={20} className="mx-auto text-zinc-300 mb-1" />
            <p className="text-[10px] text-zinc-400">Bugun dars yo'q</p>
          </div>
        ) : todayGroups.map(g => (
          <div key={g.id} className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-white/[0.03] rounded-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                <BookOpen size={12} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{g.name}</p>
                <p className="text-[9px] text-zinc-400 truncate">{g.teacher}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 shrink-0 ml-2">{g.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopStudents({ students }: { students: any[] }) {
  const top = students
    .filter(s => s.status === 'Faol')
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">Top O'quvchilar</p>
      <p className="text-[9px] text-zinc-400 mb-3">Eng faol o'quvchilar</p>
      <div className="space-y-2">
        {top.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">O'quvchilar yo'q</p>
        ) : top.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2.5">
            <span className="text-[10px] font-black text-zinc-400 w-4 text-center">{i + 1}</span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
              {s.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
              <p className="text-[9px] text-zinc-400 truncate">{s.group}</p>
            </div>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${s.paymentStatus === 'Tolov qilingan' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
              {s.paymentStatus === 'Tolov qilingan' ? 'To\'langan' : 'Qarzdor'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickLinks() {
  const navigate = useNavigate();
  const items = [
    { label: "O'quvchi qo'shish", icon: GraduationCap, path: '/crmtayyorlovmarkaz/students', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    { label: 'Yangi guruh', icon: Layers, path: '/crmtayyorlovmarkaz/groups', color: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    { label: 'Lid qo\'shish', icon: TrendingUp, path: '/crmtayyorlovmarkaz/leads', color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { label: 'BI Tahlil', icon: BarChart2, path: '/crmtayyorlovmarkaz/bi', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  ];
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Tezkor Havolalar</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.03] hover:bg-zinc-100 dark:hover:bg-white/5 transition-all text-center">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                <Icon size={14} strokeWidth={2.5} />
              </div>
              <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400 leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Widget Picker Modal ───────────────────────────────────────────────────
function WidgetPicker({ activeWidgets, permissions, role, onAdd, onClose }: {
  activeWidgets: string[];
  permissions: string[];
  role: string;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const canAccessWidget = (w: typeof WIDGET_REGISTRY[0]) => {
    if (!w.permission) return true;
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    return permissions.includes(w.permission);
  };

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
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 transition-all">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {categories.map(cat => {
            const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat && canAccessWidget(w));
            if (catWidgets.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">{cat}</p>
                <div className="space-y-1.5">
                  {catWidgets.map(w => {
                    const isActive = activeWidgets.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        onClick={() => !isActive && onAdd(w.id)}
                        disabled={isActive}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${isActive ? 'bg-zinc-50 dark:bg-white/5 opacity-60 cursor-not-allowed' : 'bg-zinc-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/30 cursor-pointer'} border border-zinc-100 dark:border-white/[0.05]`}
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{w.title}</p>
                          <p className="text-[9px] text-zinc-400 mt-0.5">{w.size === 'lg' ? 'Katta' : w.size === 'md' ? "O'rta" : 'Kichik'} widget</p>
                        </div>
                        {isActive ? (
                          <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                            <Check size={10} strokeWidth={3} className="text-zinc-500" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <Plus size={10} strokeWidth={3} />
                          </div>
                        )}
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

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function CrmDashboard() {
  const { data: students = [] } = useFirestore<any>('students');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: teachers = [] } = useFirestore<any>('teachers');

  // User info
  const [userRole] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role || 'ADMIN'; } catch { return 'ADMIN'; }
  });
  const [userPermissions] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('crm_user') || '{}').permissions;
      return JSON.parse(raw || '[]');
    } catch { return []; }
  });
  const [userName] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').name || 'Admin'; } catch { return 'Admin'; }
  });

  // Widget state persisted in localStorage
  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_widgets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return getDefaultWidgets(userRole, userPermissions);
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const saveWidgets = (widgets: string[]) => {
    setActiveWidgets(widgets);
    try { localStorage.setItem('dashboard_widgets', JSON.stringify(widgets)); } catch {}
  };

  const removeWidget = (id: string) => saveWidgets(activeWidgets.filter(w => w !== id));
  const addWidget = (id: string) => {
    const next = [...activeWidgets, id];
    saveWidgets(next);
    setShowPicker(false);
  };
  const resetWidgets = () => saveWidgets(getDefaultWidgets(userRole, userPermissions));

  // Analytics data
  const months = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  const currentMonth = new Date().getMonth();

  const revenueData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mi = (currentMonth - 5 + i + 12) % 12;
      const inc = (transactions || []).filter((t: any) => t.type === 'income' && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + t.amount, 0);
      const exp = (transactions || []).filter((t: any) => t.type === 'expense' && new Date(t.date).getMonth() === mi).reduce((a: number, t: any) => a + t.amount, 0);
      return { name: months[mi], income: inc || (4000000 + i * 500000), expense: exp || (2000000 + i * 200000) };
    });
  }, [transactions]);

  const studentGrowthData = useMemo(() => {
    let cum = 0;
    return Array.from({ length: 6 }, (_, i) => {
      const mi = (currentMonth - 5 + i + 12) % 12;
      const n = (students || []).filter((s: any) => new Date(s.joinedDate).getMonth() === mi).length;
      cum += n || (2 + i);
      return { name: months[mi], students: cum };
    });
  }, [students]);

  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    (leads || []).forEach((l: any) => { sources[l.source || 'Boshqa'] = (sources[l.source || 'Boshqa'] || 0) + 1; });
    const total = Object.values(sources).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(sources).map(([name, v]) => ({ name, value: Math.round((v / total) * 100) }));
  }, [leads]);

  const aggrData = useMemo(() => {
    const income = (transactions || []).filter((t: any) => t.type === 'income');
    const mis = currentMonth;
    const monthRevenue = income.filter((t: any) => new Date(t.date).getMonth() === mis).reduce((a: number, t: any) => a + t.amount, 0);
    return {
      studentsTotal: (students || []).length,
      studentsActive: (students || []).filter((s: any) => s.status === 'Faol').length,
      groupsTotal: (groups || []).length,
      groupsActive: (groups || []).filter((g: any) => g.status === 'Faol').length,
      monthRevenue,
      newLeads: (leads || []).filter((l: any) => {
        const d = new Date(l.createdAt || l.date);
        return d.getMonth() === mis;
      }).length,
      conversionRate: (leads || []).length > 0 ? Math.round(((students || []).length / ((leads || []).length + (students || []).length)) * 100) : 0,
      debtors: (students || []).filter((s: any) => s.paymentStatus === 'Qarzdorlik').length,
      debtTotal: new Intl.NumberFormat('uz-UZ').format((students || []).filter((s: any) => (s.balance || 0) < 0).reduce((a: number, s: any) => a + Math.abs(s.balance), 0)),
      teachersTotal: (teachers || []).length,
      teachersActive: (teachers || []).length,
    };
  }, [students, groups, leads, transactions, teachers]);

  const renderWidget = (id: string) => {
    switch (id) {
      case 'stat_students':
      case 'stat_groups':
      case 'stat_revenue':
      case 'stat_leads':
      case 'stat_debtors':
      case 'stat_teachers':
        return <StatCard id={id} data={aggrData} />;
      case 'chart_revenue':
        return <RevenueChart data={revenueData} />;
      case 'chart_students':
        return <StudentGrowthChart data={studentGrowthData} />;
      case 'chart_leads':
        return <LeadSourceChart data={leadSourceData} />;
      case 'table_upcoming':
        return <UpcomingLessons groups={groups} />;
      case 'table_top_students':
        return <TopStudents students={students} />;
      case 'quick_links':
        return <QuickLinks />;
      default:
        return null;
    }
  };

  const getWidgetMeta = (id: string) => WIDGET_REGISTRY.find(w => w.id === id);

  // Grid size classes
  const getSizeClass = (id: string) => {
    const meta = getWidgetMeta(id);
    if (meta?.size === 'lg') return 'col-span-2';
    if (meta?.size === 'md') return 'col-span-1';
    return 'col-span-1';
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-black text-slate-900 dark:text-white">
            Xush kelibsiz, {userName.split(' ')[0]} 👋
          </h1>
          <p className="text-[10px] text-zinc-400 mt-0.5">
            {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <>
              <button onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all">
                <Plus size={13} strokeWidth={3} /> Widget qo'shish
              </button>
              <button onClick={resetWidgets}
                className="px-3 py-1.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-bold transition-all">
                Standart
              </button>
            </>
          )}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isEditMode ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-[#111118] border border-zinc-200/80 dark:border-white/[0.05] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50'}`}
          >
            {isEditMode ? <><Check size={13} strokeWidth={3} /> Saqlash</> : <><Settings2 size={13} strokeWidth={2} /> Moslash</>}
          </button>
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

      {/* Widget grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatePresence>
          {activeWidgets.map(id => {
            const meta = getWidgetMeta(id);
            if (!meta) return null;
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={`relative min-h-[160px] ${getSizeClass(id)}`}
              >
                {renderWidget(id)}
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

        {/* Add widget placeholder in edit mode */}
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

      {/* Widget Picker */}
      <AnimatePresence>
        {showPicker && (
          <WidgetPicker
            activeWidgets={activeWidgets}
            permissions={userPermissions}
            role={userRole}
            onAdd={addWidget}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
