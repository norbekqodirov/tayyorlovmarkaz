import {
  GraduationCap, Layers, Wallet, TrendingUp, AlertCircle, Users, UserCheck, Target,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { formatCompact } from '../registry';

export function StatCard({ id, data }: { id: string; data: any }) {
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
