/**
 * International grading standards utility.
 *
 * Supports multiple grading systems used in education:
 * - Percentage (0-100)
 * - Letter grades (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F)
 * - GPA (0.0 - 4.0)
 * - ECTS (A, B, C, D, E, F) — European Credit Transfer System
 * - 5-point scale (Uzbek/Russian: 2, 3, 4, 5)
 * - 10-point scale (Dutch/Eastern European)
 *
 * Standard reference: US college grading system.
 */

export type LetterGrade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'F';

export type GradingSystem = 'percentage' | 'letter' | 'gpa' | 'ects' | '5point' | '10point';

/** Convert percentage (0-100) to US letter grade */
export function toLetterGrade(percent: number): LetterGrade {
  if (percent >= 97) return 'A+';
  if (percent >= 93) return 'A';
  if (percent >= 90) return 'A-';
  if (percent >= 87) return 'B+';
  if (percent >= 83) return 'B';
  if (percent >= 80) return 'B-';
  if (percent >= 77) return 'C+';
  if (percent >= 73) return 'C';
  if (percent >= 70) return 'C-';
  if (percent >= 67) return 'D+';
  if (percent >= 63) return 'D';
  if (percent >= 60) return 'D-';
  return 'F';
}

/** Convert percentage to 4.0 GPA scale */
export function toGPA(percent: number): number {
  const letter = toLetterGrade(percent);
  const gpaMap: Record<LetterGrade, number> = {
    'A+': 4.0, 'A': 4.0,  'A-': 3.7,
    'B+': 3.3, 'B': 3.0,  'B-': 2.7,
    'C+': 2.3, 'C': 2.0,  'C-': 1.7,
    'D+': 1.3, 'D': 1.0,  'D-': 0.7,
    'F':  0.0,
  };
  return gpaMap[letter];
}

/** Convert percentage to ECTS grade (European standard) */
export function toECTS(percent: number): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  if (percent >= 90) return 'A';   // Excellent — top 10%
  if (percent >= 80) return 'B';   // Very good — next 25%
  if (percent >= 70) return 'C';   // Good — next 30%
  if (percent >= 60) return 'D';   // Satisfactory — next 25%
  if (percent >= 50) return 'E';   // Sufficient — bottom 10% passing
  return 'F';                       // Fail
}

/** Convert percentage to 5-point scale (Uzbek/Russian: 2-5) */
export function to5Point(percent: number): 2 | 3 | 4 | 5 {
  if (percent >= 85) return 5;     // A'lo
  if (percent >= 70) return 4;     // Yaxshi
  if (percent >= 55) return 3;     // Qoniqarli
  return 2;                         // Qoniqarsiz
}

/** Convert percentage to 10-point scale */
export function to10Point(percent: number): number {
  return Math.round((percent / 100) * 10);
}

/** Get Uzbek label for letter grade */
export function gradeLabel(letter: LetterGrade): string {
  const labels: Record<LetterGrade, string> = {
    'A+': "A'lo+", 'A': "A'lo",   'A-': "A'lo−",
    'B+': 'Yaxshi+', 'B': 'Yaxshi', 'B-': 'Yaxshi−',
    'C+': 'Qoniqarli+', 'C': 'Qoniqarli', 'C-': 'Qoniqarli−',
    'D+': "Past+", 'D': 'Past', 'D-': "Past−",
    'F':  "Yiqilgan",
  };
  return labels[letter];
}

/** Get 5-point label */
export function fivePointLabel(score: 2 | 3 | 4 | 5): string {
  return ({ 5: "A'lo", 4: 'Yaxshi', 3: 'Qoniqarli', 2: 'Qoniqarsiz' } as const)[score];
}

/**
 * Get color class for a letter grade — used in UI.
 * Returns Tailwind text color classes.
 */
export function getGradeColor(letter: LetterGrade): string {
  if (letter.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400';
  if (letter.startsWith('B')) return 'text-blue-600 dark:text-blue-400';
  if (letter.startsWith('C')) return 'text-amber-600 dark:text-amber-400';
  if (letter.startsWith('D')) return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400'; // F
}

/** Background color class for grade badge */
export function getGradeBgColor(letter: LetterGrade): string {
  if (letter.startsWith('A')) return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
  if (letter.startsWith('B')) return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30';
  if (letter.startsWith('C')) return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30';
  if (letter.startsWith('D')) return 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30';
  return 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30';
}

/** Check if a percentage is passing (default 60%) */
export function isPassing(percent: number, threshold = 60): boolean {
  return percent >= threshold;
}

/** Format a grade for display: shows percentage + letter */
export function formatGrade(percent: number, system: GradingSystem = 'letter'): string {
  if (percent == null || isNaN(percent)) return '—';
  switch (system) {
    case 'percentage': return `${percent.toFixed(0)}%`;
    case 'letter':     return `${toLetterGrade(percent)} (${percent.toFixed(0)}%)`;
    case 'gpa':        return `${toGPA(percent).toFixed(1)} GPA`;
    case 'ects':       return `${toECTS(percent)} (${percent.toFixed(0)}%)`;
    case '5point':     return `${to5Point(percent)} (${fivePointLabel(to5Point(percent))})`;
    case '10point':    return `${to10Point(percent)}/10`;
    default:           return String(percent);
  }
}

/** Calculate GPA from list of scores */
export function calculateGPA(scores: number[]): number {
  if (!scores.length) return 0;
  const total = scores.reduce((sum, s) => sum + toGPA(s), 0);
  return Math.round((total / scores.length) * 100) / 100;
}

/** Calculate average percentage */
export function averagePercent(scores: number[]): number {
  if (!scores.length) return 0;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

/** Get rank from class average — top 10%, top 25%, etc. */
export function getClassRank(studentScore: number, classScores: number[]): {
  rank: number;
  total: number;
  percentile: number;
} {
  const sorted = [...classScores].sort((a, b) => b - a);
  const rank = sorted.findIndex(s => s <= studentScore) + 1;
  const percentile = ((sorted.length - rank + 1) / sorted.length) * 100;
  return { rank, total: sorted.length, percentile: Math.round(percentile) };
}
