/**
 * IP-11 — Oylik hisoblar (o'quvchi majburiyatlari). Moliya mas'uli shu yerda oy
 * hisoblarini generatsiya qiladi, tekshiradi, e'lon qiladi va oy yakunida
 * tuzatmalarni hisoblaydi. Shadow rejimda — eski hisob bilan solishtirish.
 * Backend: server/routes/billing.ts, qoidalar: docs/ADR_HISOB_QOIDALARI.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCheck, RefreshCw, Scale, FileSearch } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { formatNumber } from '../../../utils/formatters';
import { tashkentMonth } from '../../../utils/tashkentDate';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';
import ConfirmDialog from '../../../components/ConfirmDialog';

const STATUS_BADGE: Record<string, { label: string; color: 'amber' | 'emerald' | 'slate' }> = {
  draft: { label: 'Qoralama', color: 'amber' },
  posted: { label: "E'lon qilingan", color: 'emerald' },
  void: { label: 'Bekor', color: 'slate' },
};
const LINE_LABEL: Record<string, string> = {
  base: 'Asosiy', extra_lesson: "Qo'shimcha dars", absence_discount: 'Davomat chegirmasi', cancel_credit: 'Bekor qilingan dars',
  promo: 'Promo', sibling: 'Aka-uka', social: 'Ijtimoiy', manual: 'Tuzatma',
};
const MODE_LABEL: Record<string, { label: string; color: 'blue' | 'amber' | 'green' }> = {
  legacy: { label: 'Eski tizim (legacy)', color: 'blue' },
  shadow: { label: 'Sinov (shadow)', color: 'amber' },
  live: { label: 'Jonli (live)', color: 'green' },
};

export default function CrmBilling() {
  const { showToast } = useToast();
  const isAdmin = getCurrentRoleLevel() >= ROLE_LEVEL.ADMIN;
  const [month, setMonth] = useState(tashkentMonth());
  const [mode, setMode] = useState<string>('legacy');
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'charges' | 'shadow'>('charges');
  const [shadow, setShadow] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([api.get('/billing/mode'), api.get(`/billing/${month}/charges`)]);
      setMode(m.data.mode);
      setCharges(c.data || []);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Hisoblarni yuklab bo'lmadi", 'error');
    } finally {
      setLoading(false);
    }
  }, [month, showToast]);

  useEffect(() => { void load(); }, [load]);

  const loadShadow = useCallback(async () => {
    try { setShadow((await api.get(`/billing/${month}/shadow-report`)).data); }
    catch (e: any) { showToast(e?.response?.data?.message || "Solishtirib bo'lmadi", 'error'); }
  }, [month, showToast]);

  useEffect(() => { if (tab === 'shadow') void loadShadow(); }, [tab, loadShadow]);

  const run = async (kind: 'generate' | 'post' | 'settle') => {
    setBusy(kind);
    try {
      const r = await api.post(`/billing/${month}/${kind}`, {});
      const d = r.data;
      if (kind === 'generate') showToast(`Yaratildi ${d.created}, yangilandi ${d.updated}, o'zgarmagan ${d.unchanged}, o'tkazildi ${d.skipped.length}${d.legacyWithoutPeriod ? ` · davrsiz a'zolik ${d.legacyWithoutPeriod} (backfill kerak)` : ''}`, 'success');
      if (kind === 'post') showToast(`${d.posted} ta hisob e'lon qilindi`, 'success');
      if (kind === 'settle') showToast(d.adjustments.length ? `${d.adjustments.length} ta tuzatma (${d.targetMonth})` : 'Farq yo\'q — tuzatma kerak emas', 'success');
      await load();
      if (tab === 'shadow') await loadShadow();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Amal bajarilmadi', 'error');
    } finally {
      setBusy(null);
    }
  };

  const [confirmLive, setConfirmLive] = useState(false);
  const changeMode = async (next: string) => {
    try {
      await api.put('/billing/mode', { mode: next });
      setMode(next);
      showToast(`Rejim: ${MODE_LABEL[next]?.label || next}`, 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Rejimni o'zgartirib bo'lmadi", 'error');
    }
  };

  const openDetail = async (id: string) => {
    try { setDetail((await api.get(`/billing/charges/${id}`)).data); }
    catch { showToast("Hisobni ochib bo'lmadi", 'error'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return charges.filter(c => !q || c.student?.name?.toLowerCase().includes(q) || c.student?.code?.toLowerCase().includes(q));
  }, [charges, search]);

  const stats = useMemo(() => {
    const live = charges.filter(c => c.status !== 'void');
    return {
      count: live.filter(c => c.type === 'tuition').length,
      draft: live.filter(c => c.status === 'draft').length,
      net: live.reduce((a, c) => a + c.net, 0),
      adjustments: live.filter(c => c.type === 'adjustment').reduce((a, c) => a + c.net, 0),
    };
  }, [charges]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Oylik hisoblar"
        subtitle="O'quvchi majburiyatlari guruh×oy bo'yicha — har summa qanday hisoblangani bilan"
        badge={{ label: MODE_LABEL[mode]?.label || mode, color: MODE_LABEL[mode]?.color || 'blue' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" aria-label="Oy" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold" />
            <Button variant="secondary" size="sm" isLoading={busy === 'generate'} leftIcon={<Calculator size={16} />} onClick={() => void run('generate')}>Hisoblash</Button>
            <Button variant="primary" size="sm" isLoading={busy === 'post'} disabled={!stats.draft} leftIcon={<CheckCheck size={16} />} onClick={() => void run('post')}>E'lon qilish ({stats.draft})</Button>
            <Button variant="outline" size="sm" isLoading={busy === 'settle'} leftIcon={<Scale size={16} />} onClick={() => void run('settle')}>Oy yakuni tuzatmasi</Button>
          </div>
        }
      />

      {mode === 'legacy' && (
        <div role="note" className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2">
          <span>Hozir eski tizim ishlaydi — bu yerdagi hisoblar hech qayerga ta'sir qilmaydi. Sinov oyi uchun "shadow" rejimini yoqing (kunlik avtomatik hisoblash va solishtirish).</span>
          {isAdmin && <Button size="sm" variant="secondary" onClick={() => void changeMode('shadow')}>Shadow rejimini yoqish</Button>}
        </div>
      )}
      {mode === 'shadow' && (
        <div role="note" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>Sinov rejimi: hisoblar har kecha avtomatik tayyorlanadi, lekin qarz va balans hali eski tizimdan olinadi. Jonli rejimda qarz, balans va ustoz maoshi shu hisoblardan olinadi.</span>
          {isAdmin && <Button size="sm" variant="primary" onClick={() => setConfirmLive(true)}>Jonli rejimga o'tish</Button>}
        </div>
      )}
      {mode === 'live' && (
        <div role="note" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200">
          Jonli rejim — qarz va balans shu hisoblardan. Har oy: hisoblar har kecha o'zi tayyorlanadi → ro'yxatni tekshiring → <b>"E'lon qilish"</b>. Oldindan kiritilgan to'lov e'lon qilingan hisobga o'zi biriktiriladi. O'quvchi guruhda qachondan o'qiyotgani — guruh sahifasida "O'qishni boshlagan sanalar".
        </div>
      )}
      <ConfirmDialog
        isOpen={isAdmin && confirmLive}
        title="Jonli rejimga o'tish"
        message="Shundan keyin o'quvchi qarzi va balansi faqat e'lon qilingan oylik hisoblar va to'lovlardan hisoblanadi, ustoz maoshi ham shu hisoblardan. Eski tizimdagi qo'lda yozilgan qarz/avans bo'lsa, u avval kiritilishi kerak. Davom etasizmi?"
        confirmText="Ha, o'tish"
        onConfirm={() => { setConfirmLive(false); void changeMode('live'); }}
        onCancel={() => setConfirmLive(false)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Hisoblar" value={stats.count} sub={`${stats.draft} ta qoralama`} variant="minimal" color="blue" />
        <StatCard label="Jami (net)" value={formatNumber(stats.net)} sub="so'm" variant="minimal" color="emerald" />
        <StatCard label="Tuzatmalar" value={formatNumber(stats.adjustments)} sub="so'm" variant="minimal" color="amber" />
        <StatCard label="Oy" value={month} sub={isAdmin ? `Rejim: ${mode}` : ''} variant="minimal" color="slate" />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
          <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl" role="tablist">
            {([['charges', 'Hisoblar'], ['shadow', 'Eski tizim bilan solishtirish']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black ${tab === k ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}>{l}</button>
            ))}
          </div>
          {tab === 'charges' && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="O'quvchi ismi yoki kodi…" aria-label="Qidirish"
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm min-w-0 flex-1 sm:flex-none sm:w-64" />
          )}
          {tab === 'shadow' && <Button size="sm" variant="ghost" leftIcon={<RefreshCw size={14} />} onClick={() => void loadShadow()}>Yangilash</Button>}
        </div>

        {tab === 'charges' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="px-4 py-3 text-left">O'quvchi</th>
                  <th className="px-4 py-3 text-left">Tur</th>
                  <th className="px-4 py-3 text-right">Darslar (R/F)</th>
                  <th className="px-4 py-3 text-right">Yalpi</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-left">Muddat</th>
                  <th className="px-4 py-3 text-left">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Yuklanmoqda…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">Bu oy uchun hisob yo'q — "Hisoblash" tugmasini bosing</td></tr>
                ) : filtered.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer" onClick={() => void openDetail(c.id)}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{c.student?.name}</div>
                      <div className="text-[10px] text-zinc-400">{c.student?.code || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{c.type === 'tuition' ? 'Oylik' : c.type === 'adjustment' ? 'Tuzatma' : c.type}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{c.calc?.R != null ? `${c.calc.R}/${c.calc.F}${c.calc.fullMonth ? ' ✓' : ''}` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(c.gross)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-black ${c.net < 0 ? 'text-emerald-600' : ''}`}>{formatNumber(c.net)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{c.dueDate || '—'}</td>
                    <td className="px-4 py-3"><Badge color={STATUS_BADGE[c.status]?.color || 'slate'}>{STATUS_BADGE[c.status]?.label || c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {!shadow ? <p className="text-sm text-zinc-400">Yuklanmoqda…</p> : (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge color="blue">Farqli qatorlar: {shadow.totals.diffRows}</Badge>
                  <Badge color={shadow.totals.unexplained ? 'rose' : 'emerald'}>Izohlanmagan: {shadow.totals.unexplained}</Badge>
                  {Object.entries(shadow.byReason).map(([k, v]) => <Badge key={k} color="slate">{k}: {String(v)}</Badge>)}
                </div>
                <p className="text-xs text-zinc-500">Cutover sharti (J.7): izohlanmagan farq 0. Har farq sababi yangi hisobning izohidan olinadi.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                      <tr><th className="px-3 py-2 text-left">O'quvchi</th><th className="px-3 py-2 text-right">Yangi</th><th className="px-3 py-2 text-right">Eski</th><th className="px-3 py-2 text-right">Farq</th><th className="px-3 py-2 text-left">Sabab</th></tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {shadow.rows.slice(0, 300).map((r: any) => (
                        <tr key={`${r.studentId}-${r.groupId}`}>
                          <td className="px-3 py-2"><div className="font-bold">{r.studentName || r.studentId.slice(0, 8)}</div><div className="text-[10px] text-zinc-400">{r.groupName || '—'}</div></td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.newNet)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.legacyNet)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.diff < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatNumber(r.diff)}</td>
                          <td className={`px-3 py-2 ${r.reason === 'izohlanmagan' ? 'text-rose-600 font-bold' : ''}`}>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="Hisob tafsiloti" description={detail ? `${detail.month} · ${STATUS_BADGE[detail.status]?.label || detail.status}` : ''} width="lg">
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800">
              {detail.lines.map((l: any) => (
                <div key={l.id} className="flex justify-between gap-3 px-3 py-2">
                  <span><span className="font-bold">{LINE_LABEL[l.kind] || l.kind}</span> <span className="text-xs text-zinc-500">{l.description}</span></span>
                  <span className={`tabular-nums font-bold ${l.amount < 0 ? 'text-emerald-600' : ''}`}>{formatNumber(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="font-black">Net</span><span className="tabular-nums font-black">{formatNumber(detail.net)} so'm</span>
              </div>
            </div>
            {detail.calc?.P != null && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  ['Oylik narx (P)', formatNumber(detail.calc.P)], ['Paket (N)', detail.calc.N], ['Billable darslar (R)', detail.calc.R],
                  ['Guruh darslari (F)', detail.calc.F], ["To'liq oy", detail.calc.fullMonth ? 'Ha' : "Yo'q"], ['Qoldirishlar (A / M)', `${detail.calc.A} / ${detail.calc.M}`],
                  ['Ustoz bazasi', formatNumber(detail.teacherBase)], ['Tarif', detail.calc.tariffSource === 'version' ? 'Tarix versiyasi' : 'Joriy narx'], ["Davr", `${detail.calc.periodStart} — ${detail.calc.periodEnd || '…'}`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"><div className="text-zinc-500">{k}</div><div className="font-bold tabular-nums">{String(v)}</div></div>
                ))}
              </div>
            )}
            {detail.calc?.billableDates?.length > 0 && <p className="text-xs text-zinc-500"><FileSearch size={12} className="inline mr-1" />Darslar: {detail.calc.billableDates.join(', ')}{detail.calc.absentDates?.length ? ` · kelmagan: ${detail.calc.absentDates.join(', ')}` : ''}</p>}
            {detail.adjustments?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-black text-zinc-500 uppercase">Tuzatmalar</p>
                {detail.adjustments.map((a: any) => (
                  <div key={a.id} className="flex justify-between text-xs px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                    <span>{a.month} · {a.reason}</span><span className="tabular-nums font-bold">{formatNumber(a.net)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
