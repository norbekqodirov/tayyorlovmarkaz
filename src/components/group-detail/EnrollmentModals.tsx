/**
 * IP-09 — guruhga yozish (sana + birinchi oy preview'i) va a'zolikni yakunlash /
 * boshqa guruhga o'tkazish oynalari. Backend: server/routes/enrollments.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../Toast';
import { formatNumber } from '../../utils/formatters';
import { tashkentToday } from '../../utils/tashkentDate';

const inputCls = 'w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500';
const labelCls = 'text-sm font-bold text-slate-700 dark:text-zinc-300';

interface Preview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  month: string;
  tariff: { monthlyPrice: number; lessonsPerPackage: number; source: string } | null;
  groupLessonsInMonth: number | null;
  billableLessons: number | null;
  firstBillableDate: string | null;
  fullMonth: boolean | null;
  firstMonthAmount: number | null;
}

const errMsg = (e: any) => e?.response?.data?.message || "Saqlab bo'lmadi. Qayta urinib ko'ring.";

// ─── Guruhga yozish ──────────────────────────────────────────────────────────

export function AddEnrollmentModal({ isOpen, onClose, groupId, groupStartDate, student, onDone }: {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  /** Guruh boshlangan sana — tezkor tanlash va cheklov uchun */
  groupStartDate?: string | null;
  student: { id: string; name: string } | null;
  onDone: (alreadyEnrolled: boolean) => void;
}) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(tashkentToday());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const today = tashkentToday();
    setStartDate(groupStartDate && groupStartDate > today ? groupStartDate : today);
    setError('');
  }, [isOpen, groupStartDate]);

  useEffect(() => {
    if (!isOpen || !student || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.post('/enrollments/preview', { groupId, studentId: student.id, startDate })
        .then(r => { if (alive) setPreview(r.data); })
        .catch(() => { if (alive) setPreview(null); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [isOpen, student, groupId, startDate]);

  if (!student) return null;

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const r = await api.post('/enrollments', { studentId: student.id, groupId, startDate });
      showToast(r.data?.alreadyEnrolled ? "Bu o'quvchi allaqachon guruhda" : `O'quvchi ${startDate} dan guruhga qo'shildi`, r.data?.alreadyEnrolled ? 'info' : 'success');
      onDone(!!r.data?.alreadyEnrolled);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Guruhga qo'shish" description={student.name} width="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="enroll-start" className={labelCls}>Boshlash sanasi</label>
          <input id="enroll-start" type="date" value={startDate} min={groupStartDate || undefined} onChange={e => setStartDate(e.target.value)} className={inputCls} />
          {groupStartDate && groupStartDate < tashkentToday() && (
            <button type="button" onClick={() => setStartDate(groupStartDate)} className="text-xs font-bold text-blue-600 hover:underline">
              Guruh boshidan ({groupStartDate})
            </button>
          )}
          <p className="text-xs text-zinc-500">O'quvchi guruhda haqiqatan qachondan o'qiyotganini kiriting — shu kungi dars ham hisobga kiradi.</p>
        </div>

        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3 text-xs space-y-1.5" aria-live="polite">
          {loading && !preview ? <p className="text-zinc-500">Hisoblanmoqda…</p> : preview ? (
            <>
              {preview.tariff && (
                <div className="flex justify-between"><span className="text-zinc-500">Oylik narx</span><span className="font-bold tabular-nums">{formatNumber(preview.tariff.monthlyPrice)} so'm / {preview.tariff.lessonsPerPackage} dars</span></div>
              )}
              {preview.billableLessons != null && (
                <div className="flex justify-between"><span className="text-zinc-500">{preview.month} darslari</span><span className="font-bold tabular-nums">{preview.billableLessons} / {preview.groupLessonsInMonth}{preview.fullMonth ? " (to'liq oy)" : ''}</span></div>
              )}
              {preview.firstMonthAmount != null && (
                <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-700 pt-1.5"><span className="text-zinc-500">Birinchi oy to'lovi</span><span className="font-black tabular-nums text-blue-600">{formatNumber(preview.firstMonthAmount)} so'm</span></div>
              )}
              {preview.errors.map(m => <p key={m} className="text-rose-600 font-bold">{m}</p>)}
              {preview.warnings.map(m => <p key={m} className="text-amber-600">{m}</p>)}
              <p className="text-zinc-400 pt-1">Oy o'rtasida boshlasa — shu oy qolgan darslar bo'yicha hisoblanadi.</p>
            </>
          ) : <p className="text-zinc-500">Hisoblab bo'lmadi</p>}
        </div>

        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Bekor qilish</Button>
          <Button type="button" isLoading={saving} disabled={!!preview && !preview.ok} onClick={() => void submit()}>Qo'shish</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Yakunlash / transfer ────────────────────────────────────────────────────

const REASONS = [
  { value: 'left', label: 'Ketdi' },
  { value: 'graduated', label: 'Bitirdi' },
  { value: 'admin_fix', label: "Xato qo'shilgan (davomati yo'q)" },
];

export function EndEnrollmentModal({ isOpen, onClose, groupId, student, onDone }: {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  student: { id: string; name: string; period?: { id: string; startDate: string } | null } | null;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const today = tashkentToday();
  const [mode, setMode] = useState<'end' | 'transfer'>('end');
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('left');
  const [toGroupId, setToGroupId] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string; maxSize: number; count: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode('end'); setDate(tashkentToday()); setReason('left'); setToGroupId(''); setError('');
    api.get('/groups').then(r => {
      const list = (Array.isArray(r.data) ? r.data : r.data?.data || [])
        .filter((g: any) => g.id !== groupId && g.status !== 'completed')
        .map((g: any) => ({ id: g.id, name: g.name, maxSize: g.maxSize, count: g._count?.enrollments ?? 0 }));
      setGroups(list);
    }).catch(() => setGroups([]));
  }, [isOpen, groupId]);

  const period = student?.period ?? null;
  const target = useMemo(() => groups.find(g => g.id === toGroupId), [groups, toGroupId]);
  if (!student) return null;

  const submit = async () => {
    if (saving) return;
    setError('');
    if (mode === 'transfer' && !toGroupId) { setError('Yangi guruhni tanlang'); return; }
    setSaving(true);
    try {
      if (!period) {
        // Eski (sanasiz) a'zolik — bugun bilan yakunlanadi
        await api.delete('/enrollments/remove', { data: { studentId: student.id, groupId } });
        showToast("O'quvchi guruhdan chiqarildi", 'success');
      } else if (mode === 'end') {
        await api.post(`/enrollments/periods/${period.id}/end`, { endDate: date, reason });
        showToast(reason === 'admin_fix' ? "Xato a'zolik olib tashlandi" : `A'zolik ${date} bilan yakunlandi`, 'success');
      } else {
        await api.post(`/enrollments/periods/${period.id}/transfer`, { toGroupId, date });
        showToast(`${target?.name || 'Yangi guruh'}ga ${date} dan o'tkazildi`, 'success');
      }
      onDone();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="A'zolikni o'zgartirish" description={`${student.name}${period ? ` — ${period.startDate} dan guruhda` : ''}`} width="md">
      <div className="space-y-4">
        {period ? (
          <div className="flex gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl" role="radiogroup" aria-label="Amal">
            {([['end', 'Guruhdan chiqarish'], ['transfer', "Boshqa guruhga o'tkazish"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${mode === v ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}>{l}</button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-amber-600">Bu a'zolik yangi tizimdan oldin qo'shilgan (boshlanish sanasi yo'q) — bugungi sana bilan yakunlanadi. Transfer uchun avval ma'lumot ko'chirilishi (backfill) kerak.</p>
        )}

        {period && mode === 'end' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="end-reason" className={labelCls}>Sabab</label>
              <select id="end-reason" value={reason} onChange={e => setReason(e.target.value)} className={inputCls}>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {reason !== 'admin_fix' && (
              <div className="space-y-1.5">
                <label htmlFor="end-date" className={labelCls}>Oxirgi kun</label>
                <input id="end-date" type="date" value={date} min={period.startDate} max={today} onChange={e => setDate(e.target.value)} className={inputCls} />
                <p className="text-xs text-zinc-500">Shu kungacha bo'lgan darslar hisobga kiradi.</p>
              </div>
            )}
          </>
        )}

        {period && mode === 'transfer' && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="transfer-group" className={labelCls}>Yangi guruh</label>
              <select id="transfer-group" value={toGroupId} onChange={e => setToGroupId(e.target.value)} className={inputCls}>
                <option value="">Tanlang…</option>
                {groups.map(g => <option key={g.id} value={g.id} disabled={g.maxSize > 0 && g.count >= g.maxSize}>{g.name} ({g.count}/{g.maxSize}){g.maxSize > 0 && g.count >= g.maxSize ? " — joy yo'q" : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="transfer-date" className={labelCls}>Yangi guruhda birinchi kun</label>
              <input id="transfer-date" type="date" value={date} min={period.startDate} max={today} onChange={e => setDate(e.target.value)} className={inputCls} />
              <p className="text-xs text-zinc-500">Eski guruhdagi a'zolik bir kun oldin tugaydi — oraliq bo'shliqsiz.</p>
            </div>
          </>
        )}

        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Bekor qilish</Button>
          <Button type="button" variant={mode === 'end' ? 'danger' : 'primary'} isLoading={saving} onClick={() => void submit()}>
            {mode === 'transfer' && period ? "O'tkazish" : 'Chiqarish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── O'qishni boshlagan sanalar ──────────────────────────────────────────────
// Adminlar har o'quvchi guruhda qachondan o'qiyotganini belgilaydi (tizimga
// kiritilgan kun emas). Backend: POST /api/enrollments/periods/start-dates —
// hammasi yoki hech biri; xato qatorlar `details`da qaytadi.

type StartMember = { id: string; name: string; _period?: { id: string; startDate: string } | null };

export function StartDatesModal({ isOpen, onClose, groupId, groupStartDate, members, onDone }: {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupStartDate?: string | null;
  members: StartMember[];
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const rows = useMemo(() => members.filter(m => m._period?.id).sort((a, b) => a.name.localeCompare(b.name)), [members]);
  const missing = members.length - rows.length;
  const [dates, setDates] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDates(Object.fromEntries(rows.map(m => [m._period!.id, m._period!.startDate])));
    setBulk(groupStartDate || tashkentToday());
    setRowErrors({});
    setError('');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = rows.filter(m => dates[m._period!.id] && dates[m._period!.id] !== m._period!.startDate);

  const submit = async () => {
    if (saving) return;
    if (!changed.length) { onClose(); return; }
    setSaving(true);
    setError('');
    setRowErrors({});
    try {
      const r = await api.post('/enrollments/periods/start-dates', {
        groupId, items: changed.map(m => ({ periodId: m._period!.id, startDate: dates[m._period!.id] })),
      });
      const adj = r.data?.adjustments?.length ? ` · ${r.data.adjustments.length} ta hisobga tuzatma` : '';
      showToast(`${r.data?.changed ?? changed.length} ta o'quvchining sanasi saqlandi${adj}`, 'success');
      onDone();
      onClose();
    } catch (e: any) {
      const details = e?.response?.data?.details;
      if (Array.isArray(details)) setRowErrors(Object.fromEntries(details.filter((d: any) => d?.periodId).map((d: any) => [d.periodId, d.message])));
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title="O'qishni boshlagan sanalar" description="Har o'quvchi shu guruhda qachondan o'qiyotganini belgilang" width="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3">
          <label className="space-y-1">
            <span className="block text-xs font-bold text-zinc-500">Hammasiga bir xil sana</span>
            <input type="date" value={bulk} min={groupStartDate || undefined} onChange={e => setBulk(e.target.value)} className={`${inputCls} py-2`} />
          </label>
          <Button type="button" variant="secondary" size="sm" disabled={!bulk || !rows.length}
            onClick={() => setDates(Object.fromEntries(rows.map(m => [m._period!.id, bulk])))}>
            Hammasiga qo'llash
          </Button>
          {groupStartDate && <p className="w-full text-xs text-zinc-500">Guruh {groupStartDate} dan boshlangan — undan oldingi sana qo'yilmaydi.</p>}
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-800">
          {!rows.length ? (
            <p className="p-4 text-sm text-zinc-500">Sanani o'zgartiradigan a'zolik yo'q.</p>
          ) : rows.map((m, i) => {
            const pid = m._period!.id;
            const dirty = dates[pid] !== m._period!.startDate;
            return (
              <div key={pid} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${rowErrors[pid] ? 'bg-rose-50 dark:bg-rose-500/10' : ''}`}>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-zinc-400 tabular-nums mr-2">{i + 1}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{m.name}</span>
                  {rowErrors[pid] && <span className="block text-xs font-semibold text-rose-600">{rowErrors[pid]}</span>}
                </span>
                <input type="date" aria-label={`${m.name} — boshlash sanasi`} value={dates[pid] || ''} min={groupStartDate || undefined}
                  onChange={e => setDates(d => ({ ...d, [pid]: e.target.value }))}
                  className={`${inputCls} w-auto py-1.5 ${dirty ? 'border-blue-500' : ''}`} />
              </div>
            );
          })}
        </div>

        {missing > 0 && <p className="text-xs text-amber-600">{missing} ta o'quvchida a'zolik sanasi hali yo'q (eski yozuv) — ma'lumot ko'chirish bajarilgach shu yerda chiqadi.</p>}
        <p className="text-xs text-zinc-500">Oylik hisob shu sanadan boshlanadi: oy o'rtasida boshlasa — qolgan darslar bo'yicha. E'lon qilingan hisob bo'lsa, farq tuzatma sifatida yoziladi.</p>
        {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-zinc-500">{changed.length ? `${changed.length} ta o'zgarish` : "O'zgarish yo'q"}</span>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Bekor qilish</Button>
            <Button type="button" isLoading={saving} disabled={!changed.length} onClick={() => void submit()}>Saqlash</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
