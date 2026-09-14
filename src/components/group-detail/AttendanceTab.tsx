/**
 * AttendanceTab.tsx
 *
 * `AttendanceRecord` (haqiqiy jadval — Telegram Staff Mini App bilan BIR XIL
 * manba, `Attendance` JSON-blob'i emas) ustida ishlaydi.
 *
 * Standart ko'rinish — oylik jadval (faqat guruhning haqiqiy dars kunlari
 * ustun sifatida, GroupSchedule'dan). Har bir katak bosilganda Keldi/
 * Kelmadi/Kechikdi/Sababli ikonkalari bilan popover ochiladi — to'g'ridan-
 * to'g'ri shu yerdan belgilash mumkin, kunlik ko'rinishga o'tish shart emas.
 * Kunlik ko'rinish — "Hammasini Keldi" kabi tezkor ommaviy amal uchun
 * ikkinchi darajali rejim sifatida saqlanadi.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isToday } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Check, X, Clock, FileText, ChevronLeft, ChevronRight, CalendarDays, List, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import MonthSelector from './MonthSelector';

const DAY_JS_MAP: Record<string, number> = {
  Dush: 1, Sesh: 2, Chor: 3, Pay: 4, Jum: 5, Shan: 6, Yak: 0,
};

type Status = 'present' | 'absent' | 'late' | 'excused';

const STATUS_META: Record<Status, { label: string; icon: typeof Check; activeClass: string; idleClass: string }> = {
  present: { label: 'Keldi', icon: Check, activeClass: 'bg-emerald-500 text-white border-emerald-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-emerald-300' },
  absent: { label: 'Kelmadi', icon: X, activeClass: 'bg-rose-500 text-white border-rose-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-rose-300' },
  late: { label: 'Kechikdi', icon: Clock, activeClass: 'bg-amber-500 text-white border-amber-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-amber-300' },
  excused: { label: 'Sababli', icon: FileText, activeClass: 'bg-blue-500 text-white border-blue-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-blue-300' },
};
const STATUS_ORDER: Status[] = ['present', 'absent', 'late', 'excused'];

interface Record_ { studentId: string; status: Status; note?: string | null }

interface Props {
  group: any;
  groupStudents: any[];
}

const AttendanceTab: React.FC<Props> = ({ group, groupStudents }) => {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const [records, setRecords] = useState<Record_[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'day' | 'month'>('month');
  const [monthRecords, setMonthRecords] = useState<Record_[] & { date?: string }[] | any[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [cellPicker, setCellPicker] = useState<{ studentId: string; date: string; x: number; y: number } | null>(null);

  const hasSchedule = !!group?.days?.length;

  const isLessonDay = useMemo(() => {
    if (!hasSchedule) return false;
    return group.days.map((d: string) => DAY_JS_MAP[d]).includes(selectedDate.getDay());
  }, [group, hasSchedule, selectedDate]);

  const loadDay = useCallback(async () => {
    if (!group?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get('/attendance-records', { params: { groupId: group.id, date: dateStr } });
      setRecords(res.data || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [group?.id, dateStr]);

  useEffect(() => { void loadDay(); }, [loadDay]);

  const loadMonth = useCallback(async () => {
    if (!group?.id) return;
    setMonthLoading(true);
    try {
      const res = await api.get('/attendance-records/month', { params: { groupId: group.id, month: format(selectedDate, 'yyyy-MM') } });
      setMonthRecords(res.data || []);
    } catch {
      setMonthRecords([]);
    } finally {
      setMonthLoading(false);
    }
  }, [group?.id, selectedDate]);

  useEffect(() => { if (view === 'month') void loadMonth(); }, [view, loadMonth]);

  const getStatus = (studentId: string): Status | undefined =>
    records.find(r => r.studentId === studentId)?.status;

  const saveOne = async (studentId: string, status: Status) => {
    if (!group?.id) return;
    setSavingIds(prev => new Set(prev).add(studentId));
    // Optimistic UI — darhol ko'rsatiladi, so'rov fonda ketadi
    setRecords(prev => {
      const rest = prev.filter(r => r.studentId !== studentId);
      return [...rest, { studentId, status }];
    });
    try {
      await api.post('/attendance-records', { groupId: group.id, date: dateStr, records: [{ studentId, status }] });
    } catch {
      showToast("Saqlanmadi — qayta urinib ko'ring", 'error');
      void loadDay();
    } finally {
      setSavingIds(prev => { const next = new Set(prev); next.delete(studentId); return next; });
    }
  };

  const saveMonthCell = async (studentId: string, date: string, status: Status) => {
    if (!group?.id) return;
    setMonthRecords((prev: any[]) => {
      const rest = prev.filter(r => !(r.studentId === studentId && r.date === date));
      return [...rest, { studentId, date, status }];
    });
    // Bugungi kun uchun bo'lsa, kunlik ro'yxat ham darhol yangilansin
    if (date === dateStr) {
      setRecords(prev => [...prev.filter(r => r.studentId !== studentId), { studentId, status }]);
    }
    try {
      await api.post('/attendance-records', { groupId: group.id, date, records: [{ studentId, status }] });
    } catch {
      showToast("Saqlanmadi — qayta urinib ko'ring", 'error');
      void loadMonth();
    }
  };

  const markAllPresent = async () => {
    if (!group?.id) return;
    const unmarked = groupStudents.filter(s => !getStatus(s.id));
    if (unmarked.length === 0) {
      showToast('Barcha o\'quvchilar allaqachon belgilangan', 'info');
      return;
    }
    setSavingIds(prev => {
      const next = new Set(prev);
      unmarked.forEach(s => next.add(s.id));
      return next;
    });
    setRecords(prev => [...prev, ...unmarked.map(s => ({ studentId: s.id, status: 'present' as Status }))]);
    try {
      await api.post('/attendance-records', {
        groupId: group.id, date: dateStr,
        records: unmarked.map(s => ({ studentId: s.id, status: 'present' })),
      });
      showToast(`${unmarked.length} ta o'quvchi "Keldi" deb belgilandi`, 'success');
    } catch {
      showToast("Saqlanmadi — qayta urinib ko'ring", 'error');
      void loadDay();
    } finally {
      setSavingIds(new Set());
    }
  };

  const markedCount = groupStudents.filter(s => getStatus(s.id)).length;

  const monthDays = useMemo(() => {
    if (!hasSchedule) return [];
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return eachDayOfInterval({ start, end }).filter(day =>
      group.days.map((d: string) => DAY_JS_MAP[d]).includes(day.getDay())
    );
  }, [selectedDate, group, hasSchedule]);

  if (view === 'month') {
    return (
      <div className="flex flex-col h-full min-h-0 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <MonthSelector currentDate={selectedDate} onChange={setSelectedDate} accentClass="bg-emerald-500" />
          <button onClick={() => setView('day')} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
            <List size={14} /> Bugungi kun uchun tezkor belgilash
          </button>
        </div>

        {!hasSchedule ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <CalendarDays size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Bu guruh uchun dars jadvali belgilanmagan</p>
            <p className="text-xs text-zinc-400 mt-1">Davomatni kunlar bo'yicha ko'rsatish uchun avval Bosh sahifadagi "Dars Jadvali" vidjeti orqali guruhning dars kunlarini sozlang.</p>
          </div>
        ) : monthLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-20">
                <tr>
                  <th scope="col" className="px-3 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-100 dark:border-zinc-800">Talabalar</th>
                  {monthDays.map(day => (
                    <th key={day.toISOString()} scope="col" className="px-1.5 py-3 text-center border-l border-zinc-100 dark:border-zinc-800">
                      <div className="text-[11px] font-black">{format(day, 'dd')}</div>
                      <div className="text-[9px] text-zinc-400 uppercase">{format(day, 'EEEEEE', { locale: uz })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                {groupStudents.map((student, idx) => (
                  <tr key={student.id}>
                    <th scope="row" className="px-3 py-2.5 sticky left-0 bg-white dark:bg-zinc-900 max-w-[160px] whitespace-normal break-words text-left font-medium border-r border-zinc-100 dark:border-zinc-800">
                      {idx + 1}. {student.name}
                    </th>
                    {monthDays.map(day => {
                      const ds = format(day, 'yyyy-MM-dd');
                      const rec = monthRecords.find((r: any) => r.studentId === student.id && r.date === ds);
                      const meta = rec ? STATUS_META[rec.status as Status] : null;
                      return (
                        <td key={ds} className="px-1.5 py-2.5 text-center border-l border-zinc-100 dark:border-zinc-800">
                          <button
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setCellPicker(p =>
                                p && p.studentId === student.id && p.date === ds
                                  ? null
                                  : { studentId: student.id, date: ds, x: r.left, y: r.bottom + 4 }
                              );
                            }}
                            className={`w-6 h-6 rounded-md flex items-center justify-center mx-auto text-[10px] font-bold transition-transform hover:scale-110 ${meta ? meta.activeClass : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600'}`}
                            title={meta ? `${meta.label} — bosib o'zgartirish` : "Belgilanmagan — bosib belgilash"}
                          >
                            {meta ? <meta.icon size={12} /> : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cellPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setCellPicker(null)} />
            <div
              className="fixed z-50 flex items-center gap-1 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl"
              style={{ left: cellPicker.x, top: cellPicker.y }}
            >
              {STATUS_ORDER.map(status => {
                const meta = STATUS_META[status];
                return (
                  <button
                    key={status}
                    onClick={() => { void saveMonthCell(cellPicker.studentId, cellPicker.date, status); setCellPicker(null); }}
                    title={meta.label}
                    aria-label={meta.label}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all hover:scale-105 ${meta.activeClass}`}
                  >
                    <meta.icon size={14} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Sana tanlash */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(d => addDays(d, -1))}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            aria-label="Oldingi kun"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[140px]">
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {format(selectedDate, 'd MMMM, EEEE', { locale: uz })}
              {isToday(selectedDate) && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">BUGUN</span>}
            </p>
            {!hasSchedule && <p className="text-[11px] text-amber-600 font-medium">Guruh uchun dars jadvali belgilanmagan</p>}
            {hasSchedule && !isLessonDay && <p className="text-[11px] text-amber-600 font-medium">Bu kun dars jadvalida yo'q</p>}
          </div>
          <button
            onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            aria-label="Keyingi kun"
          >
            <ChevronRight size={16} />
          </button>
          {!isToday(selectedDate) && (
            <button onClick={() => setSelectedDate(new Date())} className="text-xs font-bold text-blue-600 hover:underline">
              Bugunga qaytish
            </button>
          )}
        </div>
        <button onClick={() => setView('month')} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
          <CalendarDays size={14} /> Oylik xulosa
        </button>
      </div>

      {loadError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-sm flex items-center justify-between">
          Davomatni yuklab bo'lmadi.
          <button onClick={() => void loadDay()} className="font-bold underline">Qayta urinish</button>
        </div>
      )}

      {/* Ommaviy amal */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-zinc-500">
          {markedCount} / {groupStudents.length} ta belgilangan
        </span>
        <button
          onClick={() => void markAllPresent()}
          disabled={loading || markedCount === groupStudents.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} /> Qolganlarni "Keldi" deb belgilash
        </button>
      </div>

      {/* O'quvchilar ro'yxati */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
        ) : groupStudents.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-8">Guruhda o'quvchi yo'q.</p>
        ) : (
          groupStudents.map((student, idx) => {
            const current = getStatus(student.id);
            const isSaving = savingIds.has(student.id);
            return (
              <div key={student.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-bold text-zinc-400 w-5 shrink-0">{idx + 1}.</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{student.name}</span>
                  {isSaving && <Loader2 size={13} className="animate-spin text-zinc-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {STATUS_ORDER.map(status => {
                    const meta = STATUS_META[status];
                    const active = current === status;
                    return (
                      <button
                        key={status}
                        onClick={() => void saveOne(student.id, status)}
                        disabled={isSaving}
                        aria-pressed={active}
                        aria-label={`${student.name} — ${meta.label}`}
                        title={meta.label}
                        className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all disabled:opacity-50 ${active ? meta.activeClass : meta.idleClass}`}
                      >
                        <meta.icon size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AttendanceTab;
