import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, BookOpen,
  Clock, DollarSign, Layers, ChevronRight,
  X, Save, CheckCircle2, AlertCircle, Users,
  Image as ImageIcon, Upload, Tag, TrendingUp, Download
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { exportToExcel } from '../../utils/export';

interface Course {
  id: string;
  name: string;
  category: string;
  duration: string;
  lessonDuration: number;
  price: number;
  description: string;
  lessonsPerWeek: number;
  status: 'Faol' | 'Qoralama' | 'Arxiv';
  image?: string;
}

const CATEGORIES = [
  { label: 'Tillar', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', gradient: 'from-blue-500 to-blue-600' },
  { label: 'IT', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500', gradient: 'from-violet-500 to-violet-600' },
  { label: 'Matematika', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', gradient: 'from-amber-500 to-amber-600' },
  { label: 'San\'at', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', dot: 'bg-rose-500', gradient: 'from-rose-500 to-rose-600' },
  { label: 'Fan', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', gradient: 'from-emerald-500 to-emerald-600' },
  { label: 'Boshqa', color: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400', gradient: 'from-zinc-400 to-zinc-500' },
];

const getCategoryStyle = (cat: string) =>
  CATEGORIES.find(c => c.label === cat) || CATEGORIES[CATEGORIES.length - 1];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  'Faol': { label: 'Faol', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  'Active': { label: 'Faol', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  'Qoralama': { label: 'Qoralama', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  'Draft': { label: 'Qoralama', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  'Arxiv': { label: 'Arxiv', cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' },
  'Archived': { label: 'Arxiv', cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500' },
};

export default function CrmCourses() {
  const { data: courses = [], loading, addDocument, updateDocument, deleteDocument } = useFirestore<Course>('courses');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Barchasi');
  const [filterStatus, setFilterStatus] = useState('Barchasi');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

  const [formData, setFormData] = useState<Partial<Course> & { imagePreview?: string }>({
    name: '',
    category: 'Tillar',
    duration: '3 oy',
    lessonDuration: 90,
    price: 0,
    description: '',
    lessonsPerWeek: 3,
    status: 'Faol',
    image: '',
  });

  // Per course student count (from students collection)
  const studentCountByCourse = useMemo(() => {
    const map: Record<string, number> = {};
    (students || []).forEach((s: any) => {
      if (s.course) map[s.course] = (map[s.course] || 0) + 1;
    });
    return map;
  }, [students]);

  // Overall stats
  const stats = useMemo(() => ({
    total: courses.length,
    active: courses.filter(c => c.status === 'Faol').length,
    totalStudents: students.length,
    avgPrice: courses.length > 0 ? Math.round(courses.reduce((s, c) => s + (c.price || 0), 0) / courses.length) : 0,
  }), [courses, students]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setFormData(f => ({ ...f, image: dataUrl, imagePreview: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!formData.name) {
      showToast('Kurs nomini kiriting!', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name || '',
        category: formData.category || 'Tillar',
        duration: formData.duration || '3 oy',
        lessonDuration: formData.lessonDuration || 90,
        price: formData.price || 0,
        description: formData.description || '',
        lessonsPerWeek: formData.lessonsPerWeek || 3,
        status: formData.status || 'Faol',
        image: formData.image || '',
      };
      if (editingCourse) {
        await updateDocument(editingCourse.id, payload);
        showToast('Kurs yangilandi ✓', 'success');
      } else {
        await addDocument(payload as any);
        showToast('Yangi kurs qo\'shildi ✓', 'success');
      }
      closeModal();
    } catch (err) {
      showToast('Xatolik yuz berdi!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirm({ open: true, id, name });
  };

  const confirmDelete = async () => {
    try {
      await deleteDocument(deleteConfirm.id);
      showToast('Kurs o\'chirildi', 'success');
    } catch {
      showToast('O\'chirishda xatolik!', 'error');
    }
    setDeleteConfirm({ open: false, id: '', name: '' });
  };

  const openModal = (course: Course | null = null) => {
    if (course) {
      setEditingCourse(course);
      setFormData({ ...course, imagePreview: course.image });
    } else {
      setEditingCourse(null);
      setFormData({ name: '', category: 'Tillar', duration: '3 oy', lessonDuration: 90, price: 0, description: '', lessonsPerWeek: 3, status: 'Faol', image: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCourse(null);
  };

  const filteredCourses = useMemo(() => {
    return (courses || []).filter(c => {
      const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'Barchasi' || c.category === filterCategory;
      const normalizedStatus = c.status;
      const matchesStatus = filterStatus === 'Barchasi' || normalizedStatus === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [courses, searchQuery, filterCategory, filterStatus]);

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat('uz-UZ').format(amount || 0) + ' so\'m';

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Kursni o'chirish"
        message={`"${deleteConfirm.name}" kursini o'chirmoqchimisiz?`}
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Kurslar Boshqaruvi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">O'quv markaz kurslarini yaratish, boshqarish va tahlil qilish</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(filteredCourses.map(c => ({
              ...c,
              price: c.price ? Number(c.price).toLocaleString() + ' UZS' : '',
              lessonsPerWeek: c.lessonsPerWeek || '',
            })), [
              { header: 'Kurs nomi', key: 'name', width: 25 },
              { header: 'Kategoriya', key: 'category', width: 15 },
              { header: 'Davomiyligi', key: 'duration', width: 15 },
              { header: 'Dars (min)', key: 'lessonDuration', width: 12 },
              { header: 'Hafta/dars', key: 'lessonsPerWeek', width: 12 },
              { header: 'Narx', key: 'price', width: 18 },
              { header: 'Holat', key: 'status', width: 12 },
            ], 'Kurslar')}
            className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all"
            title="Excel yuklab olish"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />Yangi Kurs
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Jami Kurslar', value: stats.total, icon: BookOpen, color: 'blue' },
          { label: 'Faol Kurslar', value: stats.active, icon: CheckCircle2, color: 'emerald' },
          { label: 'Jami O\'quvchilar', value: stats.totalStudents, icon: Users, color: 'violet' },
          { label: 'O\'rtacha Narx', value: formatMoney(stats.avgPrice), icon: DollarSign, color: 'amber' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-${s.color}-50 dark:bg-${s.color}-900/20 text-${s.color}-600 dark:text-${s.color}-400`}>
              <s.icon size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest truncate">{s.label}</p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5 truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Kurslarni qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
        >
          <option value="Barchasi">Barcha kategoriyalar</option>
          {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
        >
          <option value="Barchasi">Barcha holatlar</option>
          <option value="Faol">Faol</option>
          <option value="Qoralama">Qoralama</option>
          <option value="Arxiv">Arxiv</option>
        </select>
      </div>

      {/* Course Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 h-52 animate-pulse" />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-20 text-zinc-400">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-bold">Hali kurslar yo'q</p>
          <p className="text-sm mt-1">Yangi kurs qo'shing</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map(course => {
            const catStyle = getCategoryStyle(course.category);
            const studentCount = studentCountByCourse[course.name] || 0;
            const statusInfo = STATUS_LABELS[course.status] || { label: course.status, cls: 'bg-zinc-100 text-zinc-500' };
            return (
              <motion.div
                key={course.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden group hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
              >
                {/* Image / Category Banner */}
                {course.image ? (
                  <div className="relative h-36 overflow-hidden">
                    <img src={course.image} alt={course.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-sm ${catStyle.color}`}>
                        {course.category}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openModal(course)} className="p-1.5 bg-white/90 rounded-lg text-zinc-600 hover:text-blue-600 transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(course.id, course.name)} className="p-1.5 bg-white/90 rounded-lg text-rose-600 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`h-2 bg-gradient-to-r ${catStyle.gradient}`} />
                )}

                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {!course.image && (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 ${catStyle.color}`}>
                          {course.category}
                        </span>
                      )}
                      <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight line-clamp-1 group-hover:text-blue-600 transition-colors">{course.name}</h3>
                    </div>
                    {!course.image && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openModal(course)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-600 transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(course.id, course.name)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg text-rose-600 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>

                  {course.description && (
                    <p className="text-xs text-zinc-500 font-medium line-clamp-2 leading-relaxed">{course.description}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex flex-col items-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                      <Clock size={14} className="text-zinc-400" />
                      <span className="text-[10px] font-black text-zinc-600 dark:text-zinc-400">{course.duration}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                      <Layers size={14} className="text-zinc-400" />
                      <span className="text-[10px] font-black text-zinc-600 dark:text-zinc-400">{course.lessonsPerWeek}x/hafta</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                      <Users size={14} className="text-blue-500" />
                      <span className="text-[10px] font-black text-blue-600 dark:text-blue-400">{studentCount} ta</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-base font-black text-blue-600">{formatMoney(course.price)}</div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingCourse ? 'Kursni Tahrirlash' : 'Yangi Kurs Yaratish'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 transition-colors"><X size={20} /></button>
              </div>

              <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
                {/* Image Upload */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs rasmi (ixtiyoriy)</label>
                  {formData.imagePreview ? (
                    <div className="relative rounded-xl overflow-hidden h-36">
                      <img src={formData.imagePreview} alt="preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setFormData(f => ({ ...f, image: '', imagePreview: '' }))}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg text-white hover:bg-rose-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-28 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-400 dark:hover:border-blue-500 text-zinc-400 hover:text-blue-500 transition-all"
                    >
                      <Upload size={22} />
                      <span className="text-xs font-bold">Rasm yuklash</span>
                      <span className="text-[10px]">PNG, JPG — max 2MB</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs Nomi *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    placeholder="Masalan: IELTS Foundation"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Narxi (oyiga)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="400000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Davomiyligi</label>
                    <select
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    >
                      {['1 oy', '2 oy', '3 oy', '4 oy', '5 oy', '6 oy', '8 oy', '12 oy'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dars/hafta</label>
                    <input
                      type="number" min="1" max="7"
                      value={formData.lessonsPerWeek}
                      onChange={(e) => setFormData({ ...formData, lessonsPerWeek: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Dars (min)</label>
                    <input
                      type="number" min="15" max="300"
                      value={formData.lessonDuration}
                      onChange={(e) => setFormData({ ...formData, lessonDuration: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white min-h-[80px] resize-none"
                    placeholder="Kurs haqida batafsil..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                  <div className="flex gap-3">
                    {(['Faol', 'Qoralama', 'Arxiv'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setFormData({ ...formData, status: s })}
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

              <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                <button onClick={closeModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  Bekor
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20 disabled:opacity-60"
                >
                  {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
