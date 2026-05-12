import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Youtube, ExternalLink, Eye, EyeOff, GripVertical, AlertCircle } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Video {
  id: string;
  url: string;
  title: string;
  description?: string;
  isActive: boolean;
  order: number;
  addedAt: string;
}

function extractVideoId(url: string): string | null {
  // YouTube short: youtu.be/xxx, YouTube full: youtube.com/watch?v=xxx, YouTube shorts: /shorts/xxx
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isVerticalVideo(url: string): boolean {
  return url.includes('/shorts/');
}

export default function CrmVideos() {
  const { data: videos = [], addDocument, updateDocument, deleteDocument } = useFirestore<Video>('videos');
  const { showToast } = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urlError, setUrlError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const sortedVideos = [...videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleAdd = async () => {
    setUrlError('');
    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setUrlError("YouTube havola noto'g'ri. Masalan: https://youtube.com/shorts/xxxxx");
      return;
    }
    if (!title.trim()) {
      showToast('Sarlavha kiritilishi shart', 'error');
      return;
    }
    setAdding(true);
    try {
      await addDocument({
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        isActive: true,
        order: videos.length,
        addedAt: new Date().toISOString(),
      });
      setUrl('');
      setTitle('');
      setDescription('');
      showToast('Video qo\'shildi!', 'success');
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (video: Video) => {
    await updateDocument(video.id, { isActive: !video.isActive });
    showToast(video.isActive ? 'Video yashirildi' : 'Video ko\'rsatildi', 'success');
  };

  const confirmDelete = async () => {
    await deleteDocument(deleteConfirm.id);
    setDeleteConfirm({ open: false, id: '' });
    showToast('Video o\'chirildi', 'success');
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1">YouTube Videolar</h1>
        <p className="text-sm text-zinc-500">
          Saytning asosiy sahifasida ko'rsatiladigan YouTube (Shorts) videolarni boshqaring.
        </p>
      </div>

      {/* Add Form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4"
      >
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          <Youtube size={16} className="text-red-500" /> Yangi video qo'shish
        </h2>

        <div className="space-y-3">
          <div>
            <input
              value={url}
              onChange={e => { setUrl(e.target.value); setUrlError(''); }}
              placeholder="YouTube havola (Shorts yoki oddiy video)"
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            {urlError && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} /> {urlError}
              </p>
            )}
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Sarlavha (masalan: O'quvchi muvaffaqiyati)"
            className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Qisqa tavsif (ixtiyoriy)"
            className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Preview */}
        {url && extractVideoId(url) && (
          <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
            <img
              src={`https://img.youtube.com/vi/${extractVideoId(url)}/mqdefault.jpg`}
              alt="Preview"
              className="w-24 h-14 object-cover rounded-lg"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Video preview</p>
              <p className="text-[11px] text-zinc-500">{title || 'Sarlavha kiritilmagan'}</p>
              {isVerticalVideo(url) && (
                <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-bold mt-1 inline-block">
                  Vertical (Shorts) ✓
                </span>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={adding || !url || !title}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors"
        >
          <Plus size={16} /> {adding ? 'Qo\'shilmoqda...' : 'Video qo\'shish'}
        </button>
      </motion.div>

      {/* Video List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">
            Barcha videolar ({videos.length})
          </h2>
          <span className="text-xs text-zinc-400">
            {videos.filter(v => v.isActive).length} ta aktiv
          </span>
        </div>

        <AnimatePresence>
          {sortedVideos.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <Youtube size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hali video qo'shilmagan</p>
            </div>
          ) : (
            sortedVideos.map((video, idx) => {
              const videoId = extractVideoId(video.url);
              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
                    video.isActive
                      ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800/50 opacity-60'
                  }`}
                >
                  <GripVertical size={16} className="text-zinc-300 dark:text-zinc-700 shrink-0 cursor-grab" />

                  {videoId ? (
                    <img
                      src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                      alt={video.title}
                      className="w-20 h-12 object-cover rounded-lg shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-20 h-12 bg-zinc-200 dark:bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center">
                      <Youtube size={20} className="text-zinc-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{video.title}</p>
                    {video.description && (
                      <p className="text-xs text-zinc-500 truncate">{video.description}</p>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{video.url}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-zinc-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="YouTube'da ochish"
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      onClick={() => toggleActive(video)}
                      className={`p-2 transition-colors rounded-lg ${
                        video.isActive
                          ? 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                      title={video.isActive ? 'Yashirish' : 'Ko\'rsatish'}
                    >
                      {video.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ open: true, id: video.id })}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-lg"
                      title="O'chirish"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Videoni o'chirish"
        message="Bu videoni o'chirishni xohlaysizmi? Bu amalni qaytarib bo'lmaydi."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
    </div>
  );
}
