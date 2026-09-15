/**
 * ExtraLessons.tsx
 *
 * EDU-06: guruh bir kunda bir necha marta o'tilishi mumkin (qo'shimcha/qoplash
 * darsi). Asosiy AttendanceTab.tsx kunlik/oylik ko'rinishi standart, YAGONA
 * kundalik darsni boshqaradi (o'zgarishsiz) — bu komponent shu kun uchun
 * QO'SHIMCHA darslarni (alohida `LessonSession`/`LessonAttendance`) ko'rsatadi,
 * faqat kerak bo'lgandagina ("+ Dars qo'shish") ishlatiladi.
 */
import { useState, useEffect, useCallback } from 'react';
import { Check, X, Clock, FileText, Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';

type Status = 'present' | 'absent' | 'late' | 'excused';

const STATUS_META: Record<Status, { label: string; icon: typeof Check; activeClass: string; idleClass: string }> = {
  present: { label: 'Keldi', icon: Check, activeClass: 'bg-emerald-500 text-white border-emerald-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-emerald-300' },
  absent: { label: 'Kelmadi', icon: X, activeClass: 'bg-rose-500 text-white border-rose-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-rose-300' },
  late: { label: 'Kechikdi', icon: Clock, activeClass: 'bg-amber-500 text-white border-amber-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-amber-300' },
  excused: { label: 'Sababli', icon: FileText, activeClass: 'bg-blue-500 text-white border-blue-500', idleClass: 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-blue-300' },
};
const STATUS_ORDER: Status[] = ['present', 'absent', 'late', 'excused'];

interface LessonSession {
  id: string;
  date: string;
  startTime: string | null;
  label: string | null;
  _count: { attendance: number };
}

interface Props {
  groupId: string;
  date: string;
  groupStudents: any[];
}

const ExtraLessons: React.FC<Props> = ({ groupId, date, groupStudents }) => {
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<LessonSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionRecords, setSessionRecords] = useState<Record<string, { studentId: string; status: Status }[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!groupId || !date) return;
    setLoading(true);
    try {
      const res = await api.get('/lesson-sessions', { params: { groupId, date } });
      setSessions(res.data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, date]);

  useEffect(() => { void loadSessions(); setExpandedId(null); }, [loadSessions]);

  const loadSessionRecords = async (sessionId: string) => {
    try {
      const res = await api.get(`/lesson-sessions/${sessionId}/attendance`);
      setSessionRecords(prev => ({ ...prev, [sessionId]: res.data || [] }));
    } catch {
      setSessionRecords(prev => ({ ...prev, [sessionId]: [] }));
    }
  };

  const toggleExpand = (sessionId: string) => {
    if (expandedId === sessionId) { setExpandedId(null); return; }
    setExpandedId(sessionId);
    if (!sessionRecords[sessionId]) void loadSessionRecords(sessionId);
  };

  const addSession = async () => {
    setCreating(true);
    try {
      const res = await api.post('/lesson-sessions', { groupId, date });
      setSessions(prev => [...prev, { ...res.data, _count: { attendance: 0 } }]);
      setExpandedId(res.data.id);
      setSessionRecords(prev => ({ ...prev, [res.data.id]: [] }));
    } catch {
      showToast("Qo'shimcha dars yaratilmadi", 'error');
    } finally {
      setCreating(false);
    }
  };

  const removeSession = async (sessionId: string) => {
    try {
      await api.delete(`/lesson-sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (expandedId === sessionId) setExpandedId(null);
      showToast("Qo'shimcha dars o'chirildi", 'success');
    } catch {
      showToast("O'chirilmadi", 'error');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const saveStatus = async (sessionId: string, studentId: string, status: Status) => {
    const key = `${sessionId}:${studentId}`;
    setSavingKey(key);
    setSessionRecords(prev => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []).filter(r => r.studentId !== studentId), { studentId, status }],
    }));
    try {
      await api.post(`/lesson-sessions/${sessionId}/attendance`, { records: [{ studentId, status }] });
      setSessions(prev => prev.map(s => s.id === sessionId
        ? { ...s, _count: { attendance: (sessionRecords[sessionId] || []).some(r => r.studentId === studentId) ? s._count.attendance : s._count.attendance + 1 } }
        : s));
    } catch {
      showToast("Saqlanmadi — qayta urinib ko'ring", 'error');
      void loadSessionRecords(sessionId);
    } finally {
      setSavingKey(null);
    }
  };

  const sessionLabel = (s: LessonSession, idx: number) => s.label || (s.startTime ? `Dars — ${s.startTime}` : `${idx + 2}-dars`);

  if (loading) return null;

  return (
    <div className="mt-2 pt-3 border-t border-dashed border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-500">Qo'shimcha darslar (shu kunga)</span>
        <button
          onClick={() => void addSession()}
          disabled={creating}
          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline disabled:opacity-50"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Dars qo'shish
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-[11px] text-zinc-400">Bu kun uchun qo'shimcha dars yo'q — faqat asosiy darsda bir marta darsdan ortiq (masalan qoplash darsi) bo'lsa qo'shing.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s, idx) => {
            const isExpanded = expandedId === s.id;
            const records = sessionRecords[s.id] || [];
            return (
              <div key={s.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/40">
                  <button onClick={() => toggleExpand(s.id)} className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {sessionLabel(s, idx)}
                    <span className="text-zinc-400 font-medium">({s._count.attendance}/{groupStudents.length})</span>
                  </button>
                  <button onClick={() => setDeleteConfirm(s.id)} aria-label="O'chirish" className="text-zinc-400 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="p-2 space-y-1.5">
                    {groupStudents.map(student => {
                      const current = records.find(r => r.studentId === student.id)?.status;
                      const key = `${s.id}:${student.id}`;
                      const isSaving = savingKey === key;
                      return (
                        <div key={student.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-900">
                          <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 truncate">{student.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {STATUS_ORDER.map(status => {
                              const meta = STATUS_META[status];
                              const active = current === status;
                              return (
                                <button
                                  key={status}
                                  onClick={() => void saveStatus(s.id, student.id, status)}
                                  disabled={isSaving}
                                  aria-pressed={active}
                                  aria-label={`${student.name} — ${meta.label}`}
                                  title={meta.label}
                                  className={`w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all disabled:opacity-50 ${active ? meta.activeClass : meta.idleClass}`}
                                >
                                  <meta.icon size={12} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Qo'shimcha darsni o'chirish"
        message="Bu darsning barcha davomat yozuvlari ham o'chadi. Davom etasizmi?"
        onConfirm={() => deleteConfirm && void removeSession(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default ExtraLessons;
