import React, { createContext, useContext, useState } from 'react';
import { motion } from 'framer-motion';

interface TabsContextValue {
  active: string;
  setActive: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onChange, children, className = '' }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue || '');
  const active = value ?? internal;
  const setActive = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1 overflow-x-auto scrollbar-thin border-b border-zinc-200 dark:border-zinc-800 ${className}`}>
      {children}
    </div>
  );
}

export interface TabProps {
  value: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

export function Tab({ value, children, icon, count, disabled }: TabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab must be used inside Tabs');
  const isActive = ctx.active === value;

  return (
    <button
      onClick={() => !disabled && ctx.setActive(value)}
      disabled={disabled}
      className={`group relative inline-flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all whitespace-nowrap
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${isActive
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-zinc-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {typeof count === 'number' && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
          isActive
            ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
        }`}>
          {count}
        </span>
      )}
      {isActive && (
        <motion.span
          layoutId="tab-underline"
          className="absolute inset-x-3 -bottom-px h-0.5 bg-blue-500 rounded-full"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}

export function TabPanel({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('TabPanel must be used inside Tabs');
  if (ctx.active !== value) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default Tabs;
