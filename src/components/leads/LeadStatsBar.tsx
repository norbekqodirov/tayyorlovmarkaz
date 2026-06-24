/**
 * LeadStatsBar.tsx
 * Summary stat cards at the top of the Leads page.
 */
import React from 'react';
import { Target, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
}

const LeadStatsBar: React.FC<Props> = ({ leads }) => {
  const stats = [
    {
      label: 'Jami Lidlar',
      value: leads.length,
      icon: Target,
      gradient: 'from-blue-500 to-indigo-600',
      sub: 'Hammasi',
    },
    {
      label: 'Issiq (Hot)',
      value: leads.filter(l => l.status === 'hot').length,
      icon: TrendingUp,
      gradient: 'from-rose-500 to-red-600',
      sub: 'Yuqori potensial',
    },
    {
      label: 'Yutilgan',
      value: leads.filter(l => l.stage === 'won').length,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-teal-600',
      sub: 'Muvaffaqiyatli',
    },
    {
      label: 'Konversiya',
      value: leads.length > 0
        ? `${Math.round((leads.filter(l => l.stage === 'won').length / leads.length) * 100)}%`
        : '0%',
      icon: Clock,
      gradient: 'from-amber-500 to-orange-600',
      sub: 'Won / Jami',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-4 shadow-lg text-white relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white/5 -mr-6 -mt-6" />
          <div className="relative flex items-start justify-between">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 shrink-0">
              <stat.icon size={17} strokeWidth={2.5} />
            </div>
          </div>
          <div className="relative mt-3">
            <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
            <p className="text-xl font-black text-white mt-0.5">{stat.value}</p>
            <p className="text-[10px] text-white/60 mt-0.5">{stat.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LeadStatsBar;
