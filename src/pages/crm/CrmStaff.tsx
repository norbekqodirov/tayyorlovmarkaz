import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, MoreVertical, User, Mail, Phone, Briefcase, DollarSign, X, Edit2, Trash2, ShieldCheck, Clock } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import api from '../../api/client';

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
  salaryHistory?: { date: string; amount: number; status: string }[];
  attendance?: { date: string; status: 'Present' | 'Absent' | 'Late'; checkIn?: string; checkOut?: string }[];
  tasks?: { id: string; title: string; status: 'Pending' | 'Completed'; priority: 'Low' | 'Medium' | 'High'; deadline: string }[];
  performanceReviews?: { date: string; reviewer: string; feedback: string; rating: number }[];
  documents?: { id: string; name: string; type: string; uploadDate: string }[];
}

export default function CrmStaff() {
  const { data: staff = [], loading, error, addDocument, updateDocument, deleteDocument } = useFirestore<StaffMember>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState<{ type: string; isOpen: boolean }>({ type: '', isOpen: false });
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'salary' | 'tasks' | 'reviews' | 'docs'>('overview');
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editingSubItemIndex, setEditingSubItemIndex] = useState<number | null>(null);
  const [subFormData, setSubFormData] = useState<any>({});
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
      } else {
        await addDocument({
          salaryHistory: [],
          attendance: [],
          tasks: [],
          performanceReviews: [],
          documents: [],
          ...formData
        } as any);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving staff:", error);
      alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Haqiqatan ham ushbu xodimni o\'chirmoqchimisiz?')) {
      try {
        await deleteDocument(id);
      } catch (error) {
        console.error("Error deleting staff:", error);
        alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
      }
    }
  };

  const openModal = (member: StaffMember | null = null) => {
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

  const openDetail = (member: StaffMember) => {
    setSelectedMember(member);
    setActiveTab('overview');
    setIsDetailOpen(true);
  };

  const handleAddSubItem = (type: string, index: number | null = null) => {
    setEditingSubItemIndex(index);
    if (index !== null && selectedMember) {
      const items = (selectedMember as any)[type === 'salary' ? 'salaryHistory' : type === 'docs' ? 'documents' : type === 'reviews' ? 'performanceReviews' : type];
      setSubFormData(items[index]);
    } else {
      setSubFormData({});
      if (type === 'attendance') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], status: 'Present', checkIn: '09:00', checkOut: '18:00' });
      } else if (type === 'salary') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], amount: selectedMember?.salary || 0, status: 'To\'landi' });
      } else if (type === 'tasks') {
        setSubFormData({ title: '', status: 'Pending', priority: 'Medium', deadline: new Date().toISOString().split('T')[0] });
      } else if (type === 'reviews') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], reviewer: 'Admin', feedback: '', rating: 5 });
      } else if (type === 'docs') {
        setSubFormData({ name: '', type: 'Passport nusxasi' });
      }
    }
    setIsSubModalOpen({ type, isOpen: true });
  };

  const handleDeleteSubItem = async (type: string, index: number) => {
    if (!selectedMember || !window.confirm('Haqiqatan ham ushbu ma\'lumotni o\'chirmoqchimisiz?')) return;

    const updatedMember = { ...selectedMember };
    const key = type === 'salary' ? 'salaryHistory' : type === 'docs' ? 'documents' : type === 'reviews' ? 'performanceReviews' : type;
    const items = [...((updatedMember as any)[key] || [])];
    items.splice(index, 1);
    (updatedMember as any)[key] = items;

    try {
      await updateDocument(selectedMember.id, { [key]: items });
      setSelectedMember(updatedMember);
    } catch (error) {
      console.error("Error deleting sub item:", error);
      alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
  };

  const saveSubItem = async () => {
    if (!selectedMember) return;

    const updatedMember = { ...selectedMember };
    const type = isSubModalOpen.type;
    const key = type === 'salary' ? 'salaryHistory' : type === 'docs' ? 'documents' : type === 'reviews' ? 'performanceReviews' : type;
    const items = [...((updatedMember as any)[key] || [])];

    if (editingSubItemIndex !== null) {
      items[editingSubItemIndex] = subFormData;
    } else {
      if (type === 'tasks' || type === 'docs') {
        items.push({ ...subFormData, id: Date.now().toString(), uploadDate: type === 'docs' ? new Date().toISOString().split('T')[0] : undefined });
      } else {
        items.push(subFormData);
      }
    }

    (updatedMember as any)[key] = items;

    if (type === 'salary' && editingSubItemIndex === null) {
      // Sync with Finance if possible (optional enhancement)
      try {
        await api.post('/transactions', {
          type: 'expense',
          amount: subFormData.amount,
          category: 'Ish haqi',
          description: `${selectedMember.name} uchun ish haqi to'lovi`,
          date: subFormData.date,
          method: 'Naqd',
          staffId: selectedMember.id
        });
      } catch (error) {
        console.error("Error adding transaction:", error);
      }
    }

    try {
      await updateDocument(selectedMember.id, { [key]: items });
      setSelectedMember(updatedMember);
      setIsSubModalOpen({ type: '', isOpen: false });
      setEditingSubItemIndex(null);
    } catch (error) {
      console.error("Error saving sub item:", error);
      alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Xodimlar Boshqaruvi (HR)</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi jamoasini boshqarish va nazorat qilish</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus size={20} />
          Yangi Xodim
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Jami Xodimlar</p>
          <h3 className="text-3xl font-black text-slate-900 dark:text-white">{safeStaff.length}</h3>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Oylik Fond</p>
          <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(safeStaff.reduce((acc, s) => acc + (Number(s.salary) || 0), 0))}
          </h3>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Faol Xodimlar</p>
          <h3 className="text-3xl font-black text-blue-600 dark:text-blue-400">
            {safeStaff.filter(s => s.status === 'Faol').length}
          </h3>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Bo'limlar</p>
          <h3 className="text-3xl font-black text-purple-600 dark:text-purple-400">
            {new Set((safeStaff || []).map(s => s.department)).size}
          </h3>
        </div>
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
                          {(selectedMember.attendance || []).map((a, i) => (
                            <tr key={i} className="group">
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.date}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${a.status === 'Present' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                                  }`}>
                                  {a.status === 'Present' ? 'Kelgan' : 'Kelmagan'}
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
                          {(!selectedMember.attendance || (selectedMember.attendance || []).length === 0) && (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 font-bold italic">Davomat ma'lumotlari mavjud emas</td>
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
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Summa</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                            <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {(selectedMember.salaryHistory || []).map((h, i) => (
                            <tr key={i} className="group">
                              <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{h.date}</td>
                              <td className="px-6 py-4 font-black text-slate-900 dark:text-white">{new Intl.NumberFormat('uz-UZ').format(h.amount)} UZS</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">{h.status}</span>
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
                          {(!selectedMember.salaryHistory || (selectedMember.salaryHistory || []).length === 0) && (
                            <tr>
                              <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 font-bold italic">To'lovlar tarixi mavjud emas</td>
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
                      {(selectedMember.tasks || []).map((task, i) => (
                        <div key={task.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${task.status === 'Completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{task.title}</p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Muddati: {task.deadline}</p>
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
                      {(!selectedMember.tasks || (selectedMember.tasks || []).length === 0) && (
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
                      {(selectedMember.performanceReviews || []).map((review, i) => (
                        <div key={i} className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 group relative">
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
                      {(!selectedMember.performanceReviews || (selectedMember.performanceReviews || []).length === 0) && (
                        <div className="py-12 text-center text-zinc-500 font-bold italic">Fikrlar mavjud emas</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'docs' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Hujjatlar</h4>
                      <button
                        onClick={() => handleAddSubItem('docs')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20"
                      >
                        Hujjat Yuklash
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(selectedMember.documents || []).map((doc, i) => (
                        <div key={doc.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-blue-500 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 transition-colors">
                              <ShieldCheck size={20} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{doc.name}</p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{doc.type} • {doc.uploadDate}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">Yuklab olish</button>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleAddSubItem('docs', i)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => handleDeleteSubItem('docs', i)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(!selectedMember.documents || (selectedMember.documents || []).length === 0) && (
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
      <AnimatePresence>
        {isSubModalOpen.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {isSubModalOpen.type === 'attendance' && 'Davomatni belgilash'}
                  {isSubModalOpen.type === 'salary' && 'To\'lov qo\'shish'}
                  {isSubModalOpen.type === 'tasks' && 'Vazifa qo\'shish'}
                  {isSubModalOpen.type === 'reviews' && 'Fikr qoldirish'}
                  {isSubModalOpen.type === 'docs' && 'Hujjat yuklash'}
                </h3>
                <button onClick={() => setIsSubModalOpen({ type: '', isOpen: false })} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {isSubModalOpen.type === 'attendance' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</label>
                      <input type="date" value={subFormData.date} onChange={(e) => setSubFormData({ ...subFormData, date: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                      <select value={subFormData.status} onChange={(e) => setSubFormData({ ...subFormData, status: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                        <option value="Present">Kelgan</option>
                        <option value="Absent">Kelmagan</option>
                        <option value="Late">Kechikkan</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kelgan vaqti</label>
                        <input type="time" value={subFormData.checkIn} onChange={(e) => setSubFormData({ ...subFormData, checkIn: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ketgan vaqti</label>
                        <input type="time" value={subFormData.checkOut} onChange={(e) => setSubFormData({ ...subFormData, checkOut: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                      </div>
                    </div>
                  </>
                )}

                {isSubModalOpen.type === 'salary' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</label>
                      <input type="date" value={subFormData.date} onChange={(e) => setSubFormData({ ...subFormData, date: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Summa (UZS)</label>
                      <input type="number" value={subFormData.amount} onChange={(e) => setSubFormData({ ...subFormData, amount: Number(e.target.value) })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                    </div>
                  </>
                )}

                {isSubModalOpen.type === 'tasks' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vazifa nomi</label>
                      <input type="text" value={subFormData.title} onChange={(e) => setSubFormData({ ...subFormData, title: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" placeholder="Masalan: Hisobot tayyorlash" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Muhimlik</label>
                        <select value={subFormData.priority} onChange={(e) => setSubFormData({ ...subFormData, priority: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                          <option value="Low">Past</option>
                          <option value="Medium">O'rta</option>
                          <option value="High">Yuqori</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Muddati</label>
                        <input type="date" value={subFormData.deadline} onChange={(e) => setSubFormData({ ...subFormData, deadline: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" />
                      </div>
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
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Hujjat nomi</label>
                      <input type="text" value={subFormData.name} onChange={(e) => setSubFormData({ ...subFormData, name: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white" placeholder="Masalan: Passport nusxasi" />
                    </div>
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
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
                <button onClick={() => setIsSubModalOpen({ type: '', isOpen: false })} className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700">Bekor qilish</button>
                <button onClick={saveSubItem} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-600/20">Saqlash</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit/Add Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingMember ? 'Xodimni Tahrirlash' : 'Yangi Xodim Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">Asosiy Ma'lumotlar</h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ism Familiya</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="Masalan: Alisher Navoiy"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Lavozim</label>
                      <input
                        type="text"
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="Masalan: O'qituvchi"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Passport Seriya</label>
                      <input
                        type="text"
                        value={formData.passport}
                        onChange={(e) => setFormData({ ...formData, passport: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="AA 1234567"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Manzil</label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="Toshkent sh, Chilonzor..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800 pb-2">Aloqa va Ish</h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Telefon</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="+998 90 123 45 67"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                        placeholder="example@mail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Maosh (UZS)</label>
                      <input
                        type="number"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      />
                    </div>
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
