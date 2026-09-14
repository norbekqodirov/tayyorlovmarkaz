/**
 * ExamTab.tsx
 *
 * Imtihon ustunlari endi haqiqiy yaratilgan GroupExam yozuvlaridan keladi —
 * ilgari "1-Imtihon (Oraliq)"/"2-Imtihon (Oraliq)"/"Yakuniy Imtihon" qattiq
 * kodlangan 3 ta ustun har doim ko'rsatilardi, guruhda haqiqatan imtihon
 * rejalashtirilganidan qat'i nazar. Endi: avval imtihon (nomi + sanasi)
 * yaratiladi, shundagina ustun paydo bo'ladi va ball kiritish mumkin bo'ladi.
 */
import React, { useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Modal } from '../ui/Modal';
import ConfirmDialog from '../ConfirmDialog';
import { EmptyState } from '../States';

interface GroupExamDef { id: string; name: string; date: string; maxScore: number }

interface Props {
  group: any;
  groupStudents: any[];
  groupExams: GroupExamDef[];
  examDocs: any[];
  onScoreChange: (studentId: string, examName: string, score: number, maxScore: number) => void;
  onCreateExam: (data: { name: string; date: string; maxScore: number }) => Promise<void>;
  onDeleteExam: (groupExamId: string) => Promise<void>;
  canManage: boolean;
}

const ExamTab: React.FC<Props> = ({
  group, groupStudents, groupExams, examDocs, onScoreChange, onCreateExam, onDeleteExam, canManage,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', date: format(new Date(), 'yyyy-MM-dd'), maxScore: 100 });
  const [deleteTarget, setDeleteTarget] = useState<GroupExamDef | null>(null);

  const sortedExams = [...groupExams].sort((a, b) => a.date.localeCompare(b.date));

  const submitCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onCreateExam({ name: form.name.trim(), date: form.date, maxScore: form.maxScore || 100 });
      setShowCreate(false);
      setForm({ name: '', date: format(new Date(), 'yyyy-MM-dd'), maxScore: 100 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-zinc-400">
          {sortedExams.length > 0 ? `${sortedExams.length} ta imtihon` : "Hali imtihon yaratilmagan"}
        </p>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition-colors"
          >
            <Plus size={14} /> Imtihon qo'shish
          </button>
        )}
      </div>

      {sortedExams.length === 0 ? (
        <EmptyState
          icon={<Calendar size={24} />}
          title="Bu guruh uchun hali imtihon yaratilmagan"
          message={canManage ? '"Imtihon qo\'shish" tugmasi orqali nomi va sanasini belgilab birinchi imtihonni yarating.' : "O'qituvchi yoki menejer imtihon yaratgandan so'ng bu yerda paydo bo'ladi."}
        />
      ) : (
        <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
            <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                  Talabalar
                </th>
                {sortedExams.map((exam) => (
                  <th key={exam.id} className="px-6 py-3 text-center border-l border-zinc-100 dark:border-zinc-800 group relative">
                    <div className="text-xs font-black text-purple-600 dark:text-purple-400">{exam.name}</div>
                    <div className="text-[10px] text-zinc-400 font-medium mt-0.5">
                      {format(parseISO(exam.date), 'd MMM yyyy', { locale: uz })} · {exam.maxScore} ball
                    </div>
                    {canManage && (
                      <button
                        onClick={() => setDeleteTarget(exam)}
                        aria-label={`${exam.name} imtihonini o'chirish`}
                        className="absolute top-1 right-1 p-1 rounded-md text-zinc-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
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
                  {sortedExams.map((exam) => {
                    const rec = examDocs.find(
                      (a: any) => a.groupId === group.id && a.examName === exam.name && a.studentId === s.id,
                    );
                    const score = rec?.score ?? '';
                    return (
                      <td key={exam.id} className="px-6 py-2 border-l border-zinc-100 dark:border-zinc-800 text-center">
                        <input
                          type="number"
                          min="0"
                          max={exam.maxScore}
                          defaultValue={score}
                          placeholder="--"
                          onBlur={e => {
                            if (e.target.value !== '' && e.target.value !== String(score)) {
                              onScoreChange(s.id, exam.name, Number(e.target.value), exam.maxScore);
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
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Yangi imtihon">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Imtihon nomi *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Masalan: 1-oraliq nazorat"
              className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Sanasi *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Maksimal ball</label>
              <input
                type="number" min="1"
                value={form.maxScore}
                onChange={e => setForm(p => ({ ...p, maxScore: Number(e.target.value) || 100 }))}
                className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Bekor</button>
            <button
              onClick={() => void submitCreate()}
              disabled={saving || !form.name.trim() || !form.date}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold"
            >
              {saving ? 'Yaratilmoqda...' : "Yaratish"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Imtihonni o'chirish"
        message={`"${deleteTarget?.name}" imtihonini o'chirmoqchimisiz? Bu imtihon uchun kiritilgan barcha ball ustundan yashiriladi.`}
        confirmText="Ha, o'chirish"
        onConfirm={async () => { if (deleteTarget) { await onDeleteExam(deleteTarget.id); setDeleteTarget(null); } }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ExamTab;
