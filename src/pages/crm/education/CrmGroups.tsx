import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MoreVertical, Users, Calendar, Clock,
  DoorOpen, BookOpen, X, Edit2, Trash2, Download,
  ChevronRight, UserPlus, GraduationCap, CheckCircle2,
  AlertCircle, LayoutGrid, List as ListIcon, Settings
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { exportToExcel } from '../../../utils/export';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { EmptyState, ErrorState } from '../../../components/States';
import { formatNumber } from '../../../utils/formatters';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

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
  const canManage = getCurrentRoleLevel() >= ROLE_LEVEL.MANAGER;
  const navigate = useNavigate();
  const { data: groups = [], loading: groupsLoading, error: groupsError, refetch: refetchGroups, addDocument, updateDocument, deleteDocument } = useFirestore<Group>('groups');
  const { data: schedule = [], loading: scheduleLoading, error: scheduleError, refetch: refetchSchedule, addDocument: addSchedule, updateDocument: updateSchedule, deleteDocument: deleteSchedule } = useFirestore<any>('schedule');
  const coursesSource = useFirestore<any>('courses');
  // auth/users (barcha maydonlar bilan) ADMIN+ uchun ochiq — TEACHER ham bu
  // sahifani (o'qish uchun) ko'radi, shuning uchun tor, xavfsiz proyeksiya
  // ishlatiladi (bu, ilgari TEACHER uchun butun sahifani "Nosozlik" xatosiga
  // chiqargan edi — dependenciesError HAR BIR ko'ruvchi uchun tekshiriladi,
  // faqat guruh yaratish/tahrirlashga ruxsati borlar uchun emas).
  const teachersSource = useFirestore<any>('auth/users/assignable-teachers');
  const roomsSource = useFirestore<any>('rooms');
  const dependenciesLoading = scheduleLoading || coursesSource.loading || teachersSource.loading || roomsSource.loading;
  const dependenciesError = scheduleError || coursesSource.error || teachersSource.error || roomsSource.error;
  const retryDependencies = () => { void refetchSchedule(); void coursesSource.refetch(); void teachersSource.refetch(); void roomsSource.refetch(); };
  const getEndTime = (start: string, duration: number) => {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + duration;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const { showToast } = useToast();

  // Merge live API data with legacy useFirestore data
  // /auth/users/assignable-teachers allaqachon TEACHER/ADMIN/SUPER_ADMIN'ga
  // filtrlangan holda qaytadi — bu yerda qo'shimcha filtr shart emas.
  const teachers = teachersSource.data;
  const roomsList = roomsSource.data;
  const courseList = coursesSource.data;

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
  const saveBusy = useRef(false);
  const [saveError, setSaveError] = useState('');
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

  const hasScheduleConflict = useMemo(() => {
    if (!scheduleForm.room || scheduleForm.days.length === 0 || !scheduleForm.time) {
      return false;
    }

    let [formStart, formEnd] = scheduleForm.time.split(' - ');
    if (!formEnd && formStart && formStart.length === 5) {
      formEnd = getEndTime(formStart, selectedCourseData?.lessonDuration || 90);
    }
    if (!formStart || !formEnd) return false;

    const formDayNumbers = scheduleForm.days.map(d => DAY_MAP[d]).filter(Boolean);
    if (formDayNumbers.length === 0) return false;

    const timeToMin = (t: string) => {
      const [h, m] = (t || '').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const sMin = timeToMin(formStart);
    const eMin = timeToMin(formEnd);

    return (schedule || []).some((s: any) => {
      if (formData.id && s.groupId === formData.id) return false;
      if (!s.room || !s.days || !s.startTime || !s.endTime) return false;
      if (s.room.trim().toLowerCase() !== scheduleForm.room.trim().toLowerCase()) return false;

      const hasDayOverlap = (s.days || []).some((d: number) => formDayNumbers.includes(d));
      if (!hasDayOverlap) return false;

      const esMin = timeToMin(s.startTime);
      const eeMin = timeToMin(s.endTime);

      return sMin < eeMin && eMin > esMin;
    });
  }, [scheduleForm, formData.id, schedule, selectedCourseData?.lessonDuration, getEndTime]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Guruh nomi kiritilishi shart";
    if (!formData.courseId) errors.courseId = "Kurs tanlanishi shart";
    if (!formData.teacherId) errors.teacherId = "O'qituvchi tanlanishi shart";
    if (!Number.isInteger(formData.maxSize) || (formData.maxSize ?? 0) < 1) {
      errors.maxSize = "Guruh sig'imi kamida 1 bo'lgan butun son bo'lishi shart";
    }
    const enrolledCount = groups.find(g => g.id === formData.id)?._count?.enrollments ?? 0;
    if ((formData.maxSize ?? 0) < enrolledCount) errors.maxSize = `Guruhda ${enrolledCount} o'quvchi bor. Sig'im bundan kam bo'lmasligi kerak`;
    const [start, end] = scheduleForm.time.split(' - ');
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
    if (!validTime(start) || !validTime(end) || start >= end) errors.time = "Dars vaqti noto'g'ri. Dars shu kunning o'zida tugashi kerak";
    if (!formData.startDate) errors.startDate = 'Boshlanish sanasini kiriting';
    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) errors.endDate = 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak';
    if (formData.price != null && (!Number.isFinite(formData.price) || formData.price < 0)) errors.price = 'Narx manfiy bo‘lmagan son bo‘lishi kerak';
    if (hasScheduleConflict) errors.time = 'Bu xona tanlangan kun va vaqtda band. Boshqa xona yoki vaqtni tanlang';
    if (!scheduleForm.room) errors.room = "Xona tanlanishi shart";
    if (scheduleForm.days.length === 0) errors.days = "Kamida bitta dars kuni tanlanishi shart";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!canManage || saveBusy.current || dependenciesLoading || dependenciesError || groupsLoading || groupsError) return;
    if (!validateForm()) {
      showToast("Formadagi xatolarni tuzating", 'error');
      return;
    }

    saveBusy.current = true;
    setSaving(true);
    setSaveError('');
    let groupSaved = false;
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
        name: formData.name?.trim(),
        courseId: formData.courseId,
        teacherId: formData.teacherId,
        status: formData.status,
        maxSize: Number(formData.maxSize),
        price: formData.price ?? null,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
      };

      let groupId = formData.id;
      if (formData.id) {
        await updateDocument(formData.id, groupPayload);
        groupSaved = true;

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
        groupSaved = true;
        // Jadval saqlanmasa, qayta urinish shu guruhni davom ettiradi.
        setFormData(prev => ({ ...prev, id: groupId }));

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
      setIsModalOpen(false);
    } catch (err: any) {
      const message = groupSaved ? 'Guruh saqlandi, lekin dars jadvali saqlanmadi. Saqlash tugmasini bosib qayta urinib ko‘ring.' : err?.response?.data?.message || 'Guruhni saqlashda xatolik yuz berdi. Qayta urinib ko‘ring.';
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      saveBusy.current = false;
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    if (!canManage) return;
    const id = deleteConfirm.id;
    setDeleteConfirm({ open: false, id: '' });
    await deleteDocument(id);
    const existingSchedule = (schedule || []).find((s: any) => s.groupId === id);
    if (existingSchedule) await deleteSchedule(existingSchedule.id);
    showToast('Guruh o\'chirildi', 'success');
  };

  const openModal = (group: Group | null = null) => {
    if (!canManage) return;
    if (dependenciesLoading || dependenciesError) {
      showToast('Avval forma uchun zarur ma’lumotlarni yuklang', 'error');
      return;
    }
    setFormErrors({});
    setSaveError('');
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
    if (saveBusy.current) return;
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

  if (groupsLoading) return <div role="status" className="flex items-center justify-center gap-3 p-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />Guruh ma’lumotlari yuklanmoqda...</div>;
  if (groupsError) return <ErrorState message="Guruhlar yuklanmadi." onRetry={refetchGroups} />;

  return (
    <div className="space-y-6">
      {dependenciesLoading ? <p role="status">Forma ma’lumotlari yuklanmoqda...</p> : dependenciesError ? <ErrorState message="Forma uchun zarur ma’lumotlar yuklanmadi. Yaratish/tahrirlash uchun qayta urinib ko‘ring." onRetry={retryDependencies} /> : null}
      <ConfirmDialog
        isOpen={canManage && deleteConfirm.open}
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
              aria-label="Kartochkalar ko'rinishi"
              aria-pressed={viewMode === 'grid'}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="Jadval ko'rinishi"
              aria-pressed={viewMode === 'list'}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          {canManage && <Button
            onClick={() => openModal()}
            leftIcon={<Plus size={18} />}
          >
            Yangi Guruh
          </Button>}
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
      {viewMode === 'grid' ? (
        filteredGroups.length === 0 ? (
          <EmptyState title="Guruhlar topilmadi" message="Qidiruvni o'zgartiring yoki yangi guruh qo'shing." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGroups.map(group => (
              <article key={group.id} className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-lg font-bold text-slate-900 dark:text-white break-words">
                    <Link to={`/crmtayyorlovmarkaz/groups/${group.id}`} className="hover:text-blue-600 hover:underline focus-visible:outline-blue-500">
                      {group.name}
                    </Link>
                  </h2>
                  <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${
                    group.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : group.status === 'paused' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {group.status === 'active' ? 'Faol' : group.status === 'paused' ? 'Muzlatilgan' : group.status === 'completed' ? 'Tugallangan' : 'Noma\'lum'}
                  </span>
                </div>
                <div className="space-y-3 text-sm text-slate-600 dark:text-zinc-400">
                  <p className="flex items-center gap-2"><BookOpen size={16} className="shrink-0" /><span className="break-words min-w-0">{group.course?.name || 'Kurs belgilanmagan'}</span></p>
                  <p className="flex items-center gap-2"><GraduationCap size={16} className="shrink-0" /><span className="break-words min-w-0">{group.teacher?.name || "O'qituvchi belgilanmagan"}</span></p>
                  <p className="flex items-center gap-2"><Users size={16} className="shrink-0" />O'quvchilar: {group._count?.enrollments ?? 0} / {group.maxSize ?? '—'}</p>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  <span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{formatNumber(group.price ?? group.course?.price ?? 0)} so'm</span>
                  {canManage && <Button variant="ghost" size="sm" leftIcon={<Edit2 size={14} />} onClick={() => openModal(group)} aria-label={`${group.name} guruhini tahrirlash`}>
                    Tahrirlash
                  </Button>}
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
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
                    {formatNumber(displayPrice)} so'm
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
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {canManage && <button aria-label={`${group.name} guruhini tahrirlash`} onClick={(e) => { e.stopPropagation(); openModal(group); }} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors border border-blue-100 dark:border-blue-800">
                        <MoreVertical size={16} />
                      </button>}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      )}

      {/* Group Detail modal removed since it is now handled by CrmGroupDetail route */}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={canManage && isModalOpen}
        onClose={closeModal}
        title={formData.id ? 'Guruhni Tahrirlash' : 'Yangi Guruh Qo\'shish'}
        width="2xl"
      >
        <fieldset disabled={saving} className="space-y-6 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  const start = scheduleForm.time.split(' - ')[0];
                  setScheduleForm(prev => ({ ...prev, time: start ? `${start} - ${getEndTime(start, selected?.lessonDuration || 90)}` : '' }));
                  setFormData({
                    ...formData,
                    courseId: e.target.value,
                    price: selected?.price ?? formData.price,
                  });
                }}
                className={`w-full bg-zinc-50 dark:bg-zinc-800/50 border ${formErrors.courseId ? 'border-rose-400' : 'border-zinc-200 dark:border-zinc-700'} text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">Kursni tanlang...</option>
                {courseList.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.price ? `— ${formatNumber(c.price)} so'm/oy` : ''}</option>
                ))}
              </select>
              {formErrors.courseId && <p className="text-xs font-bold text-rose-500">{formErrors.courseId}</p>}
              {courseList.length === 0 && <p className="text-xs text-amber-600">Avval "Kurslar" bo'limida kurs qo'shing</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 w-full flex flex-col">
              <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                Boshlanish Vaqti {selectedCourseData && `(${selectedCourseData.lessonDuration} daqiqa)`}
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  aria-label="Boshlanish vaqti"
                  value={scheduleForm.time.split(' - ')[0]}
                  onChange={(e) => {
                    const startTime = e.target.value;
                    if (startTime) {
                        const endTime = getEndTime(startTime, selectedCourseData?.lessonDuration || 90);
                        setScheduleForm({ ...scheduleForm, time: `${startTime} - ${endTime}` });
                    } else setScheduleForm({ ...scheduleForm, time: '' });
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-zinc-400 font-bold">-</span>
                <input
                    type="time"
                    aria-label="Tugash vaqti"
                    value={scheduleForm.time.split(' - ')[1] || ''}
                    disabled
                    className="w-full bg-zinc-100 dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-700 text-zinc-500 text-sm rounded-xl px-4 py-2.5 cursor-not-allowed"
                />
              </div>
              {formErrors.time && <p role="alert" className="text-xs font-bold text-rose-500">{formErrors.time}</p>}
            </div>
            <Input
              type="number"
              label="Maksimal O'quvchilar"
              min={1}
              step={1}
              required
              error={formErrors.maxSize}
              value={formData.maxSize ?? ''}
              onChange={(e) => setFormData({ ...formData, maxSize: e.target.value === '' ? undefined : e.target.valueAsNumber })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="date"
              label="Boshlanish Sanasi"
              required
              error={formErrors.startDate}
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
            <Input
              type="date"
              label="Tugash Sanasi"
              min={formData.startDate}
              error={formErrors.endDate}
              value={formData.endDate || ''}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <MoneyInput
                label="Narxi (Oylik)"
                value={formData.price}
                onChange={(price) => setFormData({ ...formData, price })}
                placeholder={formData.price === 0 ? '0' : selectedCourseData?.price ? formatNumber(selectedCourseData.price) : '0'}
              />
              {formErrors.price && <p role="alert" className="text-xs font-bold text-rose-500">{formErrors.price}</p>}
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
                      {tier.name} — {formatNumber(tier.price)}
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

          {hasScheduleConflict && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 text-amber-500" />
              <span>Bu xona tanlangan kun va vaqtda band. Boshqa xona yoki vaqtni tanlang.</span>
            </div>
          )}

          {saveError && <p role="alert" className="text-sm text-rose-600">{saveError}</p>}
          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="ghost" onClick={closeModal} disabled={saving}>Bekor qilish</Button>
            <Button onClick={handleSave} isLoading={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
          </div>
        </fieldset>
      </Modal>
    </div>
  );
}
