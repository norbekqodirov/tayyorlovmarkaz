import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, MoreVertical, User, Mail, Phone, Briefcase, DollarSign, X, Edit2, Trash2, ShieldCheck, Clock, Users, Building2 } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import api from '../../../api/client';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  salary: number;
  joinedDate: string;
  status: 'Faol' | 'Ta\'tilda' | 'Ishdan bo\'shagan';
  department: string;
  address?: string;
  passport?: string;
  education?: string;
  experience?: string;
}

// Quyidagi 5 ta yordamchi turdagi ma'lumot (davomat, maosh, vazifa, fikr,
// hujjat) StaffMember'ning O'ZIDA saqlanmaydi — har biri alohida haqiqiy
// jadvalga (StaffAttendance, Salary, Task, PerformanceReview, StaffDocument)
// yoziladi. Avval bular soxta JSON-massiv sifatida saqlanardi (sxemada bunday
// maydon yo'q edi) — "saqlandi" deb ko'rsatib, aslida hech narsa yozmasdi.
interface AttendanceRow { id: string; date: string; status: string; checkIn?: string; checkOut?: string; notes?: string; }
interface SalaryRow { id: string; month: string; baseSalary: number; bonus: number; deduction: number; total: number; paid: boolean; notes?: string; }
interface TaskRow { id: string; title: string; completed: boolean; priority: 'Low' | 'Medium' | 'High'; deadline?: string; }
interface ReviewRow { id: string; date: string; reviewer: string; feedback: string; rating: number; }
interface DocRow { id: string; name: string; type: string; uploadDate: string; }

export default function CrmStaff() {
  const { data: staff = [], loading, error, addDocument, updateDocument, deleteDocument } = useFirestore<StaffMember>('staff');
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [deleteSubConfirm, setDeleteSubConfirm] = useState<{ open: boolean; type: string; index: number }>({ open: false, type: '', index: -1 });
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState<{ type: string; isOpen: boolean }>({ type: '', isOpen: false });
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'salary' | 'tasks' | 'reviews' | 'docs'>('overview');
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [docRows, setDocRows] = useState<DocRow[]>([]);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editingSubItemIndex, setEditingSubItemIndex] = useState<number | null>(null);
  const [subFormData, setSubFormData] = useState<any>({});
  const [loginPassword, setLoginPassword] = useState(''); // yangi xodim uchun login paroli
  const [formData, setFormData] = useState<Partial<StaffMember>>({
    name: '',
    role: '',
    email: '',
    phone: '',
    salary: 0,
    department: 'Ma\'muriyat',
    status: 'Faol',
    joinedDate: new Date().toISOString().split('T')[0],
    address: '',
    passport: '',
    education: '',
    experience: ''
  });

  const handleSave = async () => {
    try {
      if (editingMember) {
        await updateDocument(editingMember.id, formData);
        showToast('Xodim ma\'lumotlari yangilandi', 'success');
      } else {
        await addDocument({
          salaryHistory: [],
          attendance: [],
          tasks: [],
          performanceReviews: [],
          documents: [],
          ...formData,
          // Telefon + parol bilan login (User) hisobi ham yaratiladi
          ...(formData.phone ? { password: loginPassword || undefined, createLogin: true } : {}),
        } as any);
        showToast(
          formData.phone
            ? 'Yangi xodim qo\'shildi — botga kirish uchun login hisobi yaratildi'
            : 'Yangi xodim qo\'shildi',
          'success'
        );
      }
      closeModal();
    } catch (error) {
      console.error("Error saving staff:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    try {
      await deleteDocument(deleteConfirm.id);
      showToast('Xodim o\'chirildi', 'success');
    } catch (error) {
      console.error("Error deleting staff:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
    setDeleteConfirm({ open: false, id: '' });
  };

  const openModal = (member: StaffMember | null = null) => {
    setLoginPassword('');
    if (member) {
      setEditingMember(member);
      setFormData(member);
    } else {
      setEditingMember(null);
      setFormData({
        name: '',
        role: '',
        email: '',
        phone: '',
        salary: 0,
        department: 'Ma\'muriyat',
        status: 'Faol',
        joinedDate: new Date().toISOString().split('T')[0],
        address: '',
        passport: '',
        education: '',
        experience: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const loadStaffExtras = useCallback(async (staffId: string) => {
    try {
      const [att, sal, tasks, reviews, docs] = await Promise.all([
        api.get(`/salary/attendance?staffId=${staffId}`),
        api.get(`/salary/staff/${staffId}`),
        api.get('/tasks'),
        api.get('/performanceReviews'),
        api.get('/staffDocuments'),
      ]);
      setAttendanceRows(att.data || []);
      setSalaryRows(sal.data || []);
      setTaskRows((tasks.data || []).filter((t: any) => t.staffId === staffId));
      setReviewRows((reviews.data || []).filter((r: any) => r.staffId === staffId));
      setDocRows((docs.data || []).filter((d: any) => d.staffId === staffId));
    } catch (error) {
      console.error('Error loading staff extras:', error);
    }
  }, []);

  const openDetail = (member: StaffMember) => {
    setSelectedMember(member);
    setActiveTab('overview');
    setIsDetailOpen(true);
    loadStaffExtras(member.id);
  };

  // type bo'yicha lokal ro'yxat + uni bevosita yangilaydigan setter — har bir
  // "sub-item" turi endi haqiqiy jadvalga (StaffAttendance/Salary/Task/
  // PerformanceReview/StaffDocument) yoziladi, StaffMember'ning o'ziga emas.
  const subItemRows = (type: string): any[] =>
    type === 'attendance' ? attendanceRows : type === 'salary' ? salaryRows
    : type === 'tasks' ? taskRows : type === 'reviews' ? reviewRows : docRows;
  const setSubItemRows = (type: string, rows: any[]) => {
    if (type === 'attendance') setAttendanceRows(rows);
    else if (type === 'salary') setSalaryRows(rows);
    else if (type === 'tasks') setTaskRows(rows);
    else if (type === 'reviews') setReviewRows(rows);
    else setDocRows(rows);
  };

  const handleAddSubItem = (type: string, index: number | null = null) => {
    setEditingSubItemIndex(index);
    if (index !== null) {
      setSubFormData(subItemRows(type)[index]);
    } else {
      setSubFormData({});
      if (type === 'attendance') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], status: 'present', checkIn: '09:00', checkOut: '18:00' });
      } else if (type === 'salary') {
        setSubFormData({ month: new Date().toISOString().slice(0, 7), baseSalary: selectedMember?.salary || 0, bonus: 0, deduction: 0, notes: '' });
      } else if (type === 'tasks') {
        setSubFormData({ title: '', completed: false, priority: 'Medium', deadline: new Date().toISOString().split('T')[0] });
      } else if (type === 'reviews') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], reviewer: 'Admin', feedback: '', rating: 5 });
      } else if (type === 'docs') {
        setSubFormData({ name: '', type: 'Passport nusxasi' });
      }
    }
    setIsSubModalOpen({ type, isOpen: true });
  };

  const handleDeleteSubItem = (type: string, index: number) => {
    setDeleteSubConfirm({ open: true, type, index });
  };

  const confirmDeleteSubItem = async () => {
    if (!selectedMember) return;
    const { type, index } = deleteSubConfirm;
    const row = subItemRows(type)[index];
    try {
      if (type === 'attendance') await api.delete(`/staff-attendance/${row.id}`);
      else if (type === 'salary') await api.delete(`/salary/${row.id}`);
      else await api.delete(`/${type === 'tasks' ? 'tasks' : type === 'reviews' ? 'performanceReviews' : 'staffDocuments'}/${row.id}`);
      setSubItemRows(type, subItemRows(type).filter((_, i) => i !== index));
      showToast('Ma\'lumot o\'chirildi', 'success');
    } catch (error) {
      console.error("Error deleting sub item:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
    setDeleteSubConfirm({ open: false, type: '', index: -1 });
  };

  const saveSubItem = async () => {
    if (!selectedMember) return;
    const type = isSubModalOpen.type;
    const editingRow = editingSubItemIndex !== null ? subItemRows(type)[editingSubItemIndex] : null;

    try {
      let saved: any;
      if (type === 'attendance') {
        const res = await api.post('/salary/attendance', { staffId: selectedMember.id, ...subFormData });
        saved = res.data;
      } else if (type === 'salary') {
        const res = await api.post('/salary', { staffId: selectedMember.id, ...subFormData });
        saved = res.data;
      } else if (type === 'tasks') {
        const res = editingRow
          ? await api.put(`/tasks/${editingRow.id}`, subFormData)
          : await api.post('/tasks', { ...subFormData, staffId: selectedMember.id });
        saved = res.data;
      } else if (type === 'reviews') {
        const res = editingRow
          ? await api.put(`/performanceReviews/${editingRow.id}`, subFormData)
          : await api.post('/performanceReviews', { ...subFormData, staffId: selectedMember.id });
        saved = res.data;
      } else {
        const payload = { ...subFormData, uploadDate: subFormData.uploadDate || new Date().toISOString().split('T')[0] };
        const res = editingRow
          ? await api.put(`/staffDocuments/${editingRow.id}`, payload)
          : await api.post('/staffDocuments', { ...payload, staffId: selectedMember.id });
        saved = res.data;
      }

      const rows = subItemRows(type);
      if (editingSubItemIndex !== null && editingRow) {
        // attendance/salary — upsert kaliti (staffId+date / staffId+month) bo'yicha
        // qayta yozilishi mumkin, shuning uchun ID o'zgarmagan bo'lishi kerak
        setSubItemRows(type, rows.map((r, i) => i === editingSubItemIndex ? saved : r));
      } else {
        setSubItemRows(type, [saved, ...rows]);
      }

      setIsSubModalOpen({ type: '', isOpen: false });
      setEditingSubItemIndex(null);
      showToast('Ma\'lumot saqlandi', 'success');
    } catch (error) {
      console.error("Error saving sub item:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
  };

  const markSalaryPaid = async (salaryId: string) => {
    try {
      const res = await api.put(`/salary/${salaryId}/pay`, {});
      setSalaryRows(rows => rows.map(r => r.id === salaryId ? res.data : r));
      showToast("Oylik to'landi deb belgilandi va moliyaga yozildi", 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    }
  };

  const safeStaff = staff || [];
  const filteredStaff = safeStaff.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Xodimni o'chirish"
        message="Haqiqatan ham ushbu xodimni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <ConfirmDialog
        isOpen={deleteSubConfirm.open}
        title="Ma'lumotni o'chirish"
        message="Haqiqatan ham ushbu ma'lumotni o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDeleteSubItem}
        onCancel={() => setDeleteSubConfirm({ open: false, type: '', index: -1 })}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Xodimlar Boshqaruvi (HR)</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi jamoasini boshqarish va nazorat qilish</p>
        </div>
        <Button onClick={() => openModal()} leftIcon={<Plus size={20} />}>
          Yangi Xodim
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard variant="gradient" color="blue" label="Jami Xodimlar" value={safeStaff.length} sub="Ro'yxatda" icon={<Users size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="emerald" label="Oylik Fond" value={new Intl.NumberFormat('uz-UZ').format(safeStaff.reduce((acc, s) => acc + (Number(s.salary) || 0), 0))} sub="so'm / oy" icon={<DollarSign size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="violet" label="Faol Xodimlar" value={safeStaff.filter(s => s.status === 'Faol').length} sub="Ishlayotgan" icon={<ShieldCheck size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="amber" label="Bo'limlar" value={new Set((safeStaff || []).map(s => s.department)).size} sub="Unikal bo'lim" icon={<Building2 size={17} strokeWidth={2.5} />} />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Xodim ismi, lavozimi yoki bo'limi bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xodim</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Lavozim va Bo'lim</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Aloqa</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Maosh</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(filteredStaff || []).map((member) => (
                <tr key={member.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer" onClick={() => openDetail(member)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-black">
                        {(member.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{member.name}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Qo'shildi: {member.joinedDate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{member.role}</span>
                      <span className="text-xs text-zinc-500 font-medium">{member.department}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        <Phone size={12} />
                        {member.phone}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                        <Mail size={12} />
                        {member.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-black text-slate-900 dark:text-white">
                    {new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(member.salary)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${member.status === 'Faol'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : member.status === 'Ta\'tilda'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                      }`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openModal(member)}
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
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
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailOpen && selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 100 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: 100 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden border border-zinc-200 dark:border-zinc-800 h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black">
                    {(selectedMember.name || '?').charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{selectedMember.name}</h3>
                    <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">{selectedMember.role}</p>
                  </div>
                </div>
                <button onClick={() => setIsDetailOpen(false)} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="flex gap-4 mb-8 border-b border-zinc-100 dark:border-zinc-800 pb-px overflow-x-auto no-scrollbar">
                  {[
                    { id: 'overview', label: 'Umumiy', icon: User },
                    { id: 'attendance', label: 'Davomat', icon: Clock },
                    { id: 'salary', label: 'Maosh', icon: DollarSign },
                    { id: 'tasks', label: 'Vazifalar', icon: Briefcase },
                    { id: 'reviews', label: 'Fikrlar', icon: ShieldCheck },
                    { id: 'docs', label: 'Hujjatlar', icon: Plus }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === tab.id
                          ? 'text-blue-600'
                          : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                        }`}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                        />
                      )}
                    </button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                      <section>
                        <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <User size={14} /> Shaxsiy Ma'lumotlar
                        </h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Passport</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.passport || 'Kiritilmagan'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Manzil</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.address || 'Kiritilmagan'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Ta'lim</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.education || 'Kiritilmagan'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Tajriba</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.experience || 'Kiritilmagan'}</p>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4">Aloqa</h4>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 flex items-center justify-center text-blue-600 shadow-sm">
                              <Phone size={14} />
                            </div>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.phone}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-800 flex items-center justify-center text-blue-600 shadow-sm">
                              <Mail size={14} />
                            </div>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.email}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Ish Faoliyati</h4>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Bo'lim</p>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{selectedMember.department}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Maosh</p>
                            <p className="text-lg font-black text-emerald-600">{new Intl.NumberFormat('uz-UZ').format(selectedMember.salary)} UZS</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Ish boshlagan</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedMember.joinedDate}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'attendance' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Davomat Tarixi</h4>
                      <button
                        onClick={() => handleAddSubItem('attendance')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        Davomatni belgilash
                      </button>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kelgan vaqti</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ketgan vaqti</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {attendanceRows.map((a, i) => (
                            <tr key={a.id || i} className="group">
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.date}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${a.status === 'present' ? 'bg-emerald-100 text-emerald-600' : a.status === 'late' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
                                  }`}>
                                  {a.status === 'present' ? 'Kelgan' : a.status === 'late' ? 'Kechikkan' : 'Kelmagan'}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.checkIn || '--:--'}</td>
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.checkOut || '--:--'}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleAddSubItem('attendance', i)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded">
                                    <Edit2 size={14} />
                                  </button>
                                  <button onClick={() => handleDeleteSubItem('attendance', i)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {attendanceRows.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-bold italic">Davomat ma'lumotlari mavjud emas</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'salary' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">To'lovlar Tarixi</h4>
                      <button
                        onClick={() => handleAddSubItem('salary')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        To'lov qo'shish
                      </button>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Oy</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Asosiy + Bonus − Ushlab qolish</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jami</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {salaryRows.map((h, i) => (
                            <tr key={h.id || i} className="group">
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{h.month}</td>
                              <td className="px-6 py-4 text-xs font-bold text-zinc-500">
                                {new Intl.NumberFormat('uz-UZ').format(h.baseSalary)} + {new Intl.NumberFormat('uz-UZ').format(h.bonus)} − {new Intl.NumberFormat('uz-UZ').format(h.deduction)}
                              </td>
                              <td className="px-6 py-4 font-black text-slate-900 dark:text-white">{new Intl.NumberFormat('uz-UZ').format(h.total)} UZS</td>
                              <td className="px-6 py-4">
                                {h.paid ? (
                                  <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">To'landi</span>
                                ) : (
                                  <button onClick={() => markSalaryPaid(h.id)} className="px-2 py-1 bg-amber-100 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 transition-colors">
                                    To'lash
                                  </button>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleAddSubItem('salary', i)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded">
                                    <Edit2 size={14} />
                                  </button>
                                  <button onClick={() => handleDeleteSubItem('salary', i)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {salaryRows.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-bold italic">To'lovlar tarixi mavjud emas</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'tasks' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Vazifalar</h4>
                      <button
                        onClick={() => handleAddSubItem('tasks')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        Vazifa Qo'shish
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {taskRows.map((task, i) => (
                        <div key={task.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <button
                              onClick={async () => {
                                const res = await api.put(`/tasks/${task.id}`, { completed: !task.completed });
                                setTaskRows(rows => rows.map(r => r.id === task.id ? res.data : r));
                              }}
                              className={`w-4 h-4 rounded-full border-2 ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-amber-400'}`}
                              title={task.completed ? 'Bajarilgan' : 'Bajarilmagan'}
                            />
                            <div>
                              <p className={`font-bold text-slate-900 dark:text-white ${task.completed ? 'line-through opacity-50' : ''}`}>{task.title}</p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Muddati: {task.deadline || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.priority === 'High' ? 'bg-rose-100 text-rose-600' : task.priority === 'Medium' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'
                              }`}>
                              {task.priority}
                            </span>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleAddSubItem('tasks', i)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => handleDeleteSubItem('tasks', i)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {taskRows.length === 0 && (
                        <div className="py-12 text-center text-zinc-500 font-bold italic">Vazifalar mavjud emas</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Fikrlar va Baholash</h4>
                      <button
                        onClick={() => handleAddSubItem('reviews')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        Fikr Qoldirish
                      </button>
                    </div>
                    <div className="space-y-4">
                      {reviewRows.map((review, i) => (
                        <div key={review.id || i} className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 group relative">
                          <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleAddSubItem('reviews', i)} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 rounded-lg">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteSubItem('reviews', i)} className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="font-black text-slate-900 dark:text-white">{review.reviewer}</p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{review.date}</p>
                            </div>
                            <div className="flex gap-1 mr-16">
                              {[1, 2, 3, 4, 5].map(star => (
                                <span key={star} className={`text-lg ${star <= review.rating ? 'text-amber-400' : 'text-zinc-300'}`}>★</span>
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-zinc-300 font-medium leading-relaxed">{review.feedback}</p>
                        </div>
                      ))}
                      {reviewRows.length === 0 && (
                        <div className="py-12 text-center text-zinc-500 font-bold italic">Fikrlar mavjud emas</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'docs' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Hujjatlar</h4>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Fayl saqlanmaydi — faqat nom/tur/sana yozuvi</p>
                      </div>
                      <button
                        onClick={() => handleAddSubItem('docs')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        Hujjat Qo'shish
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {docRows.map((doc, i) => (
                        <div key={doc.id || i} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-blue-500 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 transition-colors">
                              <ShieldCheck size={20} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{doc.name}</p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{doc.type} • {doc.uploadDate}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleAddSubItem('docs', i)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteSubItem('docs', i)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {docRows.length === 0 && (
                        <div className="md:col-span-2 py-12 text-center text-zinc-500 font-bold italic">Hujjatlar mavjud emas</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
                <button
                  onClick={() => { setIsDetailOpen(false); openModal(selectedMember); }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                >
                  <Edit2 size={16} /> Tahrirlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-modals for Attendance, Salary, etc. */}
      <Modal
        isOpen={isSubModalOpen.isOpen}
        onClose={() => setIsSubModalOpen({ type: '', isOpen: false })}
        title={
          isSubModalOpen.type === 'attendance' ? 'Davomatni belgilash' :
          isSubModalOpen.type === 'salary' ? "To'lov qo'shish" :
          isSubModalOpen.type === 'tasks' ? 'Vazifa qo\'shish' :
          isSubModalOpen.type === 'reviews' ? 'Fikr qoldirish' :
          'Hujjat yuklash'
        }
      >
        <div className="space-y-4">
          {isSubModalOpen.type === 'attendance' && (
            <>
              <Input type="date" label="Sana" value={subFormData.date} onChange={(e) => setSubFormData({ ...subFormData, date: e.target.value })} />
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                <select value={subFormData.status} onChange={(e) => setSubFormData({ ...subFormData, status: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                  <option value="present">Kelgan</option>
                  <option value="absent">Kelmagan</option>
                  <option value="late">Kechikkan</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input type="time" label="Kelgan vaqti" value={subFormData.checkIn} onChange={(e) => setSubFormData({ ...subFormData, checkIn: e.target.value })} />
                <Input type="time" label="Ketgan vaqti" value={subFormData.checkOut} onChange={(e) => setSubFormData({ ...subFormData, checkOut: e.target.value })} />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'salary' && (
            <>
              <Input type="month" label="Oy" value={subFormData.month} onChange={(e) => setSubFormData({ ...subFormData, month: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <MoneyInput label="Asosiy" value={subFormData.baseSalary} onChange={(baseSalary) => setSubFormData({ ...subFormData, baseSalary })} />
                <MoneyInput label="Bonus" value={subFormData.bonus} onChange={(bonus) => setSubFormData({ ...subFormData, bonus })} />
                <MoneyInput label="Ushlab qolish" value={subFormData.deduction} onChange={(deduction) => setSubFormData({ ...subFormData, deduction })} />
              </div>
              <Input label="Izoh (ixtiyoriy)" value={subFormData.notes || ''} onChange={(e) => setSubFormData({ ...subFormData, notes: e.target.value })} />
            </>
          )}

          {isSubModalOpen.type === 'tasks' && (
            <>
              <Input label="Vazifa nomi" value={subFormData.title} onChange={(e) => setSubFormData({ ...subFormData, title: e.target.value })} placeholder="Masalan: Hisobot tayyorlash" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Muhimlik</label>
                  <select value={subFormData.priority} onChange={(e) => setSubFormData({ ...subFormData, priority: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                    <option value="Low">Past</option>
                    <option value="Medium">O'rta</option>
                    <option value="High">Yuqori</option>
                  </select>
                </div>
                <Input type="date" label="Muddati" value={subFormData.deadline} onChange={(e) => setSubFormData({ ...subFormData, deadline: e.target.value })} />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'reviews' && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Baholash (1-5)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setSubFormData({ ...subFormData, rating: star })} className={`text-2xl ${star <= subFormData.rating ? 'text-amber-400' : 'text-zinc-300'}`}>★</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fikr-mulohaza</label>
                <textarea value={subFormData.feedback} onChange={(e) => setSubFormData({ ...subFormData, feedback: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white resize-none" rows={4} placeholder="Xodim faoliyati haqida fikringiz..." />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'docs' && (
            <>
              <Input label="Hujjat nomi" value={subFormData.name} onChange={(e) => setSubFormData({ ...subFormData, name: e.target.value })} placeholder="Masalan: Passport nusxasi" />
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Turi</label>
                <select value={subFormData.type} onChange={(e) => setSubFormData({ ...subFormData, type: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                  <option value="Passport nusxasi">Passport nusxasi</option>
                  <option value="Diplom">Diplom</option>
                  <option value="Shartnoma">Shartnoma</option>
                  <option value="Sertifikat">Sertifikat</option>
                </select>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={() => setIsSubModalOpen({ type: '', isOpen: false })}>Bekor qilish</Button>
            <Button onClick={saveSubItem}>Saqlash</Button>
          </div>
        </div>
      </Modal>

      {/* Edit/Add Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingMember ? 'Xodimni Tahrirlash' : "Yangi Xodim Qo'shish"}
        width="2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">Asosiy Ma'lumotlar</h4>
            <Input label="Ism Familiya" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Masalan: Alisher Navoiy" />
            <Input label="Lavozim" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} placeholder="Masalan: O'qituvchi" />
            <Input label="Passport Seriya" value={formData.passport} onChange={(e) => setFormData({ ...formData, passport: e.target.value })} placeholder="AA 1234567" />
            <Input label="Manzil" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Toshkent sh, Chilonzor..." />
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">Aloqa va Ish</h4>
            <PhoneInput
              label="Telefon (login uchun)"
              value={formData.phone || ''}
              onChange={(phone) => setFormData({ ...formData, phone })}
            />
            {!editingMember && (
              <div className="space-y-2">
                <Input
                  label="Login paroli"
                  leftIcon={<ShieldCheck size={14} className="text-emerald-500" />}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Bo'sh qoldirilsa: 123456"
                />
                <p className="text-[10px] text-zinc-400 leading-tight">
                  Telefon + parol bilan xodim botga (Mini App) kira oladi. Ruxsatlar lavozimiga qarab beriladi.
                </p>
              </div>
            )}
            <Input type="email" label="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="example@mail.com" />
            <MoneyInput label="Maosh (UZS)" value={formData.salary} onChange={(salary) => setFormData({ ...formData, salary })} />
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Bo'lim</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Ma'muriyat">Ma'muriyat</option>
                <option value="Ta'lim">Ta'lim</option>
                <option value="Marketing">Marketing</option>
                <option value="Xizmat ko'rsatish">Xizmat ko'rsatish</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">Qo'shimcha</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ta'lim</label>
                <textarea
                  value={formData.education}
                  onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white resize-none"
                  rows={2}
                  placeholder="Oliy ma'lumot, universitet..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tajriba</label>
                <textarea
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white resize-none"
                  rows={2}
                  placeholder="Oldingi ish joylari, yutuqlar..."
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal}>Bekor qilish</Button>
            <Button onClick={handleSave}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
