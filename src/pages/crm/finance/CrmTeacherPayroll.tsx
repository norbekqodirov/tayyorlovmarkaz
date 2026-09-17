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
  History, Info, Users, GraduationCap, Clock, CalendarCheck, Plus, X, HandCoins, Lock,
} from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { Button } from '../../../components/ui/Button';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { Modal } from '../../../components/ui/Modal';
import { formatNumber } from '../../../utils/formatters';
import { hasAnyPermission } from '../../../utils/roles';

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
  accruedAmount: number; paidAmount: number; advanceApplied: number; status: 'draft' | 'approved' | 'paid';
  createdAt: string; approvedAt: string | null; remaining?: number;
  sourceSnapshot?: string | null;
}
// Payroll-avans (2026-09-17): "hisoblanishi berilishi degani emas" —
// xodimga oldindan berilgan, hali oylikka hisobga olinmagan pul.
interface Advance {
  id: string; personType: 'teacher' | 'staff'; personId: string;
  amount: number; remaining: number; date: string; method: string; notes?: string | null; createdAt: string;
}
// O12 tuzatish (2026-09-16 audit): davr darajasidagi jami emas, har bir
// ALOHIDA to'lov/avans-qoplash hodisasi — sana/summa/usul bilan.
interface PayoutEvent {
  kind: 'payout' | 'advance'; id: string; date: string; amount: number; method: string; createdAt: string;
}
interface StaffAttSummary {
  linked: boolean; staffMemberId?: string;
  records: { id: string; date: string; checkIn?: string; checkOut?: string; status: string }[];
  summary: { present: number; late: number; absent: number; total: number } | null;
}
interface SalaryRow {
  id: string; staffId: string; month: string; baseSalary: number; bonus: number;
  deduction: number; total: number; paid: boolean; paidAt: string | null; notes?: string | null;
  paidAmount: number; advanceApplied: number; remaining?: number;
  staff: { id: string; name: string; role: string; salary: number; photo?: string };
}
interface StaffAttendanceRow { id: string; date: string; checkIn?: string; checkOut?: string; status: string; }

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Loyiha', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  approved: { label: 'Tasdiqlangan', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  partial: { label: 'Qisman to\'langan', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  paid: { label: "To'langan", className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  none: { label: 'Hisoblanmagan', className: 'bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600' },
};

// Payroll-avans (2026-09-17): server faqat draft/approved/paid saqlaydi —
// "qisman to'langan" UI'da hisoblanadigan holat (approved + biror to'lov/
// avans allaqachon bo'lgan, lekin hali to'liq emas).
function displayPayrollStatus(status: string, paidAmount: number, advanceApplied: number): string {
  if (status !== 'approved') return status;
  return (paidAmount + advanceApplied) > 0 ? 'partial' : 'approved';
}

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
  const [payoutEvents, setPayoutEvents] = useState<PayoutEvent[]>([]);
  const [staffAtt, setStaffAtt] = useState<StaffAttSummary | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Staff ──
  const [staffList, setStaffList] = useState<StaffPerson[]>([]);
  const [staffSalaries, setStaffSalaries] = useState<SalaryRow[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffAttendance, setStaffAttendance] = useState<StaffAttendanceRow[]>([]);
  const [staffPayoutEvents, setStaffPayoutEvents] = useState<PayoutEvent[]>([]);
  const [staffDetailLoading, setStaffDetailLoading] = useState(false);
  const [staffForm, setStaffForm] = useState({ baseSalary: 0, bonus: 0, deduction: 0, notes: '' });

  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Bank');

  // Payroll-avans (2026-09-17) — tanlangan shaxsning (o'qituvchi YOKI xodim)
  // hali qoplanmagan avansi va uni berish oynasi. Ikkala bo'lim uchun umumiy.
  const canManageMoney = hasAnyPermission('finance');
  const [outstandingAdvance, setOutstandingAdvance] = useState(0);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: 0, method: 'Naqd', date: new Date().toISOString().split('T')[0], notes: '' });

  const loadOutstandingAdvance = useCallback(async (personType: 'teacher' | 'staff', personId: string) => {
    try {
      const res = await api.get('/finance/advances/outstanding', { params: { personType, personId } });
      setOutstandingAdvance(res.data?.outstanding || 0);
    } catch {
      setOutstandingAdvance(0);
    }
  }, []);

  const giveAdvance = async () => {
    const personType: 'teacher' | 'staff' = section === 'teachers' ? 'teacher' : 'staff';
    const personId = section === 'teachers' ? selectedTeacherId : selectedStaffId;
    if (!personId || advanceForm.amount <= 0) return;
    setBusy(true);
    try {
      await api.post('/finance/advances', { personType, personId, ...advanceForm });
      showToast('Avans berildi', 'success');
      setAdvanceModalOpen(false);
      setAdvanceForm({ amount: 0, method: 'Naqd', date: new Date().toISOString().split('T')[0], notes: '' });
      void loadOutstandingAdvance(personType, personId);
      if (personType === 'teacher') void loadTeacherDetail(); else void loadStaffDetail();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally { setBusy(false); }
  };

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
      void loadOutstandingAdvance('teacher', selectedTeacherId);
    } catch {
      showToast("Ma'lumotlarni yuklashda xatolik", 'error');
    } finally {
      setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeacherId, year, month, basis]);

  useEffect(() => { if (section === 'teachers' && selectedTeacherId) void loadTeacherDetail(); }, [section, selectedTeacherId, loadTeacherDetail]);

  // O12 tuzatish: tanlangan davr o'zgarganda shu davrning ALOHIDA to'lov/
  // avans-qoplash hodisalari (individual events) yuklanadi.
  useEffect(() => {
    if (!payroll) { setPayoutEvents([]); return; }
    api.get(`/finance/teacher-payroll/${payroll.id}/payouts`).then(res => setPayoutEvents(res.data || [])).catch(() => setPayoutEvents([]));
  }, [payroll?.id]);

  const livePreview = basis === 'accrual' ? accrualPreview : cashPreview;
  // O05 tuzatish (2026-09-16 audit): payroll tasdiqlangandan/to'langandan
  // keyin ham sahifa doim JONLI (bugungi davomat/narx bilan qayta hisoblangan)
  // preview'ni ko'rsatardi — agar davomat orqada o'zgartirilsa, tasdiqlangan
  // raqam O'ZGARMAYDI, lekin pastdagi tabel jim ravishda BOSHQA (yangi)
  // sonlarni ko'rsatardi, "bu qayerdan chiqdi?" ishonchini yo'qotardi. Endi
  // draft bo'lmagan payroll uchun `sourceSnapshot` (aynan tasdiqlash paytida
  // muzlatilgan breakdown) ko'rsatiladi; joriy live hisob undan farq qilsa,
  // pastda alohida ogohlantirish chiqadi (frozen raqam ustidan yozilmaydi).
  const frozenSnapshot: Preview | null = useMemo(() => {
    if (!payroll || payroll.status === 'draft' || !payroll.sourceSnapshot) return null;
    try { return JSON.parse(payroll.sourceSnapshot) as Preview; } catch { return null; }
  }, [payroll?.sourceSnapshot, payroll?.status]);
  const activePreview = frozenSnapshot || livePreview;
  const liveDiffersFromFrozen = !!frozenSnapshot && !!livePreview && Math.round(frozenSnapshot.salary) !== Math.round(livePreview.salary);
  // Server har doim authoritative `remaining`ni qaytaradi (avansni ham
  // hisobga olib) — UI formulani mustaqil takrorlamaydi; eski
  // yozuvlar/fallback uchun faqat serverdan kelmagan holatda hisoblanadi.
  const remaining = payroll ? (payroll.remaining ?? Math.max(0, payroll.accruedAmount - payroll.paidAmount - (payroll.advanceApplied || 0))) : 0;
  // Farq: hisoblangan (accrual) va tushgan (cash) baza orasidagi tafovut —
  // "hali qoplanmagan" qism qancha ekanini ko'rsatadi.
  const accrualCashDelta = accrualPreview && cashPreview ? accrualPreview.salary - cashPreview.salary : null;

  // Foydalanuvchi so'ragan g'oya: to'lashda avval TUSHGAN pul asosidagi
  // ulushni belgilash, qolgani (to'liq hisoblangan summagacha) keyinroq,
  // yana pul tushgani sayin berilishi — shuning uchun "to'lov" formasi
  // standart bo'yicha shu summani taklif qiladi (qo'lda o'zgartirish mumkin).
  useEffect(() => {
    if (payroll && payroll.status === 'approved' && cashPreview) {
      const suggested = Math.max(0, Math.min(remaining, cashPreview.salary - payroll.paidAmount - payroll.advanceApplied));
      setPayAmount(suggested);
    } else {
      setPayAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payroll?.id, payroll?.status, payroll?.paidAmount, payroll?.advanceApplied, cashPreview?.salary]);

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
      void loadOutstandingAdvance('staff', selectedStaffId);
    } catch {
      showToast('Davomat/maosh yuklanmadi', 'error');
    } finally { setStaffDetailLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId, monthStr]);

  useEffect(() => { if (section === 'staff' && selectedStaffId) void loadStaffDetail(); }, [section, selectedStaffId, loadStaffDetail]);

  // O12 tuzatish: xodim oyligi uchun ham xuddi shunday alohida hodisalar.
  useEffect(() => {
    const sal = selectedStaffId ? staffSalaryFor(selectedStaffId) : null;
    if (!sal) { setStaffPayoutEvents([]); return; }
    api.get(`/salary/${sal.id}/payouts`).then(res => setStaffPayoutEvents(res.data || [])).catch(() => setStaffPayoutEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffId ? staffSalaryFor(selectedStaffId)?.id : null]);

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

  const [payStaffAmount, setPayStaffAmount] = useState(0);
  const [payStaffMethod, setPayStaffMethod] = useState('Bank');
  const staffRemaining = selectedStaffSalary
    ? (selectedStaffSalary.remaining ?? Math.max(0, selectedStaffSalary.total - selectedStaffSalary.paidAmount - selectedStaffSalary.advanceApplied))
    : 0;

  // Xodim tanlanganda/oylik yozuvi yuklanganda to'lov summasi qoldiqqa
  // moslashtiriladi — TeacherDetail bilan bir xil "standart to'liq qoldiq"
  // taklifi (qo'lda o'zgartirish mumkin).
  useEffect(() => {
    setPayStaffAmount(staffRemaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaffSalary?.id, selectedStaffSalary?.paidAmount, selectedStaffSalary?.advanceApplied]);

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

  // Payroll-avans (2026-09-17): endi qisman to'lov qo'llab-quvvatlanadi —
  // TeacherPayroll bilan bir xil naqsh (summani qo'lda o'zgartirish mumkin,
  // birinchi to'lovda avans avtomatik hisobga olinadi).
  const payStaffSalary = async () => {
    const sal = selectedStaffId ? staffSalaryFor(selectedStaffId) : null;
    if (!sal || payStaffAmount <= 0) return;
    setBusy(true);
    try {
      const res = await api.put(`/salary/${sal.id}/pay`, { amount: payStaffAmount, method: payStaffMethod });
      setStaffSalaries(prev => prev.map(s => s.id === res.data.id ? res.data : s));
      showToast("To'lov qayd etildi", 'success');
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
            activePreview={activePreview} isFrozen={!!frozenSnapshot} liveDiffersFromFrozen={liveDiffersFromFrozen}
            payroll={payroll} history={history} payoutEvents={payoutEvents} remaining={remaining}
            accrualCashDelta={accrualCashDelta}
            staffAtt={staffAtt}
            loading={detailLoading} busy={busy}
            expandedGroupId={expandedGroupId} setExpandedGroupId={setExpandedGroupId}
            payAmount={payAmount} setPayAmount={setPayAmount}
            payMethod={payMethod} setPayMethod={setPayMethod}
            outstandingAdvance={outstandingAdvance} onGiveAdvance={() => setAdvanceModalOpen(true)}
            canManageMoney={canManageMoney}
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
            payoutEvents={staffPayoutEvents}
            monthLabel={`${MONTHS[month - 1]} ${year}`}
            form={staffForm} setForm={setStaffForm}
            loading={staffDetailLoading} busy={busy}
            remaining={staffRemaining}
            payAmount={payStaffAmount} setPayAmount={setPayStaffAmount}
            payMethod={payStaffMethod} setPayMethod={setPayStaffMethod}
            outstandingAdvance={outstandingAdvance} onGiveAdvance={() => setAdvanceModalOpen(true)}
            canManageMoney={canManageMoney}
            onBack={() => setSelectedStaffId(null)}
            onSave={saveStaffSalary} onPay={payStaffSalary}
          />
        ) : (
          <StaffList staff={staffList} salaryFor={staffSalaryFor} onSelect={setSelectedStaffId} />
        )
      )}

      <AdvanceModal
        isOpen={advanceModalOpen}
        onClose={() => setAdvanceModalOpen(false)}
        personName={section === 'teachers' ? (selectedTeacher?.name || '') : (selectedStaff?.name || '')}
        form={advanceForm} setForm={setAdvanceForm}
        busy={busy} onSubmit={giveAdvance}
      />
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
                  {p && <span className="text-xs font-bold text-slate-600 dark:text-zinc-300">{formatNumber(p.paidAmount + p.advanceApplied)}/{formatNumber(p.accruedAmount)} so'm</span>}
                  <StatusBadge status={p ? displayPayrollStatus(p.status, p.paidAmount, p.advanceApplied) : undefined} />
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
  isFrozen: boolean; liveDiffersFromFrozen: boolean;
  payroll: Payroll | null; history: Payroll[]; payoutEvents: PayoutEvent[]; remaining: number; accrualCashDelta: number | null;
  staffAtt: StaffAttSummary | null;
  loading: boolean; busy: boolean;
  expandedGroupId: string | null; setExpandedGroupId: (id: string | null) => void;
  payAmount: number; setPayAmount: (n: number) => void;
  payMethod: string; setPayMethod: (m: string) => void;
  outstandingAdvance: number; onGiveAdvance: () => void; canManageMoney: boolean;
  onBack: () => void; onCreateDraft: () => void; onApprove: () => void; onPay: () => void;
}) {
  const {
    teacherName, month, year, basis, setBasis, accrualPreview, cashPreview, activePreview,
    isFrozen, liveDiffersFromFrozen,
    payroll, history, payoutEvents, remaining, accrualCashDelta, staffAtt, loading, busy,
    expandedGroupId, setExpandedGroupId, payAmount, setPayAmount, payMethod, setPayMethod,
    outstandingAdvance, onGiveAdvance, canManageMoney,
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

            {/* Avans — hisoblanishi berilishi degani emas: xodim oldindan pul olgan bo'lishi mumkin */}
            <div className="p-4 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><HandCoins size={13} /> Oldindan berilgan avans (qoldiq)</p>
                <p className={`text-lg font-black ${outstandingAdvance > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>{formatNumber(outstandingAdvance)} so'm</p>
              </div>
              {canManageMoney && (
                <Button onClick={onGiveAdvance} disabled={busy} variant="secondary" className="text-xs">
                  <Plus size={14} /> Avans berish
                </Button>
              )}
            </div>

            {/* Hisoblash breakdown */}
            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{teacherName} — {MONTHS[month - 1]} {year}</h2>
                <div className="flex items-center gap-2">
                  {payroll && <StatusBadge status={displayPayrollStatus(payroll.status, payroll.paidAmount, payroll.advanceApplied)} />}
                  <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                    <button onClick={() => setBasis('accrual')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'accrual' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Hisoblangan</button>
                    <button onClick={() => setBasis('cash')} className={`px-3 py-1 rounded-lg text-[11px] font-bold ${basis === 'cash' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Tushgan</button>
                  </div>
                </div>
              </div>
              {/* O05 tuzatish: tasdiqlangandan keyin bu yerdagi tabel MUZLATILGAN
                  (tasdiqlash paytidagi) hisob — joriy davomat o'zgarsa ham bu
                  raqamlar o'zgarmaydi, faqat pastda alohida ogohlantirish chiqadi. */}
              <div className="mb-3">
                {isFrozen ? (
                  <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1"><Lock size={11} /> Saqlangan hisob — tasdiqlangan paytdagi holat, o'zgarmaydi</span>
                ) : (
                  <span className="text-[10px] font-bold text-blue-500">Joriy hisob-kitob (loyiha) — hali tasdiqlanmagan, qayta hisoblash bilan yangilanadi</span>
                )}
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

                  {isFrozen && liveDiffersFromFrozen && (
                    <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-xs">
                      <AlertTriangle size={14} className="shrink-0" />
                      Tasdiqlangandan keyin davomat/narx o'zgargan — joriy ma'lumot bilan qayta hisoblansa natija <b>{formatNumber((basis === 'accrual' ? accrualPreview : cashPreview)?.salary || 0)} so'm</b> bo'lardi. Tasdiqlangan summa (yuqorida) o'zgarmaydi.
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
                      canManageMoney ? (
                        <Button onClick={onApprove} disabled={busy} className="text-xs">
                          <Check size={14} /> Tasdiqlash
                        </Button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold px-3 py-2">
                          <Lock size={12} /> Tasdiqlash uchun moliya vakolati kerak
                        </span>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Tasdiqlangan summa</span>
                    <span className="font-black">{formatNumber(payroll.accruedAmount)} so'm</span>
                  </div>
                  {payroll.advanceApplied > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500 flex items-center gap-1"><HandCoins size={13} className="text-amber-500" /> Avansdan qoplandi</span>
                      <span className="font-black text-amber-600">{formatNumber(payroll.advanceApplied)} so'm</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Naqd/bank to'langan</span>
                    <span className="font-black text-emerald-600">{formatNumber(payroll.paidAmount)} so'm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500">Qoldiq</span>
                    <span className="font-black text-rose-600">{formatNumber(remaining)} so'm</span>
                  </div>
                  {remaining > 0 && (
                    canManageMoney ? (
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
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold">
                        <Lock size={12} /> To'lov qayd etish uchun moliya vakolati kerak
                      </span>
                    )
                  )}
                  {payroll.status === 'paid' && (
                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold">
                      <Check size={14} /> Bu davr uchun to'liq to'langan.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* O12 tuzatish: har bir to'lov/avans-qoplash hodisasi alohida */}
            {payroll && payroll.status !== 'draft' && <PayoutTimeline events={payoutEvents} />}
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
                      <p className="text-zinc-400">
                        {formatNumber(h.paidAmount + h.advanceApplied)} / {formatNumber(h.accruedAmount)} so'm
                        {h.advanceApplied > 0 && <span className="text-amber-500"> ({formatNumber(h.advanceApplied)} avansdan)</span>}
                      </p>
                    </div>
                    <StatusBadge status={displayPayrollStatus(h.status, h.paidAmount, h.advanceApplied)} />
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
                  <StatusBadge status={sal ? (sal.paid ? 'paid' : ((sal.paidAmount > 0 || sal.advanceApplied > 0) ? 'partial' : 'draft')) : 'none'} />
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

function StaffDetail({
  staff, salary, attendance, payoutEvents, monthLabel, form, setForm, loading, busy,
  remaining, payAmount, setPayAmount, payMethod, setPayMethod,
  outstandingAdvance, onGiveAdvance, canManageMoney,
  onBack, onSave, onPay,
}: {
  staff: StaffPerson | null; salary: SalaryRow | null; attendance: StaffAttendanceRow[]; payoutEvents: PayoutEvent[]; monthLabel: string;
  form: { baseSalary: number; bonus: number; deduction: number; notes: string };
  setForm: (f: { baseSalary: number; bonus: number; deduction: number; notes: string }) => void;
  loading: boolean; busy: boolean;
  remaining: number; payAmount: number; setPayAmount: (n: number) => void;
  payMethod: string; setPayMethod: (m: string) => void;
  outstandingAdvance: number; onGiveAdvance: () => void; canManageMoney: boolean;
  onBack: () => void; onSave: () => void; onPay: () => void;
}) {
  if (!staff) return null;
  const attSummary = {
    present: attendance.filter(a => a.status === 'present').length,
    late: attendance.filter(a => a.status === 'late').length,
    absent: attendance.filter(a => a.status === 'absent').length,
  };
  const total = Number(form.baseSalary) + Number(form.bonus) - Number(form.deduction);
  // Payroll-avans (2026-09-17): birinchi to'lov/avans qo'llanilgandan keyin
  // backend tarkibni (baseSalary/bonus/deduction) o'zgartirishni bloklaydi —
  // shuning uchun UI ham shu holatda tahrirlash formasi o'rniga o'qish-uchun
  // xulosani ko'rsatadi.
  const isLocked = !!salary && (salary.paidAmount > 0 || salary.advanceApplied > 0);

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

            {/* Avans — hisoblanishi berilishi degani emas */}
            <div className="p-4 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1 flex items-center gap-1.5"><HandCoins size={13} /> Oldindan berilgan avans (qoldiq)</p>
                <p className={`text-lg font-black ${outstandingAdvance > 0 ? 'text-amber-600' : 'text-zinc-400'}`}>{formatNumber(outstandingAdvance)} so'm</p>
              </div>
              {canManageMoney && (
                <Button onClick={onGiveAdvance} disabled={busy} variant="secondary" className="text-xs">
                  <Plus size={14} /> Avans berish
                </Button>
              )}
            </div>

            <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{staff.name} — {monthLabel}</h2>
                {salary && <StatusBadge status={salary.paid ? 'paid' : (isLocked ? 'partial' : 'draft')} />}
              </div>

              {salary?.paid ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Asosiy</span><span className="font-bold">{formatNumber(salary.baseSalary)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Bonus</span><span className="font-bold text-emerald-600">+{formatNumber(salary.bonus)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Ushlanma</span><span className="font-bold text-rose-600">-{formatNumber(salary.deduction)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-100 dark:border-zinc-800"><span className="font-black">Jami</span><span className="font-black text-emerald-600">{formatNumber(salary.total)} so'm</span></div>
                  {salary.advanceApplied > 0 && (
                    <div className="flex items-center justify-between text-sm"><span className="text-zinc-500 flex items-center gap-1"><HandCoins size={13} className="text-amber-500" /> Avansdan qoplandi</span><span className="font-bold text-amber-600">{formatNumber(salary.advanceApplied)} so'm</span></div>
                  )}
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Naqd/bank to'langan</span><span className="font-bold text-emerald-600">{formatNumber(salary.paidAmount)} so'm</span></div>
                  <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold pt-2"><Check size={14} /> To'langan{salary.paidAt ? ` — ${new Date(salary.paidAt).toLocaleDateString('uz-UZ')}` : ''}.</div>
                </div>
              ) : isLocked ? (
                // Qisman to'lov/avans allaqachon qo'llanilgan — tarkib endi
                // tahrirlanmaydi (backend ham bloklaydi), faqat qoldiqni
                // to'lash davom etadi.
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Asosiy</span><span className="font-bold">{formatNumber(salary.baseSalary)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Bonus</span><span className="font-bold text-emerald-600">+{formatNumber(salary.bonus)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Ushlanma</span><span className="font-bold text-rose-600">-{formatNumber(salary.deduction)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-zinc-100 dark:border-zinc-800"><span className="font-black">Jami</span><span className="font-black">{formatNumber(salary.total)} so'm</span></div>
                  {salary.advanceApplied > 0 && (
                    <div className="flex items-center justify-between text-sm"><span className="text-zinc-500 flex items-center gap-1"><HandCoins size={13} className="text-amber-500" /> Avansdan qoplandi</span><span className="font-bold text-amber-600">{formatNumber(salary.advanceApplied)} so'm</span></div>
                  )}
                  <div className="flex items-center justify-between text-sm"><span className="text-zinc-500">Naqd/bank to'langan</span><span className="font-bold text-emerald-600">{formatNumber(salary.paidAmount)} so'm</span></div>
                  <div className="flex items-center justify-between text-sm pb-2 border-b border-zinc-100 dark:border-zinc-800"><span className="text-zinc-500">Qoldiq</span><span className="font-black text-rose-600">{formatNumber(remaining)} so'm</span></div>
                  {remaining > 0 && (
                    canManageMoney ? (
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
                    ) : (
                      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold">
                        <Lock size={12} /> To'lov qayd etish uchun moliya vakolati kerak
                      </span>
                    )
                  )}
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
                  <div className="flex gap-2 items-center flex-wrap">
                    <Button onClick={onSave} disabled={busy} variant="secondary" className="text-xs">Saqlash</Button>
                    {salary && canManageMoney && (
                      <>
                        <MoneyInput label="To'lov summasi" value={payAmount} onChange={setPayAmount} />
                        <Button onClick={onPay} disabled={busy || payAmount <= 0 || payAmount > remaining} className="text-xs"><Check size={14} /> To'lov qayd etish</Button>
                      </>
                    )}
                    {salary && !canManageMoney && (
                      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold">
                        <Lock size={12} /> To'lov qayd etish uchun moliya vakolati kerak
                      </span>
                    )}
                  </div>
                  {!salary && <p className="text-[10px] text-zinc-400">Avval saqlang, keyin to'lov summasi maydoni paydo bo'ladi.</p>}
                </div>
              )}
            </div>

            {/* O12 tuzatish: har bir to'lov/avans-qoplash hodisasi alohida */}
            {salary && isLocked && <PayoutTimeline events={payoutEvents} />}
          </div>
        </div>
      )}
    </div>
  );
}

// O12 tuzatish (2026-09-16 audit): "Tarix" panelidagi davr darajasidagi
// jamidan farqli — bu shu BITTA davrga tegishli har bir alohida to'lov
// (naqd/bank) yoki avtomatik avans-qoplash hodisasini sana/summa/usul bilan
// ko'rsatadi. TeacherDetail va StaffDetail ikkalasi uchun umumiy.
function PayoutTimeline({ events }: { events: PayoutEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="p-5 bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05]">
      <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <History size={13} /> To'lovlar tarixi (bu davr)
      </h3>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {events.map(e => (
          <div key={e.id} className="flex items-center justify-between py-2.5 text-xs">
            <div className="flex items-center gap-2">
              {e.kind === 'advance' ? <HandCoins size={13} className="text-amber-500 shrink-0" /> : <Check size={13} className="text-emerald-500 shrink-0" />}
              <div>
                <p className="font-bold text-slate-700 dark:text-zinc-300">{e.date} · {e.method}</p>
                <p className="text-zinc-400">{e.kind === 'advance' ? 'Avansdan qoplandi' : "Naqd/bank to'lovi"}</p>
              </div>
            </div>
            <span className={`font-black ${e.kind === 'advance' ? 'text-amber-600' : 'text-emerald-600'}`}>{formatNumber(e.amount)} so'm</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Payroll-avans (2026-09-17): shaxsga (o'qituvchi/xodim) oldindan pul
// berish oynasi — TeacherDetail va StaffDetail ikkalasi uchun umumiy.
function AdvanceModal({ isOpen, onClose, personName, form, setForm, busy, onSubmit }: {
  isOpen: boolean; onClose: () => void; personName: string;
  form: { amount: number; method: string; date: string; notes: string };
  setForm: (f: { amount: number; method: string; date: string; notes: string }) => void;
  busy: boolean; onSubmit: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Avans berish" description={personName ? `${personName} uchun oldindan to'lov` : undefined} width="sm">
      <div className="space-y-3">
        <MoneyInput label="Summa" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Usul</label>
          <select
            value={form.method}
            onChange={e => setForm({ ...form, method: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold"
          >
            <option value="Naqd">Naqd</option>
            <option value="Bank">Bank</option>
            <option value="Karta">Karta</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Sana</label>
          <input
            type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Izoh (ixtiyoriy)</label>
          <input
            type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Masalan: shoshilinch ehtiyoj uchun"
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-sm"
          />
        </div>
        <p className="text-[10px] text-zinc-400 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          Bu summa darhol xarajat sifatida yoziladi va keyingi tasdiqlanadigan/to'lanadigan oylikdan avtomatik ayiriladi.
        </p>
        <Button onClick={onSubmit} disabled={busy || form.amount <= 0} className="w-full text-sm">
          <HandCoins size={14} /> Avans berish
        </Button>
      </div>
    </Modal>
  );
}
