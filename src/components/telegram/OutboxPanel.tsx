/**
 * IP-29 — xabarlar navbati (yetkazish holati): har xabar navbatda / yuborildi / xato / bekor,
 * urinishlar soni va oxirgi xato; xatolarni qayta yuborish, navbatdagisini bekor qilish.
 * Backend: GET /api/telegram/outbox, POST /api/telegram/outbox/:id/retry|cancel, /retry-failed.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../Toast';
import { apiError } from '../finance/ReasonModal';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Navbatda', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  sending: { label: 'Yuborilmoqda', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  sent: { label: 'Yuborildi', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  failed: { label: 'Xato', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  cancelled: { label: 'Bekor', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800' },
};
const KIND: Record<string, string> = {
  broadcast: 'Ommaviy', payment_reminder: "To'lov eslatmasi", receipt: 'Kvitansiya', attendance: 'Davomat',
  lead_alert: 'Yangi lid', admin_alert: 'Admin', manual: "Qo'lda",
};
// Toshkent vaqti, "26.09 14:05" (brauzerlarda uz-UZ formati turlicha chiqadi)
const time = (d: string) => {
  const t = new Date(new Date(d).getTime() + 5 * 3600e3).toISOString();
  return `${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}`;
};

export function OutboxPanel({ batchId }: { batchId?: string }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: any[]; total: number; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get('/telegram/outbox', { params: { page, limit: 30, ...(status ? { status } : {}), ...(batchId ? { batchId } : {}) } })
      .then(r => setData(r.data)).catch(e => showToast(apiError(e), 'error'));
  }, [page, status, batchId, showToast]);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try { await fn(); showToast(ok, 'success'); load(); }
    catch (e) { showToast(apiError(e), 'error'); }
    finally { setBusy(null); }
  };

  const c = data?.counts ?? {};
  const chips = [
    { key: '', label: 'Barchasi', n: Object.values(c).reduce((a, b) => a + b, 0) },
    { key: 'pending', label: 'Navbatda', n: (c.pending || 0) + (c.sending || 0) },
    { key: 'sent', label: 'Yuborildi', n: c.sent || 0 },
    { key: 'failed', label: 'Xato', n: c.failed || 0 },
    { key: 'cancelled', label: 'Bekor', n: c.cancelled || 0 },
  ];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 30));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {chips.map(ch => (
            <button key={ch.key} type="button" onClick={() => { setStatus(ch.key); setPage(1); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${status === ch.key ? 'bg-blue-500 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
              {ch.label} <span className="tabular-nums opacity-80">{ch.n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            <RefreshCw size={13} /> Yangilash
          </button>
          {(c.failed || 0) > 0 && (
            <button type="button" disabled={busy === 'all'} onClick={() => void act('all', () => api.post('/telegram/outbox/retry-failed', batchId ? { batchId } : {}), "Xatolar qayta navbatga qo'yildi")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-500/10 disabled:opacity-50">
              <RotateCcw size={13} /> Xatolarni qayta yuborish ({c.failed})
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Xabarlar navbat orqali yuboriladi: Telegram cheklovlariga rioya qilinadi, vaqtinchalik xatoda 5 martagacha qayta urinadi.
        Ommaviy xabar va to'lov eslatmalari tunda (22:00–08:00) yuborilmaydi — ertalab ketadi.
      </p>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {!data ? <p className="p-6 text-sm text-zinc-400">Yuklanmoqda…</p> : data.data.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-400">Navbatda xabar yo'q</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.data.map(m => {
              const st = STATUS[m.status] || STATUS.pending;
              const waiting = m.status === 'pending' && new Date(m.nextAttemptAt).getTime() > Date.now() + 15_000;
              return (
                <div key={m.id} className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${st.cls}`}>{st.label}</span>
                      <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{KIND[m.kind] || m.kind}</span>
                      <span className="text-xs text-zinc-400 font-mono">→ {m.chatId}</span>
                    </div>
                    <p className="text-sm text-slate-900 dark:text-white line-clamp-2 whitespace-pre-line">{m.text.replace(/<[^>]+>/g, '')}</p>
                    {m.lastError && <p className="text-xs text-rose-500 mt-0.5">{m.lastError}</p>}
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {time(m.createdAt)}{m.attempts ? ` · ${m.attempts} urinish` : ''}
                      {m.sentAt ? ` · yuborildi ${time(m.sentAt)}` : ''}
                      {waiting ? ` · ${time(m.nextAttemptAt)} da yuboriladi` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {(m.status === 'failed' || m.status === 'cancelled') && (
                      <button type="button" disabled={busy === m.id} onClick={() => void act(m.id, () => api.post(`/telegram/outbox/${m.id}/retry`), "Qayta navbatga qo'yildi")}
                        className="text-xs font-bold text-blue-600 hover:underline disabled:opacity-50">Qayta yuborish</button>
                    )}
                    {m.status === 'pending' && (
                      <button type="button" disabled={busy === m.id} onClick={() => void act(m.id, () => api.post(`/telegram/outbox/${m.id}/cancel`), 'Bekor qilindi')}
                        className="text-xs font-bold text-rose-600 hover:underline disabled:opacity-50">Bekor qilish</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {pages > 1 && (
          <div className="p-4 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 font-bold">← Oldingi</button>
            <span className="text-sm text-zinc-500">{page} / {pages}</span>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= pages} className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 font-bold">Keyingi →</button>
          </div>
        )}
      </div>
    </div>
  );
}
