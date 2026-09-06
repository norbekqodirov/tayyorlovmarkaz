/**
 * AttendanceTab.tsx
 * Shows the attendance grid (students × lesson days) for a group.
 * Each cell provides an explicit status selection.
 */
import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Button } from '../ui/Button';
import MonthSelector from './MonthSelector';

const DAY_JS_MAP: Record<string, number> = {
  Dush: 1, Sesh: 2, Chor: 3, Pay: 4, Jum: 5, Shan: 6, Yak: 0,
};

interface Props {
  group: any;
  groupStudents: any[];
  attendanceDocs: any[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
  disabled: boolean;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  saveState: { state: 'idle' | 'saving' | 'saved' | 'error'; message: string };
  onCellClick: (studentId: string, dateStr: string, nextStatus: string) => void;
}

const AttendanceTab: React.FC<Props> = ({
  group, groupStudents, attendanceDocs, currentDate, onDateChange, onCellClick, disabled, loading, loadError, onRetry, saveState,
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

  const getStatus = (studentId: string, dateStr: string) => {
    const rec = attendanceDocs.find(
      (a: any) => a.groupId === group.id && a.date === dateStr,
    );
    return rec?.records?.find((r: any) => r.studentId === studentId)?.status as string | undefined;
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div role="status" aria-live="polite" className={`text-sm min-h-5 ${saveState.state === 'error' || loadError ? 'text-rose-600' : 'text-slate-600 dark:text-zinc-300'}`}>
        {loading ? 'Davomat yuklanmoqda…' : loadError ? 'Davomatni yuklab bo‘lmadi.' : saveState.message}
        {loadError && <Button size="sm" variant="secondary" onClick={onRetry}>Qayta urinish</Button>}
      </div>
      <MonthSelector currentDate={currentDate} onChange={onDateChange} accentClass="bg-emerald-500" />
      <div className="flex-1 min-h-0 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
          <caption className="sr-only">Guruh davomati — {format(currentDate, 'MMMM yyyy', { locale: uz })}</caption>
          <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-20">
            <tr>
              <th scope="col" className="px-3 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-20">Talabalar</th>
              {daysInMonth.map(day => <th scope="col" key={day.toISOString()} className="px-2 py-3 text-center text-xs">{format(day, 'dd MMM', { locale: uz })}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm text-slate-700 dark:text-zinc-300">
            {groupStudents.map((student, index) => (
              <tr key={student.id}>
                <th scope="row" className="px-3 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 max-w-[140px] sm:max-w-[200px] whitespace-normal break-words">
                  {index + 1}. {student.name}
                </th>
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const status = getStatus(student.id, dateStr);
                  return (
                    <td key={dateStr} className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center">
                      <select
                        aria-label={`${student.name}, ${dateStr} — davomat`}
                        value={status || ''}
                        disabled={disabled}
                        onChange={event => onCellClick(student.id, dateStr, event.target.value)}
                        className="min-h-11 w-32 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 text-xs focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                      >
                        <option value="">Belgilanmagan</option>
                        <option value="present">Keldi</option>
                        <option value="absent">Kelmadi</option>
                        <option value="late">Kechikdi</option>
                        <option value="excused">Sababli</option>
                      </select>
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

export default AttendanceTab;
