/**
 * CrmTeacherPayroll.tsx — "Xodimlar Oyligi"
 *
 * Finance-audit (2026-09-15/16) — ikki bo'lim: O'QITUVCHILAR (davomat asosida
 * hisoblangan/tushgan ikki baza, HR tekshirib tasdiqlaydigan to'liq tabel) va
 * XODIMLAR (belgilangan oylik maosh + o'z davomati, mavjud Salary/StaffAttendance
 * tizimi ustida). Ikkalasida ham: ro'yxat -> shaxsga bosilganda to'liq tafsilot.
 *
 * Xodimlar bo'limi CrmStaffDetail.tsx (/staff/:id) ga NAVIGATSIYA qilmaydi —
 * o'sha route ADMIN-only, bu sahifa esa ADMIN+MANAGER uchun ochiq (finance
 * ruxsati) — shuning uchun xodim tafsiloti shu yerning o'zida, mavjud
 * /salary va /salary/attendance endpointlari ustida qurilgan.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet, Check, Loader2, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight,
  History, Info, Users, GraduationCap, Clock, CalendarCheck, Plus, X,
} from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { Button } from '../../../components/ui/Button';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { formatNumber } from '../../../utils/formatters';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

// ─── Types ──────────────────────────────────────────────────────────────────

interface Teacher { id: string; name: string; subject?: string; }
interface StaffPerson { id: string; name: string; role: string; department?: string; salary: number; photo?: string; status?: string; }

interface StudentRow {
  studentId: string; studentName: string; absences: number;
  basePrice: number; discountApplied: boolean; discount: number; finalPrice: number;
}
interface GroupBreakdown {
  groupId: string; groupName: string; studentCount: number; revenue: number;
  lessonsHeld?: number; students?: StudentRow[];
}
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
interface StaffAttSummary {
  linked: boolean; staffMemberId?: string;
  records: { id: string; date: string; checkIn?: string; checkOut?: string; status: string }[];
  summary: { present: number; late: number; absent: number; total: number } | null;
}
interface SalaryRow {
  id: string; staffId: string; month: string; baseSalary: number; bonus: number;
  deduction: number; total: number; paid: boolean; paidAt: string | null; notes?: string | null;
  staff: { id: string; name: string; role: string; salary: number; photo?: string };
}
interface StaffAttendanceRow { id: string; date: string; checkIn?: string; checkOut?: string; status: string; }

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Loyiha', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  approved: { label: 'Tasdiqlangan', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  paid: { label: "To'langan", className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  none: { label: 'Hisoblanmagan', className: 'bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600' },
};

const ATT_STATUS_LABEL: Record<string, string> = { present: "Keldi", late: 'Kech qoldi', absent: 'Kelmadi', pending: 'Kutilmoqda' };
const ATT_STATUS_COLOR: Record<string, string> = {
  present: 'text-emerald-600', late: 'text-amber-600', absent: 'text-rose-600', pending: 'text-zinc-400',
};

export default function CrmTeacherPayroll() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [section, setSection] = useState<'teachers' | 'staff'>('teachers');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // ── Teachers ──
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherPayrolls, setTeacherPayrolls] = useState<Payroll[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(searchParams.get('teacherId') || null);
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual');
  const [accrualPreview, setAccrualPreview] = useState<Preview | null>(null);
  const [cashPreview, setCashPreview] = useState<Preview | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [history, setHistory] = useState<Payroll[]>([]);
  const [staffAtt, setStaffAtt] = useState<StaffAttSummary | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Staff ──
  const [staffList, setStaffList] = useState<StaffPerson[]>([]);
  const [staffSalaries, setStaffSalaries] = useState<SalaryRow[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceRow[]>([]);
  const [staffDetailLoading, setStaffDetailLoading] = useState(false);
  const [staffForm, setStaffForm] = useState({ baseSalary: 0, bonus: 0, deduction: 0, notes: '' });

  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Bank');

  // ─── Teachers: list data ──────────────────────────────────────────────────
  useEffect(() => {
    // O01 tuzatish: `/auth/users` ADMIN+ talab qiladi — MANAGER shu sahifada
    // 403 olib, ro'yxat jimgina bo'sh qolardi. Endi shu sahifa uchun maxsus,
    // MANAGER+finance ruxsati bilan ochiq tor endpoint ishlatiladi.
    api.get('/finance/teacher-payroll/teachers-list').then(res => {
      setTeachers((res.data || []).map((u: any) => ({ id: u.id, name: u.name, subject: u.subject })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/finance/teacher-payroll', { params: { month: monthStr } })
      .then(res => setTeacherPayrolls(res.data || []))
      .catch(() => setTeacherPayrolls([]));
  }, [monthStr]);

  const teacherStatusFor = useCallback((teacherId: string): Payroll | null => {
    return teacherPayrolls.find(p => p.teacherId === teacherId && p.basis === basis) || null;
  }, [teacherPayrolls, basis]);

  // ─── Teachers: detail data ────────────────────────────────────────────────
  const loadTeacherDetail = useCallback(async () => {
    if (!selectedTeacherId) return;
    setDetailLoading(true);
    try {
      const [accRes, cashRes, listRes, attRes] = await Promise.all([
        api.get('/finance/teacher-payroll/preview', { params: { teacherId: selectedTeacherId, year, month, basis: 'accrual' } }),
        api.get('/finance/teacher-payroll/preview', { params: { teacherId: selectedTeacherId, year, month, basis: 'cash' } }),
        api.get('/finance/teacher-payroll', { params: { teacherId: selectedTeacherId } }),
        api.get(`/finance/teacher-payroll/${selectedTeacherId}/staff-attendance`, { params: { month: monthStr } }),
      ]);
      setAccrualPreview(accRes.data);
      setCashPreview(cashRes.data);
      const rows: Payroll[] = listRes.data || [];
      setHistory(rows);
      setPayroll(rows.find(r => r.month === monthStr && r.basis === basis) || null);
      setStaffAtt(attRes.data);
    } catch {
      showToast("Ma'lumotlarni yuklashda xatolik", 'error');
    } finally {
      setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, year, month, basis]);

  useEffect(() => { if (section === 'teachers' && selectedTeacherId) void loadTeacherDetail(); }, [section, selectedTeacherId, loadTeacherDetail]);

  const activePreview = basis === 'accrual' ? accrualPreview : cashPreview;
  const remaining = payroll ? Math.max(0, payroll.accruedAmount - payroll.paidAmount) : 0;
  // Farq: hisoblangan (accrual) va tushgan (cash) baza orasidagi tafovut —
  // "hali qoplanmagan" qism qancha ekanini ko'rsatadi.
  const accrualCashDelta = accrualPreview && cashPreview ? accrualPreview.salary - cashPreview.salary : null;

  // Foydalanuvchi so'ragan g'oya: to'lashda avval TUSHGAN pul asosidagi
  // ulushni belgilash, qolgani (to'liq hisoblangan summagacha) keyinroq,
  // yana pul tushgani sayin berilishi — shuning uchun "to'lov" formasi
  // standart bo'yicha shu summani taklif qiladi (qo'lda o'zgartirish mumkin).
  useEffect(() => {
    if (payroll && payroll.status === 'approved' && cashPreview) {
      const suggested = Math.max(0, Math.min(remaining, cashPreview.salary - payroll.paidAmount));
      setPayAmount(suggested);
    } else {
      setPayAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payroll?.id, payroll?.status, payroll?.paidAmount, cashPreview?.salary]);

  const createDraft = async () => {
    if (!selectedTeacherId) return;
    setBusy(true);
    try {
      const res = await api.post('/finance/teacher-payroll', { teacherId: selectedTeacherId, year, month, basis });
      setPayroll(res.data);
      showToast(payroll ? 'Qayta hisoblandi' : 'Loyiha yaratildi', 'success');
      void loadTeacherDetail();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!payroll) return;
    setBusy(true);
    try {
      const res = await api.post(`/finance/teacher-payroll/${payroll.id}/approve`);
      setPayroll(res.data);
      showToast('Tasdiqlandi', 'success');
      void loadTeacherDetail();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

  const pay = async () => {
    if (!payroll || payAmount <= 0) return;
    setBusy(true);
    try {
      const res = await api.post(`/finance/teacher-payroll/${payroll.id}/pay`, { amount: payAmount, method: payMethod });
      setPayroll(res.data);
      showToast("To'lov qayd etildi", 'success');
      void loadTeacherDetail();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

  const selectedTeacher = useMemo(() => teachers.find(t => t.id === selectedTeacherId) || null, [teachers, selectedTeacherId]);

  // ─── Staff: list data ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/staff').then(res => {
      const list = (res.data || []).filter((s: any) => s.role !== "O'qituvchi" && s.status !== "Ishdan bo'shagan");
      setStaffList(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/salary', { params: { month: monthStr } })
      .then(res => setStaffSalaries(res.data || []))
      .catch(() => setStaffSalaries([]));
  }, [monthStr]);

  const staffSalaryFor = useCallback((staffId: string): SalaryRow | null => {
    return staffSalaries.find(s => s.staffId === staffId) || null;
  }, [staffSalaries]);

  const selectedStaff = useMemo(() => staffList.find(s => s.id === selectedStaffId) || null, [staffList, selectedStaffId]);
  const selectedStaffSalary = selectedStaffId ? staffSalaryFor(selectedStaffId) : null;

  const loadStaffDetail = useCallback(async () => {
    if (!selectedStaffId) return;
    setStaffDetailLoading(true);
    try {
      const [attRes, salRes] = await Promise.all([
        api.get('/salary/attendance', { params: { staffId: selectedStaffId } }),
        api.get(`/salary/staff/${selectedStaffId}`),
      ]);
      setStaffAttendance((attRes.data || []).filter((r: any) => r.date.startsWith(monthStr)));
      setStaffSalaries(prev => {
        const others = prev.filter(s => s.staffId !== selectedStaffId);
        const thisMonth = (salRes.data || []).find((s: any) => s.month === monthStr);
        return thisMonth ? [...others, thisMonth] : others;
      });
    } catch {
      showToast('Davomat/maosh yuklanmadi', 'error');
    } finally { setStaffDetailLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId, monthStr]);

  useEffect(() => { if (section === 'staff' && selectedStaffId) void loadStaffDetail(); }, [section, selectedStaffId, loadStaffDetail]);

  useEffect(() => {
    if (selectedStaff) {
      const existing = staffSalaryFor(selectedStaff.id);
      setStaffForm({
        baseSalary: existing?.baseSalary ?? selectedStaff.salary ?? 0,
        bonus: existing?.bonus ?? 0,
        deduction: existing?.deduction ?? 0,
        notes: existing?.notes ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId, monthStr]);

  const saveStaffSalary = async () => {
    if (!selectedStaffId) return;
    setBusy(true);
    try {
      const res = await api.post('/salary', { staffId: selectedStaffId, month: monthStr, ...staffForm });
      setStaffSalaries(prev => [...prev.filter(s => s.id !== res.data.id), res.data]);
      showToast('Saqlandi', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

  const payStaffSalary = async () => {
    const sal = selectedStaffId ? staffSalaryFor(selectedStaffId) : null;
    if (!sal) return;
    setBusy(true);
    try {
      const res = await api.put(`/salary/${sal.id}/pay`, {});
      setStaffSalaries(prev => prev.map(s => s.id === res.data.id ? res.data : s));
      showToast("To'landi", 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

  // ─── Shared month/year nav ────────────────────────────────────────────────
  const shiftMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet size={20} className="text-emerald-500" /> Xodimlar Oyligi
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">O'qituvchilar (davomat asosida) va boshqa xodimlar (belgilangan maosh) oyligi</p>
      </div>

      {/* Bo'lim tanlash */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-fit">
        <button
          onClick={() => { setSection('teachers'); setSelectedStaffId(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${section === 'teachers' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}
        >
          <GraduationCap size={15} /> O'qituvchilar
        </button>
        <button
          onClick={() => { setSection('staff'); setSelectedTeacherId(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${section === 'staff' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}
        >
          <Users size={15} /> Xodimlar
        </button>
      </div>

      {/* Davr tanlash — ikkalasiga umumiy */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] w-fit">
        <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><ChevronLeft size={16} /></button>
        <span className="text-sm font-black text-slate-900 dark:text-white min-w-[140px] text-center">{MONTHS[month - 1]} {year}</span>
        <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"><ChevronRight size={16} /></button>
      </div>

      {section === 'teachers' ? (
        selectedTeacherId ? (
          <TeacherDetail
            teacherName={selectedTeacher?.name || ''}
            year={year} month={month}
            basis={basis} setBasis={setBasis}
            accrualPreview={accrualPreview} cashPreview={cashPreview}
            activePreview={activePreview}
            payroll={payroll} history={history} remaining={remaining}
            accrualCashDelta={accrualCashDelta}
            staffAtt={staffAtt}
            loading={detailLoading} busy={busy}
            expandedGroupId={expandedGroupId} setExpandedGroupId={setExpandedGroupId}
            payAmount={payAmount} setPayAmount={setPayAmount}
            payMethod={payMethod} setPayMethod={setPayMethod}
            onBack={() => setSelectedTeacherId(null)}
            onCreateDraft={createDraft} onApprove={approve} onPay={pay}
          />
        ) : (
          <TeacherList
            teachers={teachers}
            basis={basis} setBasis={setBasis}
            statusFor={teacherStatusFor}
            onSelect={setSelectedTeacherId}
          />
        )
      ) : (
        selectedStaffId ? (
          <StaffDetail
            staff={selectedStaff}
            salary={selectedStaffSalary}
            attendance={staffAttendance}
            monthLabel={`${MONTHS[month - 1]} ${year}`}
            form={staffForm} setForm={setStaffForm}
            loading={staffDetailLoading} busy={busy}
            onBack={() => setSelectedStaffId(null)}
            onSave={saveStaffSalary} onPay={payStaffSalary}
          />
        ) : (
          <StaffList staff={staffList} salaryFor={staffSalaryFor} onSelect={setSelectedStaffId} />
        )
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  const meta = STATUS_META[status || 'none'];
  return <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${meta.className}`}>{meta.label}</span>;
}

function TeacherList({ teachers, basis, setBasis, statusFor, onSelect }: {
  teachers: Teacher[]; basis: 'accrual' | 'cash'; setBasis: (b: 'accrual' | 'cash') => void;
  statusFor: (id: string) => Payroll | null; onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] overflow-hidden">
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <p className="text-sm font-black text-slate-900 dark:text-white">O'qituvchilar ({teachers.length})</p>
        <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <button onClick={() => setBasis('accrual')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'accrual' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>Hisoblangan</button>
          <button onClick={() => setBasis('cash')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'cash' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}>Tushgan</button>
        </div>
      </div>
      {teachers.length === 0 ? (
        <p className="p-8 text-center text-sm text-zinc-400">O'qituvchi topilmadi</p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {teachers.map(t => {
            const p = statusFor(t.id);
            return (
              <button key={t.id} onClick={() => onSelect(t.id)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.name}</p>
                  {t.subject && <p className="text-[11px] text-zinc-400">{t.subject}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {p && <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">{formatNumber(p.paidAmount)}/{formatNumber(p.accruedAmount)} so'm</span>}
                  <StatusBadge status={p?.status} />
                  <ChevronRight size={16} className="text-zinc-300" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupBreakdownCard({ group, expanded, onToggle }: { group: GroupBreakdown; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/40 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 truncate">{group.groupName}</span>
          <span className="text-[10px] text-zinc-400 shrink-0">({group.studentCount} o'quvchi{group.lessonsHeld !== undefined ? `, ${group.lessonsHeld} dars` : ''})</span>
        </div>
        <span className="text-xs font-black shrink-0">{formatNumber(group.revenue)} so'm</span>
      </button>
      {expanded && group.students && (
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="text-zinc-400 uppercase text-[9px] border-b border-zinc-100 dark:border-zinc-800">
              <th className="px-3 py-1.5">O'quvchi</th>
              <th className="px-3 py-1.5 text-right">Qoldirgan</th>
              <th className="px-3 py-1.5 text-right">Baza</th>
              <th className="px-3 py-1.5 text-right">Chegirma</th>
              <th className="px-3 py-1.5 text-right">Yakuniy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {group.students.map(s => (
              <tr key={s.studentId}>
                <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-zinc-300">{s.studentName}</td>
                <td className={`px-3 py-1.5 text-right ${s.discountApplied ? 'text-rose-600 font-bold' : 'text-zinc-500'}`}>{s.absences} kun</td>
                <td className="px-3 py-1.5 text-right text-zinc-500">{formatNumber(s.basePrice)}</td>
                <td className="px-3 py-1.5 text-right text-rose-600">{s.discount > 0 ? `-${formatNumber(s.discount)}` : '—'}</td>
                <td className="px-3 py-1.5 text-right font-black">{formatNumber(s.finalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TeacherDetail(props: {
  teacherName: string; year: number; month: number;
  basis: 'accrual' | 'cash'; setBasis: (b: 'accrual' | 'cash') => void;
  accrualPreview: Preview | null; cashPreview: Preview | null; activePreview: Preview | null;
  payroll: Payroll | null; history: Payroll[]; remaining: number; accrualCashDelta: number | null;
  staffAtt: StaffAttSummary | null;
  loading: boolean; busy: boolean;
  expandedGroupId: string | null; setExpandedGroupId: (id: string | null) => void;
  payAmount: number; setPayAmount: (n: number) => void;
  payMethod: string; setPayMethod: (m: string) => void;
  onBack: () => void; onCreateDraft: () => void; onApprove: () => void; onPay: () => void;
}) {
  const {
    teacherName, month, year, basis, setBasis, accrualPreview, cashPreview, activePreview,
    payroll, history, remaining, accrualCashDelta, staffAtt, loading, busy,
    expandedGroupId, setExpandedGroupId, payAmount, setPayAmount, payMethod, setPayMethod,
    onBack, onCreateDraft, onApprove, onPay,
  } = props;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
        <ChevronLeft size={14} /> O'qituvchilar ro'yxatiga qaytish
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* O'z davomati (Face ID) */}
            <div className="p-4 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CalendarCheck size={13} /> Ishga kelish-ketish (shu oy)</p>
              {!staffAtt?.linked ? (
                <p className="text-xs text-zinc-400">Bu o'qituvchi hali Staff botga ulanmagan — ishga kelish-ketish ma'lumoti yo'q.</p>
              ) : (
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-600 font-bold">{staffAtt.summary?.present || 0} keldi</span>
                  <span className="text-amber-600 font-bold">{staffAtt.summary?.late || 0} kech qoldi</span>
                  <span className="text-rose-600 font-bold">{staffAtt.summary?.absent || 0} kelmadi</span>
                </div>
              )}
            </div>

            {/* Hisoblash breakdown */}
            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{teacherName} — {MONTHS[month - 1]} {year}</h2>
                <div className="flex items-center gap-2">
                  {payroll && <StatusBadge status={payroll.status} />}
                  <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                    <button onClick={() => setBasis('accrual')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'accrual' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Hisoblangan</button>
                    <button onClick={() => setBasis('cash')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'cash' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Tushgan</button>
                  </div>
                </div>
              </div>

              {activePreview && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Baza (tushum)</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{formatNumber(activePreview.revenue)} so'm</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Oylik ({activePreview.salaryPercent}%)</p>
                      <p className="text-lg font-black text-emerald-600">{formatNumber(activePreview.salary)} so'm</p>
                    </div>
                  </div>

                  {accrualCashDelta !== null && accrualCashDelta !== 0 && accrualPreview && cashPreview && (
                    <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 text-xs">
                      <Info size={14} className="shrink-0" />
                      Hisoblangan {formatNumber(accrualPreview.salary)} so'm, tushgan pulga qarab {formatNumber(cashPreview.salary)} so'm — farq <b>{formatNumber(Math.abs(accrualCashDelta))} so'm</b> hali {accrualCashDelta > 0 ? "to'liq to'lanmagan" : ''}.
                    </div>
                  )}

                  {activePreview.note && (
                    <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-xs">
                      <Info size={14} className="shrink-0 mt-0.5" /> {activePreview.note}
                    </div>
                  )}

                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Guruhlar bo'yicha tabel — HR tekshirishi uchun</p>
                  <div className="space-y-2">
                    {activePreview.groups.map(g => (
                      <GroupBreakdownCard key={g.groupId} group={g} expanded={expandedGroupId === g.groupId} onToggle={() => setExpandedGroupId(expandedGroupId === g.groupId ? null : g.groupId)} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Amallar */}
            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              {!payroll || payroll.status === 'draft' ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-zinc-500">
                    {payroll ? "Loyiha mavjud — HR tabelni ko'rib chiqib tasdiqlashi mumkin." : "Bu davr uchun hali loyiha yaratilmagan."}
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <Button onClick={onCreateDraft} disabled={busy} variant="secondary" className="text-xs">
                      {payroll ? 'Qayta hisoblash' : 'Loyiha yaratish'}
                    </Button>
                    {payroll && (
                      <Button onClick={onApprove} disabled={busy} className="text-xs">
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
                    <>
                      <p className="text-[10px] text-zinc-400">Standart bo'yicha faqat hozirgacha TUSHGAN pulga mos ulush taklif etiladi — qolgani keyingi to'lovlarda, pul tushgani sayin berilishi mumkin. Kerak bo'lsa summani qo'lda o'zgartiring.</p>
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
                        <Button onClick={onPay} disabled={busy || payAmount <= 0 || payAmount > remaining} className="text-xs shrink-0">
                          To'lov qayd etish
                        </Button>
                      </div>
                    </>
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
                    <StatusBadge status={h.status} />
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

function StaffList({ staff, salaryFor, onSelect }: { staff: StaffPerson[]; salaryFor: (id: string) => SalaryRow | null; onSelect: (id: string) => void }) {
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] overflow-hidden">
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-black text-slate-900 dark:text-white">Xodimlar ({staff.length})</p>
      </div>
      {staff.length === 0 ? (
        <p className="p-8 text-center text-sm text-zinc-400">Xodim topilmadi</p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {staff.map(s => {
            const sal = salaryFor(s.id);
            return (
              <button key={s.id} onClick={() => onSelect(s.id)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
                  <p className="text-[11px] text-zinc-400">{s.role}{s.department ? ` · ${s.department}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                    {sal ? `${formatNumber(sal.total)} so'm` : `${formatNumber(s.salary)} so'm (asosiy)`}
                  </span>
                  <StatusBadge status={sal ? (sal.paid ? 'paid' : 'draft') : 'none'} />
                  <ChevronRight size={16} className="text-zinc-300" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StaffDetail({ staff, salary, attendance, monthLabel, form, setForm, loading, busy, onBack, onSave, onPay }: {
  staff: StaffPerson | null; salary: SalaryRow | null; attendance: StaffAttendanceRow[]; monthLabel: string;
  form: { baseSalary: number; bonus: number; deduction: number; notes: string };
  setForm: (f: { baseSalary: number; bonus: number; deduction: number; notes: string }) => void;
  loading: boolean; busy: boolean;
  onBack: () => void; onSave: () => void; onPay: () => void;
}) {
  if (!staff) return null;
  const attSummary = {
    present: attendance.filter(a => a.status === 'present').length,
    late: attendance.filter(a => a.status === 'late').length,
    absent: attendance.filter(a => a.status === 'absent').length,
  };
  const total = Number(form.baseSalary) + Number(form.bonus) - Number(form.deduction);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
        <ChevronLeft size={14} /> Xodimlar ro'yxatiga qaytish
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="p-4 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><CalendarCheck size={13} /> Ishga kelish-ketish ({monthLabel})</p>
              {attendance.length === 0 ? (
                <p className="text-xs text-zinc-400">Shu oy uchun davomat yozuvi yo'q.</p>
              ) : (
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-600 font-bold">{attSummary.present} keldi</span>
                  <span className="text-amber-600 font-bold">{attSummary.late} kech qoldi</span>
                  <span className="text-rose-600 font-bold">{attSummary.absent} kelmadi</span>
                </div>
              )}
            </div>

            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{staff.name} — {monthLabel}</h2>
                {salary && <StatusBadge status={salary.paid ? 'paid' : 'draft'} />}
              </div>

              {salary?.paid ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Asosiy</span><span className="font-bold">{formatNumber(salary.baseSalary)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Bonus</span><span className="font-bold text-emerald-600">+{formatNumber(salary.bonus)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Ushlanma</span><span className="font-bold text-rose-600">-{formatNumber(salary.deduction)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-100 dark:border-zinc-800"><span className="font-black">Jami</span><span className="font-black text-emerald-600">{formatNumber(salary.total)} so'm</span></div>
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold pt-2"><Check size={14} /> To'langan{salary.paidAt ? ` — ${new Date(salary.paidAt).toLocaleDateString('uz-UZ')}` : ''}.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <MoneyInput label="Asosiy maosh" value={form.baseSalary} onChange={v => setForm({ ...form, baseSalary: v })} />
                    <MoneyInput label="Bonus" value={form.bonus} onChange={v => setForm({ ...form, bonus: v })} />
                    <MoneyInput label="Ushlanma" value={form.deduction} onChange={v => setForm({ ...form, deduction: v })} />
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Jami</p>
                      <p className="text-lg font-black text-emerald-600">{formatNumber(total)} so'm</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={onSave} disabled={busy} variant="secondary" className="text-xs">Saqlash</Button>
                    {salary && (
                      <Button onClick={onPay} disabled={busy} className="text-xs"><Check size={14} /> To'lash</Button>
                    )}
                  </div>
                  {!salary && <p className="text-[10px] text-zinc-400">Avval saqlang, keyin "To'lash" tugmasi paydo bo'ladi.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
