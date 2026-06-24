/**
 * LazyChart — Suspense wrapper for recharts components.
 *
 * Import this instead of recharts directly in pages that don't always
 * need charts, so the recharts chunk is only loaded when the chart
 * actually renders.
 *
 * Usage:
 *   <LazyChartContainer>
 *     <AreaChart ...> ... </AreaChart>
 *   </LazyChartContainer>
 *
 * For typed recharts re-exports, import directly from 'recharts' in
 * heavy pages (BI, Dashboard) — they always need charts anyway.
 * This wrapper is for lightweight pages (Settings, Finance summary, etc.)
 */
import { Suspense, type ReactNode } from 'react';

// ── Chart skeleton ───────────────────────────────────────────────────────────
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse"
      style={{ height }}
    />
  );
}

// ── Suspense container ────────────────────────────────────────────────────────
interface LazyChartContainerProps {
  children: ReactNode;
  height?: number;
  className?: string;
}

export function LazyChartContainer({ children, height = 200, className }: LazyChartContainerProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <div className={className}>{children}</div>
    </Suspense>
  );
}

export default LazyChartContainer;
