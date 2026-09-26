/**
 * Kassa va hisoblar (IP-22) — pul qayerda turgani: naqd kassa, terminal, bank, Payme, Click.
 * Har hisob qoldig'i, kunni yopish (sanalgan pul bilan solishtirish), ichki o'tkazma
 * (kassadan bankka topshirish, Payme'dan bankka yechish — daromad emas), oylik solishtirish
 * va kassa daftari. Backend: server/routes/cash.ts, mantiq: server/services/cashAccounts.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, BookOpen, Lock, Pencil, Plus, RefreshCw } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { formatNumber } from '../../../utils/formatters';
import { tashkentMonth } from '../../../utils/tashkentDate';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';
import { ReasonModal, apiError } from '../../../components/finance/ReasonModal';
import { invalidateCashAccounts } from '../../../components/finance/AccountSelect';

interface Account {
  id: string; name: string; type: string; method: string; openingBalance: number; openingDate: string | null;
  isActive: boolean; sortOrder: number; balance: number;
  today: { income: number; expense: number; transfersIn: number; transfersOut: number };
  dayClose: boolean; lastClosedDate: string | null; todayClosed: boolean;
}

const TYPE_LABEL: Record<string, string> = { cash: 'Naqd kassa', card: 'Terminal (karta)', bank: 'Bank hisobi', online: 'Onlayn' };
const TYPE_ICON: Record<string, string> = { cash: '💵', card: '💳', bank: '🏦', online: '📱' };
const todayStr = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const dmy = (d?: string | null) => (d ? d.split('-').reverse().join('.') : '—');
const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(Math.abs(n))}` : '0');
const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest';

export default function CrmCash() {
  const { showToast } = useToast();
  const isAdmin = getCurrentRoleLevel() >= ROLE_LEVEL.ADMIN;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [month, setMonth] = useState(tashkentMonth());
  const [report, setReport] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [closeFor, setCloseFor] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editFor, setEditFor] = useState<Account | 'new' | null>(null);
  const [bookFor, setBookFor] = useState<Account | null>(null);
  const [reopenFor, setReopenFor] = useState<any>(null);
  const [voidFor, setVoidFor] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [a, r, t, s] = await Promise.all([
        api.get('/cash/accounts'), api.get('/cash/report', { params: { month } }),
        api.get('/cash/transfers', { params: { month } }), api.get('/cash/sessions', { params: { month } }),
      ]);
      setAccounts(a.data); setReport(r.data); setTransfers(t.data); setSessions(s.data);
    } catch (e) { showToast(apiError(e), 'error'); setAccounts(a => a ?? []); }
  }, [month, showToast]);
  useEffect(() => { void load(); }, [load]);
  const changed = () => { invalidateCashAccounts(); void load(); };

  const name = useMemo(() => new Map((accounts ?? []).map(a => [a.id, a.name])), [accounts]);
  const active = (accounts ?? []).filter(a => a.isActive);
  const total = active.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Kassa va hisoblar"
        subtitle="Pul qayerda turgani: kassa, terminal, bank, Payme, Click — qoldiq, kunni yopish va solishtirish"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={16} />} onClick={() => void load()}>Yangilash</Button>
            <Button variant="primary" size="sm" leftIcon={<ArrowRightLeft size={16} />} onClick={() => setTransferOpen(true)}>Ichki o'tkazma</Button>
            {isAdmin && <Button variant="outline" size="sm" leftIcon={<Plus size={16} />} onClick={() => setEditFor('new')}>Hisob qo'shish</Button>}
          </div>
        }
      />

      {/* ── Hisoblar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {accounts === null && <p className="text-sm text-zinc-400">Yuklanmoqda…</p>}
        {active.map(a => (
          <div key={a.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">{TYPE_ICON[a.type]} {a.name}</p>
                <p className="text-[11px] text-zinc-500">{TYPE_LABEL[a.type] || a.type} · usul «{a.method}»</p>
              </div>
              {a.dayClose && (a.todayClosed
                ? <Badge color="emerald" size="sm">Bugun yopilgan</Badge>
                : <Badge color="amber" size="sm">{a.lastClosedDate ? `Yopilgan: ${dmy(a.lastClosedDate)}` : 'Yopilmagan'}</Badge>)}
            </div>
            <div>
              <p className={labelCls}>Qoldiq</p>
              <p className={`text-2xl font-black tabular-nums ${a.balance < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{formatNumber(a.balance)} <span className="text-sm font-bold text-zinc-400">so'm</span></p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2"><span className="text-zinc-500">Bugun kirim</span><div className="font-black text-emerald-700 dark:text-emerald-300">+{formatNumber(a.today.income + a.today.transfersIn)}</div></div>
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2"><span className="text-zinc-500">Bugun chiqim</span><div className="font-black text-rose-700 dark:text-rose-300">−{formatNumber(a.today.expense + a.today.transfersOut)}</div></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
              {a.dayClose && !a.todayClosed && <Button size="sm" variant="primary" leftIcon={<Lock size={14} />} onClick={() => setCloseFor(a)}>Kunni yopish</Button>}
              <Button size="sm" variant="secondary" leftIcon={<BookOpen size={14} />} onClick={() => setBookFor(a)}>Kassa daftari</Button>
              {isAdmin && <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => setEditFor(a)}>Sozlash</Button>}
            </div>
          </div>
        ))}
      </div>
      {active.length > 0 && (
        <p className="text-xs text-zinc-500">Barcha hisoblarda jami: <b className="tabular-nums text-slate-900 dark:text-white">{formatNumber(total)} so'm</b>. Qoldiq = boshlang'ich qoldiq + kirim − chiqim ± ichki o'tkazmalar. Boshlang'ich qoldiq kiritilmagan hisob faqat tizimdagi harakatni ko'rsatadi.</p>
      )}

      {/* ── Oylik solishtirish */}
      <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Oylik solishtirish</h2>
            <p className="text-[11px] text-zinc-500">Bank va Payme/Click qoldig'ini ularning ko'chirmasi bilan solishtiring</p>
          </div>
          <input type="month" aria-label="Oy" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-zinc-500 text-right">
                <th className="px-4 py-2 text-left">Hisob</th><th className="px-3 py-2">Oy boshi</th><th className="px-3 py-2">Kirim</th><th className="px-3 py-2">Chiqim</th>
                <th className="px-3 py-2">O'tkazma ±</th><th className="px-3 py-2">Oy oxiri</th><th className="px-3 py-2">Yopilgan kun</th><th className="px-4 py-2">Kassa farqi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 tabular-nums text-right">
              {(report?.accounts ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-left font-bold text-slate-900 dark:text-white">{TYPE_ICON[r.type]} {r.name}{r.openingAdded ? <span className="block text-[10px] font-normal text-zinc-500">boshlang'ich qoldiq +{formatNumber(r.openingAdded)}</span> : null}</td>
                  <td className="px-3 py-2.5">{formatNumber(r.opening)}</td>
                  <td className="px-3 py-2.5 text-emerald-600">+{formatNumber(r.income)}</td>
                  <td className="px-3 py-2.5 text-rose-600">−{formatNumber(r.expense)}</td>
                  <td className="px-3 py-2.5">{signed(r.transfersIn - r.transfersOut)}</td>
                  <td className="px-3 py-2.5 font-black">{formatNumber(r.closing)}</td>
                  <td className="px-3 py-2.5 text-xs">{r.closedDays || '—'}</td>
                  <td className={`px-4 py-2.5 ${r.differenceTotal ? 'text-amber-600 font-bold' : 'text-zinc-400'}`}>{signed(r.differenceTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report?.unassigned?.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-amber-700 dark:text-amber-300">
            Hisobi aniqlanmagan eski yozuvlar (usul nomi hech bir hisobga mos emas): {report.unassigned.map((u: any) => `«${u.method}» +${formatNumber(u.income)} / −${formatNumber(u.expense)}`).join(' · ')}.
            {isAdmin ? ' Mos hisobning «usul» yorlig\'ini shu nomga o\'zgartiring yoki yangi hisob qo\'shing.' : ''}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── O'tkazmalar */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
          <h2 className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm font-black text-slate-900 dark:text-white">Ichki o'tkazmalar · {month}</h2>
          {transfers.length === 0 ? <p className="px-4 py-6 text-sm text-zinc-400">O'tkazma yo'q</p> : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {transfers.map(t => (
                <li key={t.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${t.voidedAt ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{name.get(t.fromAccountId) || '?'} → {name.get(t.toAccountId) || '?'}</p>
                    <p className="text-[11px] text-zinc-500">{dmy(t.date)}{t.fee ? ` · komissiya ${formatNumber(t.fee)}` : ''}{t.note ? ` · ${t.note}` : ''}{t.voidedAt ? ` · bekor: ${t.voidReason}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-nums font-black">{formatNumber(t.amount)}</span>
                    {!t.voidedAt && <button type="button" onClick={() => setVoidFor(t)} className="text-[11px] font-bold text-rose-600 hover:underline">Bekor</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Yopilgan kunlar */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
          <h2 className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm font-black text-slate-900 dark:text-white">Yopilgan kunlar · {month}</h2>
          {sessions.length === 0 ? <p className="px-4 py-6 text-sm text-zinc-400">Bu oyda kun yopilmagan</p> : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sessions.map(s => (
                <li key={s.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${s.status !== 'closed' ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{dmy(s.date)} · {name.get(s.accountId) || '?'}</p>
                    <p className="text-[11px] text-zinc-500 tabular-nums">
                      kutilgan {formatNumber(s.expected)} · sanalgan {formatNumber(s.counted)}
                      {s.difference ? <b className="text-amber-600"> · farq {signed(s.difference)}</b> : ' · farq yo\'q'}
                      {s.note ? ` · ${s.note}` : ''} · {s.closedByName || '—'}
                      {s.status !== 'closed' ? ` · qayta ochilgan: ${s.reopenReason}` : ''}
                    </p>
                  </div>
                  {isAdmin && s.status === 'closed' && <button type="button" onClick={() => setReopenFor(s)} className="shrink-0 text-[11px] font-bold text-blue-600 hover:underline">Qayta ochish</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CloseDayModal account={closeFor} onClose={() => setCloseFor(null)} onDone={() => { setCloseFor(null); changed(); }} />
      <TransferModal isOpen={transferOpen} accounts={active} onClose={() => setTransferOpen(false)} onDone={() => { setTransferOpen(false); changed(); }} />
      <AccountModal target={editFor} onClose={() => setEditFor(null)} onDone={() => { setEditFor(null); changed(); }} />
      <CashBookModal account={bookFor} month={month} onClose={() => setBookFor(null)} />
      <ReasonModal isOpen={!!reopenFor} title="Kunni qayta ochish" confirmText="Qayta ochish" danger={false}
        message={reopenFor ? `${dmy(reopenFor.date)} · ${name.get(reopenFor.accountId)}. Farq yozuvi (bo'lsa) olib tashlanadi, shu kunga yana yozish mumkin bo'ladi. Faqat eng oxirgi yopilgan kun ochiladi.` : ''}
        onClose={() => setReopenFor(null)}
        onConfirm={async reason => {
          try { await api.post(`/cash/sessions/${reopenFor.id}/reopen`, { reason }); showToast('Kun qayta ochildi', 'success'); setReopenFor(null); changed(); }
          catch (e) { return apiError(e); }
        }} />
      <ReasonModal isOpen={!!voidFor} title="O'tkazmani bekor qilish" confirmText="Bekor qilish"
        message={voidFor ? `${name.get(voidFor.fromAccountId)} → ${name.get(voidFor.toAccountId)}, ${formatNumber(voidFor.amount)} so'm. Komissiya bo'lsa, qarshi yozuv bilan qaytariladi.` : ''}
        onClose={() => setVoidFor(null)}
        onConfirm={async reason => {
          try { await api.post(`/cash/transfers/${voidFor.id}/void`, { reason }); showToast("O'tkazma bekor qilindi", 'success'); setVoidFor(null); changed(); }
          catch (e) { return apiError(e); }
        }} />
    </div>
  );
}

// ── Kunni yopish ─────────────────────────────────────────────────────────────
function CloseDayModal({ account, onClose, onDone }: { account: Account | null; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [date, setDate] = useState(todayStr());
  const [p, setP] = useState<any>(null);
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEntries, setShowEntries] = useState(false);

  useEffect(() => { if (account) { setDate(todayStr()); setNote(''); setError(''); setShowEntries(false); } }, [account]);
  useEffect(() => {
    if (!account) return;
    setP(null);
    api.get('/cash/day', { params: { accountId: account.id, date } })
      .then(r => { setP(r.data); setCounted(r.data.expected); })
      .catch(e => setError(apiError(e)));
  }, [account, date]);

  const diff = p ? counted - p.expected : 0;
  const submit = async () => {
    if (!account || saving) return;
    if (diff !== 0 && note.trim().length < 3) { setError('Farq bor — sababini yozing'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/cash/close', { accountId: account.id, date, counted, note: note.trim() });
      showToast(diff ? `Kun yopildi, farq ${signed(diff)} so'm yozildi` : 'Kun yopildi — kassa mos', 'success');
      onDone();
    } catch (e) { setError(apiError(e)); }
    finally { setSaving(false); }
  };
  const row = (label: string, value: string, cls = '') => (
    <div className={`flex justify-between gap-3 px-3 py-2 ${cls}`}><span>{label}</span><span className="tabular-nums font-bold">{value}</span></div>
  );

  return (
    <Modal isOpen={!!account} onClose={() => { if (!saving) onClose(); }} title="Kunni yopish" description={account ? `${TYPE_ICON[account.type]} ${account.name}` : ''} width="lg">
      <div className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <label className={labelCls}>Sana</label>
          <input type="date" value={date} max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} className={inputCls} />
        </div>
        {!p ? <p className="text-zinc-400">{error || 'Hisoblanmoqda…'}</p> : p.session ? (
          <p className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">Bu kun allaqachon yopilgan: sanalgan {formatNumber(p.session.counted)} so'm, farq {signed(p.session.difference)}.</p>
        ) : (
          <>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800">
              {row('Kun boshidagi qoldiq', formatNumber(p.opening + p.openingAdded))}
              {row('Kirim', `+${formatNumber(p.income)}`, 'text-emerald-700 dark:text-emerald-300')}
              {row('Chiqim', `−${formatNumber(p.expense)}`, 'text-rose-700 dark:text-rose-300')}
              {(p.transfersIn > 0 || p.transfersOut > 0) && row("Ichki o'tkazma", signed(p.transfersIn - p.transfersOut))}
              {row("Kassada bo'lishi kerak", `${formatNumber(p.expected)} so'm`, 'bg-zinc-50 dark:bg-zinc-800/50 font-black')}
            </div>
            <button type="button" onClick={() => setShowEntries(v => !v)} className="text-xs font-bold text-blue-600 hover:underline">
              {showEntries ? 'Yozuvlarni yashirish' : `Kun yozuvlari (${p.entries.length + p.transfers.length})`}
            </button>
            {showEntries && (
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                {p.entries.map((t: any) => (
                  <li key={t.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="truncate">{t.category}{t.studentName ? ` · ${t.studentName}` : t.staffName ? ` · ${t.staffName}` : ''}</span>
                    <span className={`tabular-nums font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'income' ? '+' : '−'}{formatNumber(Math.abs(t.amount))}{t.amount < 0 ? ' (qaytarish)' : ''}</span>
                  </li>
                ))}
                {p.transfers.map((t: any) => (
                  <li key={t.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span>Ichki o'tkazma{t.note ? ` · ${t.note}` : ''}</span>
                    <span className="tabular-nums font-bold">{t.toAccountId === account?.id ? '+' : '−'}{formatNumber(t.amount - t.fee)}</span>
                  </li>
                ))}
                {!p.entries.length && !p.transfers.length && <li className="px-3 py-2 text-zinc-400">Bu kunda yozuv yo'q</li>}
              </ul>
            )}
            <MoneyInput label="Sanalgan pul (haqiqatda)" value={counted} onChange={setCounted} />
            <p className={`text-sm font-bold ${diff === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {diff === 0 ? '✓ Kassa mos' : `Farq: ${signed(diff)} so'm (${diff > 0 ? 'ortiqcha' : 'kamomad'}) — "Kassa farqi" yozuvi bilan tenglashtiriladi`}
            </p>
            {diff !== 0 && (
              <div className="space-y-1.5">
                <label className={labelCls}>Farq sababi</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} placeholder="Masalan: qaytim xatosi, yozilmagan xarajat" />
              </div>
            )}
            <p className="text-[11px] text-zinc-500">Yopilgandan keyin shu hisob bo'yicha shu kunga (va oldingi kunlarga) yozuv kiritilmaydi — faqat ADMIN qayta ochadi.</p>
          </>
        )}
        {error && p && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Bekor qilish</Button>
          <Button onClick={() => void submit()} isLoading={saving} disabled={!p || !!p?.session} leftIcon={<Lock size={14} />}>Kunni yopish</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Ichki o'tkazma ───────────────────────────────────────────────────────────
function TransferModal({ isOpen, accounts, onClose, onDone }: { isOpen: boolean; accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [amount, setAmount] = useState(0); const [fee, setFee] = useState(0);
  const [date, setDate] = useState(todayStr()); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const cash = accounts.find(a => a.type === 'cash'); const bank = accounts.find(a => a.type === 'bank');
    setFrom(cash?.id || accounts[0]?.id || ''); setTo(bank?.id || accounts[1]?.id || '');
    setAmount(0); setFee(0); setDate(todayStr()); setNote(''); setError('');
  }, [isOpen, accounts]);

  const src = accounts.find(a => a.id === from);
  const submit = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await api.post('/cash/transfers', { fromAccountId: from, toAccountId: to, amount, fee, date, note });
      showToast("O'tkazma yozildi", 'success'); onDone();
    } catch (e) { setError(apiError(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="Ichki o'tkazma" description="Hisoblar orasida pul ko'chirish — daromad ham, xarajat ham emas" width="lg">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Qayerdan</label>
            <select aria-label="Qayerdan" value={from} onChange={e => setFrom(e.target.value)} className={inputCls}>
              {accounts.map(a => <option key={a.id} value={a.id}>{TYPE_ICON[a.type]} {a.name} ({formatNumber(a.balance)})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Qayerga</label>
            <select aria-label="Qayerga" value={to} onChange={e => setTo(e.target.value)} className={inputCls}>
              {accounts.filter(a => a.id !== from).map(a => <option key={a.id} value={a.id}>{TYPE_ICON[a.type]} {a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput label="Summa (chiqqan)" value={amount} onChange={setAmount} />
          <MoneyInput label="Komissiya (ushlab qolingan)" value={fee} onChange={setFee} />
        </div>
        {amount > 0 && (
          <p className="text-xs text-zinc-500">
            «{src?.name}» hisobidan {formatNumber(amount)} chiqadi, manzilga <b className="text-slate-900 dark:text-white">{formatNumber(Math.max(0, amount - fee))}</b> tushadi
            {fee > 0 ? `, ${formatNumber(fee)} — "Bank komissiyasi" xarajati` : ''}.
            {src && amount > src.balance ? <span className="text-amber-600"> Diqqat: summa hisob qoldig'idan ({formatNumber(src.balance)}) katta.</span> : null}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Sana</label>
            <input type="date" value={date} max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Izoh</label>
            <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="Masalan: bankka topshirildi" />
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Bekor qilish</Button>
          <Button onClick={() => void submit()} isLoading={saving} disabled={!from || !to || amount <= 0} leftIcon={<ArrowRightLeft size={14} />}>O'tkazish</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Hisob sozlamalari (ADMIN) ────────────────────────────────────────────────
function AccountModal({ target, onClose, onDone }: { target: Account | 'new' | null; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const isNew = target === 'new';
  const [form, setForm] = useState({ name: '', type: 'cash', method: 'Naqd', openingBalance: 0, openingDate: '', isActive: true });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setError('');
    setForm(target === 'new'
      ? { name: '', type: 'cash', method: 'Naqd', openingBalance: 0, openingDate: todayStr(), isActive: true }
      : { name: target.name, type: target.type, method: target.method, openingBalance: target.openingBalance, openingDate: target.openingDate || '', isActive: target.isActive });
  }, [target]);
  const submit = async () => {
    if (saving || !target) return;
    setSaving(true); setError('');
    try {
      const body = { ...form, openingDate: form.openingDate || null };
      if (isNew) await api.post('/cash/accounts', body); else await api.put(`/cash/accounts/${(target as Account).id}`, body);
      showToast(isNew ? "Hisob qo'shildi" : 'Saqlandi', 'success'); onDone();
    } catch (e) { setError(apiError(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal isOpen={!!target} onClose={() => { if (!saving) onClose(); }} title={isNew ? "Yangi hisob" : 'Hisob sozlamalari'} width="lg">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><label className={labelCls}>Nomi</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Masalan: 2-filial kassasi" /></div>
          <div className="space-y-1.5">
            <label className={labelCls}>Turi</label>
            <select aria-label="Turi" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{TYPE_ICON[k]} {v}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>To'lov usuli yorlig'i</label>
          <input value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className={inputCls} placeholder="Naqd, Karta, Bank, Payme, Click" />
          <p className="text-[11px] text-zinc-500">Kvitansiya va hisobotlarda ko'rinadi. Hisob tanlanmagan eski yozuvlar shu yorliq bo'yicha shu hisobga tushadi.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MoneyInput label="Boshlang'ich qoldiq" value={form.openingBalance} onChange={v => setForm({ ...form, openingBalance: v })} />
          <div className="space-y-1.5"><label className={labelCls}>Qaysi kundan</label><input type="date" value={form.openingDate} max={todayStr()} onChange={e => setForm({ ...form, openingDate: e.target.value })} className={inputCls} /></div>
        </div>
        <p className="text-[11px] text-zinc-500">Boshlang'ich qoldiq — shu kun boshida hisobda (kassada) haqiqatda bo'lgan pul. Undan oldingi yozuvlar bu hisob qoldig'iga kirmaydi.</p>
        {!isNew && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Faol (formalarda tanlanadi)</label>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Bekor qilish</Button>
          <Button onClick={() => void submit()} isLoading={saving} disabled={form.name.trim().length < 2 || !form.method.trim()}>Saqlash</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Kassa daftari ────────────────────────────────────────────────────────────
function CashBookModal({ account, month, onClose }: { account: Account | null; month: string; onClose: () => void }) {
  const [m, setM] = useState(month);
  const [book, setBook] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (account) setM(month); }, [account, month]);
  useEffect(() => {
    if (!account) return;
    setBook(null); setError('');
    api.get(`/cash/accounts/${account.id}/book`, { params: { month: m } }).then(r => setBook(r.data)).catch(e => setError(apiError(e)));
  }, [account, m]);
  return (
    <Modal isOpen={!!account} onClose={onClose} title="Kassa daftari" description={account ? `${TYPE_ICON[account.type]} ${account.name}` : ''} width="2xl">
      <div className="space-y-3 text-sm">
        <input type="month" aria-label="Oy" value={m} onChange={e => e.target.value && setM(e.target.value)} className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold" />
        {error ? <p className="text-rose-600">{error}</p> : !book ? <p className="text-zinc-400">Yuklanmoqda…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs tabular-nums text-right">
              <thead><tr className="text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="px-2 py-2 text-left">Sana</th><th className="px-2 py-2">Boshi</th><th className="px-2 py-2">Kirim</th><th className="px-2 py-2">Chiqim</th><th className="px-2 py-2">O'tkazma</th><th className="px-2 py-2">Oxiri</th><th className="px-2 py-2 text-left">Yopish</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {book.days.map((d: any) => (
                  <tr key={d.date}>
                    <td className="px-2 py-1.5 text-left font-bold">{dmy(d.date)}</td>
                    <td className="px-2 py-1.5">{formatNumber(d.opening + d.openingAdded)}</td>
                    <td className="px-2 py-1.5 text-emerald-600">+{formatNumber(d.income)}</td>
                    <td className="px-2 py-1.5 text-rose-600">−{formatNumber(d.expense)}</td>
                    <td className="px-2 py-1.5">{signed(d.transfersIn - d.transfersOut)}</td>
                    <td className="px-2 py-1.5 font-black">{formatNumber(d.closing)}</td>
                    <td className="px-2 py-1.5 text-left">{d.session ? (d.session.status === 'closed' ? `✓ ${d.session.difference ? `farq ${signed(d.session.difference)}` : 'mos'}` : 'qayta ochilgan') : '—'}</td>
                  </tr>
                ))}
                {!book.days.length && <tr><td colSpan={7} className="px-2 py-4 text-center text-zinc-400">Bu oyda harakat yo'q</td></tr>}
              </tbody>
              <tfoot><tr className="font-black border-t border-zinc-200 dark:border-zinc-700">
                <td className="px-2 py-2 text-left">Oy bo'yicha</td>
                <td className="px-2 py-2">{formatNumber(book.opening)}</td>
                <td className="px-2 py-2 text-emerald-600">+{formatNumber(book.days.reduce((s: number, d: any) => s + d.income, 0))}</td>
                <td className="px-2 py-2 text-rose-600">−{formatNumber(book.days.reduce((s: number, d: any) => s + d.expense, 0))}</td>
                <td className="px-2 py-2">{signed(book.days.reduce((s: number, d: any) => s + d.transfersIn - d.transfersOut, 0))}</td>
                <td className="px-2 py-2">{formatNumber(book.closing)}</td><td />
              </tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
