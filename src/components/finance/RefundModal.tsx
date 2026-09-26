/**
 * IP-17 (OQ-07) — o'quvchiga pul qaytarish. Faqat taqsimlanmagan avansdan: hisobga
 * biriktirilgan pul avval hisob tuzatmasi / a'zolikni yakunlash orqali bo'shatiladi.
 * Backend: POST /api/receipts/refunds (Idempotency-Key bilan).
 */
import { useEffect, useMemo, useState } from 'react';
import api, { newIdempotencyKey, idempotencyHeaders } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { MoneyInput } from '../ui/MoneyInput';
import { formatMoney } from '../../utils/formatters';
import { apiError } from './ReasonModal';
import { AccountSelect } from './AccountSelect';

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500';
const labelCls = 'text-sm font-bold text-slate-700 dark:text-zinc-300';

export function RefundModal({ isOpen, onClose, studentId, studentName, available, onDone }: {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
  available: number;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('Naqd');
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Bitta oyna ochilishi = bitta pul komandasi: takror bosish ikki marta qaytarmaydi
  const key = useMemo(() => newIdempotencyKey(), [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (isOpen) { setAmount(available); setReason(''); setError(''); } }, [isOpen, available]);

  const submit = async () => {
    if (saving) return;
    if (!amount || amount <= 0) { setError('Summani kiriting'); return; }
    if (amount > available) { setError(`Qaytarish mumkin bo'lgan avans: ${formatMoney(available)}`); return; }
    if (reason.trim().length < 3) { setError('Sababni yozing (kamida 3 belgi)'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/receipts/refunds', { studentId, amount, method, accountId: accountId || undefined, reason: reason.trim() }, idempotencyHeaders(key));
      onDone();
    } catch (e: any) {
      setError(apiError(e, "Qaytarishni yozib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Pul qaytarish" width="md">
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {studentName ? <b>{studentName}</b> : "O'quvchi"} avansidan qaytarish mumkin: <b className="tabular-nums">{formatMoney(available)}</b>.
          Hisoblarga biriktirilgan pul qaytarilmaydi — avval hisob tuzatmasi yoki a'zolikni yakunlash kerak.
        </div>
        <MoneyInput label="Summa" value={amount} onChange={setAmount} required />
        <AccountSelect label="Qaysi hisobdan qaytariladi" value={accountId} method={method} onChange={(id, m) => { setAccountId(id); setMethod(m); }} />
        <label className="block space-y-1.5">
          <span className={labelCls}>Sabab</span>
          <textarea className={`${inputCls} min-h-[72px] resize-y`} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Masalan: kursdan chiqdi, ortiqcha to'lagan" maxLength={500} />
        </label>
        <p className="text-xs text-zinc-500">Kassada "To'lov qaytarish" (manfiy kirim) sifatida yoziladi va sof tushumdan ayriladi.</p>
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Bekor</Button>
          <Button variant="danger" onClick={() => { void submit(); }} isLoading={saving}>Qaytarish</Button>
        </div>
      </div>
    </Modal>
  );
}
