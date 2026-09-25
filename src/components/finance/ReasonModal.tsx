/**
 * IP-17 — pul yozuvini bekor qilish / qaytarish kabi qaytarib bo'lmaydigan amallar uchun
 * sabab so'raydigan oyna. Sabab audit jurnaliga va yozuvning o'ziga saqlanadi.
 */
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500';

export function ReasonModal({ isOpen, title, message, confirmText = 'Tasdiqlash', danger = true, onClose, onConfirm }: {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  /** Xato bo'lsa — matnini qaytaring (oynada ko'rsatiladi), muvaffaqiyatda — hech narsa. */
  onConfirm: (reason: string) => Promise<string | void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (isOpen) { setReason(''); setError(''); setSaving(false); } }, [isOpen]);

  const submit = async () => {
    if (reason.trim().length < 3 || saving) { setError('Sababni yozing (kamida 3 belgi)'); return; }
    setSaving(true);
    setError('');
    try {
      const err = await onConfirm(reason.trim());
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title={title} width="md">
      <div className="space-y-4">
        {message && <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{message}</p>}
        <label className="block space-y-1.5">
          <span className="text-sm font-bold text-slate-700 dark:text-zinc-300">Sabab</span>
          <textarea
            className={`${inputCls} min-h-[84px] resize-y`}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Masalan: summa xato kiritilgan"
            maxLength={500}
          />
        </label>
        {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Bekor</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { void submit(); }} isLoading={saving}>{confirmText}</Button>
        </div>
      </div>
    </Modal>
  );
}

export const apiError = (e: any, fallback = "Amalni bajarib bo'lmadi") =>
  e?.response?.data?.message || e?.response?.data?.error || fallback;
