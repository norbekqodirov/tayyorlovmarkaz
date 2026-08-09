/**
 * LeadStatsBar.tsx
 * Summary stat cards at the top of the Leads page.
 *
 * won/conversion — stageCounts'dan (server, filtrlangan to'liq hisob,
 * sahifalashdan mustaqil). "Issiq" hisobi hozircha joriy yuklangan
 * ro'yxatdan (Kanban rejimida — hammasi; Ro'yxat rejimida — joriy sahifa) —
 * server-side agregatsiya Faza 5'da /api/marketing/overview orqali keladi.
 */
import React from 'react';
import { Target, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { StatCard } from '../ui/StatCard';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
  total: number;
  stageCounts: Record<string, number>;
}

const LeadStatsBar: React.FC<Props> = ({ leads, total, stageCounts }) => {
  const wonCount = stageCounts.won || 0;
  const conversion = total > 0 ? `${Math.round((wonCount / total) * 100)}%` : '0%';
  const hotCount = leads.filter(l => l.status === 'hot').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard variant="gradient" color="blue" label="Jami Lidlar" value={total} sub="Hammasi" icon={<Target size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="rose" label="Issiq (Hot)" value={hotCount} sub="Yuqori potensial" icon={<TrendingUp size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="emerald" label="Yutilgan" value={wonCount} sub="Muvaffaqiyatli" icon={<CheckCircle2 size={17} strokeWidth={2.5} />} />
      <StatCard variant="gradient" color="amber" label="Konversiya" value={conversion} sub="Won / Jami" icon={<Clock size={17} strokeWidth={2.5} />} />
    </div>
  );
};

export default LeadStatsBar;
