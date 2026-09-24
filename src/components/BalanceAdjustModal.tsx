/**
 * IP-02 (ML-03) — o'quvchi balansini SABABLI tuzatish.
 *
 * Balans endi o'quvchi tahrirlash formasi orqali yozilmaydi (u parallel
 * kiritilgan to'lovlarni "yutib yuborardi"). Boshlang'ich qarz/avans yoki
 * qo'lda tuzatish — faqat shu oyna orqali: atomar, sabab majburiy, audit
 * jurnaliga oldingi va keyingi qiymat bilan yoziladi. Bu kassaga pul
 * yozuvi yaratmaydi — naqd/karta to'lovi uchun "Moliya" bo'limidan foydalaning.
 */
import { useEffect, useState } from 'react';
import api from '../api/client';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { MoneyInput } from './ui/MoneyInput';
import { useToast } from './Toast';
import { formatNumber } from '../utils/formatters';

interface BalanceAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: { id: string; name: string; balance?: number | null } | null;
  /** Masalan yangi o'quvchi qo'shilganda: "Boshlang'ich qoldiq". */
  defaultReason?: string;
  onDone?: (newBalance: number) => void;
}

export default function BalanceAdjustModal({ isOpen, onClose, student, defaultReason = '', onDone }: BalanceAdjustModalProps) {
  const { showToast } = useToast();
  const [direction, setDirection] = useState<'debt' | 'credit'>('debt');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState(defaultReason);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setDirection('debt'); setAmount(0); setReason(defaultReason); setError(''); }
  }, [isOpen, defaultReason]);

  if (!student) return null;
  const current = Number(student.balance) || 0;
  const signed = direction === 'debt' ? -amount : amount;
  const preview = current + signed;

  const submit = async () => {
    if (saving) return;
    if (!amount || amount <= 0) { setError("Summani kiriting"); return; }
    if (reason.trim().length < 3) { setError("Sababni yozing (masalan: «Eski tizimdan qolgan sentabr qarzi»)"); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/students/${student.id}/balance-adjustments`, { amount: signed, reason: reason.trim() });
      showToast(`Balans tuzatildi: ${formatNumber(res.data.balance)} so'm`, 'success');
      onDone?.(res.data.balance);
      onClose();
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? "Balansni tuzatish uchun «Moliya» ruxsati kerak"
        : (e?.response?.data?.message || "Saqlab bo'lmadi. Qayta urinib ko'ring."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Balansni tuzatish" description={`${student.name} — joriy balans: ${formatNumber(current)} so'm`} width="md">
      <div className="space-y-4">
        <div className="flex gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl" role="radiogroup" aria-label="Tuzatish turi">
          <button type="button" role="radio" aria-checked={direction === 'debt'} onClick={() => setDirection('debt')}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${direction === 'debt' ? 'bg-white dark:bg-zinc-700 shadow-sm text-rose-600' : 'text-zinc-500'}`}>
            Qarz qo'shish
          </button>
          <button type="button" role="radio" aria-checked={direction === 'credit'} onClick={() => setDirection('credit')}
            className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${direction === 'credit' ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-600' : 'text-zinc-500'}`}>
            Avans / qarzni kamaytirish
          </button>
        </div>
        <MoneyInput label="Summa" value={amount} onChange={setAmount} required />
        <div className="space-y-1.5">
          <label htmlFor="balance-adjust-reason" className="text-sm font-bold text-slate-700 dark:text-zinc-300">Sabab</label>
          <textarea
            id="balance-adjust-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Masalan: eski daftardan ko'chirilgan avgust qarzi"
            className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 min-h-[72px] resize-y"
          />
        </div>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-zinc-500">Hozirgi balans</span><span className="font-bold tabular-nums">{formatNumber(current)} so'm</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Tuzatma</span><span className={`font-bold tabular-nums ${signed < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signed > 0 ? '+' : ''}{formatNumber(signed)} so'm</span></div>
          <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-700 pt-1"><span className="text-zinc-500">Yangi balans</span><span className={`font-black tabular-nums ${preview < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatNumber(preview)} so'm</span></div>
          <p className="text-zinc-400 pt-1">Bu kassaga pul yozmaydi. Naqd yoki karta to'lovi uchun Moliya → «Yangi tranzaksiya» dan foydalaning.</p>
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Bekor qilish</Button>
          <Button type="button" isLoading={saving} onClick={() => void submit()}>Tuzatishni saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}
