import { useState, useEffect } from 'react';
import { Plus, Building2, Trash2, Edit2, MapPin, Phone } from 'lucide-react';
import api from '../../../api/client';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { PhoneInput } from '../../../components/ui/PhoneInput';

export default function CrmBranches() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '', status: 'active', managerId: '' });
  const [stats, setStats] = useState<Record<string, any>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [brRes, compRes] = await Promise.all([
        api.get('/branches'),
        api.get('/analytics/branch-comparison').catch(() => ({ data: [] })),
      ]);
      setBranches(Array.isArray(brRes.data) ? brRes.data : []);
      const statsMap: Record<string, any> = {};
      (Array.isArray(compRes.data) ? compRes.data : []).forEach((s: any) => { statsMap[s.id] = s; });
      setStats(statsMap);
    } catch { setBranches([]); }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', address: '', phone: '', status: 'active', managerId: '' });
    setShowModal(true);
  };

  const openEdit = (b: any) => {
    setEditing(b);
    setForm({ name: b.name, address: b.address || '', phone: b.phone || '', status: b.status, managerId: b.managerId || '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/branches/${editing.id}`, form);
      } else {
        await api.post('/branches', form);
      }
      setShowModal(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = (id: string) => setDeleteConfirm({ open: true, id });

  const confirmRemove = async () => {
    await api.delete(`/branches/${deleteConfirm.id}`);
    setDeleteConfirm({ open: false, id: '' });
    load();
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Filialni o'chirish"
        message="Haqiqatan ham ushbu filialni o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmRemove}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Filiallar</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{branches.length} ta filial</p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus size={15} strokeWidth={2.5} />}>
          Yangi Filial
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : branches.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">Hozircha filiallar yo'q</p>
          <p className="text-sm text-zinc-400 mt-1">Birinchi filialni yarating</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map(b => {
            const s = stats[b.id];
            return (
              <div key={b.id} className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                      <Building2 size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 dark:text-white">{b.name}</h3>
                      <span className={`text-xs font-bold ${b.status === 'active' ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {b.status === 'active' ? 'Faol' : 'Faol emas'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => remove(b.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {(b.address || b.phone) && (
                  <div className="mt-3 space-y-1">
                    {b.address && (
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <MapPin size={11} /> {b.address}
                      </p>
                    )}
                    {b.phone && (
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                        <Phone size={11} /> {b.phone}
                      </p>
                    )}
                  </div>
                )}

                {s && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-lg font-black text-slate-900 dark:text-white">{s.students}</p>
                      <p className="text-[10px] text-zinc-500">O'quvchi</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-slate-900 dark:text-white">{s.groups}</p>
                      <p className="text-[10px] text-zinc-500">Guruh</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-emerald-600">{(s.income / 1000000).toFixed(1)}M</p>
                      <p className="text-[10px] text-zinc-500">Daromad</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Filialni tahrirlash' : 'Yangi filial'}
      >
        <div className="space-y-4">
          <Input label="Nomi *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Markaziy filial" />
          <Input label="Manzil" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Ko'cha, uy" />
          <PhoneInput label="Telefon" value={form.phone} onChange={(phone) => setForm(p => ({ ...p, phone }))} />
          <div>
            <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Holati</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="active">Faol</option>
              <option value="inactive">Faol emas</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Bekor</Button>
            <Button onClick={save} isLoading={saving} disabled={!form.name.trim()}>
              {editing ? 'Saqlash' : "Qo'shish"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
