import { useState, useEffect } from 'react';
import { Plus, Megaphone, Pin, Trash2, Edit2, Clock, Users, AlertTriangle, Calendar, Wrench } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../../api/client';

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  general:     { label: 'Umumiy',       icon: Megaphone,     color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-500/10' },
  urgent:      { label: 'Shoshilinch',  icon: AlertTriangle, color: 'text-rose-600',   bg: 'bg-rose-50 dark:bg-rose-500/10' },
  event:       { label: 'Tadbir',       icon: Calendar,      color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  maintenance: { label: "Ta'mirlash",   icon: Wrench,        color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-500/10' },
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Hammaga', students: "O'quvchilarga", staff: 'Xodimlarga', teachers: "O'qituvchilarga",
};

export default function CrmAnnouncements() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', content: '', type: 'general', audience: 'all',
    priority: 'normal', pinned: false, expiresAt: '',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/announcements');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', content: '', type: 'general', audience: 'all', priority: 'normal', pinned: false, expiresAt: '' });
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      title: item.title,
      content: item.content,
      type: item.type,
      audience: item.audience,
      priority: item.priority,
      pinned: item.pinned,
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const data = { ...form, expiresAt: form.expiresAt || null };
      if (editing) {
        await api.patch(`/announcements/${editing.id}`, data);
      } else {
        await api.post('/announcements', data);
      }
      setShowModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    await api.delete(`/announcements/${id}`);
    load();
  };

  const pinned = items.filter(i => i.pinned);
  const regular = items.filter(i => !i.pinned);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">E'lonlar Taxtasi</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{items.length} ta e'lon</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md">
          <Plus size={15} strokeWidth={2.5} /> Yangi E'lon
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">Hozircha e'lonlar yo'q</p>
          <button onClick={openCreate} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
            Birinchi e'lon yaratish
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-1.5">
                <Pin size={10} /> Muhim e'lonlar
              </p>
              <div className="grid gap-3">
                {pinned.map(item => <AnnouncementCard key={item.id} item={item} onEdit={openEdit} onRemove={remove} />)}
              </div>
            </div>
          )}
          {regular.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Barcha e'lonlar</p>}
              <div className="grid gap-3">
                {regular.map(item => <AnnouncementCard key={item.id} item={item} onEdit={openEdit} onRemove={remove} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    {editing ? "E'lonni tahrirlash" : "Yangi E'lon"}
                  </h2>
                </div>
                <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Sarlavha *</label>
                    <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="E'lon sarlavhasi" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Matn *</label>
                    <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={4}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="E'lon matni..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Turi</label>
                      <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="general">Umumiy</option>
                        <option value="urgent">Shoshilinch</option>
                        <option value="event">Tadbir</option>
                        <option value="maintenance">Ta'mirlash</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Kimga</label>
                      <select value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="all">Hammaga</option>
                        <option value="students">O'quvchilarga</option>
                        <option value="staff">Xodimlarga</option>
                        <option value="teachers">O'qituvchilarga</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Amal qilish muddati</label>
                    <input type="datetime-local" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))}
                      className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Yuqoriga qadalsin (pinned)</span>
                  </label>
                </div>
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    Bekor
                  </button>
                  <button onClick={save} disabled={saving || !form.title.trim() || !form.content.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all">
                    {saving ? 'Saqlanmoqda...' : (editing ? 'Saqlash' : "Qo'shish")}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function AnnouncementCard({ item, onEdit, onRemove }: { item: any; onEdit: (i: any) => void; onRemove: (id: string) => void }) {
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.general;
  const Icon = cfg.icon;
  const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();

  return (
    <div className={`group relative bg-white dark:bg-zinc-900 rounded-2xl border ${isExpired ? 'border-zinc-200/50 opacity-60' : 'border-zinc-200 dark:border-zinc-800'} p-4 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
          <Icon size={16} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                {item.pinned && <Pin size={11} className="text-amber-500 shrink-0" />}
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{item.title}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                  {AUDIENCE_LABELS[item.audience] || item.audience}
                </span>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 line-clamp-2">{item.content}</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600">
                <Edit2 size={13} />
              </button>
              <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
              <Clock size={9} /> {new Date(item.createdAt).toLocaleDateString('uz-UZ')}
            </span>
            {item.expiresAt && (
              <span className={`text-[10px] flex items-center gap-1 ${isExpired ? 'text-rose-500' : 'text-zinc-400'}`}>
                <Clock size={9} /> {isExpired ? 'Muddati tugagan' : `Muddati: ${new Date(item.expiresAt).toLocaleDateString('uz-UZ')}`}
              </span>
            )}
            {item.createdBy && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Users size={9} /> {item.createdBy}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
