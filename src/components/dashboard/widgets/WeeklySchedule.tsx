/**
 * WeeklySchedule.tsx
 * Dashboard widget — haqiqiy haftalik dars jadvali (xonalar ustun, vaqt qator),
 * to'liq CRUD (dars/xona qo'shish-tahrirlash-o'chirish) bilan. Ilgari alohida
 * "Dars Jadvali" sahifasi (CrmSchedule.tsx) edi — foydalanuvchi so'rovi bilan
 * (2026-09-14) sahifa olib tashlanib, jadvalning o'zi Dashboard'ga ko'chirildi.
 */
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Clock, Trash2, AlertCircle, DoorOpen, Calendar, Check,
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useCrmData } from '../../../hooks/useCrmData';
import { useToast } from '../../Toast';
import ConfirmDialog from '../../ConfirmDialog';
import { Modal } from '../../ui/Modal';

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

const GRID_START_H = 9;
const GRID_END_H   = 19;
const HOUR_COUNT   = GRID_END_H - GRID_START_H;
const LABEL_STEP_H = 2;
const HOUR_ROW_H   = 56;
const ROOM_COL_MIN_W = 150;

const timeToFraction = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h + m / 60 - GRID_START_H) / HOUR_COUNT;
};

export function WeeklySchedule() {
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule, loading: scheduleLoading, error: scheduleError } =
    useFirestore<Omit<ScheduleItem, 'id'>>('schedule');
  const { data: roomsData = [], addDocument: addRoomDoc, loading: roomsLoading } = useFirestore<any>('rooms');
  const { data: groups = [], loading: groupsLoading } = useFirestore<any>('groups');
  const isLoading = scheduleLoading || roomsLoading || groupsLoading;
  const { teachers: liveTeachers, getEndTime } = useCrmData();
  const { showToast } = useToast();

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

  const rooms = useMemo(() => {
    if ((roomsData || []).length > 0) return roomsData;
    return [{ id: 'r1', name: '101-xona' }, { id: 'r2', name: '102-xona' }];
  }, [roomsData]);
  const getRoomName = (r: any) => typeof r === 'string' ? r : r?.name || '';

  const daySchedule = useMemo(() =>
    (schedule || []).filter(s => (s.days || []).includes(selectedDay)),
    [schedule, selectedDay]
  );

  const gridRooms = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    rooms.forEach((r: any) => {
      const name = getRoomName(r);
      if (name && !seen.has(name)) { seen.add(name); result.push(name); }
    });
    (schedule || []).forEach(s => {
      const name = getRoomName(s.room);
      if (name && !seen.has(name)) { seen.add(name); result.push(name); }
    });
    return result;
  }, [rooms, schedule]);

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
        const itemRm = getRoomName(item.room);
        if (rm === itemRm) result.push(`Xona band: ${rm} (${ex.groupName})`);
        if (ex.teacher === item.teacher) result.push(`O'qituvchi band: ${ex.teacher}`);
      }
    });
    return result;
  };
  useEffect(() => {
    if (isModalOpen) setConflicts(checkConflicts(formData, editingItem?.id));
  }, [formData, isModalOpen]);

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

  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => GRID_START_H + i);
  const hourLines = hours.filter(h => (h - GRID_START_H) % LABEL_STEP_H === 0);

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm flex flex-col">
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
      <Modal isOpen={roomModalOpen} onClose={() => setRoomModalOpen(false)} title="Yangi xona qo'shish" width="sm">
        <div className="space-y-4">
          <input type="text" value={roomInput} onChange={e => setRoomInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRoomAndClose()}
            placeholder="Masalan: 201-xona" autoFocus
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setRoomModalOpen(false)} className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors">Bekor</button>
            <button onClick={addRoomAndClose} className="px-4 py-2 text-sm font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">Qo'shish</button>
          </div>
        </div>
      </Modal>

      {/* ─ Header ─ */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Dars Jadvali</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">Haftalik dars dasturi</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isLoading && <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
          <button onClick={() => { setRoomInput(''); setRoomModalOpen(true); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/[0.06] text-[10px] font-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all">
            <DoorOpen size={12} /> Xona
          </button>
          <button onClick={() => openModal()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black transition-all">
            <Plus size={12} /> Dars
          </button>
        </div>
      </div>

      {scheduleError && (
        <div className="p-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-xl flex items-center gap-2 mb-3">
          <AlertCircle size={14} />
          <p className="text-[11px] font-bold">Ma'lumotlarni yuklashda xatolik.</p>
        </div>
      )}

      {/* ─ Day Tabs ─ */}
      <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/[0.06] rounded-xl p-1 flex overflow-x-auto gap-1 hide-scrollbar mb-3">
        {DAYS.map(day => {
          const isToday = todayReal === day.id;
          const isSelected = selectedDay === day.id;
          const cnt = (schedule || []).filter(s => (s.days || []).includes(day.id)).length;
          return (
            <button key={day.id} onClick={() => setSelectedDay(day.id)}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-sm' : isToday ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-zinc-500 hover:bg-white dark:hover:bg-white/5'}`}>
              <span className="block text-[10px] font-black">{day.short}</span>
              {cnt > 0 && (
                <span className={`text-[8px] font-black ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>{cnt}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─ Jadval: Vaqt (qatorlar) × Xonalar (ustunlar) ─ */}
      <div className="flex-1 min-h-0 border border-zinc-100 dark:border-white/[0.06] rounded-xl overflow-hidden">
        {gridRooms.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <DoorOpen size={28} className="text-zinc-200 dark:text-zinc-700 mb-2" />
            <p className="text-xs font-black text-zinc-400">Hali xona qo'shilmagan</p>
            <button onClick={() => { setRoomInput(''); setRoomModalOpen(true); }}
              className="mt-2 text-[10px] font-black text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1">
              <Plus size={12} /> Xona qo'shish
            </button>
          </div>
        ) : (
          <div className="overflow-auto custom-scrollbar h-full" style={{ maxHeight: 420 }}>
            <div className="flex" style={{ minWidth: ROOM_COL_MIN_W * gridRooms.length + 44 }}>
              <div className="w-11 flex-shrink-0 sticky left-0 z-20 bg-white dark:bg-[#111118]">
                <div className="h-9 sticky top-0 z-30 bg-zinc-50/95 dark:bg-zinc-800/95 backdrop-blur border-b border-r border-zinc-100 dark:border-zinc-800" />
                {hourLines.map(h => (
                  <div key={h} style={{ height: LABEL_STEP_H * HOUR_ROW_H }}
                    className="border-b border-r border-zinc-100 dark:border-zinc-800 flex items-start justify-end pr-1.5 pt-1">
                    <span className="text-[9px] font-black text-blue-500 tabular-nums">{h.toString().padStart(2, '0')}</span>
                  </div>
                ))}
              </div>

              {gridRooms.map(roomName => {
                const colItems = daySchedule.filter(s => getRoomName(s.room) === roomName);
                const totalGridPx = HOUR_ROW_H * HOUR_COUNT;

                return (
                  <div key={roomName} style={{ flex: `1 1 0%`, minWidth: ROOM_COL_MIN_W }} className="border-r border-zinc-100 dark:border-zinc-800 last:border-r-0">
                    <div className="h-9 sticky top-0 z-10 bg-zinc-50/95 dark:bg-zinc-800/95 backdrop-blur border-b border-zinc-100 dark:border-zinc-800 px-2 flex items-center gap-1">
                      <DoorOpen size={11} className="text-violet-500 shrink-0" />
                      <span className="text-[10px] font-black text-slate-800 dark:text-zinc-200 truncate">{roomName}</span>
                    </div>

                    <div className="relative" style={{ height: totalGridPx }}>
                      {hourLines.map(h => (
                        <div key={h}
                          className="absolute left-0 right-0 border-b border-zinc-100 dark:border-zinc-800"
                          style={{ top: (h - GRID_START_H) * HOUR_ROW_H, height: LABEL_STEP_H * HOUR_ROW_H }} />
                      ))}

                      {colItems.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[9px] font-medium text-zinc-300 dark:text-zinc-700">Bo'sh</span>
                        </div>
                      )}

                      {colItems.map(item => {
                        const hexColor = COLOR_OPTIONS.find(c => c.bg === item.color)?.hex || '#3b82f6';
                        const topFrac = Math.max(timeToFraction(item.startTime), 0);
                        const bottomFrac = Math.min(timeToFraction(item.endTime), 1);
                        const topPx = topFrac * totalGridPx;
                        const heightPx = Math.max((bottomFrac - topFrac) * totalGridPx - 4, 32);

                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => openModal(item)}
                            title={`${item.groupName} | ${item.startTime} – ${item.endTime} | ${roomName}`}
                            className="absolute left-1 right-1 rounded-lg cursor-pointer flex flex-col justify-center px-2 py-0.5 overflow-hidden hover:brightness-95 hover:scale-[1.01] transition-all shadow-sm"
                            style={{
                              top: topPx + 2,
                              height: heightPx,
                              background: `${hexColor}18`,
                              borderLeft: `3px solid ${hexColor}`,
                            }}
                          >
                            <span className="text-[10px] font-black text-slate-800 dark:text-white truncate leading-tight">{item.groupName}</span>
                            <span className="text-[8px] font-bold truncate" style={{ color: hexColor }}>
                              {item.startTime}–{item.endTime}{item.teacher ? ` · ${item.teacher}` : ''}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Rang</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c.bg} onClick={() => setFormData({ ...formData, color: c.bg })}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-all ${formData.color === c.bg ? 'ring-2 ring-offset-2 dark:ring-offset-zinc-900 ring-zinc-500 scale-110' : 'hover:scale-110'}`} />
              ))}
            </div>
          </div>

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
