import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export type StatCardVariant = 'minimal' | 'gradient' | 'solid' | 'outline';
export type StatCardColor = 'blue' | 'green' | 'rose' | 'amber' | 'violet' | 'indigo' | 'slate' | 'cyan' | 'emerald' | 'orange';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction?: 'up' | 'down' | 'flat';
    label?: string;
  };
  sub?: string;
  variant?: StatCardVariant;
  color?: StatCardColor;
  loading?: boolean;
  href?: string;
  onClick?: () => void;
  sparkline?: number[];
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const COLOR_MAP: Record<StatCardColor, {
  gradient: string;
  solid: string;
  text: string;
  iconBg: string;
  iconColor: string;
  ring: string;
}> = {
  blue:    { gradient: 'from-blue-500 to-indigo-600', solid: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-500', ring: 'ring-blue-500/20' },
  green:   { gradient: 'from-emerald-500 to-green-600', solid: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-500', ring: 'ring-emerald-500/20' },
  emerald: { gradient: 'from-emerald-500 to-teal-600', solid: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-500', ring: 'ring-emerald-500/20' },
  rose:    { gradient: 'from-rose-500 to-pink-600', solid: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-50 dark:bg-rose-500/10', iconColor: 'text-rose-500', ring: 'ring-rose-500/20' },
  amber:   { gradient: 'from-amber-400 to-orange-500', solid: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-500', ring: 'ring-amber-500/20' },
  orange:  { gradient: 'from-orange-400 to-red-500', solid: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-50 dark:bg-orange-500/10', iconColor: 'text-orange-500', ring: 'ring-orange-500/20' },
  violet:  { gradient: 'from-violet-500 to-purple-600', solid: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-50 dark:bg-violet-500/10', iconColor: 'text-violet-500', ring: 'ring-violet-500/20' },
  indigo:  { gradient: 'from-indigo-500 to-blue-600', solid: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-50 dark:bg-indigo-500/10', iconColor: 'text-indigo-500', ring: 'ring-indigo-500/20' },
  cyan:    { gradient: 'from-cyan-500 to-blue-600', solid: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', iconBg: 'bg-cyan-50 dark:bg-cyan-500/10', iconColor: 'text-cyan-500', ring: 'ring-cyan-500/20' },
  slate:   { gradient: 'from-slate-600 to-slate-800', solid: 'bg-slate-600', text: 'text-slate-600 dark:text-slate-400', iconBg: 'bg-slate-50 dark:bg-slate-500/10', iconColor: 'text-slate-500', ring: 'ring-slate-500/20' },
};

const SIZE_MAP = {
  sm: { padding: 'p-4', valueText: 'text-lg', labelText: 'text-[10px]', iconSize: 'w-8 h-8' },
  md: { padding: 'p-5', valueText: 'text-2xl', labelText: 'text-[10px]', iconSize: 'w-10 h-10' },
  lg: { padding: 'p-6', valueText: 'text-3xl', labelText: 'text-xs', iconSize: 'w-12 h-12' },
};

function Sparkline({ data, color = 'currentColor' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 60;
    const y = 20 - ((v - min) / range) * 18;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="60" height="20" className="opacity-70">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatCard({
  label, value, icon, trend, sub,
  variant = 'minimal', color = 'blue', loading = false,
  href, onClick, sparkline, className = '', size = 'md',
}: StatCardProps) {
  const c = COLOR_MAP[color];
  const s = SIZE_MAP[size];

  if (loading) {
    return (
      <div className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 ${s.padding} animate-pulse ${className}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className={`${s.iconSize} bg-zinc-200 dark:bg-zinc-800 rounded-xl`} />
        </div>
        <div className="h-7 w-24 bg-zinc-200 dark:bg-zinc-800 rounded mb-2" />
        <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  const trendDirection = trend?.direction || (trend && trend.value > 0 ? 'up' : trend && trend.value < 0 ? 'down' : 'flat');
  const TrendIcon = trendDirection === 'up' ? ArrowUp : trendDirection === 'down' ? ArrowDown : Minus;
  const trendColor =
    trendDirection === 'up' ? 'text-emerald-500' :
    trendDirection === 'down' ? 'text-rose-500' :
    'text-zinc-400';

  const isGradient = variant === 'gradient';
  const isSolid = variant === 'solid';
  const isOutline = variant === 'outline';

  const containerClass = isGradient
    ? `bg-gradient-to-br ${c.gradient} text-white border-transparent shadow-lg shadow-${color}-500/20`
    : isSolid
    ? `${c.solid} text-white border-transparent`
    : isOutline
    ? `bg-transparent border-2 ${c.text.replace('text-', 'border-')}/30 dark:${c.text.replace('text-', 'border-')}/40 text-slate-900 dark:text-white`
    : `bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-slate-900 dark:text-white shadow-sm hover:shadow-md`;

  const labelClass = isGradient || isSolid ? 'text-white/80' : 'text-zinc-400 dark:text-zinc-500';
  const subClass = isGradient || isSolid ? 'text-white/70' : 'text-zinc-500 dark:text-zinc-400';

  const interactive = !!(href || onClick);

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl ${s.padding} transition-all duration-300 ${containerClass} ${interactive ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <p className={`${s.labelText} font-black uppercase tracking-widest ${labelClass}`}>
            {label}
          </p>
          {icon && (
            <div className={`${s.iconSize} rounded-xl flex items-center justify-center flex-shrink-0 ${
              isGradient || isSolid ? 'bg-white/15 backdrop-blur-sm text-white' : `${c.iconBg} ${c.iconColor}`
            }`}>
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`${s.valueText} font-black tracking-tight leading-none`}>
              {value}
            </p>
            {sub && (
              <p className={`text-xs font-bold mt-1.5 ${subClass} truncate`}>
                {sub}
              </p>
            )}
          </div>

          {sparkline && sparkline.length > 1 && (
            <div className={isGradient || isSolid ? 'text-white' : c.iconColor}>
              <Sparkline data={sparkline} />
            </div>
          )}
        </div>

        {trend && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-current/10">
            <div className={`flex items-center gap-1 ${isGradient || isSolid ? 'text-white' : trendColor}`}>
              <TrendIcon size={12} strokeWidth={3} />
              <span className="text-xs font-black">
                {trend.value > 0 ? '+' : ''}{trend.value}
                {typeof trend.value === 'number' && !trend.label ? '%' : ''}
              </span>
            </div>
            {trend.label && (
              <span className={`text-[10px] font-bold ${labelClass}`}>{trend.label}</span>
            )}
          </div>
        )}
      </div>

      {isGradient && (
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      )}
    </div>
  );

  if (href) {
    return <a href={href} className="block">{content}</a>;
  }
  return content;
}

export default StatCard;
