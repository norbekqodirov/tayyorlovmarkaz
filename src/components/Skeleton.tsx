import React from 'react';

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-24" />
          <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
      </div>
      <div className="h-7 w-24 bg-zinc-200 dark:bg-zinc-800 rounded mb-2" />
      <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
    </div>
  );
}

export function SkeletonChart({ height = 300 }: { height?: number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse">
      <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded mb-4" />
      <div style={{ height }} className="bg-zinc-100 dark:bg-zinc-800/50 rounded-xl" />
    </div>
  );
}

export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" />
          <div className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse"
    />
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <SkeletonAvatar size={36} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-2.5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
          </div>
          <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden animate-pulse">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-64" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-950/50">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-6 py-4">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-6 py-4">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-full max-w-[120px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonChart height={320} />
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-pulse">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-32 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
