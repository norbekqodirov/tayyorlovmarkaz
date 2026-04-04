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
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm animate-pulse">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded w-40 mb-6" />
          <div className="h-[300px] bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
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
