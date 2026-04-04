import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, X, Users, Star, Award } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import ImageUpload from '../../components/ImageUpload';

interface Teacher {
  id: string;
  name: string;
  role: string;
  exp: string;
  desc: string;
  img: string;
}

export default function CrmTeachers() {
  const { data: teachers = [], loading, addDocument, updateDocument, deleteDocument } = useFirestore<Omit<Teacher, 'id'>>('teachers');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<Partial<Teacher>>({
    name: '',
    role: '',
    exp: '',
    desc: '',
    img: ''
  });

  const handleSave = async () => {
    if (!formData.name || !formData.role) {
      alert("Ism va mutaxassislik kiritilishi shart!");
      return;
    }

    try {
      const teacherData = { ...formData } as Omit<Teacher, 'id'>;
      if (formData.id) {
        await updateDocument(formData.id, teacherData);
      } else {
        await addDocument(teacherData);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving teacher:", error);
      alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Haqiqatan ham bu ustozni o'chirmoqchimisiz?")) {
      try {
        await deleteDocument(id);
      } catch (error) {
        console.error("Error deleting teacher:", error);
        alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
      }
    }
  };

  const openModal = (teacher: Teacher | null = null) => {
    if (teacher) {
      setFormData(teacher);
    } else {
      setFormData({ name: '', role: '', exp: '', desc: '', img: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const filteredTeachers = (teachers || []).filter(t =>
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
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">F.I.O</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  placeholder="Masalan: Aliyev Vali"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Fan / Mutaxassislik</label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  placeholder="Matematika"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tajriba</label>
                <input
                  type="text"
                  value={formData.exp}
                  onChange={(e) => setFormData({ ...formData, exp: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  placeholder="Masalan: 8 yillik tajriba yoki IELTS 8.5"
                />
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
