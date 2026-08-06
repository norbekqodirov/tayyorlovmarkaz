import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap, Wallet, TrendingUp, Layers,
  Plus, X, Settings2,
  Check, Sparkles, Zap, Clock, AlertTriangle,
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { WIDGET_REGISTRY, getDefaultWidgets, formatCompact, MONTHS } from '../../../components/dashboard/registry';
import { WidgetPicker } from '../../../components/dashboard/WidgetPicker';
import { StatCard } from '../../../components/dashboard/widgets/StatCard';
import { RevenueChart } from '../../../components/dashboard/widgets/RevenueChart';
import { StudentGrowthChart } from '../../../components/dashboard/widgets/StudentGrowthChart';
import { LeadSourceChart } from '../../../components/dashboard/widgets/LeadSourceChart';
import { LeadFunnelChart } from '../../../components/dashboard/widgets/LeadFunnelChart';
import { UpcomingLessons } from '../../../components/dashboard/widgets/UpcomingLessons';
import { DebtorsTable } from '../../../components/dashboard/widgets/DebtorsTable';
import { RecentPayments } from '../../../components/dashboard/widgets/RecentPayments';
import { RecentLeads } from '../../../components/dashboard/widgets/RecentLeads';
import { TopStudents } from '../../../components/dashboard/widgets/TopStudents';
import { TasksWidget } from '../../../components/dashboard/widgets/TasksWidget';
import { QuickLinks } from '../../../components/dashboard/widgets/QuickLinks';

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
        return <UpcomingLessons schedules={schedule} />;
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
