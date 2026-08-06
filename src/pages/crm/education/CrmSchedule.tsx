import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Clock, Trash2, AlertCircle, DoorOpen,
  Calendar, BookOpen, User, Check, X as XIcon
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useCrmData } from '../../../hooks/useCrmData';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Modal } from '../../../components/ui/Modal';

// ─── Types & Constants ────────────────────────────────────────────────────────
interface ScheduleItem {
  id: string;
  groupId: string;
  groupName: string;
  teacher: string;
  room: string;
  startTime: string;
  endTime: string;
  days: number[];
  color: string;
}

const DAYS = [
  { id: 1, name: 'Dushanba', short: 'Du' },
  { id: 2, name: 'Seshanba', short: 'Se' },
  { id: 3, name: 'Chorshanba', short: 'Ch' },
  { id: 4, name: 'Payshanba', short: 'Pa' },
  { id: 5, name: 'Juma', short: 'Ju' },
  { id: 6, name: 'Shanba', short: 'Sh' },
  { id: 7, name: 'Yakshanba', short: 'Ya' },
];

const COLOR_OPTIONS = [
  { bg: 'bg-blue-500',   hex: '#3b82f6' },
  { bg: 'bg-emerald-500',hex: '#10b981' },
  { bg: 'bg-violet-500', hex: '#8b5cf6' },
  { bg: 'bg-amber-500',  hex: '#f59e0b' },
  { bg: 'bg-rose-500',   hex: '#f43f5e' },
  { bg: 'bg-cyan-500',   hex: '#06b6d4' },
  { bg: 'bg-orange-500', hex: '#f97316' },
  { bg: 'bg-pink-500',   hex: '#ec4899' },
];

// Grid: 07:00 – 20:00, each hour = 1 column = CELL_W px wide
const GRID_START_H = 7;
const GRID_END_H   = 20;
const HOUR_COUNT   = GRID_END_H - GRID_START_H; // 13
const CELL_W       = 80; // px per hour column

const timeToFraction = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h + m / 60 - GRID_START_H) / HOUR_COUNT;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function CrmSchedule() {
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } =
    useFirestore<Omit<ScheduleItem, 'id'>>('schedule');
  const { data: roomsData = [], addDocument: addRoomDoc } = useFirestore<any>('rooms');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { teachers: liveTeachers, getEndTime } = useCrmData();
  const { showToast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const todayReal = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();
  const [selectedDay, setSelectedDay] = useState(todayReal);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: '' });
  const [conflictConfirm, setConflictConfirm] = useState<{ open: boolean; data: Partial<ScheduleItem> | null }>({ open: false, data: null });
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomInput, setRoomInput] = useState('');

  const defaultForm = (): Partial<ScheduleItem> => ({
    groupName: '', teacher: '', room: '', startTime: '09:00', endTime: '10:30',
    days: [selectedDay], color: 'bg-blue-500',
  });
  const [formData, setFormData] = useState<Partial<ScheduleItem>>(defaultForm());

  // ── Derived ────────────────────────────────────────────────────────────────
  const rooms = useMemo(() => {
    if ((roomsData || []).length > 0) return roomsData;
    return [{ id: 'r1', name: '101-xona' }, { id: 'r2', name: '102-xona' }];
  }, [roomsData]);
  const getRoomName = (r: any) => typeof r === 'string' ? r : r?.name || '';

  // All groups that have at least one lesson on the selected day
  const daySchedule = useMemo(() =>
    (schedule || []).filter(s => (s.days || []).includes(selectedDay)),
    [schedule, selectedDay]
  );

  // Rows = unique groups that appear in the full schedule (so the grid is consistent)
  const gridGroups = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; teacher: string }> = [];
    (schedule || []).forEach(s => {
      if (!seen.has(s.groupName)) {
        seen.add(s.groupName);
        result.push({ name: s.groupName, teacher: s.teacher });
      }
    });
    // Also add groups from the groups collection that have no schedule yet
    (groups || []).forEach((g: any) => {
      if (!seen.has(g.name)) {
        seen.add(g.name);
        result.push({ name: g.name, teacher: g.teacher?.name || '' });
      }
    });
    return result;
  }, [schedule, groups]);

  // ── Conflict helper ────────────────────────────────────────────────────────
  const checkConflicts = (item: Partial<ScheduleItem>, excludeId?: string): string[] => {
    const result: string[] = [];
    const tS = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const s = tS(item.startTime || '00:00');
    const e = tS(item.endTime   || '00:00');
    (schedule || []).forEach(ex => {
      if (ex.id === excludeId) return;
      if (!item.days?.some(d => (ex.days || []).includes(d))) return;
      const es = tS(ex.startTime || '00:00');
      const ee = tS(ex.endTime   || '00:00');
      if (s < ee && e > es) {
        const rm = getRoomName(ex.room);
        if (rm === item.room) result.push(`Xona band: ${rm} (${ex.groupName})`);
        if (ex.teacher === item.teacher) result.push(`O'qituvchi band: ${ex.teacher}`);
      }
    });
    return result;
  };
  useEffect(() => {
    if (isModalOpen) setConflicts(checkConflicts(formData, editingItem?.id));
  }, [formData, isModalOpen]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const doSave = async (data: Partial<ScheduleItem>) => {
    const roomName = getRoomName(data.room);
    const group = (groups || []).find((g: any) => g.name === data.groupName);
    try {
      if (editingItem) {
        await updateSchedule(editingItem.id, { ...data, room: roomName, groupId: group?.id || editingItem.groupId } as any);
      } else {
        await addSchedule({ groupId: group?.id || 'g' + Date.now(), groupName: data.groupName || '', teacher: data.teacher || '', room: roomName || '', startTime: data.startTime || '09:00', endTime: data.endTime || '10:30', days: data.days || [], color: data.color || 'bg-blue-500' });
      }
      closeModal();
      showToast('Dars saqlandi', 'success');
    } catch { showToast('Xatolik!', 'error'); }
  };

  const handleSave = async () => {
    if (!formData.groupName || !formData.teacher || !formData.room || !formData.days?.length) {
      showToast("Barcha maydonlarni to'ldiring!", 'error'); return;
    }
    const cc = checkConflicts(formData, editingItem?.id);
    if (cc.length > 0) { setConflictConfirm({ open: true, data: formData }); return; }
    await doSave(formData);
  };

  const openModal = (item: ScheduleItem | null = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item, room: getRoomName(item.room) });
    } else {
      setEditingItem(null);
      const fg = (groups || [])[0];
      setFormData({ ...defaultForm(), groupName: fg?.name || '', teacher: fg?.teacher?.name || liveTeachers[0]?.name || '', room: getRoomName(rooms[0]) });
    }
    setConflicts([]);
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setEditingItem(null); setConflicts([]); };
  const toggleDay = (id: number) => {
    const cur = formData.days || [];
    setFormData({ ...formData, days: cur.includes(id) ? cur.filter(d => d !== id) : [...cur, id] });
  };

  async function addRoomAndClose() {
    const name = roomInput.trim();
    if (name && !rooms.some((r: any) => getRoomName(r) === name)) {
      try { await addRoomDoc({ name, capacity: 30 }); showToast("Xona qo'shildi", 'success'); }
      catch { showToast('Xatolik!', 'error'); }
    }
    setRoomModalOpen(false);
  }

  // ── Hour labels ────────────────────────────────────────────────────────────
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => GRID_START_H + i);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* ─ Dialogs ─ */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Darsni o'chirish"
        message="Haqiqatan ham ushbu darsni o'chirmoqchimisiz?"
        confirmText="O'chirish"
        onConfirm={async () => {
          try { await deleteSchedule(deleteConfirm.id); showToast("O'chirildi", 'success'); closeModal(); }
          catch { showToast('Xatolik!', 'error'); }
          setDeleteConfirm({ open: false, id: '' });
        }}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <ConfirmDialog
        isOpen={conflictConfirm.open}
        title="Ziddiyat aniqlandi"
        message={`${conflicts.join('\n')}\n\nBaribir saqlashni xohlaysizmi?`}
        confirmText="Saqlash"
        onConfirm={async () => { setConflictConfirm({ open: false, data: null }); if (conflictConfirm.data) await doSave(conflictConfirm.data); }}
        onCancel={() => setConflictConfirm({ open: false, data: null })}
      />
      <AnimatePresence>
        {roomModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-zinc-200 dark:border-zinc-700 space-y-4">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Yangi xona qo'shish</h3>
              <input type="text" value={roomInput} onChange={e => setRoomInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRoomAndClose()}
                placeholder="Masalan: 201-xona" autoFocus
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex justify-end gap-3">
                <button onClick={() => setRoomModalOpen(false)} className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors">Bekor</button>
                <button onClick={addRoomAndClose} className="px-4 py-2 text-sm font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">Qo'shish</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─ Header ─ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Dars Jadvali</h1>
          <p className="text-xs text-zinc-400 mt-0.5 font-medium">Haftalik dars dasturini boshqaring</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setRoomInput(''); setRoomModalOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs font-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm">
            <DoorOpen size={14} /> Xona Qo'shish
          </button>
          <button onClick={() => openModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-lg shadow-blue-600/25 transition-all">
            <Plus size={16} /> Dars Qo'shish
          </button>
        </div>
      </div>

      {/* ─ Stats ─ */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Bugun', value: (schedule || []).filter(s => (s.days || []).includes(todayReal)).length, unit: 'dars', icon: <Calendar size={18} />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10' },
          { label: 'Jami darslar', value: (schedule || []).length, unit: 'ta', icon: <BookOpen size={18} />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Xonalar', value: rooms.length, unit: 'ta', icon: <DoorOpen size={18} />, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-500/10' },
        ].map(({ label, value, unit, icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center flex-shrink-0`}>{icon}</div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">{value} <span className="text-xs font-bold text-zinc-400">{unit}</span></p>
            </div>
          </div>
        ))}
      </div>

      {/* ─ Day Tabs ─ */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-1 flex gap-1 shadow-sm">
        {DAYS.map(day => {
          const isToday = todayReal === day.id;
          const isSelected = selectedDay === day.id;
          const cnt = (schedule || []).filter(s => (s.days || []).includes(day.id)).length;
          return (
            <button key={day.id} onClick={() => setSelectedDay(day.id)}
              className={`flex-1 py-2.5 px-1 rounded-xl text-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : isToday ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
              <span className="block text-xs font-black">{day.short}</span>
              {cnt > 0 && (
                <span className={`text-[9px] font-black px-1.5 rounded-full ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>{cnt}</span>
              )}
              {isToday && !isSelected && <span className="block w-1 h-1 bg-blue-500 rounded-full mx-auto mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* ─ Transposed Grid: Groups (rows) × Hours (columns) ─ */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: CELL_W * HOUR_COUNT + 200 }}>

            {/* Hour header row */}
            <div className="flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40">
              {/* Group column header */}
              <div className="w-48 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Guruhlar</span>
              </div>
              {/* Hour columns */}
              {hours.map(h => (
                <div key={h} style={{ width: CELL_W }} className="flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 px-2 py-3 text-center">
                  <span className="text-[11px] font-black text-blue-500 tabular-nums">{h.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>

            {/* Group rows */}
            {gridGroups.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <Calendar size={40} className="text-zinc-200 dark:text-zinc-700 mb-3" />
                <p className="text-sm font-black text-zinc-400">Hali darslar qo'shilmagan</p>
                <button onClick={() => openModal()}
                  className="mt-3 text-xs font-black text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1">
                  <Plus size={14} /> Dars qo'shish
                </button>
              </div>
            ) : (
              gridGroups.map((grp, rowIdx) => {
                const rowItems = daySchedule.filter(s => s.groupName === grp.name);
                const totalGridPx = CELL_W * HOUR_COUNT;

                return (
                  <div key={grp.name}
                    className={`flex border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${rowIdx % 2 === 0 ? '' : 'bg-zinc-50/30 dark:bg-zinc-800/10'}`}
                    style={{ height: 64 }}>

                    {/* Group label */}
                    <div className="w-48 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 px-4 flex flex-col justify-center">
                      <span className="text-xs font-black text-slate-800 dark:text-zinc-200 truncate">{grp.name}</span>
                      {grp.teacher && (
                        <span className="text-[10px] font-medium text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                          <User size={9} /> {grp.teacher}
                        </span>
                      )}
                    </div>

                    {/* Time columns */}
                    <div className="relative flex-1" style={{ height: 64 }}>
                      {/* Vertical hour‑line ticks */}
                      {hours.map(h => (
                        <div key={h}
                          className="absolute top-0 bottom-0 border-r border-zinc-100 dark:border-zinc-800"
                          style={{ left: (h - GRID_START_H) * CELL_W, width: CELL_W }} />
                      ))}

                      {/* Lesson blocks */}
                      {rowItems.map(item => {
                        const hexColor = COLOR_OPTIONS.find(c => c.bg === item.color)?.hex || '#3b82f6';
                        const leftFrac = Math.max(timeToFraction(item.startTime), 0);
                        const rightFrac = Math.min(timeToFraction(item.endTime), 1);
                        const leftPx  = leftFrac  * totalGridPx;
                        const widthPx = Math.max((rightFrac - leftFrac) * totalGridPx - 4, 30);

                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => openModal(item)}
                            title={`${item.groupName} | ${item.startTime} – ${item.endTime} | ${getRoomName(item.room)}`}
                            className="absolute top-2 bottom-2 rounded-xl cursor-pointer flex items-center px-3 gap-2 overflow-hidden hover:brightness-95 transition-all shadow-md"
                            style={{
                              left: leftPx + 2,
                              width: widthPx,
                              background: `${hexColor}18`,
                              borderLeft: `3px solid ${hexColor}`,
                            }}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-black text-slate-800 dark:text-white truncate leading-tight">{item.groupName}</span>
                              <span className="text-[9px] font-bold truncate" style={{ color: hexColor }}>
                                {item.startTime}–{item.endTime} · {getRoomName(item.room)}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─ Add/Edit Modal ─ */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingItem ? 'Darsni tahrirlash' : "Yangi dars qo'shish"} width="lg">
        <div className="space-y-5">
          {conflicts.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2">
              <AlertCircle className="text-amber-500 mt-0.5 shrink-0" size={16} />
              <div>
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Ziddiyat!</p>
                {conflicts.map((c, i) => <p key={i} className="text-xs font-medium text-amber-700 dark:text-amber-400">{c}</p>)}
              </div>
            </div>
          )}

          {/* Group */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Guruh</label>
            <select value={formData.groupName}
              onChange={e => {
                const g = (groups || []).find((g: any) => g.name === e.target.value);
                const et = getEndTime(formData.startTime || '09:00', g?.course?.lessonDuration || 90);
                setFormData({ ...formData, groupName: e.target.value, teacher: g?.teacher?.name || formData.teacher, endTime: et });
              }}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Guruhni tanlang...</option>
              {(groups || []).map((g: any) => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </div>

          {/* Teacher + Room */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">O'qituvchi</label>
              <select value={formData.teacher} onChange={e => setFormData({ ...formData, teacher: e.target.value })}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tanlang...</option>
                {liveTeachers.map((t: any) => <option key={t.id} value={t.name}>{t.name}</option>)}
                {!liveTeachers.length && formData.teacher && <option value={formData.teacher}>{formData.teacher}</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Xona</label>
              <select value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                {rooms.map((r: any) => <option key={r.id || r.name} value={getRoomName(r)}>{getRoomName(r)}</option>)}
              </select>
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Boshlanish</label>
              <input type="time" value={formData.startTime}
                onChange={e => {
                  const g = (groups || []).find((g: any) => g.name === formData.groupName);
                  setFormData({ ...formData, startTime: e.target.value, endTime: getEndTime(e.target.value, g?.course?.lessonDuration || 90) });
                }}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Tugash (avto)</label>
              <input type="time" value={formData.endTime} disabled
                className="w-full bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700 text-zinc-400 text-sm rounded-xl px-4 py-2.5 cursor-not-allowed" />
            </div>
          </div>

          {/* Days */}
          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Dars kunlari</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => {
                const active = formData.days?.includes(day.id);
                return (
                  <button key={day.id} onClick={() => toggleDay(day.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                    {active && <Check size={10} />}
                    {day.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Rang</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c.bg} onClick={() => setFormData({ ...formData, color: c.bg })}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-all ${formData.color === c.bg ? 'ring-2 ring-offset-2 dark:ring-offset-zinc-900 ring-zinc-500 scale-110' : 'hover:scale-110'}`} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-zinc-100 dark:border-zinc-800">
            {editingItem ? (
              <button onClick={() => setDeleteConfirm({ open: true, id: editingItem.id })}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors">
                <Trash2 size={14} /> O'chirish
              </button>
            ) : <div />}
            <div className="flex gap-3">
              <button onClick={closeModal} className="px-4 py-2 text-xs font-black text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Bekor</button>
              <button onClick={handleSave} className="px-6 py-2 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm shadow-blue-600/25 transition-colors">Saqlash</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
