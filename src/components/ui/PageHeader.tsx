import React from 'react';
import { Search, ChevronRight } from 'lucide-react';

export interface PageHeaderTab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface PageHeaderBreadcrumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: PageHeaderBreadcrumb[];
  actions?: React.ReactNode;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    debounceMs?: number;
  };
  tabs?: PageHeaderTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  badge?: { label: string; color?: 'blue' | 'green' | 'amber' | 'rose' | 'violet' };
  sticky?: boolean;
  className?: string;
}

const BADGE_COLORS = {
  blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  green: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
};

export function PageHeader({
  title, subtitle, breadcrumb, actions, search, tabs, activeTab, onTabChange,
  badge, sticky = false, className = '',
}: PageHeaderProps) {
  const [searchValue, setSearchValue] = React.useState(search?.value || '');

  // Debounce search value
  React.useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => {
      if (searchValue !== search.value) search.onChange(searchValue);
    }, search.debounceMs ?? 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  React.useEffect(() => {
    if (search && search.value !== searchValue) setSearchValue(search.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.value]);

  return (
    <div className={`${sticky ? 'sticky top-0 z-30 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-md -mx-6 px-6' : ''} ${className}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 mb-2 text-xs font-bold text-zinc-400">
          {breadcrumb.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700" />}
              {item.href || item.onClick ? (
                <a
                  href={item.href}
                  onClick={item.onClick}
                  className="hover:text-blue-500 transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <span className={i === breadcrumb.length - 1 ? 'text-zinc-700 dark:text-zinc-300' : ''}>
                  {item.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {title}
            </h1>
            {badge && (
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${BADGE_COLORS[badge.color || 'blue']}`}>
                {badge.label}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs md:text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          {search && (
            <div className="relative flex-1 lg:flex-initial lg:w-64">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder={search.placeholder || 'Qidirish...'}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          )}
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 -mb-2 overflow-x-auto scrollbar-thin border-b border-zinc-200 dark:border-zinc-800">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange?.(tab.id)}
                className={`group relative inline-flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
                }`}
              >
                {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
                {tab.label}
                {typeof tab.count === 'number' && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
