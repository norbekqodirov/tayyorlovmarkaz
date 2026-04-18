import { useState } from 'react';
import { Plus, Edit2, Trash2, Image as ImageIcon, FileText, X } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function CrmContent() {
  const [activeTab, setActiveTab] = useState('news');
  const { showToast } = useToast();

  const { documents: news, addDocument: addNews, updateDocument: updateNews, deleteDocument: deleteNews } = useFirestore<any>('news');
  const { documents: gallery, addDocument: addGallery, updateDocument: updateGallery, deleteDocument: deleteGallery } = useFirestore<any>('gallery');

  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'news' | 'gallery'; id: string }>({ open: false, type: 'news', id: '' });
  
  const [newsForm, setNewsForm] = useState({ title: '', excerpt: '', content: '', imageUrl: '', status: 'Faol' });
  const [galleryForm, setGalleryForm] = useState({ url: '', title: '', date: '' });

  const openNewsModal = (item: any = null) => {
    if (item) {
      setEditingItem(item);
      setNewsForm({ 
        title: item.title, 
        excerpt: item.excerpt || '', 
        content: item.content || '', 
        imageUrl: item.imageUrl || '', 
        status: item.status 
      });
    } else {
      setEditingItem(null);
      setNewsForm({ title: '', excerpt: '', content: '', imageUrl: '', status: 'Faol' });
    }
    setIsNewsModalOpen(true);
  };

  const openGalleryModal = (item: any = null) => {
    if (item) {
      setEditingItem(item);
      setGalleryForm({ url: item.url, title: item.title || '', date: item.date || '' });
    } else {
      setEditingItem(null);
      setGalleryForm({ url: '', title: '', date: new Date().toISOString().split('T')[0] });
    }
    setIsGalleryModalOpen(true);
  };

  const closeModals = () => {
    setIsNewsModalOpen(false);
    setIsGalleryModalOpen(false);
    setEditingItem(null);
  };

  const handleSaveNews = async () => {
    try {
      if (editingItem?.id) {
        await updateNews(editingItem.id, newsForm);
      } else {
        await addNews({
          ...newsForm,
          date: new Date().toISOString().split('T')[0],
          author: "Admin"
        });
      }
      closeModals();
    } catch (error) {
      console.error('Error saving news:', error);
      showToast('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.', 'error');
    }
  };

  const handleSaveGallery = async () => {
    try {
      if (editingItem?.id) {
        await updateGallery(editingItem.id, galleryForm);
      } else {
        await addGallery(galleryForm);
      }
      closeModals();
    } catch (error) {
      console.error('Error saving gallery:', error);
      showToast('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.', 'error');
    }
  };

  const handleDeleteNews = (id: string) => {
    setDeleteConfirm({ open: true, type: 'news', id });
  };

  const handleDeleteGallery = (id: string) => {
    setDeleteConfirm({ open: true, type: 'gallery', id });
  };

  const confirmDelete = async () => {
    try {
      if (deleteConfirm.type === 'news') {
        await deleteNews(deleteConfirm.id);
      } else {
        await deleteGallery(deleteConfirm.id);
      }
      showToast('O\'chirildi', 'success');
    } catch (error) {
      showToast('Xatolik yuz berdi.', 'error');
    }
    setDeleteConfirm({ open: false, type: 'news', id: '' });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={deleteConfirm.type === 'news' ? "Yangilikni o'chirish" : "Rasmni o'chirish"}
        message={deleteConfirm.type === 'news' ? "Haqiqatan ham bu yangilikni o'chirmoqchimisiz?" : "Haqiqatan ham bu rasmni o'chirmoqchimisiz?"}
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, type: 'news', id: '' })}
      />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Kontent Boshqaruvi</h1>
        <button 
          onClick={() => activeTab === 'news' ? openNewsModal() : openGalleryModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} />
          Yangi qo'shish
        </button>
      </div>

      <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('news')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'news' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}
        >
          <FileText size={16} />
          Yangiliklar / Blog
        </button>
        <button 
          onClick={() => setActiveTab('gallery')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'gallery' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}
        >
          <ImageIcon size={16} />
          Galereya
        </button>
      </div>

      {activeTab === 'news' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Rasm</th>
                  <th className="px-6 py-4">Sarlavha</th>
                  <th className="px-6 py-4">Sana</th>
                  <th className="px-6 py-4">Holat</th>
                  <th className="px-6 py-4 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {(news || []).map((item: any) => (
                  <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400">
                            <ImageIcon size={16} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white max-w-xs truncate">{item.title}</td>
                    <td className="px-6 py-4 text-zinc-500">{item.date}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${item.status === 'Faol' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openNewsModal(item)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"><Edit2 size={16}/></button>
                        <button onClick={() => handleDeleteNews(item.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'gallery' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(gallery || []).map((item: any) => (
            <div key={item.id} className="group relative aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <img src={item.url} alt="Gallery item" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <button onClick={() => openGalleryModal(item)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-600 hover:scale-110 transition-transform"><Edit2 size={18}/></button>
                <button onClick={() => handleDeleteGallery(item.id)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-red-600 hover:scale-110 transition-transform"><Trash2 size={18}/></button>
              </div>
            </div>
          ))}
          <button onClick={() => openGalleryModal()} className="aspect-square bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400">
            <Plus size={32} className="mb-2" />
            <span className="font-bold text-sm">Rasm qo'shish</span>
          </button>
        </div>
      )}

      {/* News Modal */}
      {isNewsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 my-8">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingItem ? 'Yangilikni tahrirlash' : 'Yangi yangilik qo\'shish'}</h3>
              <button onClick={closeModals} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Sarlavha</label>
                <input 
                  type="text" 
                  value={newsForm.title}
                  onChange={(e) => setNewsForm({...newsForm, title: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="Yangilik sarlavhasi..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Rasm URL manzili</label>
                <input 
                  type="text" 
                  value={newsForm.imageUrl}
                  onChange={(e) => setNewsForm({...newsForm, imageUrl: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Qisqacha matn (Excerpt)</label>
                <textarea 
                  value={newsForm.excerpt}
                  onChange={(e) => setNewsForm({...newsForm, excerpt: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-none"
                  placeholder="Maqolaning qisqacha mazmuni..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">To'liq matn</label>
                <textarea 
                  value={newsForm.content}
                  onChange={(e) => setNewsForm({...newsForm, content: e.target.value})}
                  rows={12}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-y font-mono"
                  placeholder="Maqolaning to'liq matni (Markdown formatida yozishingiz mumkin)..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Holat</label>
                <select 
                  value={newsForm.status}
                  onChange={(e) => setNewsForm({...newsForm, status: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                >
                  <option value="Faol">Faol</option>
                  <option value="Arxiv">Arxiv</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
              <button onClick={closeModals} className="px-4 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                Bekor qilish
              </button>
              <button onClick={handleSaveNews} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery Modal */}
      {isGalleryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{editingItem ? 'Rasmni tahrirlash' : 'Yangi rasm qo\'shish'}</h3>
              <button onClick={closeModals} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Rasm URL manzili</label>
                <input 
                  type="text" 
                  value={galleryForm.url}
                  onChange={(e) => setGalleryForm({...galleryForm, url: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Sarlavha</label>
                <input 
                  type="text" 
                  value={galleryForm.title}
                  onChange={(e) => setGalleryForm({...galleryForm, title: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                  placeholder="Rasm sarlavhasi..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Sana</label>
                <input 
                  type="date" 
                  value={galleryForm.date}
                  onChange={(e) => setGalleryForm({...galleryForm, date: e.target.value})}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                />
              </div>
              {galleryForm.url && (
                <div className="mt-4 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                  <img src={galleryForm.url} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400?text=Xato+URL')} referrerPolicy="no-referrer" />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
              <button onClick={closeModals} className="px-4 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                Bekor qilish
              </button>
              <button onClick={handleSaveGallery} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm">
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
