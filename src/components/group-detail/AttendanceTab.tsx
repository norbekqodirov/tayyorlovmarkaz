/**
 * AttendanceTab.tsx
 *
 * `AttendanceRecord` (haqiqiy jadval — Telegram Staff Mini App bilan BIR XIL
 * manba, `Attendance` JSON-blob'i emas) ustida ishlaydi.
 *
 * Standart ko'rinish — oylik jadval. IP-10: oy uchun dars rejasi bo'lsa ustunlar
 * rejadan (bekor qilingan/ko'chirilgan darslar belgisi bilan), aks holda
 * GroupSchedule jadval kunlaridan. A'zolikdan oldingi, pauzadagi va kelajak
 * kataklari bloklanadi — server ham xuddi shu qoidalarni tekshiradi
 * (server/services/attendance.ts). Kunlik ko'rinish — "Hammasini Keldi" kabi
 * tezkor ommaviy amal uchun ikkinchi darajali rejim.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Check, X, Clock, FileText, ChevronLeft, ChevronRight, CalendarDays, List, Loader2, CalendarPlus } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import MonthSelector from './MonthSelector';
import ExtraLessons from './ExtraLessons';
import { tashkentToday } from '../../utils/tashkentDate';

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
interface Session { id: string; date: string; kind: string | null; status: string | null; label: string | null; cancelReason: string | null }
interface Column { date: string; session: Session | null }

interface Props {
  group: any;
  groupStudents: any[];
}

const CANCEL_LABEL: Record<string, string> = { center: 'Markaz bekor qildi', teacher: 'Ustoz bekor qildi', holiday: 'Bayram', other: 'Bekor qilindi' };

/** O'quvchi shu sanada davomat belgilash mumkinmi (a'zolik davri va pauza bo'yicha). */
function blockedReason(student: any, date: string): string | null {
  const p = student?._period;
  if (!p) return null;
  if (date < p.startDate) return `${p.startDate} dan guruhda`;
  const pause = (p.pauses || []).find((x: any) => date >= x.fromDate && date <= x.toDate);
  return pause ? `Pauza: ${pause.fromDate}–${pause.toDate}` : null;
}

const AttendanceTab: React.FC<Props> = ({ group, groupStudents }) => {
  const { showToast } = useToast();
  const today = tashkentToday();
  const user = useMemo(() => { try { return JSON.parse(localStorage.getItem('crm_user') || '{}'); } catch { return {}; } }, []);
  const canManage = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const monthStr = format(selectedDate, 'yyyy-MM');

  const [records, setRecords] = useState<Record_[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'day' | 'month'>('month');
  const [monthRecords, setMonthRecords] = useState<Record_[] & { date?: string }[] | any[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [cellPicker, setCellPicker] = useState<{ studentId: string; date: string; x: number; y: number } | null>(null);
  const [plan, setPlan] = useState<Session[] | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ col: Column; x: number; y: number } | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [reasonAsk, setReasonAsk] = useState<{ body: any; after: () => void } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);

  const hasSchedule = !!group?.days?.length;

  const loadPlan = useCallback(async () => {
    if (!group?.id) return;
    try {
      const res = await api.get('/lesson-plan', { params: { groupId: group.id, month: monthStr } });
      const regular = (res.data?.sessions || []).filter((s: Session) => s.kind === 'regular');
      setPlan(regular.length ? regular : null);
    } catch {
      setPlan(null);
    }
  }, [group?.id, monthStr]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  const daySession = useMemo(() => plan?.find(s => s.date === dateStr && s.status !== 'moved') ?? plan?.find(s => s.date === dateStr) ?? null, [plan, dateStr]);
  const dayClosed = !!daySession && (daySession.status === 'cancelled' || daySession.status === 'moved');

  const isLessonDay = useMemo(() => {
    if (plan) return !!daySession && !dayClosed;
    if (!hasSchedule) return false;
    return group.days.map((d: string) => DAY_JS_MAP[d]).includes(selectedDate.getDay());
  }, [group, hasSchedule, selectedDate, plan, daySession, dayClosed]);

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
      const res = await api.get('/attendance-records/month', { params: { groupId: group.id, month: monthStr } });
      setMonthRecords(res.data || []);
    } catch {
      setMonthRecords([]);
    } finally {
      setMonthLoading(false);
    }
  }, [group?.id, monthStr]);

  useEffect(() => { if (view === 'month') void loadMonth(); }, [view, loadMonth]);

  /**
   * Davomatni yuborish. Server 3 kundan eski tuzatish uchun sabab so'rasa
   * (REASON_REQUIRED) — sabab oynasi ochiladi va so'rov sabab bilan qaytariladi.
   */
  const postAttendance = async (body: any, onFail: () => void): Promise<boolean> => {
    try {
      const res = await api.post('/attendance-records', body);
      for (const w of res.data?.warnings || []) showToast(w, 'info');
      return true;
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.code === 'REASON_REQUIRED') {
        setReasonText('');
        setReasonAsk({ body, after: onFail });
        return false;
      }
      showToast(data?.message || "Saqlanmadi — qayta urinib ko'ring", 'error');
      onFail();
      return false;
    }
  };

  const submitReason = async () => {
    if (!reasonAsk || reasonText.trim().length < 3) return;
    setBusy(true);
    try {
      await api.post('/attendance-records', { ...reasonAsk.body, reason: reasonText.trim() });
      showToast('Davomat sabab bilan tuzatildi', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Saqlanmadi', 'error');
    } finally {
      setBusy(false);
      reasonAsk.after();
      setReasonAsk(null);
    }
  };

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
    await postAttendance({ groupId: group.id, date: dateStr, records: [{ studentId, status }] }, () => void loadDay());
    setSavingIds(prev => { const next = new Set(prev); next.delete(studentId); return next; });
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
    await postAttendance({ groupId: group.id, date, records: [{ studentId, status }] }, () => void loadMonth());
  };

  const markAllPresent = async () => {
    if (!group?.id) return;
    const unmarked = groupStudents.filter(s => !getStatus(s.id) && !blockedReason(s, dateStr));
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
    const ok = await postAttendance({
      groupId: group.id, date: dateStr,
      records: unmarked.map(s => ({ studentId: s.id, status: 'present' })),
    }, () => void loadDay());
    if (ok) showToast(`${unmarked.length} ta o'quvchi "Keldi" deb belgilandi`, 'success');
    setSavingIds(new Set());
  };

  // ─── Dars rejasi amallari (menejer) ────────────────────────────────────────
  const generatePlan = async () => {
    setBusy(true);
    try {
      const res = await api.post('/lesson-plan/generate', { groupId: group.id, month: monthStr });
      showToast(`Oy rejasi: ${res.data.planned} dars${res.data.holidaysSkipped?.length ? `, ${res.data.holidaysSkipped.length} bayram chiqarildi` : ''}`, 'success');
      await loadPlan();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Rejani yaratib bo'lmadi", 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelLesson = async (session: Session, reason: 'center' | 'teacher', compensate: boolean) => {
    setBusy(true);
    try {
      await api.post(`/lesson-plan/sessions/${session.id}/cancel`, { reason, compensate });
      showToast(`${session.date} darsi bekor qilindi${compensate ? " (o'quvchilarga kompensatsiya)" : ''}`, 'success');
      setHeaderMenu(null);
      await loadPlan();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Bekor qilib bo'lmadi", 'error');
    } finally {
      setBusy(false);
    }
  };

  const moveLesson = async (session: Session) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveDate)) { showToast('Yangi sanani tanlang', 'error'); return; }
    setBusy(true);
    try {
      await api.post(`/lesson-plan/sessions/${session.id}/move`, { toDate: moveDate });
      showToast(`Dars ${session.date} → ${moveDate} ga ko'chirildi`, 'success');
      setHeaderMenu(null);
      await loadPlan();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Ko'chirib bo'lmadi", 'error');
    } finally {
      setBusy(false);
    }
  };

  const markedCount = groupStudents.filter(s => getStatus(s.id)).length;

  const columns: Column[] = useMemo(() => {
    if (plan) return [...plan].sort((a, b) => a.date.localeCompare(b.date)).map(s => ({ date: s.date, session: s }));
    if (!hasSchedule) return [];
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return eachDayOfInterval({ start, end })
      .filter(day => group.days.map((d: string) => DAY_JS_MAP[d]).includes(day.getDay()))
      .map(day => ({ date: format(day, 'yyyy-MM-dd'), session: null }));
  }, [selectedDate, group, hasSchedule, plan]);

  const reasonModal = (
    <Modal isOpen={!!reasonAsk} onClose={() => { reasonAsk?.after(); setReasonAsk(null); }} title="Eski davomatni tuzatish" description="3 kundan eski davomat faqat sabab bilan o'zgartiriladi — sabab jurnalga yoziladi" width="md">
      <div className="space-y-4">
        <textarea
          aria-label="Tuzatish sababi"
          value={reasonText}
          onChange={e => setReasonText(e.target.value)}
          placeholder="Masalan: qog'oz jurnaldan ko'chirildi"
          className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 min-h-[72px]"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => { reasonAsk?.after(); setReasonAsk(null); }}>Bekor qilish</Button>
          <Button type="button" isLoading={busy} disabled={reasonText.trim().length < 3} onClick={() => void submitReason()}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );

  if (view === 'month') {
    return (
      <div className="flex flex-col h-full min-h-0 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <MonthSelector currentDate={selectedDate} onChange={setSelectedDate} accentClass="bg-emerald-500" />
          <div className="flex items-center gap-3">
            {canManage && !plan && hasSchedule && (
              <button onClick={() => void generatePlan()} disabled={busy} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline disabled:opacity-50">
                <CalendarPlus size={14} /> Oy rejasini yaratish
              </button>
            )}
            <button onClick={() => setView('day')} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
              <List size={14} /> Bugungi kun uchun tezkor belgilash
            </button>
          </div>
        </div>
        {plan && canManage && <p className="text-[11px] text-zinc-500 -mt-2">Dars rejasi bo'yicha. Kun sarlavhasini bosib darsni bekor qilish yoki ko'chirish mumkin.</p>}

        {!hasSchedule && !plan ? (
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
                  {columns.map(col => {
                    const st = col.session?.status;
                    const closed = st === 'cancelled' || st === 'moved';
                    const day = parseISO(col.date);
                    const title = st === 'cancelled' ? (CANCEL_LABEL[col.session?.cancelReason || 'other'] || 'Bekor qilindi')
                      : st === 'moved' ? "Boshqa kunga ko'chirilgan" : col.session?.label || undefined;
                    return (
                      <th key={col.date + (col.session?.id || '')} scope="col" className={`px-1.5 py-2 text-center border-l border-zinc-100 dark:border-zinc-800 ${closed ? 'opacity-50' : ''}`}>
                        <button
                          type="button"
                          disabled={!canManage || !col.session || st !== 'planned'}
                          title={title}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setMoveDate('');
                            setHeaderMenu(m => m && m.col.date === col.date ? null : { col, x: r.left, y: r.bottom + 4 });
                          }}
                          className="w-full disabled:cursor-default"
                        >
                          <div className={`text-[11px] font-black ${closed ? 'line-through' : ''}`}>{format(day, 'dd')}</div>
                          <div className="text-[9px] text-zinc-400 uppercase">{st === 'cancelled' ? 'bekor' : st === 'moved' ? "ko'ch." : format(day, 'EEEEEE', { locale: uz })}</div>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                {groupStudents.map((student, idx) => (
                  <tr key={student.id}>
                    <th scope="row" className="px-3 py-2.5 sticky left-0 bg-white dark:bg-zinc-900 max-w-[160px] whitespace-normal break-words text-left font-medium border-r border-zinc-100 dark:border-zinc-800">
                      {idx + 1}. {student.name}
                    </th>
                    {columns.map(col => {
                      const ds = col.date;
                      const rec = monthRecords.find((r: any) => r.studentId === student.id && r.date === ds);
                      const meta = rec ? STATUS_META[rec.status as Status] : null;
                      const st = col.session?.status;
                      const blocked = st === 'cancelled' || st === 'moved' ? 'Dars bo\'lmagan'
                        : ds > today ? 'Kelajak sanasi' : blockedReason(student, ds);
                      return (
                        <td key={ds + (col.session?.id || '')} className="px-1.5 py-2.5 text-center border-l border-zinc-100 dark:border-zinc-800">
                          {blocked && !meta ? (
                            <span className="w-6 h-6 mx-auto flex items-center justify-center text-[10px] text-zinc-300 dark:text-zinc-700" title={blocked}>–</span>
                          ) : (
                            <button
                              onClick={(e) => {
                                if (blocked) { showToast(blocked, 'info'); return; }
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
                          )}
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

        {headerMenu && headerMenu.col.session && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(null)} />
            <div className="fixed z-50 w-64 p-3 space-y-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl text-xs"
              style={{ left: Math.min(headerMenu.x, window.innerWidth - 272), top: headerMenu.y }}>
              <p className="font-black text-slate-900 dark:text-white">{headerMenu.col.date} darsi</p>
              <button disabled={busy} onClick={() => void cancelLesson(headerMenu.col.session!, 'center', true)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 font-bold">
                Bekor qilish — markaz sababli (o'quvchilarga kompensatsiya)
              </button>
              <button disabled={busy} onClick={() => void cancelLesson(headerMenu.col.session!, 'teacher', true)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 font-bold">
                Bekor qilish — ustoz sababli (kompensatsiya)
              </button>
              <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                <label htmlFor="move-date" className="block font-bold text-zinc-500">Boshqa kunga ko'chirish</label>
                <div className="flex gap-1.5">
                  <input id="move-date" type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1" />
                  <button disabled={busy || !moveDate} onClick={() => void moveLesson(headerMenu.col.session!)} className="px-2 py-1 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-40">OK</button>
                </div>
              </div>
            </div>
          </>
        )}
        {reasonModal}
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
            {!hasSchedule && !plan && <p className="text-[11px] text-amber-600 font-medium">Guruh uchun dars jadvali belgilanmagan</p>}
            {dayClosed && <p className="text-[11px] text-rose-600 font-medium">{daySession?.status === 'moved' ? "Bu kungi dars boshqa kunga ko'chirilgan" : `Dars bekor qilingan — ${CANCEL_LABEL[daySession?.cancelReason || 'other'] || ''}`}</p>}
            {!dayClosed && (hasSchedule || plan) && !isLessonDay && <p className="text-[11px] text-amber-600 font-medium">Bu kun dars {plan ? 'rejasida' : 'jadvalida'} yo'q</p>}
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
          disabled={loading || dayClosed || dateStr > today || markedCount === groupStudents.length}
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
            const blocked = dayClosed ? "Dars bo'lmagan" : dateStr > today ? 'Kelajak sanasi' : blockedReason(student, dateStr);
            return (
              <div key={student.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-bold text-zinc-400 w-5 shrink-0">{idx + 1}.</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{student.name}</span>
                    {blocked && <span className="block text-[10px] text-zinc-400">{blocked}</span>}
                  </span>
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
                        disabled={isSaving || !!blocked}
                        aria-pressed={active}
                        aria-label={`${student.name} — ${meta.label}`}
                        title={blocked || meta.label}
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

      {group?.id && <ExtraLessons groupId={group.id} date={dateStr} groupStudents={groupStudents} />}
      {reasonModal}
    </div>
  );
};

export default AttendanceTab;
