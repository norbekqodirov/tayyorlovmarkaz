import { useNavigate } from 'react-router-dom';
import { GraduationCap, Layers, Wallet, TrendingUp, UserCheck, BarChart2 } from 'lucide-react';

export function QuickLinks() {
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
