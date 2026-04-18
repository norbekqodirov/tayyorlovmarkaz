import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MoreVertical, Users, Calendar, Clock,
  DoorOpen, BookOpen, X, Edit2, Trash2, Filter, Download,
  ChevronRight, UserPlus, GraduationCap, CheckCircle2,
  AlertCircle, LayoutGrid, List as ListIcon, Settings
} from 'lucide-react';
import { exportToExcel } from '../../utils/export';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/States';

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

export default function CrmGroups() {
  const { data: groups = [], addDocument, updateDocument, deleteDocument } = useFirestore<Group>('groups');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: schedule = [], addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } = useFirestore<any>('schedule');
  const { courses: liveCourses, teachers: liveTeachers, rooms: liveRooms, getEndTime } = useCrmData();
  const { showToast } = useToast();

  // Merge live API data with legacy useFirestore data
  const teachers = liveTeachers.length > 0 ? liveTeachers : [];
  const roomsList = liveRooms.length > 0 ? liveRooms : [];
  const courseList = liveCourses.length > 0 ? liveCourses : [];

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

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

  const selectedCourseData = courseList.find(c => c.name === formData.subject);

  const handleSave = async () => {
    if (!formData.name) return;

    let finalTime = formData.time || '09:00 - 10:30';
    // If time is just a start time (e.g. "09:00"), calculate the end time
    if (finalTime.length === 5 && finalTime.includes(':')) {
       finalTime = `${finalTime} - ${getEndTime(finalTime, selectedCourseData?.lessonDuration || 90)}`;
    }

    const roomName = typeof formData.room === 'object' ? (formData.room as any).name : formData.room;
    const [startTime, endTime] = finalTime.split(' - ');
    const scheduleDays = (formData.days || []).map(d => DAY_MAP[d]).filter(Boolean);

    let groupId = formData.id;
    if (formData.id) {
      await updateDocument(formData.id, { ...formData, time: finalTime, room: roomName, students: formData.students ?? selectedGroup?.students ?? [] });
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

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    const id = deleteConfirm.id;
    setDeleteConfirm({ open: false, id: '' });
    await deleteDocument(id);
    const existingSchedule = (schedule || []).find((s: any) => s.groupId === id);
    if (existingSchedule) await deleteSchedule(existingSchedule.id);
    if (selectedGroup?.id === id) setIsDetailOpen(false);
    showToast('Guruh o\'chirildi', 'success');
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

  const handleAddStudentToGroup = async () => {
    if (!selectedStudentToAdd || !selectedGroup) return;

    if ((selectedGroup.students || []).includes(selectedStudentToAdd)) {
      showToast('Ushbu o\'quvchi allaqachon guruhda bor!', 'error');
      return;
    }

    if ((selectedGroup.students || []).length >= (selectedGroup.maxStudents || 15)) {
      showToast('Guruhda joy qolmagan!', 'error');
      return;
    }

    const updatedStudents = [...(selectedGroup.students || []), selectedStudentToAdd];
    await updateDocument(selectedGroup.id, { students: updatedStudents });
    setSelectedGroup({ ...selectedGroup, students: updatedStudents });
    setIsAddStudentModalOpen(false);
    setSelectedStudentToAdd('');
  };

  const handleRemoveStudentFromGroup = async (studentId: string) => {
    if (!selectedGroup) return;
    const updatedStudents = (selectedGroup.students || []).filter(id => id !== studentId);
    await updateDocument(selectedGroup.id, { students: updatedStudents });
    setSelectedGroup({ ...selectedGroup, students: updatedStudents });
    showToast('O\'quvchi guruhdan chiqarildi', 'success');
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Guruhni o'chirish"
        message="Haqiqatan ham bu guruhni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Guruhlar Boshqaruvi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">O'quv markazidagi barcha faol va yangi guruhlar nazorati</p>
        </div>
        <div className="flex gap-2">
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
          <Button
            onClick={() => openModal()}
            leftIcon={<Plus size={18} />}
          >
            Yangi Guruh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Jami Guruhlar', value: (groups || []).length, icon: Users, gradient: 'from-blue-500 to-indigo-600', sub: 'Ro\'yxatda' },
          { label: 'Faol Guruhlar', value: (groups || []).filter(g => g.status === 'Faol').length, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-600', sub: 'Hozir o\'qiyotgan' },
          { label: 'O\'rtacha To\'lish', value: (groups || []).length > 0 ? Math.round((groups || []).reduce((acc, g) => acc + ((g.students?.length || 0) / (g.maxStudents || 1) * 100), 0) / (groups || []).length) + '%' : '0%', icon: GraduationCap, gradient: 'from-amber-500 to-orange-600', sub: 'O\'rin band' }
        ].map((stat, i) => (
          <div key={i} className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-5 shadow-lg text-white relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white/5 -mr-6 -mt-6" />
            <div className="relative flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 shrink-0">
                <stat.icon size={18} strokeWidth={2.5} />
              </div>
            </div>
            <div className="relative mt-3">
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-black text-white mt-1">{stat.value}</p>
              <p className="text-[10px] text-white/60 mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="bg-white dark:bg-[#111118] p-3 rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <Input
            leftIcon={<Search size={18} />}
            placeholder="Guruh nomi, fan yoki ustoz bo'yicha qidirish..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="secondary" leftIcon={<Filter size={18} />}>
          Filtrlar
        </Button>
        <button onClick={() => {
          const exportData = filteredGroups.map(g => ({
            ...g,
            daysStr: Array.isArray(g.days) ? g.days.join(', ') : '',
            studentCount: Array.isArray(g.students) ? g.students.length : 0,
            price: g.price ? Number(g.price).toLocaleString() + ' UZS' : '',
          }));
          exportToExcel(exportData, [
            { header: 'Guruh nomi', key: 'name', width: 25 },
            { header: "Fan", key: 'subject', width: 20 },
            { header: "O'qituvchi", key: 'teacher', width: 20 },
            { header: 'Xona', key: 'room', width: 12 },
            { header: 'Kunlar', key: 'daysStr', width: 18 },
            { header: 'Vaqt', key: 'time', width: 12 },
            { header: "O'quvchilar", key: 'studentCount', width: 12 },
            { header: "Sig'im", key: 'maxStudents', width: 10 },
            { header: 'Holat', key: 'status', width: 12 },
            { header: 'Narx', key: 'price', width: 15 },
            { header: 'Boshlanish', key: 'startDate', width: 15 },
          ], 'Guruhlar');
        }}
          className="p-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all" title="Excel yuklab olish">
          <Download size={16} />
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
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${group.status === 'Faol'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                    {group.status}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                    <Calendar size={16} className="text-blue-500" />
                    {(group.days || []).join(', ')}
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
                  {/* Capacity with color coding and full badge */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchilar</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-black ${
                        (group.students || []).length >= (group.maxStudents || 15) ? 'text-rose-600' :
                        (group.students || []).length >= (group.maxStudents || 15) * 0.8 ? 'text-amber-600' :
                        'text-slate-900 dark:text-white'
                      }`}>{(group.students || []).length} / {group.maxStudents || 15}</span>
                      {(group.students || []).length >= (group.maxStudents || 15) && (
                        <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded text-[9px] font-black uppercase">To'ldi!</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (group.students || []).length >= (group.maxStudents || 15) ? 'bg-rose-500' :
                        (group.students || []).length >= (group.maxStudents || 15) * 0.8 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, ((group.students || []).length / (group.maxStudents || 1)) * 100)}%` }}
                    />
                  </div>

                  {/* Lesson progress based on start/end date */}
                  {group.startDate && group.endDate && (() => {
                    const start = new Date(group.startDate).getTime();
                    const end = new Date(group.endDate).getTime();
                    const now = Date.now();
                    const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
                    return (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Dars Progressi</span>
                          <span className="text-[10px] font-black text-blue-600">{progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })()}
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
                        <Calendar size={12} /> {(group.days || []).join(', ')}
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
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${group.status === 'Faol'
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
      <Modal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        title={formData.id ? 'Guruhni Tahrirlash' : 'Yangi Guruh Qo\'shish'}
        width="2xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Guruh Nomi"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Masalan: PM-101"
            />
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Kurs (Fan)</label>
              <select
                value={formData.subject}
                onChange={(e) => {
                  const selected = courseList.find(c => c.name === e.target.value);
                  setFormData({
                    ...formData,
                    subject: e.target.value,
                    price: selected?.price || formData.price || 0,
                  });
                }}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Kursni tanlang...</option>
                {courseList.length > 0 ? courseList.map(c => (
                  <option key={c.id} value={c.name}>{c.name} {c.price ? `— ${new Intl.NumberFormat('uz-UZ').format(c.price)} so'm/oy` : ''}</option>
                )) : SUBJECTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">O'qituvchi</label>
              <select
                value={formData.teacherId}
                onChange={(e) => {
                  const t = teachers.find((t: any) => t.id === e.target.value);
                  setFormData({ ...formData, teacherId: e.target.value, teacher: t?.name || '' });
                }}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">O'qituvchini tanlang</option>
                {teachers.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Xona</label>
              <select
                value={formData.room}
                onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Xonani tanlang</option>
                {roomsList.length > 0 ? roomsList.map((r: any, idx: number) => {
                  const name = typeof r === 'string' ? r : (r.name || r.number || `Xona ${idx + 1}`);
                  const key = typeof r === 'string' ? `r-${r}` : `r-${r.id || idx}`;
                  return <option key={key} value={name}>{name}</option>;
                }) : <option value="" disabled>Avval xona qo'shing</option>}
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${formData.days?.includes(day)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 w-full flex flex-col">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                Boshlanish Vaqti {selectedCourseData && `(${selectedCourseData.lessonDuration} daqiqa)`}
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={(formData.time || '09:00').split(' - ')[0]}
                  onChange={(e) => {
                    const startTime = e.target.value;
                    if (startTime) {
                        const endTime = getEndTime(startTime, selectedCourseData?.lessonDuration || 90);
                        setFormData({ ...formData, time: `${startTime} - ${endTime}` });
                    }
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-zinc-400 font-bold">-</span>
                <input
                    type="time"
                    value={(formData.time || '09:00 - 10:30').split(' - ')[1] || ''}
                    disabled
                    className="w-full bg-zinc-100 dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-sm rounded-xl px-4 py-2.5 cursor-not-allowed"
                />
              </div>
            </div>
            <Input
              type="number"
              label="Maksimal O'quvchilar"
              value={formData.maxStudents}
              onChange={(e) => setFormData({ ...formData, maxStudents: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="date"
              label="Boshlanish Sanasi"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
            <Input
              type="number"
              label="Narxi (Oylik)"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5 flex flex-col w-full">
            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Holat</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Faol">Faol</option>
              <option value="Yangi">Yangi</option>
              <option value="Tugallangan">Tugallangan</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="ghost" onClick={closeModal}>Bekor qilish</Button>
            <Button onClick={handleSave}>Saqlash</Button>
          </div>
        </div>
      </Modal>

      {/* Add Student to Group Modal */}
      <Modal 
        isOpen={isAddStudentModalOpen} 
        onClose={() => setIsAddStudentModalOpen(false)} 
        title="O'quvchi Qo'shish"
      >
        <div className="space-y-4">
          <div className="space-y-1.5 flex flex-col w-full">
            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">O'quvchini tanlang</label>
            <select
              value={selectedStudentToAdd}
              onChange={(e) => setSelectedStudentToAdd(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tanlang...</option>
              {(students || []).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
              ))}
            </select>
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="ghost" onClick={() => setIsAddStudentModalOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleAddStudentToGroup}>Qo'shish</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
