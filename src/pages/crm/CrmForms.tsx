import { useState, useEffect } from 'react';
import { Link as LinkIcon, Copy, ExternalLink, Plus, BarChart2, Edit2, Trash2, X } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Form {
  id: string;
  name: string;
  url: string;
  views: number;
  conversions: number;
  status: 'Faol' | 'To\'xtatilgan';
}

export default function CrmForms() {
  const { documents: forms, addDocument, updateDocument, deleteDocument } = useFirestore<Form>('forms');
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<Partial<Form>>({ name: '', url: '', status: 'Faol' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const openModal = (form: Form | null = null) => {
    if (form) {
      setEditingForm(form);
      setFormData({ name: form.name, url: form.url, status: form.status });
    } else {
      setEditingForm(null);
      setFormData({ name: '', url: `${window.location.origin}/l/`, status: 'Faol' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingForm(null);
  };

  const handleSave = async () => {
    try {
      if (editingForm) {
        await updateDocument(editingForm.id, formData);
      } else {
        const newForm = {
          ...formData,
          views: 0,
          conversions: 0
        };
        await addDocument(newForm as Omit<Form, 'id'>);
      }
      showToast(editingForm ? 'Forma yangilandi' : 'Forma qo\'shildi', 'success');
      closeModal();
    } catch (error) {
      console.error('Error saving form:', error);
      showToast('Formani saqlashda xatolik yuz berdi.', 'error');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Nusxa olindi!', 'success');
  };

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
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Target Formalar</h1>
        <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
          <Plus size={18} />
          Yangi forma yaratish
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {forms.map(form => (
          <div key={form.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <LinkIcon size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{form.name}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${form.status === 'Faol' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {form.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openModal(form)} className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"><Edit2 size={16}/></button>
                <button onClick={() => handleDelete(form.id)} className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"><Trash2 size={16}/></button>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 mb-6">
              <input 
                type="text" 
                value={form.url} 
                readOnly 
                className="bg-transparent text-xs font-mono text-zinc-600 dark:text-zinc-400 flex-1 outline-none truncate"
              />
              <button onClick={() => copyToClipboard(form.url)} className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors" title="Nusxa olish">
                <Copy size={14} />
              </button>
              <a href={form.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors" title="Ochish">
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Ko'rishlar</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{form.views}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Konversiya (Lidlar)</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{form.conversions}</p>
                  <span className="text-xs font-bold text-zinc-400">({((form.conversions / form.views) * 100).toFixed(1)}%)</span>
                </div>
              </div>
            </div>
            
            <button className="mt-4 w-full py-2 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              <BarChart2 size={16} />
              Batafsil statistika
            </button>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingForm ? 'Formani tahrirlash' : 'Yangi forma yaratish'}</h3>
              <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Forma nomi</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="Masalan: Instagram Target - Kuzgi qabul"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">URL manzil</label>
                <input 
                  type="text" 
                  value={formData.url}
                  onChange={(e) => setFormData({...formData, url: e.target.value})}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder={`${window.location.origin}/l/...`}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Holat</label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                >
                  <option value="Faol">Faol</option>
                  <option value="To'xtatilgan">To'xtatilgan</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50 dark:bg-zinc-900/50">
              <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                Bekor qilish
              </button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors">
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
