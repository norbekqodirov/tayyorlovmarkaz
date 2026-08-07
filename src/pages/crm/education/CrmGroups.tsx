import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MoreVertical, Users, Calendar, Clock,
  DoorOpen, BookOpen, X, Edit2, Trash2, Download,
  ChevronRight, UserPlus, GraduationCap, CheckCircle2,
  AlertCircle, LayoutGrid, List as ListIcon, Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToExcel } from '../../../utils/export';
import { useFirestore } from '../../../hooks/useFirestore';
import { useCrmData } from '../../../hooks/useCrmData';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { EmptyState } from '../../../components/States';

// Prisma `Group` modeliga mos keladigan shakl (server/routes/crud.ts RELATION_INCLUDES
// orqali course/teacher/_count qo'shib qaytaradi). `room`/`days`/`time` Group'da YO'Q —
// ular alohida GroupSchedule ('schedule' collection) yozuvida saqlanadi.
interface Group {
  id: string;
  name: string;
  courseId: string;
  course?: { id: string; name: string; price: number; lessonDuration?: number; duration?: string };
  teacherId: string;
  teacher?: { id: string; name: string };
  status: 'active' | 'completed' | 'paused' | string;
  maxSize: number;
  price?: number | null;
  startDate: string;
  endDate: string;
  _count?: { enrollments: number };
}

const DAYS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'];

export default function CrmGroups() {
  const navigate = useNavigate();
  const { data: groups = [], addDocument, updateDocument, deleteDocument } = useFirestore<Group>('groups');
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
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const emptyForm: Partial<Group> = {
    name: '',
    courseId: '',
    teacherId: '',
    status: 'active',
    maxSize: 15,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    price: undefined,
  };
  const [formData, setFormData] = useState<Partial<Group>>(emptyForm);
  // room/kunlar/vaqt Group modelida YO'Q — GroupSchedule ('schedule' collection)da
  // alohida saqlanadi, shuning uchun formadan mustaqil holatda boshqariladi.
  const [scheduleForm, setScheduleForm] = useState<{ room: string; days: string[]; time: string }>({
    room: '', days: [], time: '09:00 - 11:00',
  });

  const selectedCourseData = courseList.find(c => c.id === formData.courseId);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Guruh nomi kiritilishi shart";
    if (!formData.courseId) errors.courseId = "Kurs tanlanishi shart";
    if (!formData.teacherId) errors.teacherId = "O'qituvchi tanlanishi shart";
    if (!scheduleForm.room) errors.room = "Xona tanlanishi shart";
    if (scheduleForm.days.length === 0) errors.days = "Kamida bitta dars kuni tanlanishi shart";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      showToast("Iltimos, * bilan belgilangan barcha maydonlarni to'ldiring", 'error');
      return;
    }

    setSaving(true);
    try {
      let finalTime = scheduleForm.time || '09:00 - 10:30';
      // If time is just a start time (e.g. "09:00"), calculate the end time
      if (finalTime.length === 5 && finalTime.includes(':')) {
        finalTime = `${finalTime} - ${getEndTime(finalTime, selectedCourseData?.lessonDuration || 90)}`;
      }

      const [startTime, endTime] = finalTime.split(' - ');
      const scheduleDays = scheduleForm.days.map(d => DAY_MAP[d]).filter(Boolean);
      const teacherName = teachers.find((t: any) => t.id === formData.teacherId)?.name || '';

      const groupPayload = {
        name: formData.name,
        courseId: formData.courseId,
        teacherId: formData.teacherId,
        status: formData.status,
        maxSize: Number(formData.maxSize) || 15,
        price: formData.price || null,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
      };

      let groupId = formData.id;
      if (formData.id) {
        await updateDocument(formData.id, groupPayload);

        // Update schedule
        const existingSchedule = (schedule || []).find((s: any) => s.groupId === formData.id);
        if (existingSchedule) {
          await updateSchedule(existingSchedule.id, {
            groupName: formData.name,
            teacher: teacherName,
            room: scheduleForm.room,
            startTime: startTime || '09:00',
            endTime: endTime || '10:30',
            days: scheduleDays,
            groupId: formData.id
          });
        } else {
          await addSchedule({
            groupId: formData.id,
            groupName: formData.name,
            teacher: teacherName,
            room: scheduleForm.room,
            startTime: startTime || '09:00',
            endTime: endTime || '10:30',
            days: scheduleDays,
            color: 'bg-blue-500'
          });
        }
        showToast("Guruh yangilandi", 'success');
      } else {
        groupId = await addDocument(groupPayload as Omit<Group, 'id'>);

        // Add to schedule
        await addSchedule({
          groupId,
          groupName: formData.name,
          teacher: teacherName,
          room: scheduleForm.room,
          startTime: startTime || '09:00',
          endTime: endTime || '10:30',
          days: scheduleDays,
          color: 'bg-blue-500'
        });
        showToast("Guruh yaratildi", 'success');
      }
      closeModal();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Guruhni saqlashda xatolik yuz berdi', 'error');
    } finally {
      setSaving(false);
    }
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
    showToast('Guruh o\'chirildi', 'success');
  };

  const openModal = (group: Group | null = null) => {
    setFormErrors({});
    if (group) {
      setFormData({
        id: group.id,
        name: group.name,
        courseId: group.courseId || (group as any).course?.id || '',
        teacherId: group.teacherId || (group as any).teacher?.id || '',
        status: group.status,
        maxSize: group.maxSize,
        price: group.price,
        startDate: group.startDate,
        endDate: group.endDate,
      });
      // Shu guruhga tegishli GroupSchedule yozuvini topib room/kunlar/vaqtni oldindan to'ldiramiz
      const existingSchedule = (schedule || []).find((s: any) => s.groupId === group.id);
      if (existingSchedule) {
        const dayNames = (existingSchedule.days || [])
          .map((n: number) => Object.keys(DAY_MAP).find(k => DAY_MAP[k] === n))
          .filter(Boolean) as string[];
        setScheduleForm({
          room: existingSchedule.room || '',
          days: dayNames,
          time: `${existingSchedule.startTime || '09:00'} - ${existingSchedule.endTime || '10:30'}`,
        });
      } else {
        setScheduleForm({ room: '', days: [], time: '09:00 - 11:00' });
      }
    } else {
      setFormData(emptyForm);
      setScheduleForm({ room: '', days: [], time: '09:00 - 11:00' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const toggleDay = (day: string) => {
    setScheduleForm(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
    }));
  };

  const filteredGroups = useMemo(() => {
    return (groups || []).filter(g =>
      (g.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.course?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.teacher?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groups, searchTerm]);

  // O'quvchi qo'shish/olib tashlash — guruh ichidagi to'liq boshqaruv (davomat, baholash
  // bilan birga) uchun guruh tafsilot sahifasiga o'tiladi (/groups/:id, CrmGroupDetail.tsx),
  // u yerda /api/enrollments orqali to'g'ri ishlaydigan enroll UI allaqachon bor.

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
        <StatCard variant="gradient" color="blue" label="Jami Guruhlar" value={(groups || []).length} sub="Ro'yxatda" icon={<Users size={18} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="emerald" label="Faol Guruhlar" value={(groups || []).filter(g => g.status === 'active').length} sub="Hozir o'qiyotgan" icon={<CheckCircle2 size={18} strokeWidth={2.5} />} />
        <StatCard
          variant="gradient" color="amber" label="O'rtacha To'lish"
          value={(groups || []).length > 0 ? Math.round((groups || []).reduce((acc, g) => acc + ((g._count?.enrollments || 0) / (g.maxSize || 1) * 100), 0) / (groups || []).length) + '%' : '0%'}
          sub="O'rin band" icon={<GraduationCap size={18} strokeWidth={2.5} />}
        />
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
        <button onClick={() => {
          const exportData = filteredGroups.map(g => {
            const sched = (schedule || []).find((s: any) => s.groupId === g.id);
            const dayNames: string[] = (sched?.days || [])
              .map((n: number) => Object.keys(DAY_MAP).find(k => DAY_MAP[k] === n))
              .filter(Boolean) as string[];
            return {
              name: g.name,
              subject: g.course?.name || '',
              teacher: g.teacher?.name || '',
              room: sched?.room || '',
              daysStr: dayNames.join(', '),
              time: sched ? `${sched.startTime} - ${sched.endTime}` : '',
              studentCount: g._count?.enrollments || 0,
              maxSize: g.maxSize,
              status: g.status,
              price: (g.price ?? g.course?.price) ? Number(g.price ?? g.course?.price).toLocaleString() + ' UZS' : '',
              startDate: g.startDate,
            };
          });
          exportToExcel(exportData, [
            { header: 'Guruh nomi', key: 'name', width: 25 },
            { header: "Fan", key: 'subject', width: 20 },
            { header: "O'qituvchi", key: 'teacher', width: 20 },
            { header: 'Xona', key: 'room', width: 12 },
            { header: 'Kunlar', key: 'daysStr', width: 18 },
            { header: 'Vaqt', key: 'time', width: 12 },
            { header: "O'quvchilar", key: 'studentCount', width: 12 },
            { header: "Sig'im", key: 'maxSize', width: 10 },
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
                const count = group._count?.enrollments || 0;
                const max = group.maxSize || 15;
                const groupSchedule = (schedule || []).find((s: any) => s.groupId === group.id);
                const dayNames: string[] = (groupSchedule?.days || [])
                  .map((n: number) => Object.keys(DAY_MAP).find(k => DAY_MAP[k] === n))
                  .filter(Boolean) as string[];
                const displayPrice = group.price ?? group.course?.price ?? 0;
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
                    {new Intl.NumberFormat('uz-UZ').format(displayPrice)} so'm
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700 dark:text-zinc-300">
                    {groupSchedule ? `${groupSchedule.startTime} - ${groupSchedule.endTime}` : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">{group.course?.name || '—'}</span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">[{groupSchedule?.room || '—'}]</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {group.teacher?.name || '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1.5 flex-wrap w-fit">
                      {dayNames.map(d => (
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
              required
              error={formErrors.name}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Masalan: PM-101"
            />
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Kurs (Fan)<span className="text-red-500 ml-0.5">*</span></label>
              <select
                value={formData.courseId || ''}
                onChange={(e) => {
                  const selected = courseList.find(c => c.id === e.target.value);
                  setFormData({
                    ...formData,
                    courseId: e.target.value,
                    price: selected?.price || formData.price,
                  });
                }}
                className={`w-full bg-zinc-50 dark:bg-zinc-800/50 border ${formErrors.courseId ? 'border-rose-400' : 'border-zinc-200 dark:border-zinc-700'} text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">Kursni tanlang...</option>
                {courseList.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.price ? `— ${new Intl.NumberFormat('uz-UZ').format(c.price)} so'm/oy` : ''}</option>
                ))}
              </select>
              {formErrors.courseId && <p className="text-xs font-bold text-rose-500">{formErrors.courseId}</p>}
              {courseList.length === 0 && <p className="text-xs text-amber-600">Avval "Kurslar" bo'limida kurs qo'shing</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">O'qituvchi<span className="text-red-500 ml-0.5">*</span></label>
              <select
                value={formData.teacherId || ''}
                onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                className={`w-full bg-zinc-50 dark:bg-zinc-800/50 border ${formErrors.teacherId ? 'border-rose-400' : 'border-zinc-200 dark:border-zinc-700'} text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">O'qituvchini tanlang</option>
                {teachers.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {formErrors.teacherId && <p className="text-xs font-bold text-rose-500">{formErrors.teacherId}</p>}
            </div>
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Xona<span className="text-red-500 ml-0.5">*</span></label>
              <select
                value={scheduleForm.room}
                onChange={(e) => setScheduleForm({ ...scheduleForm, room: e.target.value })}
                className={`w-full bg-zinc-50 dark:bg-zinc-800/50 border ${formErrors.room ? 'border-rose-400' : 'border-zinc-200 dark:border-zinc-700'} text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">Xonani tanlang</option>
                {roomsList.length > 0 ? roomsList.map((r: any, idx: number) => {
                  const name = typeof r === 'string' ? r : (r.name || r.number || `Xona ${idx + 1}`);
                  const key = typeof r === 'string' ? `r-${r}` : `r-${r.id || idx}`;
                  return <option key={key} value={name}>{name}</option>;
                }) : <option value="" disabled>Avval xona qo'shing</option>}
              </select>
              {formErrors.room && <p className="text-xs font-bold text-rose-500">{formErrors.room}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kunlar<span className="text-red-500 ml-0.5">*</span></label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${scheduleForm.days.includes(day)
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>
            {formErrors.days && <p className="text-xs font-bold text-rose-500">{formErrors.days}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 w-full flex flex-col">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                Boshlanish Vaqti {selectedCourseData && `(${selectedCourseData.lessonDuration} daqiqa)`}
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={(scheduleForm.time || '09:00').split(' - ')[0]}
                  onChange={(e) => {
                    const startTime = e.target.value;
                    if (startTime) {
                        const endTime = getEndTime(startTime, selectedCourseData?.lessonDuration || 90);
                        setScheduleForm({ ...scheduleForm, time: `${startTime} - ${endTime}` });
                    }
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-zinc-400 font-bold">-</span>
                <input
                    type="time"
                    value={(scheduleForm.time || '09:00 - 10:30').split(' - ')[1] || ''}
                    disabled
                    className="w-full bg-zinc-100 dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-sm rounded-xl px-4 py-2.5 cursor-not-allowed"
                />
              </div>
            </div>
            <Input
              type="number"
              label="Maksimal O'quvchilar"
              value={formData.maxSize ?? ''}
              onChange={(e) => setFormData({ ...formData, maxSize: Number(e.target.value) })}
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
              type="date"
              label="Tugash Sanasi"
              value={formData.endDate || ''}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <MoneyInput
                label="Narxi (Oylik)"
                value={formData.price}
                onChange={(price) => setFormData({ ...formData, price })}
                placeholder={selectedCourseData?.price ? new Intl.NumberFormat('uz-UZ').format(selectedCourseData.price) : '0'}
              />
              {selectedCourseData?.tiers?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCourseData.tiers.map((tier: any) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, price: tier.price })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        formData.price === tier.price
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {tier.name} — {new Intl.NumberFormat('uz-UZ').format(tier.price)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Holat</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Faol</option>
                <option value="paused">Muzlatilgan</option>
                <option value="completed">Tugallangan</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Bekor qilish</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
