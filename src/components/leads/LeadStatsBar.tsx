/**
 * LeadStatsBar.tsx
 * Summary stat cards at the top of the Leads page.
 */
import React from 'react';
import { Target, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { StatCard } from '../ui/StatCard';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
}

const LeadStatsBar: React.FC<Props> = ({ leads }) => {
  const wonCount = leads.filter(l => l.stage === 'won').length;
  const conversion = leads.length > 0 ? `${Math.round((wonCount / leads.length) * 100)}%` : '0%';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard variant="gradient" color="blue" label="Jami Lidlar" value={leads.length} sub="Hammasi" icon={<Target size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="rose" label="Issiq (Hot)" value={leads.filter(l => l.status === 'hot').length} sub="Yuqori potensial" icon={<TrendingUp size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="emerald" label="Yutilgan" value={wonCount} sub="Muvaffaqiyatli" icon={<CheckCircle2 size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="amber" label="Konversiya" value={conversion} sub="Won / Jami" icon={<Clock size={17} strokeWidth={2.5} />} />
    </div>
  );
};

export default LeadStatsBar;
