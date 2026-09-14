import React from 'react';

// Bir xil rang lug'ati StatCard bilan (src/components/ui/StatCard.tsx) — butun
// ilova bo'ylab bitta rang lug'ati, status pill'lar va stat kartalar bir xil
// palitradan foydalanadi.
export type BadgeColor = 'blue' | 'green' | 'rose' | 'amber' | 'violet' | 'indigo' | 'slate' | 'cyan' | 'emerald' | 'orange';

export interface BadgeProps {
  color?: BadgeColor;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const COLOR_MAP: Record<BadgeColor, string> = {
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  green:   'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  rose:    'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  orange:  'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  violet:  'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  indigo:  'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  cyan:    'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
  slate:   'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

// Butun ta'lim moduli bo'ylab takrorlanadigan status/kategoriya pill'i —
// avval 6+ sahifada mustaqil hardcoded rang xaritasi sifatida yozilgan edi.
export function Badge({ color = 'slate', size = 'md', icon, children, className = '' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[9px] gap-1' : 'px-2.5 py-1 text-[10px] gap-1.5';
  return (
    <span className={`inline-flex items-center ${sizeClass} rounded-full font-black uppercase tracking-widest whitespace-nowrap ${COLOR_MAP[color]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export default Badge;
