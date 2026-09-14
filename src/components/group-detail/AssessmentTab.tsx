/**
 * AssessmentTab.tsx
 * Daily 1–5 grade grid (students × lesson days) for a group. Each cell is a
 * clickable badge — clicking opens a popover with 5 colored buttons (1=rose
 * .. 5=emerald, magnitude-coded) to pick the grade.
 */
import React, { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import MonthSelector from './MonthSelector';
import { GRADE_COLORS, GRADE_NEUTRAL, gradeColorFor } from '../../utils/gradeColor';

const DAY_JS_MAP: Record<string, number> = {
  Dush: 1, Sesh: 2, Chor: 3, Pay: 4, Jum: 5, Shan: 6, Yak: 0,
};

interface Props {
  group: any;
  groupStudents: any[];
  assessmentDocs: any[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
  onScoreChange: (studentId: string, dateStr: string, score: number) => void;
}

const AssessmentTab: React.FC<Props> = ({
  group, groupStudents, assessmentDocs, currentDate, onDateChange, onScoreChange,
}) => {
  const hasSchedule = !!group?.days?.length;
  const [picker, setPicker] = useState<{ studentId: string; dateStr: string; x: number; y: number } | null>(null);

  const daysInMonth = useMemo(() => {
    if (!hasSchedule) return [];
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end }).filter(date =>
      group.days.map((d: string) => DAY_JS_MAP[d]).includes(date.getDay())
    );
  }, [currentDate, group, hasSchedule]);

  if (!hasSchedule) {
    return (
      <div className="flex flex-col h-full space-y-4">
        <MonthSelector currentDate={currentDate} onChange={onDateChange} accentClass="bg-indigo-500" />
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Bu guruh uchun dars jadvali belgilanmagan</p>
          <p className="text-xs text-zinc-400 mt-1">Baholashni kunlar bo'yicha ko'rsatish uchun avval Bosh sahifadagi "Dars Jadvali" vidjeti orqali guruhning dars kunlarini sozlang.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <MonthSelector currentDate={currentDate} onChange={onDateChange} accentClass="bg-indigo-500" />

      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                Talabalar
              </th>
              {daysInMonth.map((d, i) => (
                <th key={i} className="px-2 py-3 text-center text-[10px] font-black text-indigo-500 border-l border-zinc-100 dark:border-zinc-800">
                  {format(d, 'dd MMM', { locale: uz })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-300">
            {groupStudents.map((s: any, idx) => (
              <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800 min-w-[200px]">
                  <span className="text-zinc-400 mr-2">{idx + 1}</span> {s.name}
                </td>
                {daysInMonth.map((d, i) => {
                  const dateStr = format(d, 'yyyy-MM-dd');
                  const rec = assessmentDocs.find(
                    (a: any) => a.groupId === group.id && a.date === dateStr && a.studentId === s.id,
                  );
                  const score = rec?.score != null ? Number(rec.score) : null;
                  const colors = gradeColorFor(score);
                  return (
                    <td key={i} className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center">
                      <button
                        onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setPicker(p =>
                            p && p.studentId === s.id && p.dateStr === dateStr
                              ? null
                              : { studentId: s.id, dateStr, x: r.left, y: r.bottom + 4 }
                          );
                        }}
                        aria-label={score != null ? `Baho: ${score} — bosib o'zgartirish` : "Baho qo'yish"}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-black transition-transform hover:scale-110 ${colors ? colors.solid : GRADE_NEUTRAL}`}
                      >
                        {score ?? '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPicker(null)} />
          <div
            className="fixed z-50 flex items-center gap-1 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl"
            style={{ left: picker.x, top: picker.y }}
          >
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => { onScoreChange(picker.studentId, picker.dateStr, n); setPicker(null); }}
                title={`Baho: ${n}`}
                aria-label={`Baho: ${n}`}
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black transition-transform hover:scale-110 ${GRADE_COLORS[n].solid}`}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AssessmentTab;
