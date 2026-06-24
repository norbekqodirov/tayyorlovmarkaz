/**
 * RatingTab.tsx
 * Performance leaderboard cards for each student in the group.
 * Ranks students by a composite score (attendance × 10 + avgGrade × 5).
 */
import React from 'react';
import { format } from 'date-fns';
import MonthSelector from './MonthSelector';

interface Props {
  group: any;
  groupStudents: any[];
  attendanceDocs: any[];
  assessmentDocs: any[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
}

const RatingTab: React.FC<Props> = ({
  group, groupStudents, attendanceDocs, assessmentDocs, currentDate, onDateChange,
}) => {
  const monthPrefix = format(currentDate, 'yyyy-MM');

  const ranked = [...groupStudents]
    .map(s => {
      // Attendance for this month
      const monthAtt = attendanceDocs.filter(
        (a: any) => a.groupId === group.id && a.date.startsWith(monthPrefix),
      );
      let present = 0;
      const totalAtt = monthAtt.length;
      monthAtt.forEach((doc: any) => {
        const r = doc.records?.find((rec: any) => rec.studentId === s.id);
        if (r?.status === 'present' || r?.status === 'late') present++;
      });

      // Assessments for this month
      const monthAss = assessmentDocs.filter(
        (a: any) => a.groupId === group.id && a.studentId === s.id && a.date.startsWith(monthPrefix),
      );
      const totalScore = monthAss.reduce((sum: number, doc: any) => sum + Number(doc.score || 0), 0);
      const avgScore = monthAss.length > 0 ? (totalScore / monthAss.length).toFixed(1) : '0.0';
      const performanceIndex = present * 10 + Number(avgScore) * 5;

      return { ...s, present, totalAtt, avgScore, performanceIndex };
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
                <p className={`text-xl font-black ${
                  Number(s.avgScore) >= 80 ? 'text-emerald-500' : Number(s.avgScore) >= 50 ? 'text-amber-500' : 'text-rose-500'
                }`}>
                  {s.avgScore}
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
