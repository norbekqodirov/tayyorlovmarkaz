import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Mail, Phone, Edit2, Trash2, ShieldCheck, Users, Building2, DollarSign } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { formatNumber } from '../../../utils/formatters';

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

export default function CrmStaff() {
  const { data: staff = [], loading, error, addDocument, updateDocument, deleteDocument } = useFirestore<StaffMember>('staff');
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
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
    if (searchParams.has('edit')) setSearchParams({}, { replace: true });
  };

  // Xodim profili sahifasidan "Tahrirlash" bosilganda shu ro'yxat sahifasiga
  // ?edit=<id> bilan qaytariladi — edit modali shu yerda (yagona manba) ochiladi.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && staff.length > 0) {
      const member = staff.find(s => s.id === editId);
      if (member) openModal(member);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, staff]);

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
        <StatCard variant="gradient" color="emerald" label="Oylik Fond" value={formatNumber(safeStaff.reduce((acc, s) => acc + (Number(s.salary) || 0), 0))} sub="so'm / oy" icon={<DollarSign size={17} strokeWidth={2.5} />} />
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
                <tr key={member.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group cursor-pointer" onClick={() => navigate(`/crmtayyorlovmarkaz/staff/${member.id}`)}>
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
