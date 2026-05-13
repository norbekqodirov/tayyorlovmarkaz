import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MoreVertical, Users, Calendar, Clock,
  DoorOpen, BookOpen, X, Edit2, Trash2, Filter, Download,
  ChevronRight, UserPlus, GraduationCap, CheckCircle2,
  AlertCircle, LayoutGrid, List as ListIcon, Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  courseId: string;
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
  const navigate = useNavigate();
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
    courseId: '',
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
        courseId: '',
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
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-800/30">
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">T/R</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nomi</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Narx</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dars vaqti</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'qituvchilar</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dars kunlari</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'tilganlik ko'rsatkichi</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Boshlanish sanasi</th>
                <th className="px-5 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(filteredGroups || []).map((group, idx) => {
                const count = (group.students || []).length;
                const max = group.maxStudents || 15;
                // calculate fake progress for now
                const _start = new Date(group.startDate).getTime();
                const _now = Date.now();
                const _end = group.endDate ? new Date(group.endDate).getTime() : _start + 90 * 24 * 60 * 60 * 1000;
                const progressPct = Math.min(100, Math.max(0, Math.round(((_now - _start) / (_end - _start)) * 100)));
                const passedLessons = Math.round((progressPct / 100) * 36);

                return (
                <tr
                  key={group.id}
                  onClick={() => navigate(`/crmtayyorlovmarkaz/groups/${group.id}`)}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-5 py-4 text-sm font-bold text-zinc-400">
                    {idx + 1}.
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                       <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline">{group.name}</span>
                       <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">[{max}]</span>
                       <span className="text-xs font-bold text-blue-500">[{count}]</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-700 dark:text-zinc-300">
                    {new Intl.NumberFormat('uz-UZ').format(group.price)} so'm
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700 dark:text-zinc-300">
                    {group.time}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">{group.subject}</span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">[{typeof group.room === 'object' ? (group.room as any).name : group.room}]</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {group.teacher}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1.5 flex-wrap w-fit">
                      {(group.days || []).map(d => (
                         <span key={d} className="px-2 py-1 rounded bg-emerald-500 text-white text-[10px] font-bold">{d}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 min-w-[150px]">
                    <div className="w-full flex items-center justify-between border border-amber-400 p-0.5 rounded-full overflow-hidden relative h-5">
                       <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${progressPct}%` }}></div>
                       <span className="relative w-full text-center text-[10px] font-black text-slate-800 z-10 block">{passedLessons} - {progressPct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700 dark:text-zinc-300">
                    {group.startDate}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openModal(group); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors border border-blue-100 dark:border-blue-800">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Detail modal removed since it is now handled by CrmGroupDetail route */}

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
                    courseId: selected?.id || '',
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
