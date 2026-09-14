/**
 * RatingTab.tsx
 * Performance leaderboard cards for each student in the group.
 * Ranks students by a composite score (attendance × 10 + avgGrade × 5).
 */
import React from 'react';
import { format } from 'date-fns';
import MonthSelector from './MonthSelector';
import { gradeColorFor } from '../../utils/gradeColor';

interface Props {
  group: any;
  groupStudents: any[];
  attendanceRecords: any[]; // AttendanceRecord[] — bitta o'quvchi+sana uchun bitta qator
  assessmentDocs: any[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
}

const RatingTab: React.FC<Props> = ({
  group, groupStudents, attendanceRecords, assessmentDocs, currentDate, onDateChange,
}) => {
  const monthPrefix = format(currentDate, 'yyyy-MM');

  const ranked = [...groupStudents]
    .map(s => {
      // Attendance for this month — mahraj (totalAtt) butun guruh uchun
      // belgilangan KUNLAR soni (barcha o'quvchilarga bir xil, adolatli
      // taqqoslash uchun), hisoblagich (present) shu o'quvchining o'zi.
      const monthRecords = attendanceRecords.filter(
        (r: any) => r.groupId === group.id && r.date.startsWith(monthPrefix),
      );
      const totalAtt = new Set(monthRecords.map((r: any) => r.date)).size;
      const present = monthRecords.filter(
        (r: any) => r.studentId === s.id && (r.status === 'present' || r.status === 'late'),
      ).length;

      // Assessments for this month — har bir yozuv o'z maxScore'i bilan foizga
      // normallashtiriladi (Baholash endi 1-5 shkalada, score/maxScore=5), shu
      // sabab eski (0-100 shkalali) yozuvlar bilan ham to'g'ri aralashadi.
      const monthAss = assessmentDocs.filter(
        (a: any) => a.groupId === group.id && a.studentId === s.id && a.date.startsWith(monthPrefix),
      );
      const avgPercent = monthAss.length > 0
        ? monthAss.reduce((sum: number, a: any) => sum + (Number(a.score || 0) / Number(a.maxScore || 5)) * 100, 0) / monthAss.length
        : 0;
      const avgGrade5 = monthAss.length > 0 ? Math.round((avgPercent / 100) * 5 * 10) / 10 : 0;
      const performanceIndex = present * 10 + avgPercent * 5;

      return { ...s, present, totalAtt, avgGrade5, performanceIndex };
    })
    .sort((a, b) => b.performanceIndex - a.performanceIndex);

  const medalClass = (idx: number) => {
    if (idx === 0) return 'bg-amber-400 text-white';
    if (idx === 1) return 'bg-slate-300 text-slate-700';
    if (idx === 2) return 'bg-orange-400 text-white';
    return 'bg-white dark:bg-zinc-700 text-zinc-400';
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <MonthSelector currentDate={currentDate} onChange={onDateChange} accentClass="bg-amber-500" />

      <div className="flex-1 overflow-auto rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max p-2">
        {ranked.map((s, idx) => (
          <div
            key={s.id}
            className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-[24px] border border-zinc-100 dark:border-zinc-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-full blur-3xl -m-10" />

            <div className="flex justify-between items-start mb-6 relative">
              <div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black mb-2 shadow-sm ${medalClass(idx)}`}>
                  #{idx + 1}
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{s.name}</h3>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{s.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 relative">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-3 rounded-xl">
                <p className="text-[9px] font-black tracking-widest text-zinc-400 uppercase mb-1">O'rtacha Baho</p>
                <p className={`text-xl font-black ${gradeColorFor(s.avgGrade5)?.text || 'text-zinc-400'}`}>
                  {s.avgGrade5 || '—'} <span className="text-xs text-zinc-300">/ 5</span>
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-3 rounded-xl">
                <p className="text-[9px] font-black tracking-widest text-zinc-400 uppercase mb-1">Davomat</p>
                <p className="text-xl font-black text-blue-500">
                  {s.present} <span className="text-xs text-zinc-300">/ {s.totalAtt || 12}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RatingTab;
