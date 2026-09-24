/**
 * IP-01 — arxivlangan yozuvlar ro'yxati va "Tiklash".
 *
 * O'quvchi/guruh/xodim endi "o'chirilmaydi", arxivlanadi (tarix saqlanadi).
 * Bu oyna `GET /api/:collection?archived=1` orqali faqat arxivdagilarni
 * ko'rsatadi va `POST /api/:collection/:id/restore` bilan qaytaradi.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore } from 'lucide-react';
import api from '../api/client';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './Toast';
import { formatDate } from '../utils/formatters';

interface ArchivedRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: 'students' | 'groups' | 'staff';
  title: string;
  /** Har qator uchun qo'shimcha izoh (masalan telefon yoki kurs nomi). */
  describe?: (row: any) => string | undefined;
  onRestored?: () => void;
}

export default function ArchivedRecordsModal({ isOpen, onClose, collection, title, describe, onRestored }: ArchivedRecordsModalProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/${collection}`, { params: { archived: '1' } });
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setRows(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => { if (isOpen) void load(); }, [isOpen, load]);

  const restore = async (row: any) => {
    if (restoringId) return;
    setRestoringId(row.id);
    try {
      await api.post(`/${collection}/${row.id}/restore`);
      setRows(prev => prev.filter(r => r.id !== row.id));
      showToast(`${row.name || 'Yozuv'} arxivdan tiklandi`, 'success');
      onRestored?.();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Tiklab bo'lmadi. Qayta urinib ko'ring.", 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description="Arxivlangan yozuvlarning tarixi (to'lovlar, davomat, baholar) saqlangan. Tiklangan yozuv yana ro'yxatlarda ko'rinadi." width="lg">
      {loading ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Yuklanmoqda...</p>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span>Arxivni yuklab bo'lmadi (tarmoq xatosi yoki ruxsat yo'q).</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Qayta urinish</Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Arxiv bo'sh.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[60vh] overflow-y-auto">
          {rows.map(row => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.name || 'Nomsiz'}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {[describe?.(row), row.deletedAt ? `Arxivlangan: ${formatDate(row.deletedAt)}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                isLoading={restoringId === row.id}
                disabled={!!restoringId}
                leftIcon={<ArchiveRestore size={14} />}
                onClick={() => void restore(row)}
              >
                Tiklash
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
