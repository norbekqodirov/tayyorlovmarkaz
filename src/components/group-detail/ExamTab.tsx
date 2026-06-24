/**
 * ExamTab.tsx
 * Fixed exam columns (1-Imtihon, 2-Imtihon, Yakuniy) with score inputs per student.
 */
import React from 'react';

const EXAM_NAMES = ['1-Imtihon (Oraliq)', '2-Imtihon (Oraliq)', 'Yakuniy Imtihon'];

interface Props {
  group: any;
  groupStudents: any[];
  examDocs: any[];
  onScoreChange: (studentId: string, examName: string, score: number) => void;
}

const ExamTab: React.FC<Props> = ({ group, groupStudents, examDocs, onScoreChange }) => (
  <div className="flex flex-col h-full space-y-4">
    <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
      <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
        <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
          <tr>
            <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
              Talabalar
            </th>
            {EXAM_NAMES.map((name, i) => (
              <th key={i} className="px-6 py-3 text-center text-xs font-black text-purple-600 dark:text-purple-400 border-l border-zinc-100 dark:border-zinc-800">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-300">
          {groupStudents.map((s: any, idx) => (
            <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
              <td className="px-4 py-4 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800 min-w-[200px]">
                <span className="text-zinc-400 mr-2">{idx + 1}</span> {s.name}
              </td>
              {EXAM_NAMES.map((examName, i) => {
                const rec = examDocs.find(
                  (a: any) => a.groupId === group.id && a.examName === examName && a.studentId === s.id,
                );
                const score = rec?.score ?? '';
                return (
                  <td key={i} className="px-6 py-2 border-l border-zinc-100 dark:border-zinc-800 text-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={score}
                      placeholder="--"
                      onBlur={e => {
                        if (e.target.value !== String(score)) {
                          onScoreChange(s.id, examName, Number(e.target.value));
                        }
                      }}
                      className="w-16 h-10 px-2 text-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-black focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-purple-600 dark:text-purple-400"
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

export default ExamTab;
