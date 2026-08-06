/**
 * GroupSidebar.tsx
 * Left panel: group info, enrolled student list, add/remove student UI.
 * Only visible to admin/manager roles (hidden for TEACHER).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, MoreVertical, User, Search, UserPlus, Trash2 } from 'lucide-react';

interface Props {
  group: any;
  groupStudents: any[];
  enrollmentsLoading: boolean;
  showAddStudent: boolean;
  addStudentSearch: string;
  availableStudents: any[];
  addingStudentId: string | null;
  onExport: () => void;
  onAddStudent: (studentId: string) => void;
  onRemoveStudent: (studentId: string) => void;
  onShowAddToggle: (val: boolean) => void;
  onSearchChange: (val: string) => void;
}

const GroupSidebar: React.FC<Props> = ({
  group,
  groupStudents,
  enrollmentsLoading,
  showAddStudent,
  addStudentSearch,
  availableStudents,
  addingStudentId,
  onExport,
  onAddStudent,
  onRemoveStudent,
  onShowAddToggle,
  onSearchChange,
}) => {
  const navigate = useNavigate();

  return (
    <div className="w-[380px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-black text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4 uppercase tracking-widest"
        >
          <ArrowLeft size={14} /> Ortga qaytish
        </button>

        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{group.name}</h1>
          <button className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded-lg transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>

        <div className="space-y-2 text-sm font-bold text-slate-700 dark:text-zinc-300">
          <p className="flex justify-between items-center"><span className="text-zinc-400">O'qituvchi:</span> <span className="text-blue-500">{group.teacher?.name || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Narx:</span> <span>{new Intl.NumberFormat('uz-UZ').format(group.price ?? group.course?.price ?? 0)} so'm</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Vaqt:</span> <span>{group.time || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Kurs:</span> <span>{group.course?.name || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Boshlanish:</span> <span>{group.startDate}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Tugash:</span> <span>{group.endDate || '-'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Xona:</span> <span>{typeof group.room === 'object' ? group.room?.name : group.room}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">O'quvchilar:</span> <span>{groupStudents.length} kishi</span></p>
          <div className="pt-2">
            <p className="text-zinc-400 mb-1.5">Dars kunlari:</p>
            <div className="flex gap-2 flex-wrap">
              {(group.days || []).map((d: string) => (
                <span key={d} className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] rounded uppercase tracking-widest">{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Student List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 relative">
        {/* Legend */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-400">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500" /> Qarzdorlar</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Sinov</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-800 dark:bg-white" /> Faol</span>
        </div>

        {enrollmentsLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groupStudents.length === 0 ? (
          <div className="text-center py-8">
            <User size={32} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-xs font-bold text-zinc-400">Guruhda o'quvchi yo'q</p>
          </div>
        ) : (
          groupStudents.map((s: any, idx) => {
            let colorClass = 'bg-slate-800 dark:bg-white';
            if (s.paymentStatus === 'Qarzdor' || s.paymentStatus === 'Qarzdorlik') colorClass = 'bg-rose-500';
            else if (s.status === 'left') colorClass = 'bg-amber-400';
            return (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-zinc-400 w-4 text-right">{idx + 1}</span>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-500">{s.phone?.replace('+998', '').trim()}</span>
                  <button
                    onClick={() => onRemoveStudent(s.id)}
                    title="Guruhdan chiqarish"
                    className="p-1 text-zinc-300 dark:text-zinc-700 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Add Student / Export */}
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        {showAddStudent ? (
          <div className="p-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={addStudentSearch}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Qidirish..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 dark:text-white"
                autoFocus
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {availableStudents.slice(0, 20).map(s => (
                <button
                  key={s.id}
                  onClick={() => onAddStudent(s.id)}
                  disabled={addingStudentId === s.id}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  <span>{s.name}</span>
                  <span className="text-zinc-400">{s.phone?.replace('+998', '')}</span>
                </button>
              ))}
              {availableStudents.length === 0 && (
                <p className="text-center text-xs text-zinc-400 py-4">O'quvchi topilmadi</p>
              )}
            </div>
            <button
              onClick={() => { onShowAddToggle(false); onSearchChange(''); }}
              className="w-full text-[10px] font-black text-zinc-400 hover:text-red-500 transition-colors"
            >
              Yopish
            </button>
          </div>
        ) : (
          <div className="p-4 flex justify-between items-center">
            <button
              onClick={onExport}
              className="flex items-center gap-2 text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors uppercase tracking-widest"
            >
              <Download size={12} /> Excel
            </button>
            <button
              onClick={() => onShowAddToggle(true)}
              className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors uppercase tracking-widest"
            >
              <UserPlus size={12} /> O'quvchi qo'shish
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupSidebar;
