import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, X, Check, Users, DollarSign,
  BookOpen, Phone, Mail, MapPin, Calendar, Clock,
  ChevronRight, User, Shield, GraduationCap, FileText,
  AlertCircle, Filter, Download, MoreVertical
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Pagination from '../../components/Pagination';
import { SkeletonTable } from '../../components/Skeleton';
import { exportToExcel, exportToPDF } from '../../utils/export';

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
  status: 'Faol' | 'Muzlatilgan' | 'Tark etgan';
  joinedDate: string;
  notes: string;
}

export default function CrmStudents() {
  const { data: students = [], loading, addDocument, updateDocument, deleteDocument } = useFirestore<Omit<Student, 'id'>>('students');
  const { data: groups = [], updateDocument: updateGroup } = useFirestore<any>('groups');
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Barchasi');
  const [currentPage, setCurrentPage] = useState(1);
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
        await updateDocument(formData.id, studentData);
        showToast("O'quvchi ma'lumotlari yangilandi", 'success');
      } else {
        await addDocument(studentData);
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
      const matchesFilter = filterStatus === 'Barchasi' || s.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [students, searchTerm, filterStatus]);

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
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">O'quvchilar Boshqaruvi</h1>
          <p className="text-sm font-medium text-zinc-500 mt-1">Markaz o'quvchilari, ularning natijalari va to'lovlari</p>
        </div>
        <div className="flex gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Jami O\'quvchilar', value: stats.total, icon: Users, color: 'blue' },
          { label: 'Faol O\'quvchilar', value: stats.active, icon: GraduationCap, color: 'emerald' },
          { label: 'Qarzdorlar', value: stats.debtors, icon: AlertCircle, color: 'rose' },
          { label: 'Umumiy Balans', value: new Intl.NumberFormat('uz-UZ').format(stats.totalBalance) + ' so\'m', icon: DollarSign, color: 'amber' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400`}>
                <stat.icon size={20} />
              </div>
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Filters and Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text"
              placeholder="Ism, telefon yoki guruh bo'yicha qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
            >
              <option value="Barchasi">Barcha holatlar</option>
              <option value="Faol">Faol</option>
              <option value="Muzlatilgan">Muzlatilgan</option>
              <option value="Tark etgan">Tark etgan</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs va Guruh</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov Holati</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Balans</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(paginatedStudents || []).map((student) => (
                <tr 
                  key={student.id} 
                  onClick={() => { setSelectedStudent(student); setIsDetailOpen(true); }}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{student.course}</span>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{student.group}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      student.status === 'Faol' 
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : student.status === 'Muzlatilgan'
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
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
              ))}
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
                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest mt-1">{selectedStudent.group}</p>
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

                <div className="flex gap-3 pt-6">
                  <button 
                    onClick={() => openModal(selectedStudent)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-blue-600/20"
                  >
                    Tahrirlash
                  </button>
                  <button 
                    onClick={() => handleDelete(selectedStudent.id)}
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
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formData.id ? 'O\'quvchini Tahrirlash' : 'Yangi O\'quvchi Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Personal Info */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Shaxsiy Ma'lumotlar</h4>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">F.I.O</label>
                        <input 
                          type="text" 
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          placeholder="Aliyev Vali"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Telefon</label>
                          <input 
                            type="text" 
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                            placeholder="+998 90 123 45 67"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tug'ilgan sana</label>
                          <input 
                            type="date" 
                            value={formData.birthDate}
                            onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Manzil</label>
                        <input 
                          type="text" 
                          value={formData.address}
                          onChange={(e) => setFormData({...formData, address: e.target.value})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          placeholder="Toshkent sh., Chilonzor tumani"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Parent Info */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Ota-ona Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ota yoki ona ismi</label>
                        <input 
                          type="text" 
                          value={formData.parentName}
                          onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          placeholder="Aliyev G'ani"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ota-ona telefoni</label>
                        <input 
                          type="text" 
                          value={formData.parentPhone}
                          onChange={(e) => setFormData({...formData, parentPhone: e.target.value})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          placeholder="+998 90 111 22 33"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Study Info */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">O'qish Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs</label>
                          <input 
                            type="text" 
                            value={formData.course}
                            onChange={(e) => setFormData({...formData, course: e.target.value})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                            placeholder="Matematika"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruh</label>
                          <input 
                            type="text" 
                            value={formData.group}
                            onChange={(e) => setFormData({...formData, group: e.target.value})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                            placeholder="MAT-01"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                          <select 
                            value={formData.status}
                            onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                          >
                            <option value="Faol">Faol</option>
                            <option value="Muzlatilgan">Muzlatilgan</option>
                            <option value="Tark etgan">Tark etgan</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov Holati</label>
                          <select 
                            value={formData.paymentStatus}
                            onChange={(e) => setFormData({...formData, paymentStatus: e.target.value as any})}
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
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
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Balans (UZS)</label>
                        <input 
                          type="number" 
                          value={formData.balance}
                          onChange={(e) => setFormData({...formData, balance: Number(e.target.value)})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Eslatma</label>
                        <textarea 
                          value={formData.notes}
                          onChange={(e) => setFormData({...formData, notes: e.target.value})}
                          className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white min-h-[100px]"
                          placeholder="Qo'shimcha ma'lumotlar..."
                        />
                      </div>
                    </div>
                  </div>
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
    </div>
  );
}
