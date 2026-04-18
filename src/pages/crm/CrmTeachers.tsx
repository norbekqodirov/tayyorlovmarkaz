import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, User, Users, Star, Award, Mail, Phone, Lock, ChevronRight, Calculator, BookOpen, TrendingUp, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF } from '../../utils/export';
import ImageUpload from '../../components/ImageUpload';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useFirestore } from '../../hooks/useFirestore';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;      // The selected subject (mapped from meta)
  exp: string;       // Mapped from meta
  desc: string;      // Mapped from meta
  img: string;       // Avatar
  password?: string; // Only for creation/update
}

export default function CrmTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);
  const [payrollRate, setPayrollRate] = useState<number>(40);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { showToast } = useToast();
  
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [] } = useFirestore<any>('students');
  const { addDocument: addFinance } = useFirestore<any>('finance');

  const [formData, setFormData] = useState<Partial<Teacher>>({
    name: '', email: '', phone: '', password: '', role: '', exp: '', desc: '', img: ''
  });

  const loadTeachers = async () => {
    try {
      const res = await api.get('/auth/users');
      // Filter only users with role TEACHER
      const tUsers = (res.data || []).filter((u: any) => u.role === 'TEACHER');
      
      const mapped = tUsers.map((u: any) => {
        let meta: any = {};
        try {
          const perms = JSON.parse(u.permissions || '[]');
          const metaObj = perms.find((p: any) => p.meta);
          if (metaObj) meta = metaObj.meta;
        } catch(e) {}
        
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: meta.subject || '',
          exp: meta.exp || '',
          desc: meta.desc || '',
          img: u.avatar || ''
        };
      });
      setTeachers(mapped);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadTeachers(); }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.email) {
      showToast("Ism va email kiritilishi shart!", 'error');
      return;
    }
    
    // Store extra teacher logic in generic user permissions slot
    const metaObj = {
      meta: {
        subject: formData.role,
        exp: formData.exp,
        desc: formData.desc
      }
    };
    const permissions = [metaObj];

    try {
      const dbPayload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: 'TEACHER', // Enforce teacher role
        avatar: formData.img,
        permissions
      };

      if (formData.id) {
        await api.put(`/auth/users/${formData.id}`, dbPayload);
        showToast("Ustoz muvaffaqiyatli saqlandi!");
      } else {
        if (!formData.password) { showToast("Yangi ustoz uchun parol shart!", 'error'); return; }
        await api.post('/auth/users', dbPayload);
        showToast("Yangi ustoz muvaffaqiyatli qo'shildi!");
      }
      loadTeachers();
      closeModal();
    } catch (error: any) {
      console.error(error);
      showToast(error.response?.data?.message || "Xatolik yuz berdi", 'error');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/auth/users/${deleteConfirm.id}`);
      showToast("O'chirildi!", 'success');
      loadTeachers();
    } catch (error) {
      showToast("Sizda ustozni o'chirish ruxsati yo'q, yoki xato yuz berdi", 'error');
    }
    setDeleteConfirm({ open: false, id: '' });
  };

  const openModal = (teacher: Teacher | null = null) => {
    if (teacher) {
      setFormData({ ...teacher, password: '' });
    } else {
      setFormData({ name: '', email: '', phone: '', password: '', role: '', exp: '', desc: '', img: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const filteredTeachers = teachers.filter(t =>
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Ustozni o'chirish"
        message="Ustozni tizimdan va bazadan butunlay o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Ustozlar</h1>
          <p className="text-sm text-zinc-500 mt-1">Markaz o'qituvchilarini boshqarish</p>
        </div>
        <Button
          onClick={() => openModal()}
          leftIcon={<Plus size={18} />}
        >
          Yangi ustoz
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Jami Ustozlar', value: (teachers || []).length, icon: Users, gradient: 'from-blue-500 to-indigo-600', sub: 'Ro\'yxatda' },
          { label: 'Fanlar Soni', value: new Set((teachers || []).map(t => t.role).filter(Boolean)).size, icon: Award, gradient: 'from-emerald-500 to-teal-600', sub: 'Unikal fanlar' },
          { label: 'Tajribali (3+ yil)', value: (teachers || []).filter(t => t.exp && parseInt(t.exp) >= 3).length, icon: Star, gradient: 'from-violet-500 to-purple-600', sub: '3 yildan ko\'p' }
        ].map((stat, i) => (
          <div key={i} className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-5 shadow-lg text-white relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-white/5 -mr-6 -mt-6" />
            <div className="relative flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 shrink-0">
                <stat.icon size={20} strokeWidth={2.5} />
              </div>
            </div>
            <div className="relative mt-4">
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
              <p className="text-3xl font-black text-white mt-1">{stat.value}</p>
              <p className="text-[11px] text-white/60 mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Ism yoki fan bo'yicha qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportToExcel(filteredTeachers, [
              { header: 'Ism', key: 'name', width: 25 },
              { header: 'Email', key: 'email', width: 25 },
              { header: 'Telefon', key: 'phone', width: 15 },
              { header: "Fan/Yo'nalish", key: 'role', width: 20 },
              { header: 'Tajriba', key: 'exp', width: 12 },
            ], 'Oqituvchilar')}
              className="p-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all" title="Excel">
              <Download size={16} />
            </button>
            <button onClick={() => exportToPDF(filteredTeachers, [
              { header: 'Ism', key: 'name', width: 25 },
              { header: 'Email', key: 'email', width: 25 },
              { header: 'Telefon', key: 'phone', width: 15 },
              { header: "Fan/Yo'nalish", key: 'role', width: 20 },
              { header: 'Tajriba', key: 'exp', width: 12 },
            ], "O'qituvchilar Ro'yxati", 'Oqituvchilar')}
              className="p-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all" title="PDF">
              <Download size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 font-bold">
              <tr>
                <th className="px-6 py-4">Rasm</th>
                <th className="px-6 py-4">F.I.O</th>
                <th className="px-6 py-4">Fan / Mutaxassislik</th>
                <th className="px-6 py-4">Tajriba</th>
                <th className="px-6 py-4 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredTeachers.map((teacher) => (
                <tr 
                  key={teacher.id} 
                  onClick={() => { setSelectedTeacher(teacher); setIsDetailOpen(true); }}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                      {(teacher.img && teacher.name) ? (
                        <img src={teacher.img.startsWith('/') ? teacher.img : teacher.img} alt={teacher.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                           <Users size={16} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                    {teacher.name}
                    <div className="text-xs font-normal text-zinc-500 mt-1 flex gap-2">
                       {teacher.phone && <span>{teacher.phone}</span>}
                       {teacher.email && <span>{teacher.email}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {teacher.role || 'Noma\'lum'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">
                    {teacher.exp || '0'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openModal(teacher); }}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(teacher.id); }}
                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    Ustozlar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail KPI Sidebar */}
      <AnimatePresence>
        {isDetailOpen && selectedTeacher && (
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
              {(() => {
                 const teacherGroups = (groups || []).filter((g: any) => g.teacher === selectedTeacher.name);
                 const studentIds = new Set<string>();
                 teacherGroups.forEach((g: any) => (g.students || []).forEach((s: string) => studentIds.add(s)));
                 const activeStudentsCount = studentIds.size;
                 
                 // Estimated KPI Logic: Assumes fixed proportion per student e.g 150000 UZS or based on group prices
                 let totalEstRevenue = 0;
                 teacherGroups.forEach((g: any) => {
                    const price = g.price || 0;
                    totalEstRevenue += price * (g.students || []).length;
                 });
                 // Teacher KPI = 40% of generated revenue (Example metric)
                 const estimatedSalary = totalEstRevenue * 0.4;
                 
                 return (
                  <div className="p-6 space-y-8">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">O'qituvchi KPI Dashboard</h2>
                      <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                        <X size={20} />
                      </button>
                    </div>

                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-3xl font-black shadow-xl shadow-blue-600/20 border-4 border-white dark:border-zinc-800">
                        {selectedTeacher.img ? (
                          <img src={selectedTeacher.img.startsWith('/') ? selectedTeacher.img : selectedTeacher.img} alt={selectedTeacher.name} className="w-full h-full object-cover" />
                        ) : (selectedTeacher.name || '?').charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedTeacher.name}</h3>
                        <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mt-1">{selectedTeacher.role || 'Fan tanlanmagan'}</p>
                      </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                        <div className="flex items-center gap-2 mb-2">
                           <Users size={16} className="text-emerald-600" />
                           <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Faol O'quvchilar</p>
                        </div>
                        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                          {activeStudentsCount}
                        </p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                        <div className="flex items-center gap-2 mb-2">
                           <BookOpen size={16} className="text-blue-600" />
                           <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Guruhlar</p>
                        </div>
                        <p className="text-2xl font-black text-blue-700 dark:text-blue-400">
                          {teacherGroups.length}
                        </p>
                      </div>
                    </div>

                    {/* Financial Estimation KPI */}
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl text-white shadow-lg shadow-purple-500/20 relative overflow-hidden">
                       <div className="absolute -right-4 -top-4 opacity-10"><Calculator size={100} /></div>
                       <div className="relative z-10">
                         <div className="flex items-center gap-2 mb-1">
                            <TrendingUp size={16} className="text-indigo-200" />
                            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Taxminiy Oylik KPI (40% Stavka)</p>
                         </div>
                         <h2 className="text-3xl font-black tracking-tight">{new Intl.NumberFormat('uz-UZ').format(estimatedSalary)} UZS</h2>
                         <p className="text-xs font-medium text-indigo-200 mt-2">Guruhlar tushumidan olingan ulush</p>
                       </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Ma'lumotlar</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                          <Phone size={16} className="text-zinc-400" />
                          {selectedTeacher.phone || 'Kiritilmagan'}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                          <Mail size={16} className="text-zinc-400" />
                          {selectedTeacher.email || 'Kiritilmagan'}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                          <Star size={16} className="text-zinc-400" />
                          Tajriba: {selectedTeacher.exp || 'Noma\'lum'}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                      <Button 
                        variant="secondary"
                        onClick={() => { setIsPayrollOpen(true); }}
                        className="flex-1 text-sm font-black bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                      >
                        Oylik Hisoblash
                      </Button>
                    </div>

                    <div className="flex gap-3 pt-3">
                      <Button 
                        variant="primary"
                        onClick={() => openModal(selectedTeacher)}
                        className="flex-1 text-sm font-black"
                      >
                        Tahrirlash
                      </Button>
                      <Button 
                        variant="danger"
                        onClick={() => { setIsDetailOpen(false); handleDelete(selectedTeacher.id); }}
                        className="flex-1 text-sm font-black"
                      >
                        O'chirish
                      </Button>
                    </div>
                  </div>
                 );
              })()}
            </motion.div>
           </>
        )}
      </AnimatePresence>

      {/* Payroll Modal */}
      {selectedTeacher && (
        <Modal 
          isOpen={isPayrollOpen}
          onClose={() => setIsPayrollOpen(false)}
          title="Oylik to'lash (Avto-hisoblash)"
        >
          <div className="space-y-6">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 rounded-2xl">
              {(() => {
                const teacherGroups = (groups || []).filter((g: any) => g.teacher === selectedTeacher.name);
                let totalEstRevenue = 0;
                teacherGroups.forEach((g: any) => {
                  const p = Number(g.price) || 0;
                  totalEstRevenue += p * (g.students || []).length;
                });
                const finalSalary = totalEstRevenue * (payrollRate / 100);

                const handlePay = async () => {
                  try {
                    await addFinance({
                      type: 'expense',
                      amount: finalSalary,
                      category: 'Oylik',
                      description: `${selectedTeacher.name} ga ${payrollRate}% lik stavka asosida oylik to'lovi`,
                      date: new Date().toISOString().split('T')[0],
                      method: 'Karta',
                      staffId: selectedTeacher.id,
                      staffName: selectedTeacher.name
                    });
                    showToast("Oylik to'lovi finance bo'limiga muvaffaqiyatli qo'shildi!", 'success');
                    setIsPayrollOpen(false);
                    setIsDetailOpen(false);
                  } catch (e) {
                    showToast("Xatolik yuz berdi", 'error');
                  }
                };

                return (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center text-sm font-bold text-slate-700 dark:text-zinc-300">
                       <span>Teacher Guruhlari (Revenue)</span>
                       <span>{new Intl.NumberFormat('uz-UZ').format(totalEstRevenue)} so'm</span>
                     </div>
                     <div className="flex items-center gap-4">
                       <Input 
                         type="number" 
                         label="Stavka Foizi (%)" 
                         value={payrollRate} 
                         onChange={(e) => setPayrollRate(Number(e.target.value))} 
                       />
                     </div>
                     <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
                       <span className="text-sm font-black text-emerald-800 dark:text-emerald-400">To'lanadigan Summa:</span>
                       <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{new Intl.NumberFormat('uz-UZ').format(finalSalary)} so'm</span>
                     </div>
                     <Button className="w-full mt-4" onClick={handlePay}>Moliya bo'limiga yozib to'lash</Button>
                  </div>
                );
              })()}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen}
        onClose={closeModal}
        title={formData.id ? "Ustozni Tahrirlash" : "Yangi Ustoz Qo'shish"}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="F.I.O"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Masalan: Aliyev Vali"
            />
            <Input
              label="Fan / Mutaxassislik"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Masalan: Matematika"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Telefon"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+998 90 123 45 67"
            />
            <Input
              label="Tajriba"
              value={formData.exp}
              onChange={(e) => setFormData({ ...formData, exp: e.target.value })}
              placeholder="3 yillik tajriba"
            />
          </div>

          <div className="p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl space-y-4">
             <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                <Lock size={12}/> Tizimga Kirish Ma'lumotlari
             </h4>
             <div className="grid grid-cols-2 gap-4">
               <Input
                 type="email"
                 label="Email"
                 disabled={!!formData.id}
                 value={formData.email}
                 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                 placeholder="ustoz@markaz.uz"
               />
               <Input
                 type="password"
                 label={formData.id ? "Yangi parol yozing" : "Parol kiriting *"}
                 value={formData.password}
                 onChange={(e) => setFormData({ ...formData, password: e.target.value })}
               />
             </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest">Qisqacha ma'lumot</label>
            <textarea
              value={formData.desc}
              onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-none"
              placeholder="Ustoz haqida qisqacha ma'lumot..."
            />
          </div>

          <ImageUpload
            value={formData.img || ''}
            onChange={(url) => setFormData({ ...formData, img: url })}
            label="Avatar"
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal}>Bekor qilish</Button>
            <Button onClick={handleSave}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
