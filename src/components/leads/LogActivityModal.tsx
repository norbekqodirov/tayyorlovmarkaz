/**
 * LogActivityModal.tsx
 * Haqiqiy faoliyat logi — avvalgi 3 ta soxta tugma (hardcoded matn yozib,
 * hech narsa yubormasdi) o'rniga: tur, natija, yo'nalish va ixtiyoriy
 * keyingi-qadam sanasi bilan to'liq forma. server/routes/leads.ts'dagi
 * POST /:id/activities orqali yuboriladi — bu bitta amalda lastContactAt/
 * firstResponseAt/ballni ham yangilaydi.
 */
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ACTIVITY_TYPES, ACTIVITY_OUTCOMES } from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { type: string; content: string; outcome?: string; direction: 'in' | 'out'; nextFollowUpAt?: string; nextAction?: string }) => Promise<void>;
}

export default function LogActivityModal({ isOpen, onClose, onSubmit }: Props) {
  const [type, setType] = useState('call');
  const [content, setContent] = useState('');
  const [outcome, setOutcome] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType('call'); setContent(''); setOutcome(''); setDirection('out'); setNextFollowUpAt(''); setNextAction('');
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        type, content: content.trim(), outcome: outcome || undefined, direction,
        nextFollowUpAt: nextFollowUpAt || undefined, nextAction: nextAction || undefined,
      });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Faoliyat qo'shish" width="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Turi</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none dark:text-white">
              {ACTIVITY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Yo'nalish</label>
            <select value={direction} onChange={e => setDirection(e.target.value as 'in' | 'out')} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none dark:text-white">
              <option value="out">Biz qildik</option>
              <option value="in">Mijoz qildi</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Natija (ixtiyoriy)</label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold outline-none dark:text-white">
            <option value="">Tanlanmagan</option>
            {ACTIVITY_OUTCOMES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Izoh</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            placeholder="Nima haqida gaplashildi..."
            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium outline-none dark:text-white resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input type="date" label="Keyingi aloqa sanasi (ixtiyoriy)" value={nextFollowUpAt} onChange={e => setNextFollowUpAt(e.target.value)} />
          <Input label="Keyingi qadam (ixtiyoriy)" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Masalan: Narxni yuborish" />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
          <Button variant="secondary" onClick={onClose}>Bekor qilish</Button>
          <Button onClick={handleSubmit} isLoading={saving} disabled={!content.trim()}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}
