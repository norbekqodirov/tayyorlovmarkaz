import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, MoreVertical, Users, Calendar, Clock, 
  DoorOpen, BookOpen, X, Edit2, Trash2, Filter,
  ChevronRight, UserPlus, GraduationCap, CheckCircle2,
  AlertCircle, LayoutGrid, List as ListIcon, Settings
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

interface Group {
  id: string;
  name: string;
  subject: string;
  teacher: string;
  teacherId: string;
  room: string;
  days: string[];
  time: string;
  students: string[]; // Student IDs
  status: 'Faol' | 'Tugallangan' | 'Yangi';
  maxStudents: number;
  startDate: string;
  endDate: string;
  price: number;
}

const DAYS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'];
const SUBJECTS = ['Matematika', 'Ingliz tili', 'Ona tili', 'Fizika', 'Kimyo', 'Biologiya', 'Tarix', 'IELTS', 'CEFR'];
const ROOMS = ['101-xona', '102-xona', '201-xona', '202-xona', '301-xona', '302-xona'];

export default function CrmGroups() {
  const { data: groups = [], addDocument, updateDocument, deleteDocument } = useFirestore<Group>('groups');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: staff = [] } = useFirestore<any>('staff');
  const { data: roomsList = [] } = useFirestore<any>('rooms');
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } = useFirestore<any>('schedule');

  const DAY_MAP: Record<string, number> = {
    'Dush': 1,
    'Sesh': 2,
    'Chor': 3,
    'Pay': 4,
    'Jum': 5,
    'Shan': 6,
    'Yak': 7
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [formData, setFormData] = useState<Partial<Group>>({
    name: '',
    subject: 'Matematika',
    teacher: '',
    teacherId: '',
    room: '101-xona',
    days: [],
    time: '09:00 - 11:00',
    students: [],
    status: 'Faol',
    maxStudents: 15,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    price: 400000
  });

  const handleSave = async () => {
    if (!formData.name) return;

    const roomName = typeof formData.room === 'object' ? (formData.room as any).name : formData.room;
    const [startTime, endTime] = (formData.time || '09:00 - 10:30').split(' - ');
    const scheduleDays = (formData.days || []).map(d => DAY_MAP[d]).filter(Boolean);

    let groupId = formData.id;
    if (formData.id) {
      await updateDocument(formData.id, { ...formData, room: roomName });
      if (selectedGroup?.id === formData.id) {
        setSelectedGroup({ ...selectedGroup, ...formData, room: roomName } as Group);
      }
      
      // Update schedule
      const existingSchedule = (schedule || []).find((s: any) => s.groupId === formData.id);
      if (existingSchedule) {
        await updateSchedule(existingSchedule.id, {
          groupName: formData.name,
          teacher: formData.teacher,
          room: roomName,
          startTime: startTime || '09:00',
          endTime: endTime || '10:30',
          days: scheduleDays,
          groupId: formData.id
        });
      } else {
        await addSchedule({
          groupId: formData.id,
          groupName: formData.name,
          teacher: formData.teacher,
          room: roomName,
          startTime: startTime || '09:00',
          endTime: endTime || '10:30',
          days: scheduleDays,
          color: 'bg-blue-500'
        });
      }
    } else {
      groupId = await addDocument({
        ...formData as Omit<Group, 'id'>,
        room: roomName || '101-xona',
      });

      // Add to schedule
      await addSchedule({
        groupId: groupId,
        groupName: formData.name,
        teacher: formData.teacher,
        room: roomName || '101-xona',
        startTime: startTime || '09:00',
        endTime: endTime || '10:30',
        days: scheduleDays,
        color: 'bg-blue-500'
      });
    }
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Haqiqatan ham ushbu guruhni o\'chirmoqchimisiz?')) {
      await deleteDocument(id);
      
      // Delete from schedule
      const existingSchedule = (schedule || []).find((s: any) => s.groupId === id);
      if (existingSchedule) {
        await deleteSchedule(existingSchedule.id);
      }

      if (selectedGroup?.id === id) setIsDetailOpen(false);
    }
  };

  const openModal = (group: Group | null = null) => {
    if (group) {
      setFormData(group);
    } else {
      setFormData({
        name: '',
        subject: 'Matematika',
        teacher: '',
        teacherId: '',
        room: '101-xona',
        days: [],
        time: '09:00 - 11:00',
        students: [],
        status: 'Faol',
        maxStudents: 15,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        price: 400000
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const toggleDay = (day: string) => {
    const currentDays = formData.days || [];
    if (currentDays.includes(day)) {
      setFormData({ ...formData, days: currentDays.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, days: [...currentDays, day] });
    }
  };

  const filteredGroups = useMemo(() => {
    return (groups || []).filter(g => 
      (g.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.teacher || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groups, searchTerm]);

  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');

  const teachers = useMemo(() => 
    (staff || []).filter(s => s.role?.toLowerCase().includes('o\'qituvchi') || s.department === 'Ta\'lim')
  , [staff]);

  const handleAddStudentToGroup = async () => {
    if (!selectedStudentToAdd || !selectedGroup) return;
    
    if ((selectedGroup.students || []).includes(selectedStudentToAdd)) {
      alert('Ushbu o\'quvchi allaqachon guruhda bor!');
      return;
    }

    if ((selectedGroup.students || []).length >= (selectedGroup.maxStudents || 15)) {
      alert('Guruhda joy qolmagan!');
      return;
    }

    const updatedStudents = [...(selectedGroup.students || []), selectedStudentToAdd];
    await updateDocument(selectedGroup.id, { students: updatedStudents });
    setSelectedGroup({ ...selectedGroup, students: updatedStudents });
    setIsAddStudentModalOpen(false);
    setSelectedStudentToAdd('');
  };

  const handleRemoveStudentFromGroup = async (studentId: string) => {
    if (!selectedGroup || !window.confirm('O\'quvchini guruhdan chetlatmoqchimisiz?')) return;

    const updatedStudents = (selectedGroup.students || []).filter(id => id !== studentId);
    await updateDocument(selectedGroup.id, { students: updatedStudents });
    setSelectedGroup({ ...selectedGroup, students: updatedStudents });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Guruhlar Boshqaruvi</h1>
          <p className="text-sm font-medium text-zinc-500 mt-1">O'quv markazidagi barcha faol va yangi guruhlar nazorati</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />
            Yangi Guruh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Jami Guruhlar', value: (groups || []).length, icon: Users, color: 'blue' },
          { label: 'Faol Guruhlar', value: (groups || []).filter(g => g.status === 'Faol').length, icon: CheckCircle2, color: 'emerald' },
          { label: 'O\'rtacha To\'lish', value: (groups || []).length > 0 ? Math.round((groups || []).reduce((acc, g) => acc + ((g.students?.length || 0) / (g.maxStudents || 1) * 100), 0) / (groups || []).length) + '%' : '0%', icon: GraduationCap, color: 'amber' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className={`w-10 h-10 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400 flex items-center justify-center mb-3`}>
              <stat.icon size={20} />
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Guruh nomi, fan yoki ustoz bo'yicha qidirish..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">
          <Filter size={18} />
          Filtrlar
        </button>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(filteredGroups || []).map((group) => (
            <motion.div 
              layout
              key={group.id}
              onClick={() => { setSelectedGroup(group); setIsDetailOpen(true); }}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors">{group.name}</h3>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{group.subject}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    group.status === 'Faol' 
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {group.status}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                    <Calendar size={16} className="text-blue-500" />
                    {group.days.join(', ')}
                  </div>
                  <div className="flex items-center gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                    <Clock size={16} className="text-blue-500" />
                    {group.time}
                  </div>
                  <div className="flex items-center gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                    <DoorOpen size={16} className="text-blue-500" />
                    {typeof group.room === 'object' ? (group.room as any).name : group.room}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchilar</span>
                    <span className="text-xs font-black text-slate-900 dark:text-white">{(group.students || []).length} / {group.maxStudents || 15}</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${((group.students || []).length / (group.maxStudents || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-600 dark:text-zinc-400">
                      {(group.teacher || '?').charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-zinc-500">{group.teacher}</span>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruh</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fan va Ustoz</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vaqt va Xona</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchilar</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(filteredGroups || []).map((group) => (
                <tr 
                  key={group.id} 
                  onClick={() => { setSelectedGroup(group); setIsDetailOpen(true); }}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <span className="font-black text-slate-900 dark:text-white tracking-tight">{group.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{group.subject}</span>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{group.teacher}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                        <Calendar size={12} /> {group.days.join(', ')}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                        <Clock size={12} /> {group.time}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-zinc-400" />
                      <span className="text-sm font-black text-slate-900 dark:text-white">{(group.students?.length || 0)} / {group.maxStudents}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      group.status === 'Faol' 
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                      {group.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openModal(group); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Group Detail Sidebar */}
      <AnimatePresence>
        {isDetailOpen && selectedGroup && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Guruh Tafsilotlari</h2>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white">{selectedGroup.name}</h3>
                      <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">{selectedGroup.subject}</p>
                    </div>
                    <span className="px-4 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-black uppercase tracking-widest">
                      {selectedGroup.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">O'qituvchi</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{selectedGroup.teacher}</p>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Xona</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{typeof selectedGroup.room === 'object' ? (selectedGroup.room as any).name : selectedGroup.room}</p>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Narxi</p>
                      <p className="text-sm font-black text-emerald-600">{new Intl.NumberFormat('uz-UZ').format(selectedGroup.price)} so'm</p>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Davomiyligi</p>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{selectedGroup.startDate} - {selectedGroup.endDate || '...'}</p>
                    </div>
                  </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">O'quvchilar Ro'yxati</h4>
                          <button 
                            onClick={() => setIsAddStudentModalOpen(true)}
                            className="flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            <UserPlus size={14} />
                            Qo'shish
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(students || []).filter(s => (selectedGroup.students || []).includes(s.id)).map(student => (
                            <div key={student.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-700 group/item">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black">
                                  {(student.name || '?').charAt(0)}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                                  <p className="text-[10px] font-bold text-zinc-500">{student.phone}</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleRemoveStudentFromGroup(student.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 opacity-0 group-hover/item:opacity-100 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          {(selectedGroup.students || []).length === 0 && (
                            <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                              <Users size={24} className="mx-auto text-zinc-300 mb-2" />
                              <p className="text-xs font-bold text-zinc-500">Hozircha o'quvchilar yo'q</p>
                            </div>
                          )}
                        </div>
                      </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <button 
                    onClick={() => openModal(selectedGroup)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-blue-600/20"
                  >
                    Tahrirlash
                  </button>
                  <button 
                    onClick={() => handleDelete(selectedGroup.id)}
                    className="flex-1 py-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-xl font-black text-sm hover:bg-rose-100 transition-all"
                  >
                    O'chirish
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formData.id ? 'Guruhni Tahrirlash' : 'Yangi Guruh Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruh Nomi</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="Masalan: PM-101"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fan</label>
                    <select 
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {SUBJECTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'qituvchi</label>
                    <select 
                      value={formData.teacherId}
                      onChange={(e) => {
                        const t = (teachers || []).find(t => t.id === e.target.value);
                        setFormData({...formData, teacherId: e.target.value, teacher: t?.name || ''});
                      }}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="">O'qituvchini tanlang</option>
                      {(teachers || []).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xona</label>
                    <select 
                      value={formData.room}
                      onChange={(e) => setFormData({...formData, room: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {(roomsList || []).length > 0 ? (roomsList || []).map((r, idx) => {
                        const name = typeof r === 'string' ? r : r.name;
                        const key = typeof r === 'string' ? `room-list-str-${r}` : `room-list-obj-${r.id || idx}`;
                        return <option key={key} value={name}>{name}</option>;
                      }) : ROOMS.map(r => (
                        <option key={`room-default-${r}`} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kunlar</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          formData.days?.includes(day)
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vaqt</label>
                    <input 
                      type="text" 
                      value={formData.time}
                      onChange={(e) => setFormData({...formData, time: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="Masalan: 14:00 - 16:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Maksimal O'quvchilar</label>
                    <input 
                      type="number" 
                      value={formData.maxStudents}
                      onChange={(e) => setFormData({...formData, maxStudents: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Boshlanish Sanasi</label>
                    <input 
                      type="date" 
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Narxi (Oylik)</label>
                    <input 
                      type="number" 
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                  >
                    <option value="Faol">Faol</option>
                    <option value="Yangi">Yangi</option>
                    <option value="Tugallangan">Tugallangan</option>
                  </select>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Student to Group Modal */}
      <AnimatePresence>
        {isAddStudentModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">O'quvchi Qo'shish</h3>
                <button onClick={() => setIsAddStudentModalOpen(false)}><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchini tanlang</label>
                  <select 
                    value={selectedStudentToAdd}
                    onChange={(e) => setSelectedStudentToAdd(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                  >
                    <option value="">Tanlang...</option>
                    {(students || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                <button onClick={() => setIsAddStudentModalOpen(false)} className="px-4 py-2 text-sm font-bold text-zinc-500">Bekor qilish</button>
                <button 
                  onClick={handleAddStudentToGroup}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-sm"
                >
                  Qo'shish
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
