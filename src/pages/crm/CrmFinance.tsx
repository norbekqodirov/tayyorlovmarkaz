import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Download, Plus,
  Search, ArrowUpRight, ArrowDownRight, CreditCard, Wallet,
  X, Calendar, FileText, User, Trash2, AlertTriangle,
  CheckCircle2, BarChart3, PieChart as PieChartIcon, Filter, Check, Send,
  Copy, ExternalLink, Receipt, Clock, XCircle, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { printReceipt } from '../../components/ReceiptPrint';
import { exportToExcel, exportToPDF, exportReceiptToPDF } from '../../utils/export';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { MoneyInput } from '../../components/ui/MoneyInput';
import { Modal } from '../../components/ui/Modal';
import api from '../../api/client';

interface Invoice {
  id: string;
  number: string;
  studentId: string;
  student: { id: string; name: string; phone: string; group: string };
  amount: number;
  discount: number;
  tax: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  paidAt: string | null;
  method: string | null;
  description: string | null;
  items: { id: string; name: string; quantity: number; price: number }[];
  createdAt: string;
}

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
  method: 'Karta' | 'Naqd' | 'Bank';
  studentId?: string;
  studentName?: string;
  staffId?: string;
  staffName?: string;
}

const INCOME_CATEGORIES = ["Kurs to'lovi", 'Sotuv', 'Investitsiya', 'Boshqa'];
const EXPENSE_CATEGORIES = ['Ijara', 'Marketing', 'Oylik', 'Kommunal', 'Soliq', 'Boshqa'];
const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const TOOLTIP_STYLE = {
  borderRadius: '14px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
  fontSize: 11,
  fontWeight: 700,
  padding: '10px 14px',
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(amount);
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return new Intl.NumberFormat('uz-UZ').format(v);
}

export default function CrmFinance() {
  const { data: transactions = [], addDocument, deleteDocument } = useFirestore<Transaction>('finance');
  const { data: students = [], updateDocument: updateStudent } = useFirestore<any>('students');
  const { data: staff = [] } = useFirestore<any>('staff');
  const { data: teachers = [] } = useFirestore<any>('teachers');
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [activeTab, setActiveTab] = useState<'transactions' | 'debtors' | 'monthly' | 'invoices'>('transactions');

  // Invoices state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    studentId: '', amount: '', discount: '0', tax: '0',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    method: 'Naqd', description: '',
  });
  const [invoiceLinks, setInvoiceLinks] = useState<{ payme: string; click: string; amount: number } | null>(null);
  const [invoiceLinksLoading, setInvoiceLinksLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await api.get('/finance/invoices');
      setInvoices(res.data || []);
    } catch { /* ignore */ } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'invoices') fetchInvoices();
  }, [activeTab, fetchInvoices]);

  const handleCreateInvoice = async () => {
    if (!invoiceForm.studentId || !invoiceForm.amount) return;
    try {
      await api.post('/finance/invoices', {
        studentId: invoiceForm.studentId,
        amount: Number(invoiceForm.amount),
        discount: Number(invoiceForm.discount),
        tax: Number(invoiceForm.tax),
        dueDate: invoiceForm.dueDate,
        method: invoiceForm.method,
        description: invoiceForm.description,
      });
      showToast("Invoice yaratildi", 'success');
      setIsInvoiceModalOpen(false);
      setInvoiceForm({ studentId: '', amount: '', discount: '0', tax: '0', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], method: 'Naqd', description: '' });
      fetchInvoices();
    } catch { showToast("Xatolik yuz berdi", 'error'); }
  };

  const handleMarkInvoicePaid = async (invoiceId: string) => {
    try {
      await api.patch(`/finance/invoices/${invoiceId}`, { status: 'paid' });
      showToast("Invoice to'landi deb belgilandi", 'success');
      fetchInvoices();
    } catch { showToast("Xatolik yuz berdi", 'error'); }
  };

  const handleGetInvoiceLinks = async (invoice: Invoice) => {
    setInvoiceLinksLoading(true);
    try {
      const res = await api.get(`/finance/invoices/${invoice.id}/payment-links`);
      setInvoiceLinks(res.data);
    } catch { showToast("Havolalarni yuklashda xatolik", 'error'); } finally {
      setInvoiceLinksLoading(false);
    }
  };
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [isDebtorsModalOpen, setIsDebtorsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const [paymentLinks, setPaymentLinks] = useState<{ payme: string; click: string; studentName: string; amount: number } | null>(null);
  const [isGeneratingLinks, setIsGeneratingLinks] = useState(false);
  const [copiedType, setCopiedType] = useState<'payme' | 'click' | null>(null);

  const handleGetPaymentLinks = async (studentId: string, studentName: string, balance: number) => {
    setIsGeneratingLinks(true);
    try {
      const debtAmount = Math.abs(balance);
      const res = await api.get(`/payments/generate-links?studentId=${studentId}&amount=${debtAmount}`);
      setPaymentLinks({
        payme: res.data.payme,
        click: res.data.click,
        studentName,
        amount: debtAmount
      });
    } catch (err) {
      showToast("To'lov havolalarini yuklashda xatolik yuz berdi", 'error');
    } finally {
      setIsGeneratingLinks(false);
    }
  };


  const [form, setForm] = useState<Partial<Transaction>>({
    type: 'income',
    amount: 0,
    category: "Kurs to'lovi",
    description: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Karta',
    studentId: '',
    studentName: '',
    staffId: '',
    staffName: ''
  });

  const handleSave = async () => {
    if (!form.amount || !form.category) return;
    const newTransaction = { ...form, amount: Number(form.amount) };

    if (newTransaction.type === 'income' && newTransaction.studentId) {
      const student = students.find(s => s.id === newTransaction.studentId);
      if (student?.id) {
        const newBalance = (student.balance || 0) + Number(newTransaction.amount);
        const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
        await updateStudent(student.id, { balance: newBalance, paymentStatus: newPaymentStatus });
      }
    }

    await addDocument(newTransaction as Omit<Transaction, 'id'>);
    showToast("Tranzaksiya qo'shildi", 'success');
    setIsModalOpen(false);
    setForm({
      type: 'income', amount: 0, category: "Kurs to'lovi",
      description: '', date: new Date().toISOString().split('T')[0],
      method: 'Karta', studentId: '', studentName: '', staffId: '', staffName: ''
    });
  };

  const confirmDelete = async () => {
    await deleteDocument(deleteConfirm.id);
    if (selectedTransaction?.id === deleteConfirm.id) setIsDetailOpen(false);
    setDeleteConfirm({ open: false, id: '' });
    showToast("Tranzaksiya o'chirildi", 'success');
  };

  const currentMonth = new Date().getMonth();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const monthIncome = transactions.filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === currentMonth).reduce((a, t) => a + t.amount, 0);
  const prevMonthIncome = transactions.filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === prevMonth).reduce((a, t) => a + t.amount, 0);
  const monthGrowth = prevMonthIncome > 0 ? Math.round(((monthIncome - prevMonthIncome) / prevMonthIncome) * 100) : 0;

  const monthExpense = transactions.filter(t => t.type === 'expense' && t.date && new Date(t.date).getMonth() === currentMonth).reduce((a, t) => a + t.amount, 0);

  const debtors = useMemo(() =>
    students
      .filter(s => (s.balance || 0) < 0 || s.paymentStatus === 'Qarzdorlik')
      .sort((a, b) => (a.balance || 0) - (b.balance || 0)),
    [students]
  );
  const totalDebt = debtors.reduce((a, s) => a + Math.abs(s.balance || 0), 0);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
        || (t.category || '').toLowerCase().includes(searchTerm.toLowerCase())
        || (t.studentName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'all' || t.type === filterType;
      return matchSearch && matchType;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [transactions, searchTerm, filterType]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, currentPage]);

  const chartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mi = (currentMonth - 5 + i + 12) % 12;
      const income = transactions.filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi).reduce((a, t) => a + t.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi).reduce((a, t) => a + t.amount, 0);
      return { name: MONTHS[mi], income, expense, profit: income - expense };
    });
  }, [transactions, currentMonth]);

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    transactions.filter(t => t.type === 'income').forEach(t => {
      cats[t.category] = (cats[t.category] || 0) + t.amount;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const PIE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

  const monthlySummary = useMemo(() => {
    return Array.from({ length: 12 }, (_, mi) => {
      const inc = transactions.filter(t => t.type === 'income' && t.date && new Date(t.date).getMonth() === mi).reduce((a, t) => a + t.amount, 0);
      const exp = transactions.filter(t => t.type === 'expense' && t.date && new Date(t.date).getMonth() === mi).reduce((a, t) => a + t.amount, 0);
      return { month: MONTHS[mi], income: inc, expense: exp, profit: inc - exp };
    });
  }, [transactions]);

  return (
    <div className="space-y-5">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Tranzaksiyani o'chirish"
        message="Haqiqatan ham ushbu tranzaksiyani o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Moliya Boshqaruvi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Barcha moliyaviy oqimlar, to'lovlar va tahlil</p>
        </div>
        <div className="flex gap-2">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">
              <Download size={16} /> Eksport
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
              <button onClick={() => {
                exportToExcel(filteredTransactions, [
                  { header: 'Sana', key: 'date', width: 12 },
                  { header: 'Tur', key: 'type', width: 10 },
                  { header: 'Kategoriya', key: 'category', width: 18 },
                  { header: 'Summa', key: 'amount', width: 15 },
                  { header: 'Usul', key: 'method', width: 10 },
                  { header: 'Tavsif', key: 'description', width: 30 },
                ], 'Moliya');
                showToast('Excel yuklab olindi', 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-t-xl">
                Excel (.xlsx)
              </button>
              <button onClick={async () => {
                await exportToPDF(filteredTransactions, [
                  { header: 'Sana', key: 'date' }, { header: 'Kategoriya', key: 'category' },
                  { header: 'Summa', key: 'amount' }, { header: 'Tavsif', key: 'description' },
                ], 'Moliya Hisoboti', 'Moliya');
                showToast('PDF yuklab olindi', 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-b-xl">
                PDF (.pdf)
              </button>
            </div>
          </div>
          <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus size={16} />}>
            Yangi Tranzaksiya
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Bu Oy Kirim', value: formatCompact(monthIncome),
            sub: `${monthGrowth >= 0 ? '+' : ''}${monthGrowth}% o'tgan oyga`,
            icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', up: monthGrowth >= 0
          },
          {
            label: 'Bu Oy Chiqim', value: formatCompact(monthExpense),
            sub: 'Joriy oy xarajati',
            icon: TrendingDown, gradient: 'from-rose-500 to-red-600', up: false
          },
          {
            label: 'Umumiy Balans', value: formatCompact(balance),
            sub: 'Jami kirim - chiqim',
            icon: Wallet, gradient: 'from-blue-600 to-indigo-700', up: balance >= 0
          },
          {
            label: 'Jami Qarz', value: formatCompact(totalDebt),
            sub: `${debtors.length} ta qarzdor o'quvchi`,
            icon: AlertTriangle, gradient: 'from-amber-500 to-orange-600', up: debtors.length === 0
          },
        ].map((stat, i) => (
          <div 
            key={i} 
            onClick={i === 3 ? () => setIsDebtorsModalOpen(true) : undefined}
            className={`bg-gradient-to-br ${stat.gradient} p-4 rounded-2xl shadow-lg text-white relative overflow-hidden ${i === 3 ? 'cursor-pointer hover:scale-[1.02] transition-transform shadow-amber-500/20 ring-2 ring-amber-500/50' : ''}`}
          >
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <stat.icon size={18} />
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                {stat.up ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
              </div>
            </div>
            <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
            <p className="text-xl font-black text-white mt-0.5">{stat.value} so'm</p>
            <p className="text-[10px] text-white/60 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white dark:bg-[#111118] p-5 rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 size={15} className="text-blue-500" /> Oylik Taqqoslash
              </h3>
              <p className="text-[10px] text-zinc-400 mt-0.5">Oxirgi 6 oylik kirim va chiqim</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-zinc-400 font-bold">Kirim</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-400" /><span className="text-zinc-400 font-bold">Chiqim</span></div>
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={3} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} tickFormatter={v => formatCompact(v)} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="income" name="Kirim" fill="#10b981" radius={[6, 6, 2, 2]} maxBarSize={20} />
                <Bar dataKey="expense" name="Chiqim" fill="#f43f5e" radius={[6, 6, 2, 2]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111118] p-5 rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <PieChartIcon size={15} className="text-violet-500" /> Kirim Kategoriyalari
          </h3>
          {categoryData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-zinc-300">
              <FileText size={32} />
            </div>
          ) : (
            <>
              <div className="h-[150px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={4} dataKey="value">
                      {categoryData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ borderRadius: '10px', fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase">Jami</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">{formatCompact(totalIncome)}</span>
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                {categoryData.slice(0, 4).map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{c.name}</span>
                    </div>
                    <span className="text-[11px] font-black text-slate-900 dark:text-white">{Math.round((c.value / (totalIncome || 1)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700 flex-wrap">
        {([
          { key: 'transactions', label: 'Tranzaksiyalar' },
          { key: 'invoices', label: `Invoicelar (${invoices.filter(i => i.status === 'pending').length})` },
          { key: 'debtors', label: `Qarzdorlar (${debtors.length})` },
          { key: 'monthly', label: 'Oylik Hisobot' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.key ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'transactions' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between gap-3">
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              {(['all', 'income', 'expense'] as const).map(t => (
                <button key={t} onClick={() => { setFilterType(t); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                    filterType === t
                      ? `bg-white dark:bg-zinc-700 shadow-sm ${t === 'income' ? 'text-emerald-600' : t === 'expense' ? 'text-rose-600' : 'text-blue-600'}`
                      : 'text-zinc-400'
                  }`}
                >
                  {t === 'all' ? 'Barchasi' : t === 'income' ? 'Kirim' : 'Chiqim'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  placeholder="Qidirish..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sana</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Tavsif</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Kategoriya</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Usul</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Summa</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {paginatedTransactions.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center">
                    <FileText size={32} className="mx-auto text-zinc-200 mb-2" />
                    <p className="text-sm font-bold text-zinc-400">Tranzaksiyalar topilmadi</p>
                  </td></tr>
                ) : paginatedTransactions.map(t => (
                  <tr key={t.id} onClick={() => { setSelectedTransaction(t); setIsDetailOpen(true); }}
                    className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group">
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{t.date}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{t.description || t.category}</p>
                        {t.studentName && <p className="text-[10px] text-zinc-400">{t.studentName}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-[10px] font-bold">{t.category}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
                        <CreditCard size={11} /> {t.method}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 text-right font-black text-sm ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {t.type === 'income' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              printReceipt({
                                id: t.id,
                                amount: t.amount,
                                method: t.method || 'Naqd',
                                paidAt: t.date,
                                notes: t.description,
                                student: t.studentName ? { name: t.studentName } : undefined,
                              });
                            }}
                            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-500 rounded-lg transition-all"
                            title="Chek chop etish">
                            <Receipt size={14} />
                          </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); setDeleteConfirm({ open: true, id: t.id }); }}
                          className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 rounded-lg transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredTransactions.length > PAGE_SIZE && (
            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">{filteredTransactions.length} ta natijadan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)}</span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-200 transition-colors">
                  ←
                </button>
                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage * PAGE_SIZE >= filteredTransactions.length}
                  className="px-3 py-1.5 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 rounded-lg disabled:opacity-40 hover:bg-zinc-200 transition-colors">
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-100 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Receipt size={14} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Invoicelar</p>
                <p className="text-[10px] text-zinc-400">Jami: {invoices.length} ta</p>
              </div>
            </div>
            <Button onClick={() => setIsInvoiceModalOpen(true)} leftIcon={<Plus size={14} />} size="sm">
              Yangi Invoice
            </Button>
          </div>

          {invoicesLoading ? (
            <div className="py-16 text-center text-zinc-400 text-sm">Yuklanmoqda...</div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Invoice mavjud emas</p>
              <button onClick={() => setIsInvoiceModalOpen(true)} className="mt-3 text-xs text-blue-500 font-bold hover:underline">
                + Birinchi invoice yaratish
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Raqam</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Talaba</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Summa</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Muddat</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Holat</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {invoices.map(inv => {
                    const isOverdue = inv.status === 'pending' && inv.dueDate < new Date().toISOString().split('T')[0];
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
                      paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
                      overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
                      cancelled: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                    };
                    const statusLabels: Record<string, string> = { pending: 'Kutilmoqda', paid: "To'landi", overdue: 'Muddati o\'tgan', cancelled: 'Bekor' };
                    return (
                      <tr key={inv.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-black text-slate-900 dark:text-white">{inv.number}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{inv.student?.name}</p>
                          <p className="text-[10px] text-zinc-400">{inv.student?.group}</p>
                        </td>
                        <td className="px-5 py-3.5 font-black text-sm text-slate-900 dark:text-white">
                          {formatMoney(inv.amount)}
                          {inv.discount > 0 && <span className="ml-1 text-[10px] text-emerald-500">-{inv.discount}%</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold ${isOverdue ? 'text-rose-500' : 'text-zinc-500'}`}>{inv.dueDate}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${statusColors[isOverdue ? 'overdue' : inv.status]}`}>
                            {statusLabels[isOverdue ? 'overdue' : inv.status]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                            {inv.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleMarkInvoicePaid(inv.id)}
                                  className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 rounded-lg text-[10px] font-bold flex items-center gap-1"
                                  title="To'landi deb belgilash"
                                >
                                  <CheckCircle2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleGetInvoiceLinks(inv)}
                                  className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 rounded-lg"
                                  title="To'lov havolalari"
                                >
                                  <ExternalLink size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoice yaratish modali */}
      <Modal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} title="Yangi Invoice Yaratish">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Talaba</label>
            <select
              value={invoiceForm.studentId}
              onChange={e => setInvoiceForm(f => ({ ...f, studentId: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="">Talabani tanlang...</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} {s.group ? `(${s.group})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <MoneyInput
                label="Summa (so'm)"
                value={Number(invoiceForm.amount) || 0}
                onChange={amount => setInvoiceForm(f => ({ ...f, amount: String(amount) }))}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">To'lov usuli</label>
              <select
                value={invoiceForm.method}
                onChange={e => setInvoiceForm(f => ({ ...f, method: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                {['Naqd', 'Payme', 'Click', 'Bank', 'Karta'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Chegirma (%)</label>
              <input
                type="number" placeholder="0" min="0" max="100"
                value={invoiceForm.discount}
                onChange={e => setInvoiceForm(f => ({ ...f, discount: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">To'lov muddati</label>
              <input
                type="date"
                value={invoiceForm.dueDate}
                onChange={e => setInvoiceForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Tavsif</label>
            <input
              placeholder="Kurs to'lovi, Yanvar oyi..."
              value={invoiceForm.description}
              onChange={e => setInvoiceForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>
          {invoiceForm.amount && Number(invoiceForm.amount) > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
              <div className="flex justify-between text-xs font-bold text-zinc-600 dark:text-zinc-400">
                <span>Asosiy summa:</span>
                <span>{formatMoney(Number(invoiceForm.amount))}</span>
              </div>
              {Number(invoiceForm.discount) > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 mt-1">
                  <span>Chegirma ({invoiceForm.discount}%):</span>
                  <span>-{formatMoney(Number(invoiceForm.amount) * Number(invoiceForm.discount) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-blue-700 dark:text-blue-400 mt-1.5 pt-1.5 border-t border-blue-200 dark:border-blue-500/30">
                <span>Jami:</span>
                <span>{formatMoney(Number(invoiceForm.amount) * (1 - Number(invoiceForm.discount) / 100))}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsInvoiceModalOpen(false)} className="flex-1">Bekor</Button>
            <Button onClick={handleCreateInvoice} className="flex-1" disabled={!invoiceForm.studentId || !invoiceForm.amount}>
              Invoice Yaratish
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invoice to'lov havolalari modali */}
      <Modal isOpen={!!invoiceLinks} onClose={() => setInvoiceLinks(null)} title="To'lov Havolalari">
        {invoiceLinks && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">Summa: <span className="font-black text-slate-900 dark:text-white">{formatMoney(invoiceLinks.amount)}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-xs font-black text-zinc-500 mb-2">PAYME</p>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(invoiceLinks.payme); showToast("Nusxalandi", 'success'); }}
                    className="flex-1 py-2 text-xs font-bold bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg flex items-center justify-center gap-1">
                    <Copy size={12} /> Nusxalash
                  </button>
                  <a href={invoiceLinks.payme} target="_blank" rel="noreferrer"
                    className="p-2 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-xs font-black text-zinc-500 mb-2">CLICK</p>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(invoiceLinks.click); showToast("Nusxalandi", 'success'); }}
                    className="flex-1 py-2 text-xs font-bold bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg flex items-center justify-center gap-1">
                    <Copy size={12} /> Nusxalash
                  </button>
                  <a href={invoiceLinks.click} target="_blank" rel="noreferrer"
                    className="p-2 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setInvoiceLinks(null)}>Yopish</Button>
            </div>
          </div>
        )}
      </Modal>

      {activeTab === 'debtors' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-100 dark:bg-amber-500/20 rounded-lg flex items-center justify-center">
                <AlertTriangle size={14} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Qarzdorlar Ro'yxati</p>
                <p className="text-[10px] text-zinc-400">{debtors.length} ta o'quvchi, jami {formatCompact(totalDebt)} so'm qarz</p>
              </div>
            </div>
            <button onClick={() => {
              exportToExcel(debtors, [
                { header: 'Ism', key: 'name', width: 25 },
                { header: 'Telefon', key: 'phone', width: 15 },
                { header: 'Guruh', key: 'group', width: 15 },
                { header: 'Balans', key: 'balance', width: 15 },
              ], 'Qarzdorlar');
              showToast('Excel yuklab olindi', 'success');
            }} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors">
              <Download size={14} /> Eksport
            </button>
          </div>
          {debtors.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-base font-black text-slate-900 dark:text-white">Barcha to'lovlar amalga oshirilgan!</p>
              <p className="text-sm text-zinc-400 mt-1">Hech qanday qarzdor o'quvchi yo'q</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">O'quvchi</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Guruh / Kurs</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Telefon</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Qarz Miqdori</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Holat</th>
                    <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {debtors.map(s => (
                    <tr key={s.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-500/5 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 font-black text-sm">
                            {(s.name || '?').charAt(0)}
                          </div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{s.group || '—'}</p>
                          <p className="text-[10px] text-zinc-400">{s.course || ''}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">{s.phone || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-black text-rose-600">
                          -{new Intl.NumberFormat('uz-UZ').format(Math.abs(s.balance || 0))} so'm
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-500/20 text-rose-600 rounded-full text-[10px] font-black">
                          Qarzdor
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleGetPaymentLinks(s.id, s.name, s.balance)}
                          disabled={isGeneratingLinks}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <CreditCard size={12} />
                          Havola
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'monthly' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-sm font-black text-slate-900 dark:text-white">Oylik Hisobot</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Har oylik moliyaviy ko'rsatkichlar</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Oy</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Kirim</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Chiqim</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Sof Foyda</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {monthlySummary.filter(m => m.income > 0 || m.expense > 0).map((m, i) => (
                  <tr key={i} className={`hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors ${MONTHS[currentMonth] === m.month ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">{m.month}</span>
                        {MONTHS[currentMonth] === m.month && (
                          <span className="text-[9px] font-black text-blue-600 bg-blue-100 dark:bg-blue-500/20 px-1.5 py-0.5 rounded">Joriy</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-bold text-emerald-600">{formatCompact(m.income)} so'm</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-bold text-rose-600">{formatCompact(m.expense)} so'm</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`text-sm font-black ${m.profit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                        {m.profit >= 0 ? '+' : ''}{formatCompact(m.profit)} so'm
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="w-full max-w-[100px] bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${Math.min(100, (m.income / (Math.max(...monthlySummary.map(x => x.income)) || 1)) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-t-2 border-zinc-200 dark:border-zinc-700">
                  <td className="px-5 py-3 text-[10px] font-black text-zinc-500 uppercase">Jami</td>
                  <td className="px-5 py-3 text-right text-sm font-black text-emerald-600">{formatCompact(totalIncome)} so'm</td>
                  <td className="px-5 py-3 text-right text-sm font-black text-rose-600">{formatCompact(totalExpense)} so'm</td>
                  <td className="px-5 py-3 text-right text-sm font-black text-blue-600">{formatCompact(balance)} so'm</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isDetailOpen && selectedTransaction && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800">
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Tranzaksiya</h2>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <div className={`text-center p-6 rounded-2xl ${selectedTransaction.type === 'income' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
                  <div className={`w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center ${selectedTransaction.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600'}`}>
                    {selectedTransaction.type === 'income' ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
                  </div>
                  <p className={`text-2xl font-black ${selectedTransaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {selectedTransaction.type === 'income' ? '+' : '-'}{formatMoney(selectedTransaction.amount)}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">{selectedTransaction.category}</p>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Calendar, label: 'Sana', value: selectedTransaction.date },
                    { icon: CreditCard, label: "To'lov usuli", value: selectedTransaction.method },
                    ...(selectedTransaction.studentName ? [{ icon: User, label: "O'quvchi", value: selectedTransaction.studentName }] : []),
                    ...(selectedTransaction.description ? [{ icon: FileText, label: 'Tavsif', value: selectedTransaction.description }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <row.icon size={15} className="text-blue-500" />
                        <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">{row.label}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 pt-2">
                  <Button variant="secondary" className="w-full" leftIcon={<Download size={15} />}
                    onClick={async () => { await exportReceiptToPDF(selectedTransaction); }}>
                    Chek (PDF)
                  </Button>
                  <Button variant="danger" className="w-full" leftIcon={<Trash2 size={15} />}
                    onClick={() => setDeleteConfirm({ open: true, id: selectedTransaction.id })}>
                    O'chirish
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Yangi Tranzaksiya" width="md">
        <div className="space-y-4">
          <div className="flex gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button onClick={() => setForm({ ...form, type: 'income', category: INCOME_CATEGORIES[0] })}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${form.type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-600' : 'text-zinc-400'}`}>
              Kirim
            </button>
            <button onClick={() => setForm({ ...form, type: 'expense', category: EXPENSE_CATEGORIES[0] })}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${form.type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-rose-600' : 'text-zinc-400'}`}>
              Chiqim
            </button>
          </div>

          <MoneyInput label="Summa (UZS)"
            value={form.amount} onChange={amount => setForm({ ...form, amount })} />

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
              {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {form.type === 'income' && form.category === "Kurs to'lovi" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</label>
              <select value={form.studentId} onChange={e => {
                const s = students.find(st => st.id === e.target.value);
                setForm({ ...form, studentId: e.target.value, studentName: s?.name || '', description: s ? `${s.name} — kurs to'lovi` : '' });
              }} className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">O'quvchini tanlang</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} {s.balance !== undefined ? `(${s.balance > 0 ? '+' : ''}${new Intl.NumberFormat('uz-UZ').format(s.balance)} so'm)` : ''}</option>)}
              </select>
            </div>
          )}

          {form.type === 'expense' && form.category === 'Oylik' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xodim / O'qituvchi</label>
              <select value={form.staffId} onChange={e => {
                const all = [...staff, ...teachers];
                const m = all.find(x => x.id.toString() === e.target.value);
                setForm({ ...form, staffId: e.target.value, staffName: m?.name || '', description: m ? `${m.name} — ish haqi` : '' });
              }} className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tanlang...</option>
                <optgroup label="O'qituvchilar">{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
                <optgroup label="Xodimlar">{staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</optgroup>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
              placeholder="Qo'shimcha ma'lumot..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Sana" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov usuli</label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value as any })}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Karta">💳 Karta</option>
                <option value="Naqd">💵 Naqd</option>
                <option value="Bank">🏦 Bank</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleSave} leftIcon={<Check size={14} />}>Saqlash</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!paymentLinks}
        onClose={() => setPaymentLinks(null)}
        title="To'lov havolalari"
        width="md"
      >
        {paymentLinks && (
          <div className="space-y-5 py-2">
            <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-850">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">O'quvchi</p>
              <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{paymentLinks.studentName}</p>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-3">Qarz miqdori</p>
              <p className="text-lg font-black text-rose-600 mt-0.5">{formatMoney(paymentLinks.amount)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payme Card */}
              <div className="p-4 bg-gradient-to-b from-[#f9fafc] to-[#f3f5f8] dark:from-zinc-800/40 dark:to-zinc-800/70 border border-zinc-200/50 dark:border-zinc-700/50 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-[#2cf] flex items-center justify-center text-white font-black text-xs shadow-sm shadow-[#2cf]/20">P</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">Payme</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 font-medium">Payme orqali to'g'ridan-to'g'ri to'lov havolasi</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(paymentLinks.payme);
                      setCopiedType('payme');
                      setTimeout(() => setCopiedType(null), 2000);
                      showToast("Payme havolasi nusxalandi!", "success");
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      copiedType === 'payme'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:border-zinc-750 dark:text-zinc-300'
                    }`}
                  >
                    {copiedType === 'payme' ? <Check size={14} /> : <Copy size={14} />}
                    {copiedType === 'payme' ? 'Nusxalandi' : 'Nusxalash'}
                  </button>
                  <a
                    href={paymentLinks.payme}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* Click Card */}
              <div className="p-4 bg-gradient-to-b from-[#f9fafc] to-[#f3f5f8] dark:from-zinc-800/40 dark:to-zinc-800/70 border border-zinc-200/50 dark:border-zinc-700/50 rounded-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-[#005bff] flex items-center justify-center text-white font-black text-xs shadow-sm shadow-[#005bff]/20">C</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">Click</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-2 font-medium">Click orqali to'g'ridan-to'g'ri to'lov havolasi</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(paymentLinks.click);
                      setCopiedType('click');
                      setTimeout(() => setCopiedType(null), 2000);
                      showToast("Click havolasi nusxalandi!", "success");
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      copiedType === 'click'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:border-zinc-750 dark:text-zinc-300'
                    }`}
                  >
                    {copiedType === 'click' ? <Check size={14} /> : <Copy size={14} />}
                    {copiedType === 'click' ? 'Nusxalandi' : 'Nusxalash'}
                  </button>
                  <a
                    href={paymentLinks.click}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center justify-center"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="secondary" onClick={() => setPaymentLinks(null)}>Yopish</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
