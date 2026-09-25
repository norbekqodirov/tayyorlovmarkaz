/**
 * Oylik hisoblar — har o'quvchining oy (hisob davri) bo'yicha hisobi, to'lagani va qarzi.
 * Jonli rejimda hammasi avtomatik: hisob o'zi chiqadi va darhol kuchga kiradi (qo'lda
 * "e'lon qilish" yo'q), to'lovlar qarzni o'zi qoplaydi, davr tugagach davomat tuzatmasi
 * o'zi yoziladi. Shadow/legacy'da — eski boshqaruv vositalari (sinov uchun).
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
import { ReasonModal, apiError } from '../../../components/finance/ReasonModal';

const STATUS_BADGE: Record<string, { label: string; color: 'amber' | 'emerald' | 'slate' }> = {
  draft: { label: 'Qoralama', color: 'amber' },
  posted: { label: 'Hisoblangan', color: 'emerald' },
  void: { label: 'Bekor', color: 'slate' },
};
const LINE_LABEL: Record<string, string> = {
  base: 'Asosiy', extra_lesson: "Qo'shimcha dars", absence_discount: 'Davomat chegirmasi', cancel_credit: 'Bekor qilingan dars',
  promo: 'Promo', sibling: 'Aka-uka', social: 'Ijtimoiy', manual: 'Tuzatma',
};
const dm = (d?: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');
const todayStr = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
function payState(r: { amount: number; paid: number; debt: number; dueDate?: string | null }) {
  if (r.debt <= 0) return { label: "To'langan", color: 'emerald' as const };
  if (r.dueDate && todayStr() > r.dueDate) return { label: "Muddati o'tgan", color: 'rose' as const };
  if (r.paid > 0) return { label: 'Qisman', color: 'amber' as const };
  return { label: 'Qarz', color: 'amber' as const };
}

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
  const [summary, setSummary] = useState<any[]>([]);
  // IP-21: o'tgan oy — yopish checklist'i / yopilgan holat
  const [closeInfo, setCloseInfo] = useState<any | null>(null);
  const [closeModal, setCloseModal] = useState<null | 'force' | 'reopen'>(null);
  const [showMissing, setShowMissing] = useState(false);
  const isSuper = getCurrentRoleLevel() >= ROLE_LEVEL.SUPER_ADMIN;
  const pastMonth = month < tashkentMonth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, sm] = await Promise.all([api.get('/billing/mode'), api.get(`/billing/${month}/charges`), api.get(`/billing/${month}/summary`)]);
      setMode(m.data.mode);
      setCharges(c.data || []);
      setSummary(sm.data || []);
      setCloseInfo(null);
      if (m.data.mode === 'live' && month < tashkentMonth()) {
        api.get(`/billing/${month}/close-check`).then(r => setCloseInfo(r.data)).catch(() => setCloseInfo(null));
      }
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

  // Jonli rejim: "Yangilash" — hisoblarni hozir hisoblash (odatda har kecha o'zi bo'ladi)
  const refreshNow = async () => {
    setBusy('refresh');
    try {
      const d = (await api.post(`/billing/${month}/refresh`, {})).data;
      showToast(d.created || d.updated ? `Yangilandi: yangi ${d.created}, o'zgargan ${d.updated}` : "Hisoblar dolzarb — o'zgarish yo'q", 'success');
      await load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Yangilab bo\'lmadi', 'error');
    } finally {
      setBusy(null);
    }
  };
  const live = mode === 'live';
  const doClose = async (force: boolean, reason?: string) => {
    setBusy('close');
    try {
      await api.post(`/billing/${month}/close`, force ? { force: true, reason } : {});
      showToast(`${month} oyi yopildi`, 'success');
      setCloseModal(null);
      await load();
    } catch (e: any) {
      if (e?.response?.data?.details) setCloseInfo((c: any) => ({ ...(c || {}), ...e.response.data.details }));
      const msg = apiError(e, "Oyni yopib bo'lmadi");
      if (force) return msg;
      showToast(msg, 'error');
    } finally {
      setBusy(null);
    }
  };
  const doReopen = async (reason: string) => {
    try {
      await api.post(`/billing/${month}/reopen`, { reason });
      showToast(`${month} oyi qayta ochildi`, 'success');
      setCloseModal(null);
      await load();
    } catch (e: any) { return apiError(e); }
  };
  const liveRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary.filter(r => !q || r.student?.name?.toLowerCase().includes(q) || r.student?.code?.toLowerCase().includes(q) || r.groupName?.toLowerCase().includes(q));
  }, [summary, search]);
  const liveStats = useMemo(() => ({
    students: new Set(summary.map(r => r.student?.id)).size,
    amount: summary.reduce((a, r) => a + r.amount, 0),
    paid: summary.reduce((a, r) => a + r.paid, 0),
    debt: summary.reduce((a, r) => a + r.debt, 0),
  }), [summary]);

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
        subtitle={live ? "Har o'quvchining shu oy uchun hisobi, to'lagani va qarzi" : "O'quvchi majburiyatlari guruh×oy bo'yicha — har summa qanday hisoblangani bilan"}
        badge={live ? undefined : { label: MODE_LABEL[mode]?.label || mode, color: MODE_LABEL[mode]?.color || 'blue' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" aria-label="Oy" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold" />
            {live ? (
              <Button variant="secondary" size="sm" isLoading={busy === 'refresh'} leftIcon={<RefreshCw size={16} />} onClick={() => void refreshNow()}>Yangilash</Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" isLoading={busy === 'generate'} leftIcon={<Calculator size={16} />} onClick={() => void run('generate')}>Hisoblash</Button>
                <Button variant="primary" size="sm" isLoading={busy === 'post'} disabled={!stats.draft} leftIcon={<CheckCheck size={16} />} onClick={() => void run('post')}>E'lon qilish ({stats.draft})</Button>
                <Button variant="outline" size="sm" isLoading={busy === 'settle'} leftIcon={<Scale size={16} />} onClick={() => void run('settle')}>Oy yakuni tuzatmasi</Button>
              </>
            )}
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
          Hisoblar avtomatik: har oy boshida (yoki guruh boshlangan kuni — sozlamaga ko'ra), o'quvchi qo'shilganda yoki sanasi o'zgarganda darhol chiqadi. Kiritilgan to'lovlar qarzni o'zi qoplaydi; davr tugagach davomat bo'yicha tuzatma o'zi yoziladi. O'quvchi qachondan o'qiyotgani — guruh sahifasida "O'qishni boshlagan sanalar".
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

      {live && pastMonth && closeInfo && (
        closeInfo.status === 'closed' ? (
          <div role="note" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
            <span><b>{month} oyi yopilgan</b>{closeInfo.closedAt ? ` · ${new Date(closeInfo.closedAt).toLocaleDateString('ru-RU')}` : ''} — hisob, davomat va maosh o'zgarmaydi; tuzatishlar keyingi ochiq oyga tushadi.</span>
            {isSuper && <Button size="sm" variant="secondary" onClick={() => setCloseModal('reopen')}>Qayta ochish</Button>}
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-900 dark:text-white">{month} oyini yopish</p>
              {isAdmin && (
                <div className="flex gap-2">
                  {closeInfo.blockers?.length > 0 && !closeInfo.blockers.includes('ended') && (
                    <Button size="sm" variant="secondary" onClick={() => setCloseModal('force')}>Majburiy yopish…</Button>
                  )}
                  <Button size="sm" isLoading={busy === 'close'} disabled={!closeInfo.canClose} onClick={() => void doClose(false)}>Oyni yopish</Button>
                </div>
              )}
            </div>
            <ul className="space-y-1.5 text-xs">
              {closeInfo.items?.map((it: any) => (
                <li key={it.key} className="flex items-start gap-2">
                  <span className={`mt-0.5 inline-flex w-4 justify-center font-black ${it.status === 'ok' ? 'text-emerald-600' : it.status === 'warn' ? 'text-amber-600' : 'text-rose-600'}`}>{it.status === 'ok' ? '✓' : it.status === 'warn' ? '!' : '✕'}</span>
                  <span className="min-w-0">
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{it.label}</span>
                    {it.count > 0 && <span className="text-zinc-500"> — {it.count}</span>}
                    {it.hint && <span className="block text-zinc-500">{it.hint}</span>}
                    {it.key === 'attendance' && it.count > 0 && (
                      <>
                        <button type="button" className="text-blue-600 font-bold hover:underline" onClick={() => setShowMissing(v => !v)}>{showMissing ? 'Yashirish' : "Qaysi darslar?"}</button>
                        {showMissing && (
                          <span className="block mt-1 space-y-0.5">
                            {it.details.map((g: any) => <span key={g.groupId} className="block text-zinc-600 dark:text-zinc-400">{g.groupName}: {g.dates.map((d: string) => dm(d)).join(', ')}</span>)}
                          </span>
                        )}
                      </>
                    )}
                    {it.key === 'payroll' && it.count > 0 && <span className="block text-zinc-500">{it.details.map((u: any) => u.name).join(', ')}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-zinc-400">Yopishda hisoblar yangilanadi, davr tugagan hisoblarga davomat tuzatmasi yoziladi, avans qarzga biriktiriladi va balanslar solishtiriladi.</p>
          </div>
        )
      )}
      <ReasonModal isOpen={closeModal === 'force'} title={`${month} oyini majburiy yopish`}
        message="Checklist'da hal qilinmagan band bor (masalan davomati olinmagan darslar). Sabab bilan yopiladi va audit jurnaliga yoziladi."
        confirmText="Majburiy yopish" onClose={() => setCloseModal(null)} onConfirm={reason => doClose(true, reason)} />
      <ReasonModal isOpen={closeModal === 'reopen'} title={`${month} oyini qayta ochish`}
        message="Yopilgan oy qayta ochilsa, uning hisob va davomatini o'zgartirish mumkin bo'ladi. Faqat zarur holatda, sabab bilan."
        confirmText="Qayta ochish" danger={false} onClose={() => setCloseModal(null)} onConfirm={doReopen} />
      {live ? (<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="O'quvchilar" value={liveStats.students} sub={`${summary.length} ta hisob`} variant="minimal" color="blue" />
        <StatCard label="Jami hisob" value={formatNumber(liveStats.amount)} sub="so'm" variant="minimal" color="slate" />
        <StatCard label="To'langan" value={formatNumber(liveStats.paid)} sub="so'm" variant="minimal" color="emerald" />
        <StatCard label="Qarz" value={formatNumber(liveStats.debt)} sub="so'm" variant="minimal" color="rose" />
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800 flex-wrap">
          <p className="text-xs font-black text-slate-900 dark:text-white">{month} hisoblari</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="O'quvchi, kod yoki guruh…" aria-label="Qidirish"
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm min-w-0 flex-1 sm:flex-none sm:w-64" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 text-left">O'quvchi</th>
                <th className="px-4 py-3 text-left">Guruh</th>
                <th className="px-4 py-3 text-left">Davr</th>
                <th className="px-4 py-3 text-right">Darslar</th>
                <th className="px-4 py-3 text-right">Hisob</th>
                <th className="px-4 py-3 text-right">To'langan</th>
                <th className="px-4 py-3 text-right">Qarz</th>
                <th className="px-4 py-3 text-left">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">Yuklanmoqda…</td></tr>
              ) : liveRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">Bu oy uchun hisob hali yo'q — hisoblar har kecha o'zi chiqadi yoki "Yangilash"ni bosing</td></tr>
              ) : liveRows.map(r => {
                const st = payState(r);
                return (
                  <tr key={r.chargeId} className="hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer" onClick={() => void openDetail(r.chargeId)}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{r.student?.name}</div>
                      <div className="text-[10px] text-zinc-400">{r.student?.code || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.type === 'tuition' ? (r.groupName || '—') : r.type === 'other_fee' ? 'Boshqa to\'lov' : "Boshlang'ich qoldiq"}</td>
                    <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap">{r.windowFrom ? `${dm(r.windowFrom)}–${dm(r.windowTo)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">{r.lessons != null ? `${r.lessons}/${r.groupLessons}` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">{formatNumber(r.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatNumber(r.paid)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-black ${r.debt > 0 ? 'text-rose-600' : 'text-zinc-400'}`}>{formatNumber(r.debt)}</td>
                    <td className="px-4 py-3"><Badge color={st.color}>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>) : (<>
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
      </>)}

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
