/**
 * AssessmentTab.tsx
 * Daily score grid (students × lesson days) for a group.
 * Each cell is an editable number input (0–100).
 */
import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import MonthSelector from './MonthSelector';

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
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end }).filter(date => {
      const day = date.getDay();
      if (!group?.days?.length) return day !== 0;
      return group.days.map((d: string) => DAY_JS_MAP[d]).includes(day);
    });
  }, [currentDate, group]);

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
                  const score = rec?.score ?? '';
                  return (
                    <td key={i} className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={score}
                        onBlur={e => {
                          if (e.target.value !== String(score)) {
                            onScoreChange(s.id, dateStr, Number(e.target.value));
                          }
                        }}
                        className="w-10 h-8 text-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-indigo-600 dark:text-indigo-400"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssessmentTab;
