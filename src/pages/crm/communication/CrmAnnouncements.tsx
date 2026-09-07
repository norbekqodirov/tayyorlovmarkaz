import { useState, useEffect } from 'react';
import { Plus, Megaphone, Pin, Trash2, Edit2, Clock, Users, AlertTriangle, Calendar, Wrench } from 'lucide-react';
import api from '../../../api/client';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

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
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ title?: string; content?: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [form, setForm] = useState({
    title: '', content: '', type: 'general', audience: 'all',
    priority: 'normal', pinned: false, expiresAt: '',
  });

  const userRoleLevel = getCurrentRoleLevel();
  // Backend route permissions in server/routes/announcements.ts:
  // POST/PATCH/DELETE /api/announcements require requireAuth (level >= 1 TEACHER)
  const canCreate = userRoleLevel >= ROLE_LEVEL.TEACHER;
  const canEdit = userRoleLevel >= ROLE_LEVEL.TEACHER;
  const canDelete = userRoleLevel >= ROLE_LEVEL.TEACHER;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/announcements');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "E'lonlarni yuklashda xatolik yuz berdi");
      setItems([]);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', content: '', type: 'general', audience: 'all', priority: 'normal', pinned: false, expiresAt: '' });
    setFormErrors({});
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      title: item.title || '',
      content: item.content || '',
      type: item.type || 'general',
      audience: item.audience || 'all',
      priority: item.priority || 'normal',
      pinned: !!item.pinned,
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : '',
    });
    setFormErrors({});
    setSaveError(null);
    setShowModal(true);
  };

  const validateForm = () => {
    const errs: { title?: string; content?: string } = {};
    if (!form.title.trim()) {
      errs.title = "Sarlavha kiriting";
    }
    if (!form.content.trim()) {
      errs.content = "E'lon matnini kiriting";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const data = { ...form, expiresAt: form.expiresAt || null };
      if (editing) {
        await api.patch(`/announcements/${editing.id}`, data);
      } else {
        await api.post('/announcements', data);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.message || "E'lonni saqlashda xatolik yuz berdi");
    }
    setSaving(false);
  };

  const remove = (id: string) => {
    setDeleteError(null);
    setDeleteConfirm({ open: true, id });
  };

  const confirmRemove = async () => {
    try {
      await api.delete(`/announcements/${deleteConfirm.id}`);
      setDeleteConfirm({ open: false, id: '' });
      load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || err.message || "E'lonni o'chirishda xatolik yuz berdi");
    }
  };

  const pinned = items.filter(i => i.pinned);
  const regular = items.filter(i => !i.pinned);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="E'lonni o'chirish"
        message="Haqiqatan ham ushbu e'lonni o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmRemove}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />

      {deleteError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400">
          {deleteError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">E'lonlar Taxtasi</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{items.length} ta e'lon</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} leftIcon={<Plus size={15} strokeWidth={2.5} />}>
            Yangi E'lon
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Megaphone size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">Hozircha e'lonlar yo'q</p>
          {canCreate && (
            <button onClick={openCreate} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
              Birinchi e'lon yaratish
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {pinned.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-1.5">
                <Pin size={10} /> Muhim e'lonlar
              </p>
              <div className="grid gap-3">
                {pinned.map(item => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={openEdit}
                    onRemove={remove}
                  />
                ))}
              </div>
            </div>
          )}
          {regular.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Barcha e'lonlar</p>}
              <div className="grid gap-3">
                {regular.map(item => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={openEdit}
                    onRemove={remove}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "E'lonni tahrirlash" : "Yangi E'lon"}
        width="lg"
      >
        <div className="space-y-4">
          {saveError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400">
              {saveError}
            </div>
          )}

          <div>
            <Input
              label="Sarlavha *"
              value={form.title}
              onChange={e => {
                setForm(p => ({ ...p, title: e.target.value }));
                if (formErrors.title) setFormErrors(p => ({ ...p, title: undefined }));
              }}
              placeholder="E'lon sarlavhasi"
            />
            {formErrors.title && <p className="text-xs text-rose-500 mt-1 font-semibold">{formErrors.title}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">Matn *</label>
            <textarea
              value={form.content}
              onChange={e => {
                setForm(p => ({ ...p, content: e.target.value }));
                if (formErrors.content) setFormErrors(p => ({ ...p, content: undefined }));
              }}
              rows={4}
              className={`w-full border ${formErrors.content ? 'border-rose-500' : 'border-zinc-200 dark:border-zinc-700'} rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
              placeholder="E'lon matni..."
            />
            {formErrors.content && <p className="text-xs text-rose-500 mt-1 font-semibold">{formErrors.content}</p>}
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
          <Input type="datetime-local" label="Amal qilish muddati" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))}
              className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Yuqoriga qadalsin (pinned)</span>
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Bekor</Button>
            <Button onClick={save} isLoading={saving} disabled={!form.title.trim() || !form.content.trim()}>
              {editing ? 'Saqlash' : "Qo'shish"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AnnouncementCard({
  item,
  canEdit,
  canDelete,
  onEdit,
  onRemove,
}: {
  item: any;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (i: any) => void;
  onRemove: (id: string) => void;
}) {
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
            {(canEdit || canDelete) && (
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                {canEdit && (
                  <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600" title="Tahrirlash">
                    <Edit2 size={13} />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600" title="O'chirish">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
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

