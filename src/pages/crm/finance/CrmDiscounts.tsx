import { useState, useEffect } from 'react';
import { Plus, Tag, Copy, Trash2, Edit2, CheckCircle2, XCircle, Percent, DollarSign } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../../api/client';

export default function CrmDiscounts() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', type: 'percent', value: '', maxUses: '',
    validFrom: '', validTo: '', minAmount: '', isActive: true,
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/discounts');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', type: 'percent', value: '', maxUses: '', validFrom: '', validTo: '', minAmount: '', isActive: true });
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      code: item.code, name: item.name || '', type: item.type, value: String(item.value),
      maxUses: item.maxUses ? String(item.maxUses) : '', validFrom: item.validFrom || '',
      validTo: item.validTo || '', minAmount: item.minAmount ? String(item.minAmount) : '',
      isActive: item.isActive,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.code || !form.value) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        value: Number(form.value),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        minAmount: form.minAmount ? Number(form.minAmount) : null,
      };
      if (editing) {
        await api.patch(`/discounts/${editing.id}`, data);
      } else {
        await api.post('/discounts', data);
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Xatolik');
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    await api.delete(`/discounts/${id}`);
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const isExpired = (item: any) => {
    const today = new Date().toISOString().split('T')[0];
    return item.validTo && item.validTo < today;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Chegirmalar & Promo-kodlar</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{items.length} ta chegirma</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md">
          <Plus size={15} strokeWidth={2.5} /> Yangi Chegirma
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Tag size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">Hozircha chegirmalar yo'q</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(item => {
            const expired = isExpired(item);
            const limited = item.maxUses && item.usedCount >= item.maxUses;
            const active = item.isActive && !expired && !limited;
            return (
              <div key={item.id} className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.type === 'percent' ? 'bg-violet-50 dark:bg-violet-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}`}>
                      {item.type === 'percent'
                        ? <Percent size={16} className="text-violet-600" />
                        : <DollarSign size={16} className="text-emerald-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 dark:text-white font-mono text-sm tracking-wider">{item.code}</span>
                        <button onClick={() => copyCode(item.code)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                          <Copy size={11} />
                        </button>
                      </div>
                      {item.name && <p className="text-xs text-zinc-500 mt-0.5">{item.name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {active ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-zinc-400" />}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {item.type === 'percent' ? `${item.value}%` : `${item.value.toLocaleString()} so'm`}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {item.usedCount}/{item.maxUses || '∞'} ishlatildi
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2 text-[10px] text-zinc-400">
                  {item.validFrom && <span>{item.validFrom}</span>}
                  {item.validFrom && item.validTo && <span>→</span>}
                  {item.validTo && <span className={expired ? 'text-rose-500' : ''}>{item.validTo}</span>}
                  {!item.validFrom && !item.validTo && <span>Muddatsiz</span>}
                </div>

                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                  <div className="flex gap-1.5">
                    {expired && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">Muddati tugagan</span>}
                    {limited && !expired && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">Tugagan</span>}
                    {!item.isActive && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">Faol emas</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="font-black text-slate-900 dark:text-white">{editing ? 'Chegirmani tahrirlash' : 'Yangi chegirma'}</h2>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Kod *</label>
                      <input
                        value={form.code}
                        onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase tracking-wider"
                        placeholder="SALE20"
                        disabled={!!editing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Nomi</label>
                      <input
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Yoz chegirmasi"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Turi</label>
                      <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="percent">Foiz (%)</option>
                        <option value="fixed">Belgilangan so'm</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">
                        Qiymat {form.type === 'percent' ? '(%)' : "(so'm)"} *
                      </label>
                      <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={form.type === 'percent' ? '20' : '50000'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Boshlanish sanasi</label>
                      <input type="date" value={form.validFrom} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Tugash sanasi</label>
                      <input type="date" value={form.validTo} onChange={e => setForm(p => ({ ...p, validTo: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Max ishlatish soni</label>
                      <input type="number" value={form.maxUses} onChange={e => setForm(p => ({ ...p, maxUses: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Cheksiz" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Min miqdor</label>
                      <input type="number" value={form.minAmount} onChange={e => setForm(p => ({ ...p, minAmount: e.target.value }))}
                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0" />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Faol</span>
                  </label>
                </div>
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Bekor</button>
                  <button onClick={save} disabled={saving || !form.code || !form.value}
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
