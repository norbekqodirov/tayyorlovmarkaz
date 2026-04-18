import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, X, Check, Users, DollarSign,
  BookOpen, Phone, Mail, MapPin, Calendar,
  User, GraduationCap,
  AlertCircle, Download, Send, ExternalLink, Copy
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Pagination from '../../components/Pagination';
import { SkeletonTable } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/States';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { exportToExcel, exportToPDF, exportCertificateToPDF } from '../../utils/export';
import { useCrmData } from '../../hooks/useCrmData';

interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  birthDate: string;
  parentName: string;
  parentPhone: string;
  course: string;
  group: string;
  paymentStatus: 'Tolov qilingan' | 'Qarzdorlik' | 'Kutilmoqda';
  balance: number;
  status: 'Faol' | 'Muzlatilgan' | 'Tark etgan' | 'Bitiruvchi';
  joinedDate: string;
  notes: string;
}

export default function CrmStudents() {
  const { data: students = [], loading, error, addDocument, updateDocument, deleteDocument, refetch } = useFirestore<Omit<Student, 'id'>>('students');
  const { data: groups = [], updateDocument: updateGroup } = useFirestore<any>('groups');
  const { courses: liveCourses, groups: liveGroups } = useCrmData();
  const courseOptions = liveCourses.length > 0 ? liveCourses : [];
  const groupOptions = liveGroups.length > 0 ? liveGroups : (groups || []);
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Barchasi');
  const [filterCourse, setFilterCourse] = useState<string>('Barchasi');
  const [filterGroup, setFilterGroup] = useState<string>('Barchasi');
  const [filterPayment, setFilterPayment] = useState<string>('Barchasi');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const itemsPerPage = 20;
  
  const [formData, setFormData] = useState<Partial<Student>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    birthDate: '',
    parentName: '',
    parentPhone: '',
    course: '',
    group: '',
    paymentStatus: 'Kutilmoqda',
    balance: 0,
    status: 'Faol',
    joinedDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const handleSave = async () => {
    if (!formData.name) {
      showToast("O'quvchi ismi kiritilishi shart!", 'error');
      return;
    }
    if (!formData.phone) {
      showToast("Telefon raqam kiritilishi shart!", 'error');
      return;
    }

    try {
      const studentData = { ...formData } as Omit<Student, 'id'>;
      if (formData.id) {
        // Handle group change: remove from old group, add to new group
        const oldStudent = (students || []).find((s: any) => s.id === formData.id) as any;
        const oldGroupName = oldStudent?.group || '';
        const newGroupName = formData.group || '';
        if (oldGroupName !== newGroupName) {
          // Remove from old group
          if (oldGroupName) {
            const oldGroup = (groups || []).find((g: any) => g.name === oldGroupName);
            if (oldGroup) {
              const updated = (oldGroup.students || []).filter((sid: string) => sid !== formData.id);
              await updateGroup(oldGroup.id, { students: updated });
            }
          }
          // Add to new group
          if (newGroupName) {
            const newGroup = (groups || []).find((g: any) => g.name === newGroupName);
            if (newGroup && !(newGroup.students || []).includes(formData.id)) {
              await updateGroup(newGroup.id, { students: [...(newGroup.students || []), formData.id] });
            }
          }
        }
        await updateDocument(formData.id, studentData);
        showToast("O'quvchi ma'lumotlari yangilandi", 'success');
      } else {
        const newId = await addDocument(studentData);
        // Add student to group's students array
        if (formData.group && newId) {
          const group = (groups || []).find((g: any) => g.name === formData.group);
          if (group) {
            await updateGroup(group.id, { students: [...(group.students || []), newId] });
          }
        }
        showToast("Yangi o'quvchi qo'shildi", 'success');
      }
      closeModal();
    } catch (error) {
      console.error("Error saving student:", error);
      showToast("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.", 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    const id = deleteConfirm.id;
    setDeleteConfirm({ open: false, id: '' });
    try {
      const student = (students || []).find(s => s.id === id);
      if (student && student.group) {
        const group = (groups || []).find((g: any) => g.name === student.group);
        if (group) {
          const updatedStudents = (group.students || []).filter((sid: string) => sid !== id);
          await updateGroup(group.id, { students: updatedStudents });
        }
      }
      await deleteDocument(id);
      if (selectedStudent?.id === id) setIsDetailOpen(false);
      showToast("O'quvchi o'chirildi", 'success');
    } catch (error) {
      console.error("Error deleting student:", error);
      showToast("O'chirishda xatolik yuz berdi.", 'error');
    }
  };

  const openModal = (student: Student | null = null) => {
    if (student) {
      setFormData(student);
    } else {
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        birthDate: '',
        parentName: '',
        parentPhone: '',
        course: '',
        group: '',
        paymentStatus: 'Kutilmoqda',
        balance: 0,
        status: 'Faol',
        joinedDate: new Date().toISOString().split('T')[0],
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const filteredStudents = useMemo(() => {
    return (students || []).filter(s => {
      const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.phone || '').includes(searchTerm) ||
                          (s.group || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'Barchasi' || s.status === filterStatus;
      const matchesCourse = filterCourse === 'Barchasi' || s.course === filterCourse;
      const matchesPayment = filterPayment === 'Barchasi' || s.paymentStatus === filterPayment;
      return matchesSearch && matchesStatus && matchesCourse && matchesPayment;
    });
  }, [students, searchTerm, filterStatus, filterCourse, filterPayment]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage]);

  const stats = {
    total: (students || []).length,
    active: (students || []).filter(s => s.status === 'Faol').length,
    debtors: (students || []).filter(s => s.paymentStatus === 'Qarzdorlik').length,
    totalBalance: (students || []).reduce((acc, s) => acc + (s.balance || 0), 0)
  };

  if (error) return <ErrorState message="Sinxronizatsiyada xatolik yuz berdi" onRetry={refetch} />;
  if (loading) return <SkeletonTable rows={8} cols={5} />;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="O'quvchini o'chirish"
        message="Haqiqatan ham bu o'quvchini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">O'quvchilar Boshqaruvi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Markaz o'quvchilari, ularning natijalari va to'lovlari</p>
        </div>
        <div className="flex gap-2">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">
              <Download size={18} />
              Eksport
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
              <button onClick={() => {
                const cols = [
                  { header: 'Ism', key: 'name', width: 25 },
                  { header: 'Telefon', key: 'phone', width: 15 },
                  { header: 'Guruh', key: 'group', width: 15 },
                  { header: 'Holat', key: 'status', width: 12 },
                  { header: "To'lov", key: 'paymentStatus', width: 15 },
                ];
                exportToExcel(filteredStudents, cols, "Oqquchilar");
                showToast("Excel fayl yuklab olindi", 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-t-xl transition-colors">
                Excel (.xlsx)
              </button>
              <button onClick={() => {
                const cols = [
                  { header: 'Ism', key: 'name' },
                  { header: 'Telefon', key: 'phone' },
                  { header: 'Guruh', key: 'group' },
                  { header: 'Holat', key: 'status' },
                  { header: "To'lov", key: 'paymentStatus' },
                ];
                exportToPDF(filteredStudents, cols, "O'quvchilar ro'yxati", "Oqquchilar");
                showToast("PDF fayl yuklab olindi", 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-b-xl transition-colors">
                PDF (.pdf)
              </button>
            </div>
          </div>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />
            Yangi O'quvchi
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Jami O\'quvchilar', value: stats.total, icon: Users, gradient: 'from-blue-500 to-indigo-600', sub: 'Ro\'yxatdagi jami' },
          { label: 'Faol O\'quvchilar', value: stats.active, icon: GraduationCap, gradient: 'from-emerald-500 to-teal-600', sub: 'Hozir o\'qiyotgan' },
          { label: 'Qarzdorlar', value: stats.debtors, icon: AlertCircle, gradient: 'from-rose-500 to-red-600', sub: 'To\'lov qilmagan' },
          { label: 'Umumiy Balans', value: new Intl.NumberFormat('uz-UZ').format(stats.totalBalance), icon: DollarSign, gradient: 'from-amber-500 to-orange-600', sub: 'so\'m' }
        ].map((stat, i) => (
          <div key={i} className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-4 shadow-lg text-white relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white/5 -mr-6 -mt-6" />
            <div className="relative flex items-start justify-between">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/20 shrink-0">
                <stat.icon size={17} strokeWidth={2.5} />
              </div>
            </div>
            <div className="relative mt-3">
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-black text-white mt-0.5 truncate">{stat.value}</p>
              <p className="text-[10px] text-white/60 mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters and Table */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Ism, telefon yoki guruh bo'yicha qidirish..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha holatlar</option>
                <option value="Faol">Faol</option>
                <option value="Muzlatilgan">Muzlatilgan</option>
                <option value="Tark etgan">Tark etgan</option>
                <option value="Bitiruvchi">Bitiruvchi</option>
              </select>
              <select
                value={filterCourse}
                onChange={(e) => { setFilterCourse(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha kurslar</option>
                {courseOptions.map((c: any) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterPayment}
                onChange={(e) => { setFilterPayment(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha to'lovlar</option>
                <option value="Tolov qilingan">To'lov qilingan</option>
                <option value="Qarzdorlik">Qarzdorlik</option>
                <option value="Kutilmoqda">Kutilmoqda</option>
              </select>
              {selectedIds.size > 0 && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`${selectedIds.size} ta o'quvchini o'chirasizmi?`)) return;
                    for (const id of selectedIds) await deleteDocument(id);
                    setSelectedIds(new Set());
                    showToast(`${selectedIds.size} ta o'quvchi o'chirildi`, 'success');
                  }}
                  className="px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-black hover:bg-rose-700 transition-colors"
                >
                  <Trash2 size={16} className="inline mr-1.5" />
                  {selectedIds.size} ta o'chirish
                </button>
              )}
            </div>
          </div>
          {filteredStudents.length > 0 && (
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {filteredStudents.length} ta o'quvchi topildi
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedIds.has(s.id))}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      paginatedStudents.forEach(s => e.target.checked ? next.add(s.id) : next.delete(s.id));
                      setSelectedIds(next);
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs va Guruh</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov Holati</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Balans</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(paginatedStudents || []).length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState 
                      title={searchTerm || filterStatus !== 'Barchasi' ? "Hech narsa topilmadi" : "O'quvchilar yo'q"} 
                      message={searchTerm || filterStatus !== 'Barchasi' ? "Qidiruv shartiga mos o'quvchi topilmadi." : "Hali ro'yxatda o'quvchi mavjud emas."} 
                      actionLabel={!searchTerm && filterStatus === 'Barchasi' ? "+ O'quvchi qo'shish" : undefined}
                      onAction={() => openModal()}
                    />
                  </td>
                </tr>
              ) : (
              (paginatedStudents || []).map((student) => (
                <tr
                  key={student.id}
                  onClick={() => { setSelectedStudent(student); setIsDetailOpen(true); }}
                  className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group ${selectedIds.has(student.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(student.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(student.id) : next.delete(student.id);
                        setSelectedIds(next);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                        {(student.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 dark:text-white tracking-tight">{student.name}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{student.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{student.course}</span>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{student.group}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      student.paymentStatus === 'Tolov qilingan' 
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : student.paymentStatus === 'Qarzdorlik'
                        ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    }`}>
                      {student.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-black ${student.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {new Intl.NumberFormat('uz-UZ').format(student.balance)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      student.status === 'Faol'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : student.status === 'Muzlatilgan'
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : student.status === 'Bitiruvchi'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); openModal(student); }}
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
                        className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredStudents.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Student Detail Sidebar */}
      <AnimatePresence>
        {isDetailOpen && selectedStudent && (
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
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">O'quvchi Profili</h2>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-24 h-24 rounded-3xl bg-blue-600 text-white flex items-center justify-center text-3xl font-black shadow-xl shadow-blue-600/20">
                    {(selectedStudent.name || '?').charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedStudent.name}</h3>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{selectedStudent.group}</p>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <p className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">ID: {selectedStudent.id}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Balans</p>
                    <p className={`text-lg font-black ${selectedStudent.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {new Intl.NumberFormat('uz-UZ').format(selectedStudent.balance)}
                    </p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Holat</p>
                    <p className="text-lg font-black text-blue-600">{selectedStudent.status}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Aloqa Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Phone size={16} className="text-zinc-400" />
                        {selectedStudent.phone}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Mail size={16} className="text-zinc-400" />
                        {selectedStudent.email}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <MapPin size={16} className="text-zinc-400" />
                        {selectedStudent.address}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Ota-ona Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <User size={16} className="text-zinc-400" />
                        {selectedStudent.parentName}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Phone size={16} className="text-zinc-400" />
                        {selectedStudent.parentPhone}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">O'qish Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <BookOpen size={16} className="text-zinc-400" />
                        {selectedStudent.course}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Calendar size={16} className="text-zinc-400" />
                        A'zo bo'lgan sana: {selectedStudent.joinedDate}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Eslatmalar</h4>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl italic">
                      "{selectedStudent.notes || 'Hech qanday eslatma yo\'q'}"
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={() => showToast(`SMS va Telegram orqali xabarnoma ${selectedStudent.name} ga yuborildi!`, 'success')}
                      className="w-full text-xs font-black"
                      leftIcon={<Send size={14} />}
                    >
                      Xabar yuborish
                    </Button>
                    {(selectedStudent.status === 'Bitiruvchi' || selectedStudent.status === 'Faol') && (
                      <Button 
                        variant="secondary" 
                        onClick={() => exportCertificateToPDF(selectedStudent)}
                        className="w-full text-xs font-black"
                        leftIcon={<Download size={14} />}
                      >
                        Sertifikat
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={() => window.open(`/portal/${selectedStudent.id}`, '_blank')}
                      className="w-full text-sm font-black bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      leftIcon={<ExternalLink size={16} />}
                    >
                      Talaba Portali
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/portal/${selectedStudent.id}`);
                        showToast('Havola nusxalandi!', 'success');
                      }}
                      className="text-sm font-black text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="primary"
                      onClick={() => openModal(selectedStudent)}
                      className="flex-1 text-sm font-black"
                    >
                      Tahrirlash
                    </Button>
                    <Button 
                      variant="danger"
                      onClick={() => handleDelete(selectedStudent.id)}
                      className="flex-1 text-sm font-black"
                    >
                      O'chirish
                    </Button>
                  </div>
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
        title={formData.id ? 'O\'quvchini Tahrirlash' : 'Yangi O\'quvchi Qo\'shish'}
        width="2xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Shaxsiy Ma'lumotlar</h4>
              <div className="space-y-3">
                <Input 
                  label="F.I.O"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Aliyev Vali"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input 
                    label="Telefon"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+998 90 123 45 67"
                  />
                  <Input 
                    type="date"
                    label="Tug'ilgan sana"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                  />
                </div>
                <Input 
                  label="Manzil"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="Toshkent sh., Chilonzor tumani"
                />
              </div>
            </div>

            {/* Parent Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Ota-ona Ma'lumotlari</h4>
              <div className="space-y-3">
                <Input 
                  label="Ota yoki ona ismi"
                  value={formData.parentName}
                  onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                  placeholder="Aliyev G'ani"
                />
                <Input 
                  label="Ota-ona telefoni"
                  value={formData.parentPhone}
                  onChange={(e) => setFormData({...formData, parentPhone: e.target.value})}
                  placeholder="+998 90 111 22 33"
                />
              </div>
            </div>

            {/* Study Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">O'qish Ma'lumotlari</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Kurs</label>
                    <select
                      value={formData.course}
                      onChange={(e) => setFormData({...formData, course: e.target.value, group: ''})}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="">Kursni tanlang...</option>
                      {courseOptions.map((c: any) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Guruh</label>
                    <select
                      value={formData.group}
                      onChange={(e) => {
                        const g = groupOptions.find((g: any) => g.name === e.target.value);
                        setFormData({...formData, group: e.target.value, balance: g?.price ? -g.price : (formData.balance || 0)});
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="">Guruhni tanlang...</option>
                      {groupOptions
                        .filter((g: any) => !formData.course || g.subject === formData.course)
                        .map((g: any) => (
                          <option key={g.id} value={g.name}>{g.name} ({g.teacher || 'Ustoz yo\'q'})</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Holat</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="Faol">Faol</option>
                      <option value="Muzlatilgan">Muzlatilgan</option>
                      <option value="Tark etgan">Tark etgan</option>
                      <option value="Bitiruvchi">Bitiruvchi</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">To'lov Holati</label>
                    <select 
                      value={formData.paymentStatus}
                      onChange={(e) => setFormData({...formData, paymentStatus: e.target.value as any})}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="Tolov qilingan">To'lov qilingan</option>
                      <option value="Qarzdorlik">Qarzdorlik</option>
                      <option value="Kutilmoqda">Kutilmoqda</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial & Notes */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Moliya va Eslatmalar</h4>
              <div className="space-y-3">
                <Input 
                  type="number"
                  label="Balans (UZS)"
                  value={formData.balance}
                  onChange={(e) => setFormData({...formData, balance: Number(e.target.value)})}
                />
                <div className="space-y-1.5 flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Eslatma</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium min-h-[100px] resize-y"
                    placeholder="Qo'shimcha ma'lumotlar..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal} type="button">Bekor qilish</Button>
            <Button variant="primary" onClick={handleSave} type="button" leftIcon={<Check size={18} />}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
