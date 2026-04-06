import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, GraduationCap, DollarSign,
  Download, ArrowUpRight, ArrowDownRight, Target, Zap, Clock,
  Filter, Calendar, Search, Maximize2, MoreHorizontal, CheckCircle2,
  AlertTriangle, BookOpen, UserCheck, PieChart as PieChartIcon, 
  BarChart2, Activity, Layers, ArrowDownUp
} from 'lucide-react';

// ==========================================
// MOCK DATA GENERATION
// ==========================================
const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const COLORS = {
  blue: ['#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd'],
  emerald: ['#047857','#059669','#10b981','#34d399','#6ee7b7'],
  rose: ['#be123c','#e11d48','#f43f5e','#fb7185','#fda4af'],
  amber: ['#b45309','#d97706','#f59e0b','#fbbf24','#fcd34d'],
  violet: ['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd'],
  slate: ['#334155','#475569','#64748b','#94a3b8','#cbd5e1']
};

const historicalData = Array.from({ length: 12 }, (_, i) => {
  const m = MONTHS[i];
  const isSep = m === 'Sen';
  const isSummer = m === 'Iyun' || m === 'Iyul' || m === 'Avg';
  
  const target = 15000000 + i * 2000000;
  const tolangan = target * (isSummer ? 0.6 : 0.85);
  const qarzdorlik = target * 0.1;
  const kutilayotgan = target * 0.05;

  return {
    name: m,
    yangi: isSep ? 320 : isSummer ? 80 : 150 + Math.floor(Math.random() * 50),
    chiqdi: isSummer ? 120 : 40 + Math.floor(Math.random() * 20),
    jami: 800 + i * 40,
    davomat: isSummer ? 75 : 88 + Math.floor(Math.random() * 10),
    target, tolangan, qarzdorlik, kutilayotgan
  };
});

const coursePerfData = [
  { name: 'IELTS Intensive', oquvchilar: 340, davomat: 92, daromad: 125000000 },
  { name: 'General English', oquvchilar: 280, davomat: 88, daromad: 84000000 },
  { name: 'IT Front-End', oquvchilar: 150, davomat: 95, daromad: 90000000 },
  { name: 'Matematika OTM', oquvchilar: 410, davomat: 90, daromad: 102000000 },
  { name: 'Boshlang\'ich', oquvchilar: 180, davomat: 85, daromad: 36000000 },
];

const sourceData = [
  { name: 'Instagram', value: 45 },
  { name: 'Telegram', value: 25 },
  { name: 'Tanish orqali', value: 15 },
  { name: 'Tashrif (Walk-in)', value: 10 },
  { name: 'Vebsayt', value: 5 },
];

const demographicsAge = [
  { name: '6–10', v: 150 },
  { name: '11–14', v: 310 },
  { name: '15–18', v: 480 },
  { name: '19–25', v: 220 },
  { name: '25+', v: 88 },
];

const demographicsGender = [
  { name: 'Yigitlar', value: 65, fill: COLORS.blue[2] },
  { name: 'Qizlar', value: 35, fill: COLORS.rose[2] },
];

const teacherPerf = [
  { name: 'Aziz R.', score: 92, attendance: 95, retention: 88 },
  { name: 'Malika T.', score: 88, attendance: 91, retention: 85 },
  { name: 'Nodir B.', score: 95, attendance: 98, retention: 92 },
  { name: 'Sabina X.', score: 85, attendance: 89, retention: 82 },
  { name: 'Umid J.', score: 90, attendance: 93, retention: 89 },
];

const paymentBreakdown = [
  { group: 'IT-Frontend 14', full: 80, partial: 15, unpaid: 5 },
  { group: 'IELTS-G3', full: 60, partial: 30, unpaid: 10 },
  { MathOTM: 'Math-Oliy', full: 90, partial: 5, unpaid: 5 },
  { group: 'GenEng-B2', full: 75, partial: 20, unpaid: 5 },
];

// Helper formatting
const fN = (v: number) => new Intl.NumberFormat('uz').format(v);
const fM = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v);

// ==========================================
// 1. REUSABLE COMPONENTS
// ==========================================

const ThemedTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md p-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 dark:border-white/10 z-50 min-w-[160px]">
      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pb-2 border-b border-slate-100 dark:border-white/10">{label}</p>
      <div className="space-y-2">
        {payload.map((e: any, i: number) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color || e.fill }} />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{e.name}</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white leading-none">
              {formatter ? formatter(e.value, e.name) : e.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

function ChartCard({ title, desc, types = ['Bar', 'Line'], defaultType = 'Bar', children }: any) {
  const [type, setType] = useState(defaultType);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-white/5 p-5 sm:p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col group
      ${expanded ? 'fixed inset-4 z-[100] shadow-2xl' : 'relative h-full'}`}>
      
      {/* Expanded Backdrop Overlay */}
      {expanded && <div className="fixed inset-[-100px] bg-slate-900/60 backdrop-blur-sm z-[-1]" onClick={() => setExpanded(false)} />}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{title}</h3>
          {desc && <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {types.length > 1 && (
            <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-1 mr-2">
              {types.map((t: string) => (
                <button key={t} onClick={() => setType(t)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${type === t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400" title="Yuklab olish"><Download size={16} /></button>
          <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400" onClick={() => setExpanded(!expanded)}>
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-[220px] w-full">
        {typeof children === 'function' ? children({ type, expanded }) : children}
      </div>
    </div>
  );
}

// ==========================================
// 2. MAIN DASHBOARD
// ==========================================

export default function CrmAdvancedBI() {
  const [period, setPeriod] = useState('Bu Yil');
  const [compare, setCompare] = useState(false);

  const kpis = [
    { label: "Jami O'quvchilar", v: "1,248", t: "+12.4%", up: true, c: "blue" },
    { label: "Faol O'quvchilar", v: "1,120", t: "+8.1%", up: true, c: "emerald" },
    { label: "Yangi O'quvchilar", v: "142", t: "+24%", up: true, c: "violet" },
    { label: "Davomat Foizi", v: "88.5%", t: "-1.2%", up: false, c: "amber" },
    { label: "To'lov Unumdorligi", v: "85%", t: "+4.5%", up: true, c: "emerald" },
    { label: "Jami Kurslar", v: "15", t: "0", up: true, c: "slate" },
    { label: "Ustozlar", v: "34", t: "+2", up: true, c: "blue" },
    { label: "Oylik Daromad", v: "420M", t: "+15%", up: true, c: "emerald" },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
            <div className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-600/30">
              <Activity size={20} strokeWidth={3} />
            </div>
            Biznes Analitika Panel
          </h1>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-2">To'liq operatsion, moliyaviy va akademik ko'rsatkichlar tahlili.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#0f172a] px-3 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-white/5">
            <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="peer sr-only" />
            <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 relative"></div>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Taqqoslash (O'tgan davr)</span>
          </label>
          <div className="flex bg-white dark:bg-[#0f172a] rounded-xl p-1 shadow-sm border border-slate-200 dark:border-white/5">
            {['Hafta', 'Oy', 'Bu Yil'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${period === p ? 'bg-slate-900 text-white dark:bg-slate-700' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                {p}
              </button>
            ))}
          </div>
          <button className="bg-white dark:bg-[#0f172a] p-2 rounded-xl shadow-sm border border-slate-200 dark:border-white/5 text-slate-500 hover:bg-slate-50">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* AI INSIGHTS */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-500/20 rounded-[20px] p-5 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-amber-500 fill-amber-500" />
          <h3 className="text-xs font-black text-blue-900 dark:text-blue-300 uppercase tracking-widest">Sun'iy Intellekt Xulosalari</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex gap-3 bg-white/60 dark:bg-slate-900/50 p-3 rounded-xl border border-white/40 dark:border-white/5">
            <TrendingUp className="text-emerald-500 shrink-0" size={18} />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
              Instagram'dan kelgan o'quvchilar o'tgan oyga nisbatan <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">+40% ga oshdi</span>. Bu marketing kampaniyasi samarasini ko'rsatadi.
            </p>
          </div>
          <div className="flex gap-3 bg-white/60 dark:bg-slate-900/50 p-3 rounded-xl border border-white/40 dark:border-white/5">
            <AlertTriangle className="text-amber-500 shrink-0" size={18} />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
              <b>IELTS-G3</b> guruhida davomat bir haftada qatorasiga 75% dan past. Ustoz bilan sabablarini o'rganish majburiy.
            </p>
          </div>
          <div className="flex gap-3 bg-white/60 dark:bg-slate-900/50 p-3 rounded-xl border border-white/40 dark:border-white/5">
            <Target className="text-blue-500 shrink-0" size={18} />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
              Agar qoldiqlarni yig'ish tezligi saqlansa, bu oy reja <span className="text-blue-600 dark:text-blue-400 font-extrabold">+12% over-target</span> bo'lib yopiladi.
            </p>
          </div>
        </div>
      </div>

      {/* 8 KPI CARDS - Compact Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {kpis.map((k, i) => {
          const sparkColor = 
            k.c === 'blue' ? { fill: COLORS.blue[2], fLine: COLORS.blue[1] } :
            k.c === 'emerald' ? { fill: COLORS.emerald[2], fLine: COLORS.emerald[1] } :
            k.c === 'violet' ? { fill: COLORS.violet[2], fLine: COLORS.violet[1] } :
            k.c === 'amber' ? { fill: COLORS.amber[2], fLine: COLORS.amber[1] } :
            { fill: COLORS.slate[3], fLine: COLORS.slate[2] };

          const bgHoverColor = 
            k.c === 'blue' ? 'bg-blue-500/5' :
            k.c === 'emerald' ? 'bg-emerald-500/5' :
            k.c === 'violet' ? 'bg-violet-500/5' :
            k.c === 'amber' ? 'bg-amber-500/5' :
            'bg-slate-500/5';

          return (
            <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-[#0f172a] p-4 lg:p-5 rounded-[20px] border border-slate-200/80 dark:border-white/5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between min-h-[140px]">
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110 duration-500 ${bgHoverColor}`} />
              <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">{k.label}</p>
              <div className="mt-4 flex items-end justify-between relative z-10">
                <span className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{k.v}</span>
                <div className={`flex items-center gap-0.5 text-[9px] lg:text-[10px] font-black px-1.5 py-0.5 rounded-md ${k.up ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10'}`}>
                  {k.up ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />} {k.t}
                </div>
              </div>
              {/* Fake sparkline using a simple SVG curve */}
              <div className="absolute bottom-0 left-0 w-full h-8 sm:h-10 opacity-[0.15] pointer-events-none">
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full">
                  <path d={`M0,20 Q20,${k.up ? 10 : 20} 40,15 T80,${k.up ? 5 : 15} T100,${k.up ? 0 : 20} L100,20 L0,20 Z`} fill={sparkColor.fill} />
                  <path d={`M0,20 Q20,${k.up ? 10 : 20} 40,15 T80,${k.up ? 5 : 15} T100,${k.up ? 0 : 20}`} fill="none" stroke={sparkColor.fLine} strokeWidth="1.5" />
                </svg>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Growth */}
        <ChartCard title="O'quvchilar Dinamikasi" desc="Oylik kirdi-chiqdi tahlili" types={['Area', 'Bar', 'Line']}>
          {({ type }: any) => (
            <ResponsiveContainer width="100%" height="100%">
              {type === 'Area' ? (
                <AreaChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.emerald[2]} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.emerald[2]} stopOpacity={0}/></linearGradient>
                    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.rose[2]} stopOpacity={0.2}/><stop offset="95%" stopColor={COLORS.rose[2]} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 2 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} />
                  {compare && <Area type="monotone" dataKey="jami" name="O'tgan yil" stroke={COLORS.slate[3]} strokeDasharray="4 4" fill="none" />}
                  <Area type="monotone" dataKey="yangi" name="Yangi" stroke={COLORS.emerald[2]} strokeWidth={3} fill="url(#gk)" />
                  <Area type="monotone" dataKey="chiqdi" name="Chiqib ketgan" stroke={COLORS.rose[2]} strokeWidth={3} fill="url(#gc)" />
                </AreaChart>
              ) : type === 'Bar' ? (
                <BarChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} />
                  <Bar dataKey="yangi" name="Yangi" fill={COLORS.emerald[2]} radius={[4,4,0,0]} maxBarSize={30} />
                  <Bar dataKey="chiqdi" name="Chiqib ketgan" fill={COLORS.rose[2]} radius={[4,4,0,0]} maxBarSize={30} />
                </BarChart>
              ) : (
                <LineChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} />
                  <Line type="monotone" dataKey="jami" name="Jami o'quvchilar" stroke={COLORS.blue[2]} strokeWidth={4} dot={{r:4, strokeWidth:2}} />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 2. Revenue & Payments */}
        <ChartCard title="Moliya va To'lovlar" desc="Daromad tushum estikatsiyasi" types={['Stacked Bar', 'Area', 'Composed']}>
          {({ type }: any) => (
            <ResponsiveContainer width="100%" height="100%">
              {type === 'Stacked Bar' ? (
                <BarChart data={historicalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={fM} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                  <Tooltip content={<ThemedTooltip formatter={fN} />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} />
                  <Bar dataKey="tolangan" name="To'langan" fill={COLORS.blue[2]} stackId="a" maxBarSize={35} />
                  <Bar dataKey="kutilayotgan" name="Kutilayotgan" fill={COLORS.amber[3]} stackId="a" maxBarSize={35} />
                  <Bar dataKey="qarzdorlik" name="Qarzdorlik" fill={COLORS.rose[3]} stackId="a" radius={[6,6,0,0]} maxBarSize={35} />
                </BarChart>
              ) : type === 'Area' ? (
                <AreaChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={fM} tick={{fontSize: 10, fontWeight: 700}} />
                  <Tooltip content={<ThemedTooltip formatter={fN} />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="tolangan" name="To'langan hamma pul" stroke={COLORS.blue[3]} fill={COLORS.blue[2]} fillOpacity={0.2} />
                  <Area type="monotone" dataKey="target" name="Reja (Target)" stroke={COLORS.slate[3]} strokeDasharray="5 5" fill="none" />
                </AreaChart>
              ) : (
                <ComposedChart data={historicalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700}} dy={10} />
                  <YAxis yAxisId="left" tickFormatter={fM} tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                  <Tooltip content={<ThemedTooltip formatter={fN} />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop: 10 }} />
                  <Bar yAxisId="left" dataKey="tolangan" name="Kirim" fill={COLORS.blue[2]} radius={[4,4,0,0]} maxBarSize={30} />
                  <Line yAxisId="left" type="monotone" dataKey="target" name="Reja" stroke={COLORS.slate[4]} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 3. Course Performance */}
        <ChartCard title="Kurslar Kesimida Tahlil" desc="Daromad hajmi va davomat" types={['Bar']}>
          {() => (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coursePerfData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(150,150,150,0.1)" />
                <XAxis type="number" tickFormatter={fM} tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{fontSize: 11, fontWeight: 800, fill: '#888'}} width={100} />
                <Tooltip content={<ThemedTooltip formatter={fN} />} cursor={{fill: 'rgba(0,0,0,0.02)'}} />
                <Bar dataKey="daromad" name="Sof Daromad" fill={COLORS.violet[2]} radius={[0,6,6,0]} barSize={24}>
                  {coursePerfData.map((e,i) => <Cell key={i} fill={COLORS.blue[i % COLORS.blue.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 4. Teacher Performance Radar */}
        <ChartCard title="O'qituvchi Reytingi" desc="Kompleks unumdorlik" types={['Radar', 'Bar']}>
          {({ type }: any) => (
            <ResponsiveContainer width="100%" height="100%">
              {type === 'Radar' ? (
                <RadarChart data={teacherPerf} outerRadius="75%">
                  <PolarGrid stroke="rgba(150,150,150,0.1)" />
                  <PolarAngleAxis dataKey="name" tick={{fontSize: 11, fontWeight: 800, fill: '#888'}} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Sifat %" dataKey="score" stroke={COLORS.blue[2]} fill={COLORS.blue[2]} fillOpacity={0.3} strokeWidth={2} />
                  <Radar name="Qolish %" dataKey="retention" stroke={COLORS.emerald[2]} fill={COLORS.emerald[2]} fillOpacity={0.3} strokeWidth={2} />
                  <Tooltip content={<ThemedTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                </RadarChart>
              ) : (
                <BarChart data={teacherPerf} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.1)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 10, fontWeight: 700}} dy={10} />
                  <YAxis tickLine={false} axisLine={false} domain={[0,100]} tick={{fontSize: 10, fontWeight: 700}} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700, paddingTop:10 }} />
                  <Bar dataKey="score" name="Dars sifati" fill={COLORS.blue[2]} radius={[4,4,0,0]} maxBarSize={20} />
                  <Bar dataKey="retention" name="Qolish %" fill={COLORS.emerald[2]} radius={[4,4,0,0]} maxBarSize={20} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* 5. Acquisition Sources Funnel / Donut */}
        <ChartCard title="Lid Manbalari" desc="Trafik konversiyasi" types={['Donut', 'Funnel']}>
          {({ type }: any) => (
             type === 'Donut' ? (
                <div className="flex flex-col md:flex-row items-center w-full h-full pb-4">
                  <div className="flex-1 w-full h-full min-h-[200px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={2} dataKey="value" cornerRadius={4}>
                          {sourceData.map((e,i) => <Cell key={i} fill={Object.values(COLORS)[i%5][2]} />)}
                        </Pie>
                        <Tooltip content={<ThemedTooltip formatter={(v:number)=>`${v}%`} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">100%</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Jami Lid</span>
                    </div>
                  </div>
                  <div className="w-full md:w-1/2 flex flex-col gap-2 p-2">
                    {sourceData.map((s,i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor: Object.values(COLORS)[i%5][2]}} />
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{s.name}</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{s.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
             ) : (
                <div className="flex flex-col justify-center h-full space-y-1.5 px-4 w-full">
                  {[
                    { l: 'Qiziqish / Barchasi', v: 450, c: COLORS.blue[2], w: '100%' },
                    { l: 'Uchrashuv', v: 280, c: COLORS.violet[2], w: '75%' },
                    { l: 'Sinov darsi', v: 160, c: COLORS.amber[3], w: '50%' },
                    { l: 'Sotuv', v: 92, c: COLORS.emerald[2], w: '30%' },
                  ].map((s, i) => (
                    <motion.div key={i} initial={{width:0}} animate={{width:s.w}} className="h-10 rounded-lg flex items-center justify-between px-4 relative overflow-hidden" style={{backgroundColor: s.c}}>
                       <span className="text-xs font-black text-white z-10">{s.l}</span>
                       <span className="text-lg font-black text-white/90 z-10">{s.v}</span>
                       <div className="absolute top-0 right-0 h-full w-24 bg-white/10 -skew-x-12 translate-x-4"></div>
                    </motion.div>
                  ))}
                </div>
             )
          )}
        </ChartCard>

        {/* 6. Demographics Dual Chart */}
        <ChartCard title="Demografiya" desc="Yosh va Jins taqsimoti" types={['Dual']}>
          {() => (
            <div className="flex items-center w-full h-full">
              <div className="w-1/2 h-full flex flex-col items-center justify-center border-r border-slate-100 dark:border-white/5 pr-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={demographicsAge} layout="vertical" margin={{top:0, right:5, left:0, bottom:0}}>
                     <XAxis type="number" hide />
                     <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#888'}} width={40} />
                     <Tooltip content={<ThemedTooltip />} cursor={{fill: 'rgba(0,0,0,0.02)'}} />
                     <Bar dataKey="v" name="O'quvchi" fill={COLORS.blue[2]} radius={[0,4,4,0]} barSize={16}>
                       {demographicsAge.map((e,i) => <Cell key={i} fill={COLORS.blue[i === 2 ? 3 : 1]} />)}
                     </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 h-full relative flex items-center justify-center pl-4 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                   <PieChart>
                     <Pie data={demographicsGender} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" stroke="none">
                       {demographicsGender.map((e,i) => <Cell key={i} fill={e.fill} />)}
                     </Pie>
                     <Tooltip content={<ThemedTooltip formatter={(v:any)=>`${v}%`} />} />
                   </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center ml-4 pointer-events-none mb-4">
                  <div className="flex -space-x-1">
                   {['bg-blue-500', 'bg-rose-500'].map((c,i) => <div key={i} className={`w-3 h-3 rounded-full ${c} border border-white`} />)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartCard>

      </div>

      {/* 8. DATA TABLE */}
      <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-white/5 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">So'nggi O'quvchilar Bazasi</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Barcha filtirlangan va status bo'yicha saralangan ma'lumotlar.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Qidirish..." className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold w-[200px] outline-none focus:border-blue-500 transition-colors" />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-xs font-bold text-slate-600 dark:text-slate-300">
              <Filter size={14} /> Saralash
            </button>
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/[0.02]">
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">O'quvchi</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Kurs & Guruh</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Davomat</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">To'lov Holati</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {[
                { n: "Aliyev Bobur", c: "IELTS Intensive", g: "IELTS-G3", a: 95, p: "To'langan", pc: "emerald" },
                { n: "Xusanova Komila", c: "IT Front-End", g: "Fr-11", a: 65, p: "Qarzdor", pc: "rose" },
                { n: "Umarov Jomiy", c: "Matematika", g: "Math-OTM", a: 88, p: "Qisman", pc: "amber" },
                { n: "Samadov Aziz", c: "General English", g: "GE-B2", a: 90, p: "To'langan", pc: "emerald" },
                { n: "Olimova Jasmina", c: "IELTS Intensive", g: "IELTS-G4", a: 72, p: "Qarzdor", pc: "rose" },
              ].map((r, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-black">
                      {r.n.charAt(0)}
                    </div>
                    {r.n}
                    {r.a < 70 && r.pc === "rose" && <span title="Xavf hududida"><AlertTriangle size={14} className="text-rose-500" /></span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{r.c}</p>
                    <p className="text-[10px] font-bold text-slate-400">{r.g}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${r.a >= 90 ? 'text-emerald-600' : r.a >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>{r.a}%</span>
                      <div className="w-16 h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.a}%`, backgroundColor: r.a >= 90 ? '#10b981' : r.a >= 75 ? '#f59e0b' : '#f43f5e' }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-md uppercase tracking-wider
                      ${r.pc === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20' : ''}
                      ${r.pc === 'rose' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20' : ''}
                      ${r.pc === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20' : ''}
                    `}>
                      {r.p}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-slate-400 hover:text-blue-600 p-2"><MoreHorizontal size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-500">
          <p>Jami 1,248 o'quvchidan 1-5 ko'rsatilmoqda.</p>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50" disabled>Oldingi</button>
            <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">1</button>
            <button className="px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg">2</button>
            <button className="px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg">3</button>
            <button className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5">Keyingi</button>
          </div>
        </div>
      </div>
    </div>
  );
}
