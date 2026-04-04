import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Clock, DoorOpen, X, Trash2, Edit2, Filter, MapPin, AlertCircle, User, Users, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';

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

const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500'
];

const DEFAULT_START = 9;
const DEFAULT_END = 18;

export default function CrmSchedule() {
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } = useFirestore<Omit<ScheduleItem, 'id'>>('schedule');
  const { data: roomsData = [], addDocument: addRoomDoc } = useFirestore<any>('rooms');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { courses, teachers: liveTeachers, getEndTime } = useCrmData();
  const teachers = liveTeachers.length > 0 ? liveTeachers : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 7 : today;
  });
  const [viewMode, setViewMode] = useState<'rooms' | 'days'>('rooms');
  const [conflicts, setConflicts] = useState<string[]>([]);

  const [formData, setFormData] = useState<Partial<ScheduleItem>>({
    groupName: '', teacher: '', room: '', startTime: '09:00', endTime: '10:30', days: [], color: COLORS[0]
  });

  // Room list
  const rooms = useMemo(() => {
    const safe = roomsData || [];
    if (safe.length > 0) return safe;
    return [{ id: 'r1', name: '101-xona' }, { id: 'r2', name: '102-xona' }, { id: 'r3', name: '103-xona' }];
  }, [roomsData]);

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Dynamic time range: default 9-18, expand if needed
  const { startHour, endHour, totalSlots } = useMemo(() => {
    let minH = DEFAULT_START;
    let maxH = DEFAULT_END;
    (schedule || []).forEach(item => {
      const sH = parseInt(item.startTime?.split(':')[0] || '9');
      const eH = parseInt(item.endTime?.split(':')[0] || '10');
      const eM = parseInt(item.endTime?.split(':')[1] || '0');
      if (sH < minH) minH = sH;
      if (eH + (eM > 0 ? 1 : 0) > maxH) maxH = eH + (eM > 0 ? 1 : 0);
    });
    return { startHour: minH, endHour: maxH, totalSlots: maxH - minH };
  }, [schedule]);

  const timeSlots = useMemo(() =>
    Array.from({ length: totalSlots }, (_, i) => {
      const h = startHour + i;
      return `${h.toString().padStart(2, '0')}:00`;
    }),
    [startHour, totalSlots]);

  // Items for the selected day
  const daySchedule = useMemo(() =>
    (schedule || []).filter(item => (item.days || []).includes(selectedDay)),
    [schedule, selectedDay]);

  // Conflict checker
  const checkConflicts = (item: Partial<ScheduleItem>, excludeId?: string) => {
    const newC: string[] = [];
    const s = timeToMinutes(item.startTime || '00:00');
    const e = timeToMinutes(item.endTime || '00:00');
    (schedule || []).forEach(ex => {
      if (ex.id === excludeId) return;
      if (!item.days?.some(d => (ex.days || []).includes(d))) return;
      const es = timeToMinutes(ex.startTime || '00:00');
      const ee = timeToMinutes(ex.endTime || '00:00');
      if (s < ee && e > es) {
        const rm = typeof ex.room === 'object' ? (ex.room as any).name : ex.room;
        if (rm === item.room) newC.push(`Xona band: ${rm} (${ex.groupName})`);
        if (ex.teacher === item.teacher) newC.push(`O'qituvchi band: ${ex.teacher} (${ex.groupName})`);
      }
    });
    return newC;
  };

  useEffect(() => {
    if (isModalOpen) setConflicts(checkConflicts(formData, editingItem?.id));
  }, [formData, isModalOpen, editingItem]);

  const handleSave = async () => {
    if (!formData.groupName || !formData.teacher || !formData.room || !formData.days?.length) {
      alert("Iltimos, barcha maydonlarni to'ldiring!"); return;
    }
    const roomName = typeof formData.room === 'object' ? (formData.room as any).name : formData.room;
    const cc = checkConflicts({ ...formData, room: roomName }, editingItem?.id);
    if (cc.length > 0 && !window.confirm(`Ziddiyatlar:\n${cc.join('\n')}\n\nDavom etsinmi?`)) return;
    const group = (groups || []).find((g: any) => g.name === formData.groupName);
    try {
      if (editingItem) {
        await updateSchedule(editingItem.id, { ...formData, room: roomName, groupId: group?.id || editingItem.groupId } as any);
      } else {
        await addSchedule({
          groupId: group?.id || 'g' + Date.now(), groupName: formData.groupName || '', teacher: formData.teacher || '',
          room: roomName || '', startTime: formData.startTime || '09:00', endTime: formData.endTime || '10:30',
          days: formData.days || [], color: formData.color || COLORS[0]
        });
      }
      closeModal();
    } catch { alert("Xatolik yuz berdi!"); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Darsni o'chirmoqchimisiz?")) {
      try { await deleteSchedule(id); closeModal(); } catch { alert("Xatolik!"); }
    }
  };

  const openModal = (item: ScheduleItem | null = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item, room: typeof item.room === 'object' ? (item.room as any).name : (item.room || '') });
    } else {
      setEditingItem(null);
      setFormData({
        groupName: (groups || [])[0]?.name || '', teacher: (groups || [])[0]?.teacher || (teachers || [])[0]?.name || '',
        room: rooms[0]?.name || '', startTime: '09:00', endTime: '10:30', days: [selectedDay],
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setEditingItem(null); setConflicts([]); };
  const toggleDay = (dayId: number) => {
    const cur = formData.days || [];
    setFormData({ ...formData, days: cur.includes(dayId) ? cur.filter(d => d !== dayId) : [...cur, dayId] });
  };

  const handleAddRoom = async () => {
    const name = window.prompt('Yangi xona nomini kiriting:');
    if (name && !rooms.some((r: any) => r.name === name)) {
      try { await addRoomDoc({ name, capacity: 30 }); } catch { alert("Xatolik!"); }
    }
  };

  // Calculate position for schedule blocks
  const getBlockStyle = (item: ScheduleItem) => {
    const sMin = timeToMinutes(item.startTime) - startHour * 60;
    const eMin = timeToMinutes(item.endTime) - startHour * 60;
    const totalMin = totalSlots * 60;
    return {
      top: `${(sMin / totalMin) * 100}%`,
      height: `${((eMin - sMin) / totalMin) * 100}%`,
    };
  };

  const getRoomName = (r: any) => typeof r === 'string' ? r : r?.name || '';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Dars Jadvali</h1>
          <p className="text-zinc-500 text-sm font-medium">Xonalar kesimida darslarni rejalashtirish</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAddRoom} className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all">
            <MapPin size={14} /> Xona Qo'shish
          </button>
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button onClick={() => setViewMode('rooms')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'rooms' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}>
              Xonalar
            </button>
            <button onClick={() => setViewMode('days')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${viewMode === 'days' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}>
              Kunlar
            </button>
          </div>
          <button onClick={() => openModal()} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20">
            <Plus size={18} /> Dars Qo'shish
          </button>
        </div>
      </div>

      {/* Day Selector Tabs */}
      <div className="flex items-center gap-1 mb-3 bg-white dark:bg-zinc-900 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0">
        {DAYS.map(day => {
          const isToday = (new Date().getDay() || 7) === day.id;
          const count = (schedule || []).filter(s => (s.days || []).includes(day.id)).length;
          return (
            <button
              key={day.id}
              onClick={() => setSelectedDay(day.id)}
              className={`flex-1 py-2 px-1 rounded-lg text-xs font-black transition-all relative ${selectedDay === day.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : isToday
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
            >
              <span className="block">{day.short}</span>
              {count > 0 && (
                <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${selectedDay === day.id ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                  {count}
                </span>
              )}
              {isToday && selectedDay !== day.id && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ======= ROOM VIEW: Rooms as columns ======= */}
      {viewMode === 'rooms' && (
        <div className="flex-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1 flex flex-col min-h-0">
            <div className="min-w-[700px] flex flex-col flex-1 min-h-0">
              {/* Room Headers */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="w-14 shrink-0 bg-zinc-50 dark:bg-zinc-800/50 border-r border-zinc-200 dark:border-zinc-800 p-2 flex items-center justify-center">
                  <Clock size={14} className="text-zinc-400" />
                </div>
                {rooms.map((room: any) => (
                  <div key={room.id || room.name} className="flex-1 p-2.5 text-center border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 bg-zinc-50 dark:bg-zinc-800/50">
                    <div className="flex items-center justify-center gap-1.5">
                      <DoorOpen size={12} className="text-zinc-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{getRoomName(room)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Grid Body */}
              <div className="flex flex-1 overflow-y-auto min-h-0 relative">
                {/* Time column */}
                <div className="w-14 shrink-0 border-r border-zinc-200 dark:border-zinc-800 relative">
                  {timeSlots.map((time, idx) => (
                    <div
                      key={time}
                      className="border-b border-zinc-100 dark:border-zinc-800/50 flex items-start justify-center pt-1"
                      style={{ height: `${100 / totalSlots}%` }}
                    >
                      <span className="text-[10px] font-black text-zinc-400">{time}</span>
                    </div>
                  ))}
                </div>

                {/* Room columns */}
                {rooms.map((room: any) => {
                  const roomName = getRoomName(room);
                  const roomItems = daySchedule.filter(s => {
                    const sRoom = typeof s.room === 'object' ? (s.room as any).name : s.room;
                    return sRoom === roomName;
                  });
                  return (
                    <div key={room.id || room.name} className="flex-1 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 relative">
                      {/* Hour lines */}
                      {timeSlots.map((time) => (
                        <div key={time} className="border-b border-zinc-100 dark:border-zinc-800/50" style={{ height: `${100 / totalSlots}%` }} />
                      ))}
                      {/* Schedule blocks */}
                      {roomItems.map(item => {
                        const style = getBlockStyle(item);
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => openModal(item)}
                            className={`absolute left-1 right-1 ${item.color} text-white rounded-lg cursor-pointer z-10 hover:z-20 hover:scale-[1.02] transition-transform overflow-hidden shadow-md border border-white/20`}
                            style={{ top: style.top, height: style.height, minHeight: '28px' }}
                          >
                            <div className="px-2 py-1 flex flex-col justify-center h-full gap-0.5">
                              <p className="text-[11px] font-black leading-tight truncate">{item.groupName}</p>
                              <div className="flex items-center gap-1 opacity-80">
                                <User size={9} />
                                <span className="text-[9px] font-bold truncate">{item.teacher}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-70">
                                <Clock size={8} />
                                <span className="text-[8px] font-bold">{item.startTime}–{item.endTime}</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======= DAYS VIEW: Days as columns (classic) ======= */}
      {viewMode === 'days' && (
        <div className="flex-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1 flex flex-col min-h-0">
            <div className="min-w-[900px] flex flex-col flex-1 min-h-0">
              {/* Day Headers */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="w-14 shrink-0 bg-zinc-50 dark:bg-zinc-800/50 border-r border-zinc-200 dark:border-zinc-800 p-2 flex items-center justify-center">
                  <Clock size={14} className="text-zinc-400" />
                </div>
                {DAYS.map((day) => (
                  <div key={day.id} className={`flex-1 p-2.5 text-center border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 ${(new Date().getDay() || 7) === day.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-zinc-50 dark:bg-zinc-800/50'
                    }`}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{day.name}</span>
                  </div>
                ))}
              </div>

              {/* Time Grid Body */}
              <div className="flex flex-1 overflow-y-auto min-h-0 relative">
                <div className="w-14 shrink-0 border-r border-zinc-200 dark:border-zinc-800 relative">
                  {timeSlots.map((time) => (
                    <div key={time} className="border-b border-zinc-100 dark:border-zinc-800/50 flex items-start justify-center pt-1" style={{ height: `${100 / totalSlots}%` }}>
                      <span className="text-[10px] font-black text-zinc-400">{time}</span>
                    </div>
                  ))}
                </div>
                {DAYS.map((day) => {
                  const dayItems = (schedule || []).filter(s => (s.days || []).includes(day.id));
                  return (
                    <div key={day.id} className="flex-1 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0 relative">
                      {timeSlots.map((time) => (
                        <div key={time} className="border-b border-zinc-100 dark:border-zinc-800/50" style={{ height: `${100 / totalSlots}%` }} />
                      ))}
                      {dayItems.map(item => {
                        const style = getBlockStyle(item);
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => openModal(item)}
                            className={`absolute left-0.5 right-0.5 ${item.color} text-white rounded-lg cursor-pointer z-10 hover:z-20 hover:scale-[1.02] transition-transform overflow-hidden shadow-md border border-white/20`}
                            style={{ top: style.top, height: style.height, minHeight: '24px' }}
                          >
                            <div className="px-1.5 py-0.5 flex flex-col justify-center h-full">
                              <p className="text-[10px] font-black leading-tight truncate">{item.groupName}</p>
                              <span className="text-[8px] font-bold opacity-70 truncate">{typeof item.room === 'object' ? (item.room as any).name : item.room}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mt-3 shrink-0">
        <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center"><Clock size={18} /></div>
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Bugun</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{(schedule || []).filter(s => (s.days || []).includes(new Date().getDay() || 7)).length} <span className="text-xs font-bold text-zinc-400">dars</span></p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><MapPin size={18} /></div>
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Xonalar</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{rooms.length} <span className="text-xs font-bold text-zinc-400">ta</span></p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center"><Users size={18} /></div>
          <div>
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Tanlangan kun</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{daySchedule.length} <span className="text-xs font-bold text-zinc-400">dars</span></p>
          </div>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingItem ? 'Darsni Tahrirlash' : "Yangi Dars Qo'shish"}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"><X size={24} /></button>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {conflicts.length > 0 && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl flex items-start gap-2">
                    <AlertCircle className="text-rose-600 mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Ziddiyatlar</p>
                      <ul className="text-xs font-bold text-rose-700 dark:text-rose-400 list-disc list-inside">
                        {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruh</label>
                    <select value={formData.groupName} onChange={(e) => {
                      const g = (groups || []).find((g: any) => g.name === e.target.value);
                      const course = courses.find((c: any) => c.name === g?.subject);
                      const duration = course?.lessonDuration || 90;
                      const endTime = getEndTime(formData.startTime || '09:00', duration);
                      setFormData({ 
                        ...formData, 
                        groupName: e.target.value, 
                        teacher: g?.teacher || formData.teacher, 
                        room: g?.room || formData.room,
                        endTime 
                      });
                    }} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                      <option value="">Tanlang</option>
                      {(groups || []).map((g: any) => <option key={g.id} value={g.name}>{g.name}</option>)}
                      {!(groups || []).length && formData.groupName && <option value={formData.groupName}>{formData.groupName}</option>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'qituvchi</label>
                    <select value={formData.teacher} onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                      <option value="">Tanlang</option>
                      {(teachers || []).map((t: any) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      {!(teachers || []).length && formData.teacher && <option value={formData.teacher}>{formData.teacher}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xona</label>
                    <select value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                      {rooms.map((r: any) => <option key={r.id || r.name} value={getRoomName(r)}>{getRoomName(r)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rang</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLORS.map(c => (
                        <button key={c} onClick={() => setFormData({ ...formData, color: c })} className={`w-7 h-7 rounded-full ${c} ${formData.color === c ? 'ring-2 ring-offset-2 ring-zinc-400' : ''} transition-all`} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Boshlanish</label>
                    <input type="time" value={formData.startTime} onChange={(e) => {
                        const g = (groups || []).find((g: any) => g.name === formData.groupName);
                        const course = courses.find((c: any) => c.name === g?.subject);
                        const duration = course?.lessonDuration || 90;
                        setFormData({ 
                          ...formData, 
                          startTime: e.target.value,
                          endTime: e.target.value ? getEndTime(e.target.value, duration) : formData.endTime
                        });
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tugash</label>
                    <input type="time" value={formData.endTime} disabled
                      className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold text-zinc-500 cursor-not-allowed" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kunlar</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                      <button key={day.id} onClick={() => toggleDay(day.id)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${formData.days?.includes(day.id) ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}>{day.name}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                {editingItem ? (
                  <button onClick={() => handleDelete(editingItem.id)} className="flex items-center gap-2 text-rose-600 font-bold text-sm hover:text-rose-700">
                    <Trash2 size={16} /> O'chirish
                  </button>
                ) : <div />}
                <div className="flex gap-3">
                  <button onClick={closeModal} className="px-5 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Bekor qilish</button>
                  <button onClick={handleSave} className="px-7 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20">Saqlash</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
