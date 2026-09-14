// 5-ballik baholash tizimi uchun yagona rang lug'ati — kichik (1) qizil'dan
// katta (5) yashilgacha, kattalik/kichiklikka qarab farqlanadi. AssessmentTab
// (Baholash grid + popover) va RatingTab (o'rtacha baho ko'rsatkichi) shu
// yerdan foydalanadi, ikkalasi ham bir xil rangda ko'rinishi uchun.
export const GRADE_COLORS: Record<number, { solid: string; text: string; bg: string }> = {
  1: { solid: 'bg-rose-500 text-white',    text: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-500/10' },
  2: { solid: 'bg-orange-500 text-white',  text: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-500/10' },
  3: { solid: 'bg-amber-500 text-white',   text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/10' },
  4: { solid: 'bg-lime-500 text-white',    text: 'text-lime-600 dark:text-lime-400',       bg: 'bg-lime-50 dark:bg-lime-500/10' },
  5: { solid: 'bg-emerald-500 text-white', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
};

export const GRADE_NEUTRAL = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 border border-dashed border-zinc-300 dark:border-zinc-700';

export function gradeColorFor(score: number | null | undefined) {
  if (!score || score < 1 || score > 5) return null;
  return GRADE_COLORS[Math.round(score)] || null;
}
