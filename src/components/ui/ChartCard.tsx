import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'radar';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type?: 'line' | 'bar' | 'area';
}

export interface ChartCardProps {
  title?: string;
  subtitle?: string;
  type: ChartType;
  data: any[];
  series: ChartSeries[];
  xAxisKey?: string;
  height?: number;
  actions?: React.ReactNode;
  legend?: 'top' | 'bottom' | 'none';
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  formatY?: (v: number) => string;
  formatTooltip?: (value: any, name: string) => React.ReactNode;
  className?: string;
  innerRadius?: number;
  outerRadius?: number;
  stacked?: boolean;
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16'];

function CustomTooltip({ active, payload, label, formatY, formatTooltip }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-3 min-w-[140px]">
      {label && (
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="font-bold text-slate-700 dark:text-zinc-300 truncate">{entry.name}</span>
            </div>
            <span className="font-black text-slate-900 dark:text-white tabular-nums">
              {formatTooltip
                ? formatTooltip(entry.value, entry.name)
                : formatY
                ? formatY(entry.value)
                : entry.value?.toLocaleString?.() ?? entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCard({
  title, subtitle, type, data, series, xAxisKey = 'name',
  height = 300, actions, legend = 'top',
  loading = false, empty = false, emptyMessage = "Ma'lumot yo'q",
  formatY, formatTooltip, className = '',
  innerRadius, outerRadius, stacked,
}: ChartCardProps) {
  const isEmpty = empty || !data || data.length === 0;

  const renderChart = () => {
    if (type === 'pie') {
      return (
        <PieChart>
          <Pie
            data={data}
            dataKey={series[0]?.key}
            nameKey={xAxisKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius || 60}
            outerRadius={outerRadius || 100}
            paddingAngle={2}
          >
            {data.map((_entry, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip formatY={formatY} formatTooltip={formatTooltip} />} />
          {legend !== 'none' && <Legend verticalAlign={legend === 'top' ? 'top' : 'bottom'} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
        </PieChart>
      );
    }

    if (type === 'radar') {
      return (
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(161, 161, 170, 0.2)" />
          <PolarAngleAxis dataKey={xAxisKey} tick={{ fontSize: 11, fontWeight: 700 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          {series.map(s => (
            <Radar key={s.key} dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.3} />
          ))}
          <Tooltip content={<CustomTooltip formatY={formatY} formatTooltip={formatTooltip} />} />
          {legend !== 'none' && <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
        </RadarChart>
      );
    }

    if (type === 'line') {
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.15)" vertical={false} />
          <XAxis dataKey={xAxisKey} tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} tickFormatter={formatY} />
          <Tooltip content={<CustomTooltip formatY={formatY} formatTooltip={formatTooltip} />} />
          {legend !== 'none' && <Legend verticalAlign={legend === 'top' ? 'top' : 'bottom'} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
          {series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart data={data}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.15)" vertical={false} />
          <XAxis dataKey={xAxisKey} tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} tickFormatter={formatY} />
          <Tooltip content={<CustomTooltip formatY={formatY} formatTooltip={formatTooltip} />} />
          {legend !== 'none' && <Legend verticalAlign={legend === 'top' ? 'top' : 'bottom'} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
          {series.map(s => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2.5}
              stackId={stacked ? '1' : undefined}
            />
          ))}
        </AreaChart>
      );
    }

    // bar
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(161, 161, 170, 0.15)" vertical={false} />
        <XAxis dataKey={xAxisKey} tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke="#a1a1aa" axisLine={false} tickLine={false} tickFormatter={formatY} />
        <Tooltip content={<CustomTooltip formatY={formatY} formatTooltip={formatTooltip} />} cursor={{ fill: 'rgba(161, 161, 170, 0.1)' }} />
        {legend !== 'none' && <Legend verticalAlign={legend === 'top' ? 'top' : 'bottom'} iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />}
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[6, 6, 0, 0]} stackId={stacked ? '1' : undefined} />
        ))}
      </BarChart>
    );
  };

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm md:text-base font-black text-slate-900 dark:text-white tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>
      )}

      <div style={{ width: '100%', height }}>
        {loading ? (
          <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
        ) : isEmpty ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
            <BarChart3 size={36} className="text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs font-bold">{emptyMessage}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default ChartCard;
