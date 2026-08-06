/**
 * CrmStudentDetail — Comprehensive student profile page with tabs.
 *
 * Shows: Overview, Grades, Attendance, Statistics, Analytics, Payments,
 *        Tests, Certificates — all in one place.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  ArrowLeft, User, Phone, Mail, MapPin, Calendar, GraduationCap,
  TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertCircle,
  BookOpen, Award, FileText, Wallet, BarChart2, Edit2,
  Activity, Trophy, Target, Users, Download, Share2,
} from 'lucide-react';
import api from '../../../api/client';
import { formatMoney, formatDate } from '../../../utils/formatters';
import {
  toLetterGrade, toGPA, getGradeBgColor, getGradeColor,
  calculateGPA, averagePercent, gradeLabel,
} from '../../../utils/grading';
import { EmptyState, ErrorState } from '../../../components/States';
import { SkeletonStatCard } from '../../../components/Skeleton';

function LoadingState({ label }: { label?: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => <SkeletonStatCard key={i} />)}
      </div>
      {label && <p className="text-center text-xs text-zinc-400">{label}</p>}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudentDetail {
  student: any;
  attendance: { total: number; present: number; absent: number; late: number; rate: number };
  grades: any[];
  payments: any[];
  certificates: any[];
  trend: Array<{ date: string; attendance: number; grades: number }>;
  group?: any;
  course?: any;
}

const TABS = [
  { id: 'overview',     label: 'Umumiy',       icon: User       },
  { id: 'grades',       label: 'Baholar',      icon: Award      },
  { id: 'attendance',   label: 'Davomat',      icon: CheckCircle2 },
  { id: 'statistics',   label: 'Statistika',   icon: BarChart2  },
  { id: 'analytics',    label: 'Analitika',    icon: TrendingUp },
  { id: 'payments',     label: "To'lovlar",    icon: Wallet     },
  { id: 'tests',        label: 'Testlar',      icon: FileText   },
  { id: 'certificates', label: 'Sertifikatlar', icon: Trophy    },
];

const TOOLTIP_STYLE = {
  borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 700,
  padding: '10px 14px',
};

export default function CrmStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Fetch all related data in parallel
        const [studRes, attRes, gradesRes, paymentsRes, certsRes] = await Promise.allSettled([
          api.get(`/students/${id}`),
          api.get(`/students/${id}/attendance`).catch(() => ({ data: [] })),
          api.get(`/journal?studentId=${id}`).catch(() => ({ data: [] })),
          api.get(`/finance?studentId=${id}`).catch(() => ({ data: [] })),
          api.get(`/certificates?studentId=${id}`).catch(() => ({ data: { data: [] } })),
        ]);

        if (studRes.status !== 'fulfilled') {
          setError("O'quvchi topilmadi");
          setLoading(false);
          return;
        }
        const student = studRes.value.data;

        // Process attendance
        const attRecords = attRes.status === 'fulfilled' ? (attRes.value.data || []) : [];
        const present = attRecords.filter((a: any) => a.status === 'present').length;
        const absent  = attRecords.filter((a: any) => a.status === 'absent').length;
        const late    = attRecords.filter((a: any) => a.status === 'late').length;
        const total   = attRecords.length;
        const rate    = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;

        // Process grades
        const gradesRaw = gradesRes.status === 'fulfilled' ? (gradesRes.value.data || []) : [];
        const grades = gradesRaw.filter((g: any) => g.grade != null);

        // Process payments
        const paymentsRaw = paymentsRes.status === 'fulfilled' ? (paymentsRes.value.data || []) : [];
        const payments = Array.isArray(paymentsRaw)
          ? paymentsRaw.filter((p: any) => p.studentId === id)
          : [];

        // Process certificates
        const certsRaw = certsRes.status === 'fulfilled'
          ? (certsRes.value.data?.data || certsRes.value.data || [])
          : [];

        // Build trend data (last 6 months)
        const now = new Date();
        const trend = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          const monthLabel = d.toLocaleDateString('uz-UZ', { month: 'short' });
          const monthAtt = attRecords.filter((a: any) => {
            if (!a.date) return false;
            const ad = new Date(a.date);
            return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear();
          });
          const monthPresent = monthAtt.filter((a: any) => a.status === 'present').length;
          const monthGrades = grades.filter((g: any) => {
            if (!g.date) return false;
            const gd = new Date(g.date);
            return gd.getMonth() === d.getMonth() && gd.getFullYear() === d.getFullYear();
          });
          const avgGrade = monthGrades.length
            ? monthGrades.reduce((s: number, g: any) => s + Number(g.grade), 0) / monthGrades.length
            : 0;
          return {
            date: monthLabel,
            attendance: monthAtt.length ? Math.round((monthPresent / monthAtt.length) * 100) : 0,
            grades: Math.round(avgGrade),
          };
        });

        setData({
          student,
          attendance: { total, present, absent, late, rate },
          grades,
          payments,
          certificates: certsRaw,
          trend,
          group: student.group,
          course: student.course,
        });
      } catch (err: any) {
        setError(err?.message || 'Xatolik yuz berdi');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Derived analytics
  const analytics = useMemo(() => {
    if (!data) return null;
    const gradeScores = data.grades.map(g => Number(g.grade) || 0);
    const avgGrade = averagePercent(gradeScores);
    const gpa = calculateGPA(gradeScores);
    const letter = toLetterGrade(avgGrade);
    const totalPaid = data.payments
      .filter(p => p.type === 'income')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    return { avgGrade, gpa, letter, totalPaid };
  }, [data]);

  if (loading) return <LoadingState label="Talaba ma'lumotlari yuklanmoqda..." />;
  if (error || !data) return <ErrorState message={error || 'Talaba topilmadi'} onRetry={() => navigate(0)} />;

  const student = data.student;
  const initial = (student.name || '?').charAt(0).toUpperCase();

  return (
    <div className="space-y-5 page-enter">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/crmtayyorlovmarkaz/students')}
          className="p-2 rounded-xl bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{student.name}</h1>
          <p className="text-xs text-zinc-400 mt-0.5 font-medium">
            ID: {student.id?.slice(0, 8).toUpperCase()} · {student.status || 'Faol'}
          </p>
        </div>
      </div>

      {/* ── Profile Banner ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 shadow-xl shadow-blue-500/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-white/5" />
        </div>
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center text-white text-3xl font-black shadow-2xl">
            {initial}
          </div>

          {/* Quick info */}
          <div className="flex-1 min-w-0 text-white">
            <h2 className="text-2xl font-black leading-tight">{student.name}</h2>
            <p className="text-white/70 text-sm mt-1">{student.course || '—'} · {student.group || '—'}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-white/70">
              <span className="flex items-center gap-1.5"><Phone size={11} /> {student.phone || '—'}</span>
              {student.parentPhone && <span className="flex items-center gap-1.5"><Users size={11} /> {student.parentPhone}</span>}
              {student.joinedDate && <span className="flex items-center gap-1.5"><Calendar size={11} /> {formatDate(student.joinedDate)}</span>}
            </div>
          </div>

          {/* GPA Card */}
          {analytics && (
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 min-w-[68px]">
                <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">GPA</span>
                <span className="text-white font-black text-lg leading-tight">{analytics.gpa.toFixed(2)}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 min-w-[68px]">
                <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Baho</span>
                <span className="text-white font-black text-lg leading-tight">{analytics.letter}</span>
              </div>
              <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 min-w-[68px]">
                <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Davomat</span>
                <span className="text-white font-black text-lg leading-tight">{data.attendance.rate}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-1 flex overflow-x-auto scrollbar-hide gap-1 shadow-sm">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={13} strokeWidth={2.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview'     && <OverviewTab student={student} attendance={data.attendance} analytics={analytics} />}
        {activeTab === 'grades'       && <GradesTab grades={data.grades} analytics={analytics} />}
        {activeTab === 'attendance'   && <AttendanceTab attendance={data.attendance} trend={data.trend} />}
        {activeTab === 'statistics'   && <StatisticsTab data={data} analytics={analytics} />}
        {activeTab === 'analytics'    && <AnalyticsTab data={data} analytics={analytics} />}
        {activeTab === 'payments'     && <PaymentsTab payments={data.payments} balance={student.balance} studentId={id!} />}
        {activeTab === 'tests'        && <TestsTab studentId={id!} />}
        {activeTab === 'certificates' && <CertificatesTab certificates={data.certificates} />}
      </motion.div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Overview ─────────────────────────────────────────────────────────────────
function OverviewTab({ student, attendance, analytics }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Personal Info */}
      <InfoCard title="Shaxsiy Ma'lumotlar" icon={User}>
        <InfoRow label="F.I.O." value={student.name} />
        <InfoRow label="Tug'ilgan sana" value={student.birthDate ? formatDate(student.birthDate, 'long') : '—'} />
        <InfoRow label="Telefon" value={student.phone} />
        <InfoRow label="Email" value={student.email || '—'} />
        <InfoRow label="Manzil" value={student.address || '—'} />
      </InfoCard>

      {/* Parent Info */}
      <InfoCard title="Ota-ona" icon={Users}>
        <InfoRow label="F.I.O." value={student.parentName || '—'} />
        <InfoRow label="Telefon" value={student.parentPhone || '—'} />
        {student.parentTelegramId && <InfoRow label="Telegram ID" value={student.parentTelegramId} />}
      </InfoCard>

      {/* Academic */}
      <InfoCard title="O'qish" icon={BookOpen}>
        <InfoRow label="Kurs" value={student.course || '—'} />
        <InfoRow label="Guruh" value={student.group || '—'} />
        <InfoRow label="A'zo bo'lgan" value={student.joinedDate ? formatDate(student.joinedDate) : '—'} />
        <InfoRow label="Status" value={student.status || 'Faol'} valueClassName="text-blue-600 font-bold" />
      </InfoCard>

      {/* Quick stats */}
      <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Davomat" value={`${attendance.rate}%`} icon={CheckCircle2} color="emerald" />
        <StatCard label="GPA" value={analytics?.gpa.toFixed(2) || '—'} icon={Award} color="blue" />
        <StatCard label="O'rtacha baho" value={analytics ? `${analytics.avgGrade.toFixed(0)}` : '—'} icon={BarChart2} color="violet" />
        <StatCard label="Balans" value={formatMoney(student.balance || 0)} icon={Wallet} color={(student.balance || 0) < 0 ? 'rose' : 'green'} />
      </div>

      {/* Notes */}
      {student.notes && (
        <div className="lg:col-span-3">
          <InfoCard title="Eslatmalar" icon={FileText}>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 italic">"{student.notes}"</p>
          </InfoCard>
        </div>
      )}
    </div>
  );
}

// ── Grades ───────────────────────────────────────────────────────────────────
function GradesTab({ grades, analytics }: any) {
  if (!grades.length) {
    return <EmptyState icon={<Award size={24} />} title="Hali baholar yo'q" message="Ushbu o'quvchining elektron jurnalda baholar mavjud emas" />;
  }

  // Grade distribution
  const distribution = grades.reduce((acc: any, g: any) => {
    const letter = toLetterGrade(Number(g.grade));
    acc[letter] = (acc[letter] || 0) + 1;
    return acc;
  }, {});
  const distData = Object.entries(distribution).map(([letter, count]) => ({ letter, count }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* GPA Card */}
      <div className="lg:col-span-1 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-6 shadow-sm">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Umumiy Natija</p>
        <div className="flex items-end gap-4 mb-4">
          <div className={`text-6xl font-black ${analytics ? getGradeColor(analytics.letter) : ''}`}>
            {analytics?.letter || 'N/A'}
          </div>
          <div className="text-2xl font-black text-zinc-400 mb-2">{analytics?.avgGrade.toFixed(0)}%</div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-100 dark:border-white/[0.05]">
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">GPA (4.0)</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{analytics?.gpa.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Jami baho</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{grades.length}</p>
          </div>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="lg:col-span-2 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Baholar Taqsimoti</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="letter" stroke="#94a3b8" fontSize={11} fontWeight={700} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {distData.map((d, i) => (
                <Cell key={i} fill={
                  d.letter.startsWith('A') ? '#10b981' :
                  d.letter.startsWith('B') ? '#3b82f6' :
                  d.letter.startsWith('C') ? '#f59e0b' :
                  d.letter.startsWith('D') ? '#f97316' : '#f43f5e'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grades List */}
      <div className="lg:col-span-3 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05]">
          <p className="text-xs font-black text-slate-900 dark:text-white">Baholar Ro'yxati</p>
        </div>
        <div className="divide-y divide-zinc-50 dark:divide-white/[0.03]">
          {grades.slice(0, 50).map((g: any, i: number) => {
            const pct = Number(g.grade);
            const letter = toLetterGrade(pct);
            return (
              <div key={g.id || i} className="flex items-center justify-between px-5 py-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{g.topic || g.subject || 'Dars bahosi'}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(g.date)} · {g.comment || ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-500">{pct}%</span>
                  <span className={`px-2.5 py-1 rounded-lg border text-xs font-black ${getGradeBgColor(letter)}`}>
                    {letter}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Attendance ───────────────────────────────────────────────────────────────
function AttendanceTab({ attendance, trend }: any) {
  const pieData = [
    { name: 'Kelgan',     value: attendance.present, color: '#10b981' },
    { name: 'Kechikkan',  value: attendance.late,    color: '#f59e0b' },
    { name: 'Kelmagan',   value: attendance.absent,  color: '#f43f5e' },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Big Number */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-6 flex flex-col items-center justify-center shadow-sm">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Davomat Foizi</p>
        <div className={`text-6xl font-black ${attendance.rate >= 80 ? 'text-emerald-500' : attendance.rate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
          {attendance.rate}%
        </div>
        <p className="text-sm text-zinc-500 mt-3">
          {attendance.present + attendance.late} / {attendance.total} dars
        </p>
      </div>

      {/* Pie Chart */}
      <div className="lg:col-span-2 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Davomat Taqsimoti</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={4}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Stat Cards */}
      <div className="lg:col-span-3 grid grid-cols-3 gap-3">
        <StatCard label="Kelgan" value={attendance.present} icon={CheckCircle2} color="emerald" />
        <StatCard label="Kechikkan" value={attendance.late} icon={Clock} color="amber" />
        <StatCard label="Kelmagan" value={attendance.absent} icon={XCircle} color="rose" />
      </div>

      {/* Trend Chart */}
      <div className="lg:col-span-3 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Oxirgi 6 Oy Trendi</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="att" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} fontWeight={700} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="attendance" stroke="#10b981" fill="url(#att)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Statistics ───────────────────────────────────────────────────────────────
function StatisticsTab({ data, analytics }: any) {
  // Radar comparison: attendance vs grades vs participation vs homework
  const radarData = [
    { metric: 'Davomat',     value: data.attendance.rate },
    { metric: 'Baholar',     value: analytics?.avgGrade || 0 },
    { metric: 'Testlar',     value: 70 }, // placeholder
    { metric: 'Faollik',     value: 65 }, // placeholder
    { metric: 'Uy ishi',     value: 80 }, // placeholder
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Radar Chart */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Umumiy Profil</p>
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(0,0,0,0.06)" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
            <Radar name="Talaba" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Trends */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Baho va Davomat Trendi</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="attendance" fill="#10b981" name="Davomat %" radius={[6, 6, 0, 0]} />
            <Bar dataKey="grades" fill="#3b82f6" name="O'rtacha baho" radius={[6, 6, 0, 0]} />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        <InsightCard
          icon={Target}
          color="blue"
          title="Maqsadli daraja"
          value={analytics?.gpa >= 3.5 ? "A'lo darajada" : analytics?.gpa >= 3.0 ? 'Yaxshi' : analytics?.gpa >= 2.0 ? 'O\'rtacha' : 'Yordam kerak'}
        />
        <InsightCard
          icon={data.attendance.rate >= 80 ? TrendingUp : TrendingDown}
          color={data.attendance.rate >= 80 ? 'emerald' : 'rose'}
          title="Davomat"
          value={data.attendance.rate >= 80 ? "A'lo davomat" : 'Davomatni yaxshilang'}
        />
        <InsightCard
          icon={Activity}
          color="violet"
          title="Faollik"
          value={data.grades.length > 10 ? 'Yuqori' : data.grades.length > 5 ? "O'rtacha" : 'Past'}
        />
      </div>
    </div>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsTab({ data, analytics }: any) {
  return (
    <div className="space-y-4">
      {/* Performance over time */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
        <p className="text-xs font-black text-slate-900 dark:text-white mb-3">Davomiy O'sish Tahlili</p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data.trend}>
            <defs>
              <linearGradient id="gradGrades" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAtt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} fontWeight={700} />
            <YAxis stroke="#94a3b8" fontSize={10} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="grades" stroke="#3b82f6" fill="url(#gradGrades)" strokeWidth={2.5} name="Baholar" />
            <Area type="monotone" dataKey="attendance" stroke="#10b981" fill="url(#gradAtt)" strokeWidth={2.5} name="Davomat" />
            <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RecommendationCard
          type={analytics?.avgGrade >= 80 ? 'positive' : 'attention'}
          title="Akademik natija"
          description={
            analytics?.avgGrade >= 80
              ? `Ajoyib! O'quvchining o'rtacha bahosi ${analytics?.avgGrade.toFixed(0)}% (${analytics.letter}). Davomiy yondashishni saqlash kerak.`
              : `O'rtacha baho ${analytics?.avgGrade?.toFixed(0) || 0}%. Qo'shimcha mashg'ulotlar tavsiya etiladi.`
          }
        />
        <RecommendationCard
          type={data.attendance.rate >= 85 ? 'positive' : 'attention'}
          title="Davomat tahlili"
          description={
            data.attendance.rate >= 85
              ? `Davomat ${data.attendance.rate}% — mukammal. Sabablar bilan tushuntirilgan kelmaganlik kam.`
              : `Davomat ${data.attendance.rate}%. ${data.attendance.absent} ta darsdan qolgan. Ota-ona bilan suhbat tavsiya etiladi.`
          }
        />
      </div>
    </div>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────
function PaymentsTab({ payments, balance, studentId }: any) {
  const [monthlyDue, setMonthlyDue] = useState<any>(null);
  useEffect(() => {
    if (studentId) {
      api.get(`/finance/monthly-due/${studentId}`).then(res => setMonthlyDue(res.data)).catch(() => setMonthlyDue(null));
    }
  }, [studentId]);

  const totalIncome = payments.filter((p: any) => p.type === 'income').reduce((s: number, p: any) => s + (p.amount || 0), 0);
  return (
    <div className="space-y-4">
      {monthlyDue?.byGroup?.length > 0 && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between">
            <p className="text-xs font-black text-slate-900 dark:text-white">Bu oy uchun hisoblangan to'lov ({monthlyDue.month}) — davomat asosida</p>
            <p className="text-sm font-black text-blue-600">{formatMoney(monthlyDue.total)}</p>
          </div>
          <div className="divide-y divide-zinc-50 dark:divide-white/[0.03]">
            {monthlyDue.byGroup.map((g: any) => (
              <div key={g.groupId} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{g.courseName}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {g.absences} dars qoldirilgan{g.discountApplied ? ` · ${formatMoney(g.discount)} chegirma` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatMoney(g.finalPrice)}</p>
                  {g.discountApplied && <p className="text-[10px] text-zinc-400 line-through">{formatMoney(g.basePrice)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!payments.length ? (
        <EmptyState icon={<Wallet size={24} />} title="To'lovlar tarixi bo'sh" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Jami to'langan" value={formatMoney(totalIncome)} icon={Wallet} color="emerald" />
            <StatCard label="Balans" value={formatMoney(balance || 0)} icon={Wallet} color={(balance || 0) < 0 ? 'rose' : 'green'} />
            <StatCard label="Tranzaksiyalar" value={payments.length} icon={FileText} color="blue" />
          </div>
          <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05]">
              <p className="text-xs font-black text-slate-900 dark:text-white">To'lovlar Tarixi</p>
            </div>
            <div className="divide-y divide-zinc-50 dark:divide-white/[0.03]">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{p.category || 'To\'lov'}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(p.date)} · {p.method}</p>
                  </div>
                  <div className={`text-sm font-black ${p.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {p.type === 'income' ? '+' : '−'}{formatMoney(p.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────
function TestsTab({ studentId }: { studentId: string }) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/tests/submissions?studentId=${studentId}`)
      .then(r => setSubmissions(r.data?.data || r.data || []))
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <LoadingState />;
  if (!submissions.length) return <EmptyState icon={<FileText size={24} />} title="Test natijalari yo'q" />;

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/[0.05]">
        <p className="text-xs font-black text-slate-900 dark:text-white">Test Natijalari</p>
      </div>
      <div className="divide-y divide-zinc-50 dark:divide-white/[0.03]">
        {submissions.map((sub: any) => {
          // TestSubmission.score allaqachon foiz (0-100) sifatida saqlanadi (tests.ts submit handler)
          const pct = Math.round(sub.score || 0);
          const letter = toLetterGrade(pct);
          return (
            <div key={sub.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{sub.test?.title || 'Test'}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(sub.submittedAt)}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-lg border text-xs font-black ${getGradeBgColor(letter)}`}>
                {letter} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Certificates ─────────────────────────────────────────────────────────────
function CertificatesTab({ certificates }: any) {
  if (!certificates.length) return <EmptyState icon={<Trophy size={24} />} title="Sertifikatlar yo'q" message="Bu o'quvchi hali sertifikat olmagan" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {certificates.map((cert: any) => (
        <div key={cert.id} className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 rounded-2xl p-5 border-2 border-amber-200 dark:border-amber-500/30 shadow-sm relative overflow-hidden">
          <div className="absolute top-4 right-4">
            <Trophy size={28} className="text-amber-400" />
          </div>
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Sertifikat</p>
          <h3 className="text-lg font-black text-slate-900 dark:text-white mt-2">{cert.course?.name || 'Kurs'}</h3>
          <p className="text-xs text-zinc-500 mt-1">№ {cert.serialNumber}</p>
          {cert.grade && <p className="text-xs font-bold text-amber-700 mt-2">Baho: {cert.grade}</p>}
          <p className="text-[10px] text-zinc-400 mt-3">{formatDate(cert.issuedAt)}</p>
          {cert.pdfUrl && (
            <a href={cert.pdfUrl} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800">
              <Download size={11} /> PDF yuklab olish
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function InfoCard({ title, icon: Icon, children }: any) {
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={14} className="text-blue-500" />
        <p className="text-xs font-black text-slate-900 dark:text-white">{title}</p>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, valueClassName = '' }: any) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400 font-medium">{label}</span>
      <span className={`text-slate-900 dark:text-white font-bold text-right ${valueClassName}`}>{value || '—'}</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
    blue:    'bg-blue-50 dark:bg-blue-500/10 text-blue-600',
    violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-600',
    amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
    rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-600',
    green:   'bg-green-50 dark:bg-green-500/10 text-green-600',
  };
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color] || colors.blue}`}>
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest truncate">{label}</p>
        <p className="text-base font-black text-slate-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, color, title, value }: any) {
  const colors: Record<string, string> = {
    blue:    'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-600',
    emerald: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
    rose:    'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-600',
    violet:  'border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-600',
  };
  return (
    <div className={`rounded-2xl border-2 p-4 ${colors[color]}`}>
      <Icon size={18} strokeWidth={2.2} className="mb-2" />
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</p>
      <p className="text-sm font-black mt-1">{value}</p>
    </div>
  );
}

function RecommendationCard({ type, title, description }: any) {
  const colors = type === 'positive'
    ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/[0.06]'
    : 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.06]';
  const Icon = type === 'positive' ? CheckCircle2 : AlertCircle;
  const iconColor = type === 'positive' ? 'text-emerald-500' : 'text-amber-500';
  return (
    <div className={`rounded-2xl border-2 p-4 ${colors}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`${iconColor} shrink-0 mt-0.5`} />
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{title}</p>
          <p className="text-xs text-slate-700 dark:text-zinc-300 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
