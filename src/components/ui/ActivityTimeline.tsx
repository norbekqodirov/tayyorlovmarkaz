import React, { useState } from 'react';
import { Plus, Edit3, Trash2, Phone, MessageSquare, Calendar, FileText, Activity, ChevronDown, RotateCcw, User } from 'lucide-react';

export type TimelineItemType = 'create' | 'update' | 'delete' | 'restore' | 'note' | 'call' | 'message' | 'meeting' | 'event' | 'login' | 'logout';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  description?: string;
  timestamp: string | Date;
  user?: { name: string; avatar?: string };
  meta?: Record<string, any>;
  expandable?: React.ReactNode;
}

export interface ActivityTimelineProps {
  items: TimelineItem[];
  groupByDay?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

const ICON_MAP: Record<TimelineItemType, { icon: any; color: string; bg: string }> = {
  create:   { icon: Plus,         color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30' },
  update:   { icon: Edit3,        color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30' },
  delete:   { icon: Trash2,       color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-100 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30' },
  restore:  { icon: RotateCcw,    color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-100 dark:bg-violet-500/15 border-violet-200 dark:border-violet-500/30' },
  note:     { icon: FileText,     color: 'text-zinc-600 dark:text-zinc-300',       bg: 'bg-zinc-100 dark:bg-zinc-500/15 border-zinc-200 dark:border-zinc-500/30' },
  call:     { icon: Phone,        color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30' },
  message:  { icon: MessageSquare,color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-100 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30' },
  meeting:  { icon: Calendar,     color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-100 dark:bg-cyan-500/15 border-cyan-200 dark:border-cyan-500/30' },
  event:    { icon: Activity,     color: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-500/15 border-slate-200 dark:border-slate-500/30' },
  login:    { icon: User,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30' },
  logout:   { icon: User,         color: 'text-zinc-600 dark:text-zinc-300',       bg: 'bg-zinc-100 dark:bg-zinc-500/15 border-zinc-200 dark:border-zinc-500/30' },
};

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hozir';
  if (diff < 3600) return `${Math.floor(diff / 60)} daq oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} kun oldin`;
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(d: Date): string {
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Bugun';
  if (isYesterday) return 'Kecha';
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
}

function TimelineItemRow({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const { icon: Icon, color, bg } = ICON_MAP[item.type] || ICON_MAP.event;
  const date = typeof item.timestamp === 'string' ? new Date(item.timestamp) : item.timestamp;

  return (
    <div className="relative pl-10 pb-5 last:pb-0 group">
      {/* Connector line */}
      <div className="absolute left-[15px] top-9 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800 group-last:hidden" />

      {/* Icon */}
      <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border ${bg} flex items-center justify-center z-10`}>
        <Icon size={14} className={color} strokeWidth={2.5} />
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {item.title}
            </p>
            {item.description && (
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
              {item.user && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[8px] font-black">
                    {item.user.name.charAt(0).toUpperCase()}
                  </span>
                  {item.user.name}
                </span>
              )}
              <span>·</span>
              <span title={date.toLocaleString('uz-UZ')}>{formatTime(date)}</span>
              <span>·</span>
              <span>{formatRelative(date)}</span>
            </div>
          </div>
          {item.expandable && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors flex-shrink-0"
            >
              <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {expanded && item.expandable && (
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            {item.expandable}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityTimeline({ items, groupByDay = false, loading = false, emptyMessage = 'Faollik tarixi yo\'q', className = '' }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="flex-1 h-16 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
        <Activity size={36} className="text-zinc-300 dark:text-zinc-700 mb-3" />
        <p className="text-sm font-bold text-zinc-400">{emptyMessage}</p>
      </div>
    );
  }

  if (groupByDay) {
    const groups: Record<string, TimelineItem[]> = {};
    items.forEach(item => {
      const d = typeof item.timestamp === 'string' ? new Date(item.timestamp) : item.timestamp;
      const key = d.toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return (
      <div className={className}>
        {Object.entries(groups).map(([dateStr, dayItems]) => (
          <div key={dateStr} className="mb-6 last:mb-0">
            <div className="sticky top-0 z-10 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm py-2 -mx-2 px-2 mb-3">
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                {formatDay(new Date(dateStr))}
              </p>
            </div>
            <div>
              {dayItems.map(item => (
                <TimelineItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map(item => (
        <TimelineItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

export default ActivityTimeline;
