/**
 * Hisob tafsiloti — "nima uchun shu summa": qatorlar (asosiy, chegirmalar), formula
 * qiymatlari (P, N, R, F, qoldirishlar), darslar ro'yxati va tuzatmalar.
 * "Oylik hisoblar" sahifasi va o'quvchi profili birga ishlatadi.
 * Backend: GET /api/billing/charges/:id.
 */
import { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import api from '../../api/client';
import { Modal } from '../ui/Modal';
import { formatNumber } from '../../utils/formatters';

const LINE_LABEL: Record<string, string> = {
  base: 'Asosiy', extra_lesson: "Qo'shimcha dars", absence_discount: 'Davomat chegirmasi', cancel_credit: 'Bekor qilingan dars',
  promo: 'Promo', sibling: 'Aka-uka', social: 'Ijtimoiy', manual: 'Tuzatma',
};
const STATUS_LABEL: Record<string, string> = { draft: 'Qoralama', posted: 'Hisoblangan', void: 'Bekor' };
const dm = (d?: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');

export function ChargeDetailModal({ chargeId, onClose }: { chargeId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDetail(null); setError('');
    if (!chargeId) return;
    api.get(`/billing/charges/${chargeId}`).then(r => setDetail(r.data)).catch(() => setError("Hisobni ochib bo'lmadi"));
  }, [chargeId]);

  const c = detail?.calc;
  const adjTotal = (detail?.adjustments || []).filter((a: any) => a.status === 'posted').reduce((s: number, a: any) => s + a.net, 0);
  return (
    <Modal isOpen={!!chargeId} onClose={onClose} title="Hisob tafsiloti"
      description={detail ? `${c?.windowFrom ? `${dm(c.windowFrom)}–${dm(c.windowTo)}` : detail.month} · ${STATUS_LABEL[detail.status] || detail.status}` : ''} width="lg">
      {error ? <p className="text-sm text-rose-600">{error}</p> : !detail ? <p className="text-sm text-zinc-400">Yuklanmoqda…</p> : (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800">
            {detail.lines.map((l: any) => (
              <div key={l.id} className="flex justify-between gap-3 px-3 py-2">
                <span><span className="font-bold">{LINE_LABEL[l.kind] || l.kind}</span> <span className="text-xs text-zinc-500">{l.description}</span></span>
                <span className={`tabular-nums font-bold ${l.amount < 0 ? 'text-emerald-600' : ''}`}>{formatNumber(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
              <span className="font-black">Hisob</span><span className="tabular-nums font-black">{formatNumber(detail.net)} so'm</span>
            </div>
            {adjTotal !== 0 && (
              <div className="flex justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/10">
                <span className="font-black">Tuzatmalar bilan</span><span className="tabular-nums font-black">{formatNumber(detail.net + adjTotal)} so'm</span>
              </div>
            )}
          </div>
          {c?.P != null && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[
                ['Oylik narx (P)', formatNumber(c.P)], ['Paket (N)', c.N], ["O'quvchi darslari (R)", c.R],
                ['Guruh darslari (F)', c.F], ["To'liq oy", c.fullMonth ? 'Ha' : "Yo'q"], ['Qoldirishlar (A / M)', `${c.A} / ${c.M}`],
                ['Ustoz bazasi', formatNumber(detail.teacherBase)], ['Tarif', c.tariffSource === 'version' ? 'Tarix versiyasi' : 'Joriy narx'], ['A\'zolik', `${c.periodStart} — ${c.periodEnd || '…'}`],
              ].map(([k, v]) => (
                <div key={String(k)} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"><div className="text-zinc-500">{k}</div><div className="font-bold tabular-nums">{String(v)}</div></div>
              ))}
            </div>
          )}
          {c?.P != null && (
            <p className="text-xs text-zinc-500">
              {c.fullMonth ? `To'liq oy: o'quvchi guruhning shu davrdagi barcha darslarida a'zo — paket narxi ${formatNumber(c.P)}.` : `Qisman oy: ${c.R} dars × ${formatNumber(c.P)} / ${c.N}.`}
              {c.A > 0 ? ` Qoldirilgan darslar: ${c.A} (chegirma ${c.M} tadan boshlanadi).` : ''}
            </p>
          )}
          {c?.billableDates?.length > 0 && <p className="text-xs text-zinc-500"><FileSearch size={12} className="inline mr-1" />Darslar: {c.billableDates.map(dm).join(', ')}{c.absentDates?.length ? ` · kelmagan: ${c.absentDates.map(dm).join(', ')}` : ''}</p>}
          {detail.adjustments?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-black text-zinc-500 uppercase">Tuzatmalar</p>
              {detail.adjustments.map((a: any) => (
                <div key={a.id} className="flex justify-between gap-3 text-xs px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                  <span>{a.month} · {a.reason}</span><span className="tabular-nums font-bold">{formatNumber(a.net)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
