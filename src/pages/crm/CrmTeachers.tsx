import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, X, User, Users, Star, Award, Mail, Phone, Lock } from 'lucide-react';
import ImageUpload from '../../components/ImageUpload';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

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
  const [searchTerm, setSearchTerm] = useState('');
  const { showToast } = useToast();

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
      alert("Ism va email kiritilishi shart!");
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
        if (!formData.password) { alert("Yangi ustoz uchun parol shart!"); return; }
        await api.post('/auth/users', dbPayload);
        showToast("Yangi ustoz muvaffaqiyatli qo'shildi!");
      }
      loadTeachers();
      closeModal();
    } catch (error: any) {
      console.error(error);
      alert(error.response?.data?.message || "Xatolik yuz berdi");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Ustozni tizimdan va bazadan butunlay o'chirmoqchimisiz?")) {
      try {
        await api.delete(`/auth/users/${id}`);
        showToast("O'chirildi!");
        loadTeachers();
      } catch (error) {
        showToast("Sizda ustozni o'chirish ruxsati yo'q, yoki xato yuz berdi");
      }
    }
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Ustozlar</h1>
          <p className="text-sm text-zinc-500 mt-1">Markaz o'qituvchilarini boshqarish</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Yangi ustoz
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-500">Jami ustozlar</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">{(teachers || []).length}</h3>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Award size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-500">Fanlar soni</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {new Set((teachers || []).map(t => t.role).filter(Boolean)).size}
            </h3>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Star size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-500">Tajribali (3+ yil)</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {(teachers || []).filter(t => t.exp && parseInt(t.exp) >= 3).length}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              placeholder="Ism yoki fan bo'yicha qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
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
                <tr key={teacher.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
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
                      {teacher.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">
                    {teacher.exp}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openModal(teacher)}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(teacher.id)}
                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {formData.id ? "Ustozni tahrirlash" : "Yangi ustoz"}
              </h3>
              <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><User size={14}/> F.I.O</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    placeholder="Masalan: Aliyev Vali"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Award size={14}/> Fan / Mutaxassislik</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    placeholder="Matematika"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Phone size={14}/> Telefon</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    placeholder="+998 90 123 45 67"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5"><Star size={14}/> Tajriba</label>
                  <input
                    type="text"
                    value={formData.exp}
                    onChange={(e) => setFormData({ ...formData, exp: e.target.value })}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    placeholder="8 yillik tajriba"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-4">
                 <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center justify-between">
                    Tizimga Kirish Ma'lumotlari
                    <span className="text-blue-500"><Lock size={14}/></span>
                 </h4>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-bold text-blue-800 dark:text-blue-300 mb-1">Email <span className="text-rose-500">*</span></label>
                     <input
                       type="email"
                       disabled={!!formData.id} // Cannot change email after creation for now
                       value={formData.email}
                       onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                       className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white disabled:opacity-50"
                       placeholder="ustoz@markaz.uz"
                     />
                   </div>
                   <div>
                     <label className="block text-[10px] font-bold text-blue-800 dark:text-blue-300 mb-1">Parol {formData.id ? "(Faqat o'zgartirish uchun)" : <span className="text-rose-500">*</span>}</label>
                     <input
                       type="password"
                       value={formData.password}
                       onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                       className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                       placeholder={formData.id ? "Yangi parol yozing..." : "Parol kiriting"}
                     />
                   </div>
                 </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Qisqacha ma'lumot</label>
                <textarea
                  value={formData.desc}
                  onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white resize-none"
                  placeholder="Ustoz haqida qisqacha ma'lumot..."
                />
              </div>

              <ImageUpload
                value={formData.img || ''}
                onChange={(url) => setFormData({ ...formData, img: url })}
                label="Rasm"
              />
            </div>

            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-950/50">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
