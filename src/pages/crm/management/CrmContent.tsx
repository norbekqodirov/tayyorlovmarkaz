import { useState } from 'react';
import { Plus, Edit2, Trash2, Image as ImageIcon, FileText, X } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

export default function CrmContent() {
  const [activeTab, setActiveTab] = useState('news');
  const { showToast } = useToast();

  const currentRoleLevel = getCurrentRoleLevel();
  const canManageContent = currentRoleLevel >= ROLE_LEVEL.ADMIN;

  const {
    documents: news,
    loading: newsLoading,
    error: newsError,
    addDocument: addNews,
    updateDocument: updateNews,
    deleteDocument: deleteNews,
    refetch: refetchNews,
  } = useFirestore<any>('news');

  const {
    documents: gallery,
    loading: galleryLoading,
    error: galleryError,
    addDocument: addGallery,
    updateDocument: updateGallery,
    deleteDocument: deleteGallery,
    refetch: refetchGallery,
  } = useFirestore<any>('gallery');

  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [savingNews, setSavingNews] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'news' | 'gallery'; id: string }>({
    open: false,
    type: 'news',
    id: '',
  });

  const [newsForm, setNewsForm] = useState({ title: '', excerpt: '', content: '', imageUrl: '', status: 'Faol' });
  const [galleryForm, setGalleryForm] = useState({ url: '', title: '', date: '' });

  const openNewsModal = (item: any = null) => {
    if (!canManageContent) {
      showToast("Sizda yangiliklarni boshqarish uchun ruxsat yo'q", 'error');
      return;
    }
    if (item) {
      setEditingItem(item);
      setNewsForm({
        title: item.title || '',
        excerpt: item.excerpt || '',
        content: item.content || '',
        imageUrl: item.imageUrl || '',
        status: item.status || 'Faol',
      });
    } else {
      setEditingItem(null);
      setNewsForm({ title: '', excerpt: '', content: '', imageUrl: '', status: 'Faol' });
    }
    setIsNewsModalOpen(true);
  };

  const openGalleryModal = (item: any = null) => {
    if (!canManageContent) {
      showToast("Sizda galereyani boshqarish uchun ruxsat yo'q", 'error');
      return;
    }
    if (item) {
      setEditingItem(item);
      setGalleryForm({ url: item.url || '', title: item.title || '', date: item.date || '' });
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
    if (!canManageContent) {
      showToast("Sizda bu amalni bajarish uchun ruxsat yo'q", 'error');
      return;
    }
    const title = newsForm.title.trim();
    const excerpt = newsForm.excerpt.trim();
    const content = newsForm.content.trim();
    const imageUrl = newsForm.imageUrl.trim();

    if (!title) {
      showToast("Yangilik sarlavhasini kiriting", 'error');
      return;
    }
    if (!content) {
      showToast("Yangilik matnini kiriting", 'error');
      return;
    }

    setSavingNews(true);
    try {
      if (editingItem?.id) {
        await updateNews(editingItem.id, { title, excerpt, content, imageUrl, status: newsForm.status });
        showToast("Yangilik tahrirlandi", 'success');
      } else {
        await addNews({
          title,
          excerpt,
          content,
          imageUrl,
          status: newsForm.status,
          date: new Date().toISOString().split('T')[0],
          author: "Admin",
        });
        showToast("Yangilik qo'shildi", 'success');
      }
      closeModals();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    } finally {
      setSavingNews(false);
    }
  };

  const handleSaveGallery = async () => {
    if (!canManageContent) {
      showToast("Sizda bu amalni bajarish uchun ruxsat yo'q", 'error');
      return;
    }
    const url = galleryForm.url.trim();
    const title = galleryForm.title.trim();

    if (!url) {
      showToast("Rasm URL manzilini kiriting", 'error');
      return;
    }

    setSavingGallery(true);
    try {
      if (editingItem?.id) {
        await updateGallery(editingItem.id, { url, title, date: galleryForm.date });
        showToast("Rasm tahrirlandi", 'success');
      } else {
        await addGallery({
          url,
          title,
          date: galleryForm.date || new Date().toISOString().split('T')[0],
        });
        showToast("Rasm qo'shildi", 'success');
      }
      closeModals();
    } catch (error: any) {
      showToast(error.response?.data?.message || "Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    } finally {
      setSavingGallery(false);
    }
  };

  const handleDeleteNews = (id: string) => {
    if (!canManageContent) {
      showToast("Sizda yangilikni o'chirish uchun ruxsat yo'q", 'error');
      return;
    }
    setDeleteConfirm({ open: true, type: 'news', id });
  };

  const handleDeleteGallery = (id: string) => {
    if (!canManageContent) {
      showToast("Sizda rasmni o'chirish uchun ruxsat yo'q", 'error');
      return;
    }
    setDeleteConfirm({ open: true, type: 'gallery', id });
  };

  const confirmDelete = async () => {
    if (!canManageContent) {
      showToast("Sizda bu amalni bajarish uchun ruxsat yo'q", 'error');
      setDeleteConfirm({ open: false, type: 'news', id: '' });
      return;
    }
    try {
      if (deleteConfirm.type === 'news') {
        await deleteNews(deleteConfirm.id);
      } else {
        await deleteGallery(deleteConfirm.id);
      }
      showToast("O'chirildi", 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || "O'chirishda xatolik yuz berdi", 'error');
    } finally {
      setDeleteConfirm({ open: false, type: 'news', id: '' });
    }
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
        {canManageContent && (
          <button
            onClick={() => activeTab === 'news' ? openNewsModal() : openGalleryModal()}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Yangi qo'shish
          </button>
        )}
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
          {newsLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : newsError ? (
            <div className="p-6">
              <ErrorState message="Yangiliklarni yuklashda xatolik yuz berdi." onRetry={refetchNews} />
            </div>
          ) : (news || []).length === 0 ? (
            <div className="text-center py-16">
              <FileText size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="font-bold text-zinc-500">Hozircha yangiliklar yo'q</p>
              {canManageContent && (
                <button onClick={() => openNewsModal()} className="mt-3 text-blue-600 text-sm font-bold">
                  + Birinchi yangilikni qo'shish
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Rasm</th>
                    <th className="px-6 py-4">Sarlavha</th>
                    <th className="px-6 py-4">Sana</th>
                    <th className="px-6 py-4">Holat</th>
                    {canManageContent && <th className="px-6 py-4 text-right">Amallar</th>}
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
                      {canManageContent && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openNewsModal(item)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Tahrirlash">
                              <Edit2 size={16}/>
                            </button>
                            <button onClick={() => handleDeleteNews(item.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="O'chirish">
                              <Trash2 size={16}/>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'gallery' && (
        <div>
          {galleryLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : galleryError ? (
            <ErrorState message="Galereyani yuklashda xatolik yuz berdi." onRetry={refetchGallery} />
          ) : (gallery || []).length === 0 && !canManageContent ? (
            <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <ImageIcon size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="font-bold text-zinc-500">Hozircha galereya rasmlari yo'q</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(gallery || []).map((item: any) => (
                <div key={item.id} className="group relative aspect-square bg-zinc-100 dark:bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <img src={item.url} alt="Gallery item" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {canManageContent && (
                    <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <button onClick={() => openGalleryModal(item)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-600 hover:scale-110 transition-transform" title="Tahrirlash">
                        <Edit2 size={18}/>
                      </button>
                      <button onClick={() => handleDeleteGallery(item.id)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-red-600 hover:scale-110 transition-transform" title="O'chirish">
                        <Trash2 size={18}/>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {canManageContent && (
                <button onClick={() => openGalleryModal()} className="aspect-square bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400">
                  <Plus size={32} className="mb-2" />
                  <span className="font-bold text-sm">Rasm qo'shish</span>
                </button>
              )}
            </div>
          )}
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
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Sarlavha *</label>
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
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">To'liq matn *</label>
                <textarea
                  value={newsForm.content}
                  onChange={(e) => setNewsForm({...newsForm, content: e.target.value})}
                  rows={10}
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
              <button
                onClick={handleSaveNews}
                disabled={savingNews || !newsForm.title.trim() || !newsForm.content.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
              >
                {savingNews ? 'Saqlanmoqda...' : 'Saqlash'}
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
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Rasm URL manzili *</label>
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
              {galleryForm.url.trim() && (
                <div className="mt-4 aspect-video rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                  <img src={galleryForm.url.trim()} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400?text=Xato+URL')} referrerPolicy="no-referrer" />
                </div>
              )}
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
              <button onClick={closeModals} className="px-4 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                Bekor qilish
              </button>
              <button
                onClick={handleSaveGallery}
                disabled={savingGallery || !galleryForm.url.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
              >
                {savingGallery ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
