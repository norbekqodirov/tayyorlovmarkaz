/**
 * GroupSidebar.tsx
 * Left panel: group info, enrolled student list, add/remove student UI.
 * Group information is visible to every authorized role.
 */
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, User, Search, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

interface Props {
  canManage: boolean;
  removingStudentId: string | null;
  group: any;
  groupStudents: any[];
  enrollmentsLoading: boolean;
  enrollmentsError: boolean;
  onRetryEnrollments: () => void;
  studentsLoading: boolean;
  studentsError: boolean;
  onRetryStudents: () => void;
  schedulesLoading: boolean;
  schedulesError: boolean;
  onRetrySchedules: () => void;
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
  canManage,
  removingStudentId,
  group,
  groupStudents,
  enrollmentsLoading,
  enrollmentsError, onRetryEnrollments,
  studentsLoading, studentsError, onRetryStudents,
  schedulesLoading, schedulesError, onRetrySchedules,
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
  const [expanded, setExpanded] = useState(false);
  const rosterUnavailable = enrollmentsLoading || enrollmentsError;
  const mutationBusy = !!addingStudentId || !!removingStudentId;
  const full = !rosterUnavailable && groupStudents.length >= group.maxSize;

  return (
    <div className="w-full xl:w-[380px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden shrink-0">
      <Button variant="secondary" className="xl:hidden m-3 h-auto whitespace-normal break-words" aria-expanded={expanded} aria-controls="group-sidebar-content" onClick={() => setExpanded(!expanded)}>
        {group.name} — {expanded ? "Ma’lumotlarni yig‘ish" : "Guruh ma’lumotlari"}
      </Button>
      <div id="group-sidebar-content" className={`${expanded ? 'flex' : 'hidden'} xl:flex flex-col min-h-0 xl:overflow-y-auto`}>
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
        <button
          onClick={() => navigate('/crmtayyorlovmarkaz/groups')}
          className="flex items-center gap-2 text-xs font-black text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4 uppercase tracking-widest"
        >
          <ArrowLeft size={14} /> Ortga qaytish
        </button>

        <div className="flex justify-between items-start mb-4">
          <h1 className="min-w-0 break-words text-2xl font-black text-slate-800 dark:text-white tracking-tight">{group.name}</h1>
        </div>

        <div className="space-y-2 text-sm font-bold text-slate-700 dark:text-zinc-300 [&>p]:gap-3 [&>p]:items-start [&>p>span:last-child]:min-w-0 [&>p>span:last-child]:break-words [&>p>span:last-child]:text-right [&>p>span:first-child]:shrink-0">
          <p className="flex justify-between items-center"><span className="text-zinc-400">O'qituvchi:</span> <span className="text-blue-500">{group.teacher?.name || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Narx:</span> <span>{formatNumber(group.price ?? group.course?.price ?? 0)} so'm</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Vaqt:</span> <span>{group.time || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Kurs:</span> <span>{group.course?.name || '—'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Boshlanish:</span> <span>{group.startDate}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Tugash:</span> <span>{group.endDate || '-'}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">Xona:</span> <span>{typeof group.room === 'object' ? group.room?.name : group.room}</span></p>
          <p className="flex justify-between items-center"><span className="text-zinc-400">O'quvchilar:</span> <span>{rosterUnavailable ? '—' : `${groupStudents.length} / ${group.maxSize}`}</span></p>
          {schedulesLoading ? <p role="status">Jadval yuklanmoqda...</p> : schedulesError ? <div role="alert"><p>Jadval yuklanmadi.</p><Button size="sm" onClick={onRetrySchedules}>Qayta urinish</Button></div> : null}
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
        ) : enrollmentsError ? (
          <div role="alert" className="space-y-3 py-4 text-center text-sm text-rose-600">
            <p>Guruh o'quvchilari ro'yxati yuklanmadi.</p>
            <Button size="sm" onClick={onRetryEnrollments}>Qayta urinish</Button>
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
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs font-black text-zinc-400 w-4 text-right">{idx + 1}</span>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                  <span className="min-w-0 break-words text-xs font-bold text-slate-800 dark:text-zinc-200">{s.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[10px] font-bold text-zinc-500">{s.phone?.replace('+998', '').trim()}</span>
                  {canManage && <Button
                    variant="ghost"
                    size="sm"
                    disabled={mutationBusy}
                    onClick={() => onRemoveStudent(s.id)}
                    title="Guruhdan chiqarish"
                    aria-label={`${s.name} — guruhdan chiqarish`}
                    className="min-h-11 min-w-11 text-rose-600 dark:text-rose-400"
                  >
                    {removingStudentId === s.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </Button>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Add Student / Export */}
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        {canManage && showAddStudent ? (
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
              {studentsLoading ? <p role="status" className="flex gap-2 p-3 text-xs"><Loader2 size={16} className="animate-spin" />O'quvchilar yuklanmoqda...</p> : studentsError ? <div role="alert" className="space-y-2 text-sm text-rose-600"><p>O'quvchilar ro'yxati yuklanmadi.</p><Button size="sm" onClick={onRetryStudents}>Qayta urinish</Button></div> : rosterUnavailable ? <p className="text-xs p-3">Avval guruh ro'yxatini yuklang.</p> : full ? <p role="status" className="text-xs p-3 text-amber-600">Guruhda bo'sh o'rin qolmagan.</p> : availableStudents.map(s => (
                <button
                  key={s.id}
                  onClick={() => onAddStudent(s.id)}
                  disabled={mutationBusy}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  <span className="min-w-0 break-words text-left">{s.name}</span>
                  {addingStudentId === s.id ? <Loader2 size={16} aria-label="Qo‘shilmoqda" className="shrink-0 animate-spin" /> : <span className="shrink-0 text-zinc-400">{s.phone?.replace('+998', '')}</span>}
                </button>
              ))}
              {!studentsLoading && !studentsError && !rosterUnavailable && !full && availableStudents.length === 0 && (
                <p className="text-center text-xs text-zinc-400 py-4">Mos o'quvchi topilmadi yoki allaqachon guruhga qo'shilgan.</p>
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
          <div className="p-4 flex flex-wrap gap-2 justify-between items-center">
            <button
              onClick={onExport}
              disabled={rosterUnavailable}
              className="flex items-center gap-2 text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors uppercase tracking-widest"
            >
              <Download size={12} /> Excel
            </button>
            {canManage && <button
              onClick={() => onShowAddToggle(true)}
              disabled={rosterUnavailable || mutationBusy}
              className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors uppercase tracking-widest"
            >
              <UserPlus size={12} /> O'quvchi qo'shish
            </button>}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default GroupSidebar;
