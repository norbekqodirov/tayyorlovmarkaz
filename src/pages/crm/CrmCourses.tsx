import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, Edit2, Trash2, BookOpen, 
  Clock, DollarSign, Layers, ChevronRight,
  X, Save, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

interface Course {
  id: string;
  name: string;
  category: string;
  duration: string;          // e.g., "3 oy"
  lessonDuration: number;    // minutes per lesson, e.g. 90
  price: number;
  description: string;
  lessonsPerWeek: number;
  status: 'Active' | 'Draft' | 'Archived';
}

const CATEGORIES = ['Tillar', 'IT', 'Matematika', 'San\'at', 'Boshqa'];

export default function CrmCourses() {
  const { data: courses, loading, error, addDocument, updateDocument, deleteDocument } = useFirestore<Course>('courses');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Barchasi');

  const [formData, setFormData] = useState<Partial<Course>>({
    name: '',
    category: 'Tillar',
    duration: '3 oy',
    lessonDuration: 90,
    price: 0,
    description: '',
    lessonsPerWeek: 3,
    status: 'Active'
  });

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      alert('Iltimos, kurs nomi va narxini kiriting!');
      return;
    }

    try {
      if (editingCourse) {
        await updateDocument(editingCourse.id, formData);
      } else {
        await addDocument({
          name: formData.name || '',
          category: formData.category || 'Tillar',
          duration: formData.duration || '3 oy',
          lessonDuration: formData.lessonDuration || 90,
          price: formData.price || 0,
          description: formData.description || '',
          lessonsPerWeek: formData.lessonsPerWeek || 3,
          status: formData.status || 'Active'
        } as any);
      }
      closeModal();
    } catch (error) {
      console.error("Error saving course:", error);
      alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Ushbu kursni o\'chirmoqchimisiz?')) {
      try {
        await deleteDocument(id);
      } catch (error) {
        console.error("Error deleting course:", error);
        alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
      }
    }
  };

  const openModal = (course: Course | null = null) => {
    if (course) {
      setEditingCourse(course);
      setFormData(course);
    } else {
      setEditingCourse(null);
      setFormData({
        name: '',
        category: 'Tillar',
        duration: '3 oy',
        lessonDuration: 90,
        price: 0,
        description: '',
        lessonsPerWeek: 3,
        status: 'Active'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCourse(null);
  };

  const filteredCourses = (courses || []).filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'Barchasi' || c.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Kurslar Boshqaruvi</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi kurslarini yaratish va tahrirlash</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus size={20} />
          Yangi Kurs
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input 
            type="text"
            placeholder="Kurslarni qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
          />
        </div>
        <div className="md:col-span-1">
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
          >
            <option value="Barchasi">Barcha kategoriyalar</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map(course => (
          <motion.div 
            key={course.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden group hover:shadow-xl transition-all"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  course.category === 'IT' ? 'bg-purple-100 text-purple-600' :
                  course.category === 'Tillar' ? 'bg-blue-100 text-blue-600' :
                  'bg-zinc-100 text-zinc-600'
                }`}>
                  {course.category}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(course)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(course.id)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{course.name}</h3>
                <p className="text-zinc-500 text-xs font-medium line-clamp-2 leading-relaxed">
                  {course.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{course.duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{course.lessonsPerWeek} dars/hafta</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-lg font-black text-blue-600">
                  {formatMoney(course.price)}
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${
                  course.status === 'Active' ? 'text-emerald-600' : 'text-zinc-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${course.status === 'Active' ? 'bg-emerald-600' : 'bg-zinc-400'}`} />
                  {course.status}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingCourse ? 'Kursni Tahrirlash' : 'Yangi Kurs Yaratish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs Nomi</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    placeholder="Masalan: IELTS Foundation"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Narxi (oyiga)</label>
                    <input 
                      type="number" 
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Davomiyligi</label>
                    <select
                      value={formData.duration}
                      onChange={(e) => setFormData({...formData, duration: e.target.value})}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {['1 oy', '2 oy', '3 oy', '4 oy', '5 oy', '6 oy', '8 oy', '12 oy'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Darslar soni (haftasiga)</label>
                    <input
                      type="number"
                      min="1" max="7"
                      value={formData.lessonsPerWeek}
                      onChange={(e) => setFormData({...formData, lessonsPerWeek: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dars davomiyligi (daqiqa)</label>
                    <select
                      value={formData.lessonDuration}
                      onChange={(e) => setFormData({...formData, lessonDuration: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {[45, 60, 90, 120].map(d => (
                        <option key={d} value={d}>{d} daqiqa</option>
                      ))}
                    </select>
                  </div>
                </div>


                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white min-h-[100px]"
                    placeholder="Kurs haqida batafsil..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</label>
                  <div className="flex gap-4">
                    {['Active', 'Draft', 'Archived'].map(s => (
                      <button
                        key={s}
                        onClick={() => setFormData({...formData, status: s as any})}
                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                          formData.status === s 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
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
