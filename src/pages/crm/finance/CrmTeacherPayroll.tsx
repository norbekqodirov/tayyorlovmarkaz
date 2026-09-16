/**
 * CrmTeacherPayroll.tsx
 *
 * Finance-audit (2026-09-15), F5 — o'qituvchilar oyligi: ikki baza
 * (Hisoblangan/Accrual, Tushgan/Cash) yonma-yon ko'rsatiladi, lekin FAQAT
 * kelishilgan bittasi bo'yicha draft->tasdiqlash->to'lov jarayoni yuritiladi
 * (server/routes/teacherPayroll.ts). HR'dagi eski "Oylik to'lash" (oddiy
 * generic xarajat, davr/tasdiqlashsiz) shu sahifaga havola bilan almashtirildi.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet, Check, Loader2, AlertTriangle, ChevronDown, History, Info,
} from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { Button } from '../../../components/ui/Button';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { formatNumber } from '../../../utils/formatters';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

interface Teacher { id: string; name: string; }
interface GroupBreakdown { groupId: string; groupName: string; studentCount: number; revenue: number; }
interface Preview {
  teacherId: string; year: number; month: number; basis: 'accrual' | 'cash';
  salaryPercent: number; revenue: number; salary: number;
  groups: GroupBreakdown[]; note: string | null;
}
interface Payroll {
  id: string; teacherId: string; month: string; basis: 'accrual' | 'cash';
  accruedAmount: number; paidAmount: number; status: 'draft' | 'approved' | 'paid';
  createdAt: string; approvedAt: string | null;
}

const STATUS_META: Record<Payroll['status'], { label: string; className: string }> = {
  draft: { label: 'Loyiha', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  approved: { label: 'Tasdiqlangan', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  paid: { label: "To'langan", className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export default function CrmTeacherPayroll() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState(searchParams.get('teacherId') || '');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual');

  const [accrualPreview, setAccrualPreview] = useState<Preview | null>(null);
  const [cashPreview, setCashPreview] = useState<Preview | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [history, setHistory] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Bank');

  useEffect(() => {
    api.get('/auth/users').then(res => {
      const list = (res.data || []).filter((u: any) => u.role === 'TEACHER').map((u: any) => ({ id: u.id, name: u.name }));
      setTeachers(list);
      if (!teacherId && list.length) setTeacherId(list[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const loadAll = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      const [accRes, cashRes, listRes] = await Promise.all([
        api.get('/finance/teacher-payroll/preview', { params: { teacherId, year, month, basis: 'accrual' } }),
        api.get('/finance/teacher-payroll/preview', { params: { teacherId, year, month, basis: 'cash' } }),
        api.get('/finance/teacher-payroll', { params: { teacherId } }),
      ]);
      setAccrualPreview(accRes.data);
      setCashPreview(cashRes.data);
      const rows: Payroll[] = listRes.data || [];
      setHistory(rows);
      const current = rows.find(r => r.month === monthStr && r.basis === basis) || null;
      setPayroll(current);
    } catch {
      showToast("Ma'lumotlarni yuklashda xatolik", 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, year, month, basis]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const activePreview = basis === 'accrual' ? accrualPreview : cashPreview;
  const remaining = payroll ? Math.max(0, payroll.accruedAmount - payroll.paidAmount) : 0;

  const createDraft = async () => {
    setBusy(true);
    try {
      const res = await api.post('/finance/teacher-payroll', { teacherId, year, month, basis });
      setPayroll(res.data);
      showToast(payroll ? 'Qayta hisoblandi' : 'Loyiha yaratildi', 'success');
      void loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!payroll) return;
    setBusy(true);
    try {
      const res = await api.post(`/finance/teacher-payroll/${payroll.id}/approve`);
      setPayroll(res.data);
      showToast('Tasdiqlandi', 'success');
      void loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!payroll || payAmount <= 0) return;
    setBusy(true);
    try {
      const res = await api.post(`/finance/teacher-payroll/${payroll.id}/pay`, { amount: payAmount, method: payMethod });
      setPayroll(res.data);
      setPayAmount(0);
      showToast("To'lov qayd etildi", 'success');
      void loadAll();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setBusy(false);
    }
  };

  const teacherName = useMemo(() => teachers.find(t => t.id === teacherId)?.name || '', [teachers, teacherId]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet size={20} className="text-emerald-500" /> O'qituvchilar Oyligi
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Davr bo'yicha hisoblash, tasdiqlash va to'lovni qayd etish</p>
        </div>
      </div>

      {/* Filtrlar */}
      <div className="flex items-center gap-3 flex-wrap p-4 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
        <div className="relative">
          <select
            value={teacherId}
            onChange={e => setTeacherId(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white"
          >
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white"
          >
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl ml-auto">
          <button
            onClick={() => setBasis('accrual')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${basis === 'accrual' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}
          >
            Hisoblangan
          </button>
          <button
            onClick={() => setBasis('cash')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${basis === 'cash' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}
          >
            Tushgan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : !teacherId ? (
        <p className="text-center text-zinc-500 py-12">O'qituvchi topilmadi</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Hisoblash breakdown */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{teacherName} — {MONTHS[month - 1]} {year}</h2>
                {payroll && <span className={`text-[10px] font-black px-2 py-1 rounded-full ${STATUS_META[payroll.status].className}`}>{STATUS_META[payroll.status].label}</span>}
              </div>

              {activePreview && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Baza (tushum)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{formatNumber(activePreview.revenue)} so'm</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Oylik ({activePreview.salaryPercent}%)</p>
                      <p className="text-lg font-black text-emerald-600">{formatNumber(activePreview.salary)} so'm</p>
                    </div>
                  </div>

                  {activePreview.note && (
                    <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-xs">
                      <Info size={14} className="shrink-0 mt-0.5" /> {activePreview.note}
                    </div>
                  )}

                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-zinc-400 uppercase text-[10px]">
                        <th className="pb-2">Guruh</th>
                        <th className="pb-2 text-right">O'quvchi</th>
                        <th className="pb-2 text-right">Baza</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {activePreview.groups.map(g => (
                        <tr key={g.groupId}>
                          <td className="py-2 font-bold text-slate-700 dark:text-zinc-300">{g.groupName}</td>
                          <td className="py-2 text-right text-zinc-500">{g.studentCount}</td>
                          <td className="py-2 text-right font-bold">{formatNumber(g.revenue)} so'm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* Amallar */}
            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              {!payroll || payroll.status === 'draft' ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {payroll ? "Loyiha mavjud — qayta hisoblab tasdiqlashingiz mumkin." : "Bu davr uchun hali loyiha yaratilmagan."}
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <Button onClick={() => void createDraft()} disabled={busy} variant="secondary" className="text-xs">
                      {payroll ? 'Qayta hisoblash' : 'Loyiha yaratish'}
                    </Button>
                    {payroll && (
                      <Button onClick={() => void approve()} disabled={busy} className="text-xs">
                        <Check size={14} /> Tasdiqlash
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Tasdiqlangan summa</span>
                    <span className="font-black">{formatNumber(payroll.accruedAmount)} so'm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Berilgan</span>
                    <span className="font-black text-emerald-600">{formatNumber(payroll.paidAmount)} so'm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Qoldiq</span>
                    <span className="font-black text-rose-600">{formatNumber(remaining)} so'm</span>
                  </div>
                  {remaining > 0 && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <MoneyInput label="To'lov summasi" value={payAmount} onChange={setPayAmount} />
                      </div>
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value)}
                        className="px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold"
                      >
                        <option value="Bank">Bank</option>
                        <option value="Naqd">Naqd</option>
                        <option value="Karta">Karta</option>
                      </select>
                      <Button onClick={() => void pay()} disabled={busy || payAmount <= 0 || payAmount > remaining} className="text-xs shrink-0">
                        To'lov qayd etish
                      </Button>
                    </div>
                  )}
                  {payroll.status === 'paid' && (
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold">
                      <Check size={14} /> Bu davr uchun to'liq to'langan.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tarix */}
          <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] h-fit">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <History size={15} className="text-zinc-400" /> Tarix
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-400">Hali yozuv yo'q</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <div>
                      <p className="font-bold text-slate-700 dark:text-zinc-300">{h.month} <span className="text-zinc-400 font-medium">({h.basis === 'cash' ? 'tushgan' : 'hisoblangan'})</span></p>
                      <p className="text-zinc-400">{formatNumber(h.paidAmount)} / {formatNumber(h.accruedAmount)} so'm</p>
                    </div>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${STATUS_META[h.status].className}`}>{STATUS_META[h.status].label}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-1.5 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Tasdiqlangan/to'langan davr summasi qayta hisoblanmaydi — tuzatish kerak bo'lsa alohida murojaat qiling.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
