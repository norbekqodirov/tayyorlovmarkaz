/**
 * LeadBulkBar.tsx
 * Bir nechta lid tanlanganda paydo bo'ladigan ommaviy amallar paneli.
 * server/routes/bulk.ts'dagi mavjud POST /api/bulk/leads'ni ishlatadi
 * (assign/restore Faza 3'da qo'shildi).
 */
import { useState, useEffect } from 'react';
import { X, Trash2, UserPlus, ArrowRightLeft } from 'lucide-react';
import api from '../../api/client';
import { STAGES } from './types';

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function LeadBulkBar({ selectedIds, onClear, onDone, showToast }: Props) {
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/leads/assignable-users').then(res => setManagers(res.data || [])).catch(() => {});
  }, []);

  if (selectedIds.length === 0) return null;

  const runBulk = async (action: string, data?: any, successMsg?: string) => {
    setBusy(true);
    try {
      const res = await api.post('/bulk/leads', { action, ids: selectedIds, data });
      showToast(successMsg || res.data?.message || 'Bajarildi', 'success');
      onDone();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-4 z-30 mx-auto max-w-3xl">
      <div className="bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-black">{selectedIds.length} ta tanlandi</span>

        <div className="flex items-center gap-1.5">
          <ArrowRightLeft size={14} className="text-zinc-400" />
          <select
            disabled={busy}
            defaultValue=""
            onChange={e => { if (e.target.value) runBulk('status', { stage: e.target.value }, 'Bosqich yangilandi'); }}
            className="bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none"
          >
            <option value="" disabled>Bosqich...</option>
            {STAGES.map(s => <option key={s.id} value={s.id} className="text-slate-900">{s.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <UserPlus size={14} className="text-zinc-400" />
          <select
            disabled={busy}
            defaultValue=""
            onChange={e => { if (e.target.value) runBulk('assign', { userId: e.target.value }, 'Biriktirildi'); }}
            className="bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none"
          >
            <option value="" disabled>Menejerga biriktirish...</option>
            {managers.map(m => <option key={m.id} value={m.id} className="text-slate-900">{m.name}</option>)}
          </select>
        </div>

        <button
          disabled={busy}
          onClick={() => runBulk('delete', undefined, "O'chirildi")}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-black transition-colors"
        >
          <Trash2 size={14} /> O'chirish
        </button>

        <button onClick={onClear} className="ml-auto p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
