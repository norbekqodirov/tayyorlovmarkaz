/**
 * AttendanceTab.tsx
 * Shows the attendance grid (students × lesson days) for a group.
 * Clicking a cell cycles the status: none → present → absent → late → none.
 */
import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Check, X as XIcon, Clock } from 'lucide-react';
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
  onCellClick: (studentId: string, dateStr: string, currentStatus: string | undefined) => void;
}

const AttendanceTab: React.FC<Props> = ({
  group, groupStudents, attendanceDocs, currentDate, onDateChange, onCellClick,
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

  const renderCell = (st: string | undefined) => {
    if (st === 'present')
      return (
        <div className="w-8 h-8 mx-auto rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/50 cursor-pointer">
          <Check size={16} />
        </div>
      );
    if (st === 'absent')
      return (
        <div className="w-8 h-8 mx-auto rounded-xl bg-rose-500 flex items-center justify-center text-white shadow-sm shadow-rose-500/50 cursor-pointer">
          <XIcon size={16} />
        </div>
      );
    if (st === 'late')
      return (
        <div className="w-8 h-8 mx-auto rounded-xl bg-amber-400 flex items-center justify-center text-white shadow-sm shadow-amber-400/50 cursor-pointer">
          <Clock size={16} />
        </div>
      );
    return (
      <div className="w-7 h-7 mx-auto rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer" />
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <MonthSelector currentDate={currentDate} onChange={onDateChange} accentClass="bg-emerald-500" />

      <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
        <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                Talabalar
              </th>
              {daysInMonth.map((d, i) => (
                <th key={i} className="px-2 py-3 text-center text-[10px] font-black text-blue-500 border-l border-zinc-100 dark:border-zinc-800">
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
                  const st = getStatus(s.id, dateStr);
                  return (
                    <td
                      key={i}
                      onClick={() => onCellClick(s.id, dateStr, st)}
                      className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center"
                    >
                      {renderCell(st)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2">
        <button className="text-[10px] uppercase font-black tracking-widest text-zinc-400 hover:text-blue-500 transition-colors border border-zinc-200 dark:border-zinc-700 px-4 py-2 rounded-xl">
          PDF Eksport
        </button>
      </div>
    </div>
  );
};

export default AttendanceTab;
