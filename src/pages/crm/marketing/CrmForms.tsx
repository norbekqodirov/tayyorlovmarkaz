import { useState } from 'react';
import { Link as LinkIcon, Copy, ExternalLink, Plus, Edit2, Trash2 } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useCrmData } from '../../../hooks/useCrmData';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { StatCard } from '../../../components/ui/StatCard';

interface Form {
  id: string;
  title: string;
  description?: string | null;
  course?: string | null;
  isActive: boolean;
  submissions: number;
}

export default function CrmForms() {
  const { documents: forms, addDocument, updateDocument, deleteDocument } = useFirestore<Form>('forms');
  const { courses } = useCrmData();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<Partial<Form>>({ title: '', description: '', course: '', isActive: true });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const openModal = (form: Form | null = null) => {
    if (form) {
      setEditingForm(form);
      setFormData({ title: form.title, description: form.description || '', course: form.course || '', isActive: form.isActive });
    } else {
      setEditingForm(null);
      setFormData({ title: '', description: '', course: '', isActive: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingForm(null);
  };

  const handleSave = async () => {
    if (!formData.title?.trim()) {
      showToast('Forma nomi kiritilishi shart', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (editingForm) {
        await updateDocument(editingForm.id, formData);
      } else {
        await addDocument({ ...formData, submissions: 0 } as Omit<Form, 'id'>);
      }
      showToast(editingForm ? 'Forma yangilandi' : 'Forma qo\'shildi', 'success');
      closeModal();
    } catch (error) {
      console.error('Error saving form:', error);
      showToast('Formani saqlashda xatolik yuz berdi.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    try {
      await deleteDocument(deleteConfirm.id);
      showToast('Forma o\'chirildi', 'success');
    } catch (error) {
      showToast('Formani o\'chirishda xatolik yuz berdi.', 'error');
    }
    setDeleteConfirm({ open: false, id: '' });
  };

  const shareUrl = (form: Form) => `${window.location.origin}/l/${form.id}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Nusxa olindi!', 'success');
  };

  const totalForms = forms.length;
  const activeForms = forms.filter(f => f.isActive).length;
  const totalSubmissions = forms.reduce((sum, f) => sum + (f.submissions || 0), 0);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Formani o'chirish"
        message="Haqiqatan ham bu formani o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Target Formalar</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Reklama uchun qisqa lid-yig'ish sahifalari</p>
        </div>
        <Button onClick={() => openModal()} leftIcon={<Plus size={18} />}>
          Yangi forma yaratish
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard variant="minimal" label="Jami Formalar" value={totalForms} icon={<LinkIcon size={18} />} color="blue" />
        <StatCard variant="minimal" label="Faol Formalar" value={activeForms} icon={<LinkIcon size={18} />} color="emerald" />
        <StatCard variant="minimal" label="Jami Arizalar" value={totalSubmissions} icon={<LinkIcon size={18} />} color="violet" />
      </div>

      {forms.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <LinkIcon size={40} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
          <p className="font-bold text-zinc-500">Hali forma yaratilmagan</p>
          <p className="text-sm text-zinc-400 mt-1">Reklama kampaniyalari uchun birinchi lid-yig'ish formangizni yarating</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map(form => (
            <div key={form.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <LinkIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{form.title}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${form.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                      {form.isActive ? 'Faol' : "To'xtatilgan"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openModal(form)} className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"><Edit2 size={16}/></button>
                  <button onClick={() => handleDelete(form.id)} className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"><Trash2 size={16}/></button>
                </div>
              </div>

              {form.course && <p className="text-xs text-zinc-500 mb-3">Kurs: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{form.course}</span></p>}

              <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 mb-6">
                <input
                  type="text"
                  value={shareUrl(form)}
                  readOnly
                  className="bg-transparent text-xs font-mono text-zinc-600 dark:text-zinc-400 flex-1 outline-none truncate"
                />
                <button onClick={() => copyToClipboard(shareUrl(form))} className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors" title="Nusxa olish">
                  <Copy size={14} />
                </button>
                <a href={shareUrl(form)} target="_blank" rel="noopener noreferrer" className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors" title="Ochish">
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Jami Arizalar</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{form.submissions || 0}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingForm ? 'Formani tahrirlash' : 'Yangi forma yaratish'}
      >
        <div className="space-y-4">
          <Input
            label="Forma nomi"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            placeholder="Masalan: Instagram Target - Kuzgi qabul"
          />
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Tavsif</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={2}
              placeholder="Forma haqida qisqacha (ixtiyoriy)"
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Kurs</label>
            <select
              value={formData.course || ''}
              onChange={(e) => setFormData({...formData, course: e.target.value})}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            >
              <option value="">Tanlanmagan</option>
              {courses.map((c: any) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
              className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Forma faol</span>
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal}>Bekor qilish</Button>
            <Button onClick={handleSave} isLoading={isSaving}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
