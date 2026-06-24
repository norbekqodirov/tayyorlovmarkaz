/**
 * NotesTab.tsx
 * Teacher notes for each student in the group (one textarea per student).
 */
import React from 'react';

interface Props {
  group: any;
  groupStudents: any[];
  noteDocs: any[];
  onNoteChange: (studentId: string, note: string) => void;
}

const NotesTab: React.FC<Props> = ({ group, groupStudents, noteDocs, onNoteChange }) => (
  <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-800/20 rounded-2xl p-4 shadow-inner border border-zinc-100 dark:border-zinc-800">
    <div className="space-y-3">
      {groupStudents.map((s: any) => {
        const rec = noteDocs.find((n: any) => n.studentId === s.id && n.groupId === group.id);
        return (
          <div key={s.id} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="w-[200px] shrink-0 font-bold text-sm text-slate-800 dark:text-zinc-200 flex items-center">
              {s.name}
            </div>
            <textarea
              defaultValue={rec?.note || ''}
              onBlur={e => {
                if (e.target.value !== (rec?.note || '')) {
                  onNoteChange(s.id, e.target.value);
                }
              }}
              placeholder="O'quvchi haqida qisqacha izoh yozish..."
              className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-sm font-medium resize-none focus:outline-none focus:border-blue-500 transition-all min-h-[80px] dark:text-zinc-300"
            />
          </div>
        );
      })}
    </div>
  </div>
);

export default NotesTab;
