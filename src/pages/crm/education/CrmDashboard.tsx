import { useState, useMemo, useCallback, useEffect } from 'react';
import api from '../../../api/client';
import { toTashkentDate } from '../../../utils/tashkentDate';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap, Wallet, TrendingUp, Layers,
  Plus, X, Settings2,
  Check, Sparkles, Zap, Clock, AlertTriangle,
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { ErrorState } from '../../../components/States';
import { WIDGET_REGISTRY, getDefaultWidgets, formatCompact, MONTHS } from '../../../components/dashboard/registry';
import { WidgetPicker } from '../../../components/dashboard/WidgetPicker';
import { StatCard } from '../../../components/dashboard/widgets/StatCard';
import { RevenueChart } from '../../../components/dashboard/widgets/RevenueChart';
import { StudentGrowthChart } from '../../../components/dashboard/widgets/StudentGrowthChart';
import { LeadSourceChart } from '../../../components/dashboard/widgets/LeadSourceChart';
import { LeadFunnelChart } from '../../../components/dashboard/widgets/LeadFunnelChart';
import { WeeklySchedule } from '../../../components/dashboard/widgets/WeeklySchedule';
import { DebtorsTable } from '../../../components/dashboard/widgets/DebtorsTable';
import { RecentPayments } from '../../../components/dashboard/widgets/RecentPayments';
import { RecentLeads } from '../../../components/dashboard/widgets/RecentLeads';
import { TopStudents } from '../../../components/dashboard/widgets/TopStudents';
import { TasksWidget } from '../../../components/dashboard/widgets/TasksWidget';
import { QuickLinks } from '../../../components/dashboard/widgets/QuickLinks';
import { studentStatusToUi } from '../../../utils/statusBadge';

// ─── Main Dashboard ────────────────────────────────────────────────────────
export default function CrmDashboard() {
  const { data: students = [], loading: loadingStudents, error: errorStudents, refetch: refetchStudents } = useFirestore<any>('students');
  const { data: groups = [], loading: loadingGroups, error: errorGroups, refetch: refetchGroups } = useFirestore<any>('groups');
  const { data: leads = [], loading: loadingLeads, error: errorLeads, refetch: refetchLeads } = useFirestore<any>('leads');
  const { data: transactions = [], loading: loadingTransactions, error: errorTransactions, refetch: refetchTransactions } = useFirestore<any>('transactions');
  const { data: teachers = [] } = useFirestore<any>('teachers');
  const { data: attendanceRecords = [] } = useFirestore<any>('attendanceRecords');

  const refetchAll = useCallback(() => {
    refetchStudents();
    refetchGroups();
    refetchLeads();
    refetchTransactions();
  }, [refetchStudents, refetchGroups, refetchLeads, refetchTransactions]);

  // Bo'sh satr fail-closed — 'ADMIN' bo'lganda localStorage buzilgan/o'qib
  // bo'lmagan holatda ham to'liq admin widget to'plami ko'rsatilardi.
  const [userRole] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').role || ''; } catch { return ''; }
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
  const today = toTashkentDate();

  // IP-24: kirim/chiqim metrikalar lug'atidan (server): kategoriya turi bo'yicha, bekor qilinganlar
  // va ichki o'tkazmalar kirmaydi, oy YYYY-MM bo'yicha (ilgari yil hisobga olinmasdi).
  // Ruxsat bo'lmasa (403) — tranzaksiyalardan YYYY-MM bo'yicha zaxira hisob.
  const monthKeys = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return d.toISOString().slice(0, 7);
  }), [today]);
  const [series, setSeries] = useState<Record<string, { income: number; expense: number }> | null>(null);
  useEffect(() => {
    const years = [...new Set(monthKeys.map(k => k.slice(0, 4)))];
    Promise.all(years.map(y => api.get('/analytics/metrics/series', { params: { year: y } }).then(r => r.data as any[])))
      .then(parts => setSeries(Object.fromEntries(parts.flat().map(r => [r.month, { income: r.income, expense: r.expense }]))))
      .catch(() => setSeries(null));
  }, [monthKeys]);
  const monthTotals = useCallback((key: string) => {
    if (series) return series[key] ?? { income: 0, expense: 0 };
    const inMonth = (t: any) => typeof t.date === 'string' && t.date.slice(0, 7) === key;
    return {
      income: transactions.filter((t: any) => t.type === 'income' && inMonth(t)).reduce((a: number, t: any) => a + (t.amount || 0), 0),
      expense: transactions.filter((t: any) => t.type === 'expense' && inMonth(t)).reduce((a: number, t: any) => a + (t.amount || 0), 0),
    };
  }, [series, transactions]);

  const revenueData = useMemo(() => monthKeys.map(k => ({ name: MONTHS[Number(k.slice(5, 7)) - 1], ...monthTotals(k) })), [monthKeys, monthTotals]);

  const joinedIn = useCallback((s: any, key: string) => typeof s.joinedDate === 'string' && s.joinedDate.slice(0, 7) === key, []);
  const studentGrowthData = useMemo(() => {
    let cum = 0;
    return monthKeys.map(k => {
      cum += students.filter((s: any) => joinedIn(s, k)).length;
      return { name: MONTHS[Number(k.slice(5, 7)) - 1], students: cum };
    });
  }, [students, monthKeys, joinedIn]);

  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    leads.forEach((l: any) => {
      const src = l.source || 'Boshqa';
      sources[src] = (sources[src] || 0) + 1;
    });
    return Object.entries(sources).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [leads]);

  const aggrData = useMemo(() => {
    const thisMonthIncome = monthTotals(monthKeys[5]).income;
    const prevMonthIncome = monthTotals(monthKeys[4]).income;
    const monthRevenueGrowth = prevMonthIncome > 0 ? Math.round(((thisMonthIncome - prevMonthIncome) / prevMonthIncome) * 100) : (thisMonthIncome > 0 ? 100 : 0); // ijroiya hisobot bilan bir xil qoida

    const activeStudents = students.filter((s: any) => studentStatusToUi(s.status) === 'Faol');
    const prevMonthStudents = students.filter((s: any) => joinedIn(s, monthKeys[4])).length;
    const thisMonthStudents = students.filter((s: any) => joinedIn(s, monthKeys[5])).length;
    const studentsGrowth = prevMonthStudents > 0 ? Math.round(((thisMonthStudents - prevMonthStudents) / prevMonthStudents) * 100) : 0;

    // Today's attendance — endi haqiqiy AttendanceRecord'dan, butun markaz
    // bo'yicha (eski kod faqat BITTA guruhning yozuvini topardi, .find()
    // birinchi mosini olgani uchun; endi barcha guruhlar to'g'ri jamlanadi).
    const todayRecords = attendanceRecords.filter((r: any) => r.date === today);
    const todayPresent = todayRecords.filter((r: any) => r.status === 'present' || r.status === 'late').length;
    const todayAbsent = todayRecords.filter((r: any) => r.status === 'absent').length;
    const todayTotal = todayPresent + todayAbsent; // sababli (excused) foizga kirmaydi
    const todayAttendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

    // IP-04 (ML-02 oraliq): qarzdor — faqat manfiy balans (Moliya sahifasi va
    // DebtorsTable bilan bir xil qoida; qo'lda yoziladigan to'lov holati matni emas).
    const debtors = students.filter((s: any) => (s.balance || 0) < 0);
    const debtTotal = debtors.reduce((a: number, s: any) => a + Math.abs(s.balance || 0), 0);

    const monthLeads = leads.filter((l: any) => {
      if (!l.createdAt && !l.date) return false;
      return toTashkentDate(new Date(l.createdAt || l.date)).slice(0, 7) === monthKeys[5];
    }).length;

    const wonLeads = leads.filter((l: any) => l.stage === 'won').length;
    const conversionRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;

    return {
      studentsTotal: students.length,
      studentsActive: activeStudents.length,
      studentsLeft: students.filter((s: any) => studentStatusToUi(s.status) === 'Tark etgan').length,
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
  }, [students, groups, leads, teachers, attendanceRecords, today, monthKeys, monthTotals, joinedIn]);

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
      case 'weekly_schedule':
        return <WeeklySchedule />;
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
    if (meta?.size === 'full') return 'col-span-1 sm:col-span-2 lg:col-span-4';
    if (meta?.size === 'lg') return 'col-span-1 sm:col-span-2';
    return 'col-span-1';
  };

  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Xayrli tun' : hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';

  // Ba'zi kolleksiyalar (students/groups/leads/finance) endi COLLECTION_PERMISSION_MAP
  // orqali ruxsat talab qiladi (crud.ts) — TEACHER/MANAGER kabi cheklangan rol uchun
  // bu 403 (ruxsat yo'q) qaytaradi, tarmoq/server xatosi EMAS. Ikkalasini
  // aralashtirib "Dashboard yuklanmadi" degan qo'rqinchli xato ko'rsatish
  // noto'g'ri — 403 holida faqat tegishli vidjet(lar) jim yashiriladi,
  // butun sahifa "singan" ko'rinmasligi kerak.
  const isForbidden = (err: any) => err?.response?.status === 403;
  const deniedPermissions = useMemo(() => {
    const denied = new Set<string>();
    if (isForbidden(errorStudents)) denied.add('students');
    if (isForbidden(errorGroups)) denied.add('groups');
    if (isForbidden(errorLeads)) denied.add('leads');
    if (isForbidden(errorTransactions)) denied.add('finance');
    return denied;
  }, [errorStudents, errorGroups, errorLeads, errorTransactions]);

  const isInitialLoading = loadingStudents && loadingGroups && loadingLeads && loadingTransactions;
  const isFatalError = (errorStudents && !isForbidden(errorStudents)) && (errorGroups && !isForbidden(errorGroups)) &&
    (errorLeads && !isForbidden(errorLeads)) && (errorTransactions && !isForbidden(errorTransactions)) &&
    students.length === 0 && groups.length === 0 && leads.length === 0;

  const visibleWidgets = useMemo(
    () => activeWidgets.filter(id => {
      const meta = getWidgetMeta(id);
      return !meta?.permission || !deniedPermissions.has(meta.permission);
    }),
    [activeWidgets, deniedPermissions]
  );

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isFatalError) {
    return <ErrorState message="Dashboard ma'lumotlarini yuklashda xatolik yuz berdi" onRetry={refetchAll} />;
  }

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

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {[
              { label: "O'quvchi", value: aggrData.studentsTotal, icon: GraduationCap, permission: 'students' },
              { label: 'Guruh', value: aggrData.groupsActive, icon: Layers, permission: 'groups' },
              { label: 'Lid', value: aggrData.totalLeads, icon: TrendingUp, permission: 'leads' },
            ].filter(s => !deniedPermissions.has(s.permission)).map((s, i) => (
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
        <div className="relative border-t border-white/10 px-5 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-4 flex-wrap">
            {!deniedPermissions.has('finance') && (
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-yellow-300" />
                <span className="text-white/70 text-[10px] font-semibold">Bu oylik daromad:</span>
                <span className="text-white font-black text-[13px]">{formatCompact(aggrData.monthRevenue)} so'm</span>
              </div>
            )}
            {aggrData.debtors > 0 && !deniedPermissions.has('students') && (
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
      {visibleWidgets.length === 0 && !isEditMode && (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 dark:border-white/10 py-14 flex flex-col items-center justify-center text-center gap-1">
          <p className="text-sm font-black text-zinc-400">Sizga ko'rsatish uchun vidjet yo'q</p>
          <p className="text-xs text-zinc-400">Vidjetlar sizning ruxsatlaringizga qarab ko'rsatiladi</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-auto">
        <AnimatePresence>
          {visibleWidgets.map(id => {
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
                className={`relative ${getSizeClass(id)} ${meta.size === 'sm' ? 'min-h-[130px]' : meta.size === 'full' ? 'min-h-[560px]' : 'min-h-[280px]'}`}
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
