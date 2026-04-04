import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Clock, DoorOpen, X, Trash2, Edit2, Filter, MapPin, AlertCircle, User, Users } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

interface ScheduleItem {
  id: string;
  groupId: string;
  groupName: string;
  teacher: string;
  room: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  days: number[];    // 1-7 (Dushanba-Yakshanba)
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

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_HEIGHT = 100; // pixels per hour

const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500'
];

export default function CrmSchedule() {
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } = useFirestore<Omit<ScheduleItem, 'id'>>('schedule');
  const { data: roomsData = [], addDocument: addRoomDoc } = useFirestore<any>('rooms');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: staff = [] } = useFirestore<any>('staff');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [selectedRoom, setSelectedRoom] = useState('Barchasi');
  const [rooms, setRooms] = useState<any[]>(['Barchasi']);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);

  const [formData, setFormData] = useState<Partial<ScheduleItem>>({
    groupName: '',
    teacher: '',
    room: '',
    startTime: '09:00',
    endTime: '10:30',
    days: [],
    color: COLORS[0]
  });

  useEffect(() => {
    const safeRoomsData = roomsData || [];
    if (safeRoomsData.length > 0) {
      setRooms(['Barchasi', ...safeRoomsData]);
    } else {
      const defaultRooms = [
        { name: '101-xona' },
        { name: '102-xona' },
        { name: '103-xona' }
      ];
      setRooms(['Barchasi', ...defaultRooms]);
      // Only add default rooms if collection is empty
      if (safeRoomsData.length === 0) {
        defaultRooms.forEach(room => addRoomDoc(room));
      }
    }
  }, [roomsData]);

  useEffect(() => {
    const safeStaff = staff || [];
    if (safeStaff.length > 0) {
      setTeachers(safeStaff.filter((s: any) => s.role?.toLowerCase().includes('o\'qituvchi') || s.department === 'Ta\'lim'));
    }
  }, [staff]);

  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const checkConflicts = (item: Partial<ScheduleItem>, excludeId?: string) => {
    const newConflicts: string[] = [];
    const start = timeToMinutes(item.startTime || '00:00');
    const end = timeToMinutes(item.endTime || '00:00');

    (schedule || []).forEach(existing => {
      if (existing.id === excludeId) return;

      const hasCommonDay = item.days?.some(d => (existing.days || []).includes(d));
      if (!hasCommonDay) return;

      const existingStart = timeToMinutes(existing.startTime || '00:00');
      const existingEnd = timeToMinutes(existing.endTime || '00:00');

      const overlaps = (start < existingEnd && end > existingStart);

      if (overlaps) {
        if (existing.room === item.room) {
          newConflicts.push(`Xona band: ${existing.room} (${existing.groupName})`);
        }
        if (existing.teacher === item.teacher) {
          newConflicts.push(`O'qituvchi band: ${existing.teacher} (${existing.groupName})`);
        }
      }
    });

    return newConflicts;
  };

  useEffect(() => {
    if (isModalOpen) {
      setConflicts(checkConflicts(formData, editingItem?.id));
    }
  }, [formData, isModalOpen, editingItem]);

  const handleSave = async () => {
    if (!formData.groupName || !formData.teacher || !formData.room || !formData.days || formData.days.length === 0) {
      alert('Iltimos, barcha maydonlarni to\'ldiring (Guruh, O\'qituvchi, Xona va Kunlar)!');
      return;
    }

    const roomName = typeof formData.room === 'object' ? (formData.room as any).name : formData.room;
    const currentConflicts = checkConflicts({ ...formData, room: roomName }, editingItem?.id);
    if (currentConflicts.length > 0) {
      if (!window.confirm(`Ziddiyatlar aniqlandi:\n${currentConflicts.join('\n')}\n\nBaribir saqlashni xohlaysizmi?`)) {
        return;
      }
    }

    const group = (groups || []).find((g: any) => g.name === formData.groupName);
    
    try {
      if (editingItem) {
        const itemData = { 
          ...formData, 
          room: roomName, 
          groupId: group?.id || editingItem.groupId 
        } as Omit<ScheduleItem, 'id'>;
        await updateSchedule(editingItem.id, itemData);
      } else {
        const newItem: Omit<ScheduleItem, 'id'> = {
          groupId: group?.id || 'g' + Date.now(),
          groupName: formData.groupName || '',
          teacher: formData.teacher || '',
          room: roomName || '',
          startTime: formData.startTime || '09:00',
          endTime: formData.endTime || '10:30',
          days: formData.days || [],
          color: formData.color || COLORS[0]
        };
        await addSchedule(newItem);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving schedule:", error);
      alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Ushbu darsni jadvaldan o\'chirmoqchimisiz?')) {
      try {
        await deleteSchedule(id);
        closeModal();
      } catch (error) {
        console.error("Error deleting schedule:", error);
        alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
      }
    }
  };

  const openModal = (item: ScheduleItem | null = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ 
        ...item,
        room: typeof item.room === 'object' ? (item.room as any).name : (item.room || '')
      });
    } else {
      const safeGroups = groups || [];
      const safeRooms = rooms || [];
      const safeTeachers = teachers || [];
      setEditingItem(null);
      setFormData({
        groupName: safeGroups[0]?.name || '',
        teacher: safeGroups[0]?.teacher || safeTeachers[0]?.name || '',
        room: typeof (safeRooms[1] || '101-xona') === 'string' ? (safeRooms[1] || '101-xona') : (safeRooms[1] as any).name,
        startTime: '09:00',
        endTime: '10:30',
        days: [],
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setConflicts([]);
  };

  const toggleDay = (dayId: number) => {
    const currentDays = formData.days || [];
    if (currentDays.includes(dayId)) {
      setFormData({ ...formData, days: currentDays.filter(id => id !== dayId) });
    } else {
      setFormData({ ...formData, days: [...currentDays, dayId] });
    }
  };

  const filteredSchedule = useMemo(() => {
    const safeSchedule = schedule || [];
    return selectedRoom === 'Barchasi' 
      ? safeSchedule 
      : safeSchedule.filter(item => item.room === selectedRoom);
  }, [schedule, selectedRoom]);

  const calculatePosition = (startTime: string, endTime: string) => {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const startOffset = (startMin - START_HOUR * 60) * (HOUR_HEIGHT / 60);
    const height = (endMin - startMin) * (HOUR_HEIGHT / 60);
    return { top: startOffset, height };
  };

  const timeLabels = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
    const hour = START_HOUR + i;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  const handleAddRoom = async () => {
    const roomName = window.prompt('Yangi xona nomini kiriting:');
    if (roomName) {
      const existingRooms = rooms.filter(r => r !== 'Barchasi');
      if (!existingRooms.some(r => (typeof r === 'string' ? r : r.name) === roomName)) {
        try {
          await addRoomDoc({ name: roomName });
        } catch (error) {
          console.error("Error adding room:", error);
          alert("Xatolik yuz berdi.");
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Dars Jadvali</h1>
          <p className="text-zinc-500 text-sm font-medium">Professional darslarni rejalashtirish tizimi</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleAddRoom}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
          >
            <MapPin size={18} />
            Xona Qo'shish
          </button>
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 shadow-sm">
            <Filter size={16} className="text-zinc-400" />
            <select 
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none dark:text-white"
            >
              {rooms.map((room, idx) => {
                const name = typeof room === 'string' ? room : room.name;
                const key = typeof room === 'string' ? `room-str-${room}` : `room-obj-${room.id || idx}`;
                return <option key={key} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            Dars Qo'shish
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px] relative">
            {/* Header */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-20">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-r border-zinc-200 dark:border-zinc-800"></div>
              {DAYS.map((day) => (
                <div key={day.id} className="p-4 text-center font-black text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 border-r border-zinc-200 dark:border-zinc-800 last:border-r-0">
                  {day.name}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="relative" style={{ height: (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT }}>
              {/* Time Labels and Horizontal Lines */}
              {timeLabels.map((time, idx) => (
                <div 
                  key={time} 
                  className="absolute w-full border-t border-zinc-100 dark:border-zinc-800/50 flex"
                  style={{ top: idx * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <div className="w-[80px] -mt-3 text-[10px] font-black text-zinc-400 text-center bg-white dark:bg-zinc-900 z-10">
                    {time}
                  </div>
                  <div className="flex-1 grid grid-cols-7 h-full">
                    {DAYS.map(day => (
                      <div key={day.id} className="border-r border-zinc-100 dark:border-zinc-800/50 last:border-r-0 h-full" />
                    ))}
                  </div>
                </div>
              ))}

              {/* Schedule Items */}
              {filteredSchedule.map(item => (
                (item.days || []).map(dayId => {
                  const pos = calculatePosition(item.startTime, item.endTime);
                  return (
                    <motion.div
                      key={`${item.id}-${dayId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => openModal(item)}
                      className={`absolute rounded-xl ${item.color} text-white p-3 shadow-lg cursor-pointer z-10 hover:scale-[1.02] transition-transform overflow-hidden border-2 border-white/20`}
                      style={{
                        top: pos.top,
                        height: pos.height,
                        left: `calc(80px + ${(dayId - 1) * (100 / 7)}%)`,
                        width: `calc(${(100 / 7)}% - 8px)`,
                        margin: '0 4px'
                      }}
                    >
                      <div className="flex flex-col h-full justify-between">
                        <div>
                          <p className="text-xs font-black leading-tight mb-1">{item.groupName}</p>
                          <div className="flex items-center gap-1 opacity-80 text-[10px] font-bold">
                            <User size={10} />
                            <span className="truncate">{item.teacher}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/20">
                          <div className="flex items-center gap-1 opacity-80 text-[9px] font-black">
                            <Clock size={10} />
                            <span>{item.startTime}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-80 text-[9px] font-black">
                            <DoorOpen size={10} />
                            <span>{typeof item.room === 'object' ? (item.room as any).name : item.room}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Bugungi darslar</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {(schedule || []).filter(item => (item.days || []).includes(new Date().getDay() || 7)).length} ta
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
            <MapPin size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xonalar bandligi</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {Math.round((new Set((schedule || []).map(s => s.room)).size / Math.max(1, (rooms || []).length - 1)) * 100)}%
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jami guruhlar</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {new Set((schedule || []).map(s => s.groupName)).size} ta
            </p>
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
                  {editingItem ? 'Darsni Tahrirlash' : 'Yangi Dars Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {conflicts.length > 0 && (
                  <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-rose-600 mt-0.5" size={18} />
                    <div>
                      <p className="text-xs font-black text-rose-600 uppercase tracking-widest mb-1">Ziddiyatlar aniqlandi</p>
                      <ul className="text-xs font-bold text-rose-700 dark:text-rose-400 list-disc list-inside">
                        {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruh</label>
                    <select 
                      value={formData.groupName}
                      onChange={(e) => {
                        const group = (groups || []).find(g => g.name === e.target.value);
                        const roomName = group?.room;
                        setFormData({
                          ...formData, 
                          groupName: e.target.value,
                          teacher: group?.teacher || formData.teacher,
                          room: typeof roomName === 'object' ? (roomName as any).name : (roomName || formData.room)
                        });
                      }}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="">Guruhni tanlang</option>
                      {(groups || []).map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                      {!(groups || []).length && <option value={formData.groupName}>{formData.groupName}</option>}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'qituvchi</label>
                    <select 
                      value={formData.teacher}
                      onChange={(e) => setFormData({...formData, teacher: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="">O'qituvchini tanlang</option>
                      {(teachers || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                      {!(teachers || []).length && <option value={formData.teacher}>{formData.teacher}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xona</label>
                    <select 
                      value={formData.room}
                      onChange={(e) => setFormData({...formData, room: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {rooms.filter(r => r !== 'Barchasi').map((room, idx) => {
                        const name = typeof room === 'string' ? room : room.name;
                        const key = typeof room === 'string' ? `room-opt-str-${room}` : `room-opt-obj-${room.id || idx}`;
                        return <option key={key} value={name}>{name}</option>;
                      })}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rang</label>
                    <div className="flex gap-2">
                      {COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setFormData({...formData, color})}
                          className={`w-8 h-8 rounded-full ${color} ${formData.color === color ? 'ring-2 ring-offset-2 ring-zinc-400' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Boshlanish Vaqti</label>
                    <input 
                      type="time" 
                      value={formData.startTime}
                      onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tugash Vaqti</label>
                    <input 
                      type="time" 
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kunlar</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                      <button
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                          formData.days?.includes(day.id)
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {day.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                {editingItem ? (
                  <button 
                    onClick={() => handleDelete(editingItem.id)}
                    className="flex items-center gap-2 text-rose-600 font-bold text-sm hover:text-rose-700"
                  >
                    <Trash2 size={18} />
                    O'chirish
                  </button>
                ) : <div></div>}
                <div className="flex gap-3">
                  <button 
                    onClick={closeModal}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Bekor qilish
                  </button>
                  <button 
                    onClick={handleSave}
                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20"
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
