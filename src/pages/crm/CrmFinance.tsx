import React, { useState, useMemo } from 'react';
import { 
  DollarSign, TrendingUp, TrendingDown, Filter, Download, Plus, 
  Search, ArrowUpRight, ArrowDownRight, CreditCard, Wallet, 
  X, Calendar, Tag, FileText, User, MoreVertical, Trash2,
  PieChart as PieChartIcon, BarChart as BarChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie 
} from 'recharts';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import { exportToExcel, exportToPDF, exportReceiptToPDF } from '../../utils/export';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

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

const INCOME_CATEGORIES = ['Kurs to\'lovi', 'Sotuv', 'Investitsiya', 'Boshqa'];
const EXPENSE_CATEGORIES = ['Ijara', 'Marketing', 'Oylik', 'Kommunal', 'Soliq', 'Boshqa'];

export default function CrmFinance() {
  const { data: transactions = [], addDocument, deleteDocument } = useFirestore<Transaction>('finance');
  const { data: students = [], updateDocument: updateStudent } = useFirestore<any>('students');
  const { data: staff = [] } = useFirestore<any>('staff');
  const { data: teachers = [] } = useFirestore<any>('teachers');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  
  const [form, setForm] = useState<Partial<Transaction>>({
    type: 'income',
    amount: 0,
    category: 'Kurs to\'lovi',
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

    const newTransaction = {
      ...form,
      amount: Number(form.amount)
    };

    // If it's a student payment, update student balance and payment status
    if (newTransaction.type === 'income' && newTransaction.studentId) {
      const student = (students || []).find(s => s.id === newTransaction.studentId);
      if (student && student.id) {
        const newBalance = (student.balance || 0) + newTransaction.amount;
        const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
        await updateStudent(student.id, { balance: newBalance, paymentStatus: newPaymentStatus });
      }
    }

    await addDocument(newTransaction as Omit<Transaction, 'id'>);
    
    setIsModalOpen(false);
    setForm({
      type: 'income',
      amount: 0,
      category: 'Kurs to\'lovi',
      description: '',
      date: new Date().toISOString().split('T')[0],
      method: 'Karta',
      studentId: '',
      studentName: '',
      staffId: '',
      staffName: ''
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Haqiqatan ham ushbu tranzaksiyani o\'chirmoqchimisiz?')) {
      await deleteDocument(id);
      if (selectedTransaction?.id === id) setIsDetailOpen(false);
    }
  };

  const totalIncome = (transactions || []).filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpense = (transactions || []).filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
  const balance = totalIncome - totalExpense;

  const filteredTransactions = useMemo(() => {
    return (transactions || []).filter(t => {
      const matchesSearch = (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (t.studentName && t.studentName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = filterType === 'all' || t.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [transactions, searchTerm, filterType]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(amount);
  };

  const chartData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => ({
      date: date.split('-').slice(1).reverse().join('.'),
      income: (transactions || []).filter(t => t.date === date && t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0),
      expense: (transactions || []).filter(t => t.date === date && t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0),
    }));
  }, [transactions]);

  const pieData = [
    { name: 'Kirim', value: totalIncome, color: '#10b981' },
    { name: 'Chiqim', value: totalExpense, color: '#ef4444' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Moliya Boshqaruvi</h1>
          <p className="text-sm font-medium text-zinc-500 mt-1">O'quv markazining barcha moliyaviy oqimlari nazorati</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus size={18} />}
        >
          Yangi Tranzaksiya
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Umumiy Balans', value: balance, icon: Wallet, color: 'blue', sub: 'Joriy holat' },
          { label: 'Jami Kirim', value: totalIncome, icon: TrendingUp, color: 'emerald', sub: '+12% o\'tgan oyga nisbatan' },
          { label: 'Jami Chiqim', value: totalExpense, icon: TrendingDown, color: 'rose', sub: '-5% o\'tgan oyga nisbatan' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden relative group">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${stat.color}-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110`} />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className={`w-10 h-10 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400 flex items-center justify-center`}>
                <stat.icon size={20} />
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest text-${stat.color}-600`}>{stat.sub}</span>
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{stat.label}</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{formatMoney(stat.value)}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
              <BarChartIcon size={16} className="text-blue-500" />
              Haftalik Hisobot
            </h3>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => val / 1000 + 'k'} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => formatMoney(val)}
                />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-6">
            <PieChartIcon size={16} className="text-blue-500" />
            Balans Taqsimoti
          </h3>
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => formatMoney(val)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sof Foyda</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">{formatMoney(balance)}</span>
            </div>
          </div>
          <div className="space-y-3 mt-4">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-bold text-zinc-500">{item.name}</span>
                </div>
                <span className="text-xs font-black text-slate-900 dark:text-white">{Math.round((item.value / (totalIncome + totalExpense)) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <button 
                onClick={() => setFilterType('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${filterType === 'all' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
              >
                Barchasi
              </button>
              <button 
                onClick={() => setFilterType('income')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${filterType === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-600' : 'text-zinc-500'}`}
              >
                Kirim
              </button>
              <button 
                onClick={() => setFilterType('expense')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${filterType === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-rose-600' : 'text-zinc-500'}`}
              >
                Chiqim
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex-1 md:w-64">
              <Input
                leftIcon={<Search size={18} />}
                placeholder="Qidirish..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="!px-3 flex items-center justify-center">
              <Download size={18} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif va Kategoriya</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov turi</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Summa</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredTransactions.map((t) => (
                <tr 
                  key={t.id} 
                  onClick={() => { setSelectedTransaction(t); setIsDetailOpen(true); }}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-zinc-500">{t.date}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{t.description}</span>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {t.method === 'Karta' ? <CreditCard size={12} /> : <DollarSign size={12} />}
                      {t.method}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-right font-black ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="text-zinc-200" />
                      <p className="text-sm font-bold text-zinc-500">Tranzaksiyalar topilmadi</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Sidebar */}
      <AnimatePresence>
        {isDetailOpen && selectedTransaction && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Tranzaksiya Tafsilotlari</h2>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="text-center p-8 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-700">
                    <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                      selectedTransaction.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    }`}>
                      {selectedTransaction.type === 'income' ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                    </div>
                    <h3 className={`text-3xl font-black ${
                      selectedTransaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {selectedTransaction.type === 'income' ? '+' : '-'}{formatMoney(selectedTransaction.amount)}
                    </h3>
                    <p className="text-sm font-bold text-zinc-500 mt-1">{selectedTransaction.category}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Calendar size={18} className="text-blue-500" />
                        <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Sana</span>
                      </div>
                      <span className="text-sm font-black text-slate-900 dark:text-white">{selectedTransaction.date}</span>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <CreditCard size={18} className="text-blue-500" />
                        <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">To'lov turi</span>
                      </div>
                      <span className="text-sm font-black text-slate-900 dark:text-white">{selectedTransaction.method}</span>
                    </div>

                    {selectedTransaction.studentName && (
                      <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <User size={18} className="text-blue-500" />
                          <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">O'quvchi</span>
                        </div>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{selectedTransaction.studentName}</span>
                      </div>
                    )}

                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-2">
                      <div className="flex items-center gap-3">
                        <FileText size={18} className="text-blue-500" />
                        <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">Tavsif</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                        {selectedTransaction.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 space-y-3">
                  <Button 
                    variant="secondary"
                    onClick={() => exportReceiptToPDF(selectedTransaction)}
                    className="w-full py-4 text-sm font-black"
                    leftIcon={<Download size={18} />}
                  >
                    Chekni Yuklash (PDF)
                  </Button>
                  <Button 
                    variant="danger"
                    onClick={() => handleDelete(selectedTransaction.id)}
                    className="w-full py-4 text-sm"
                    leftIcon={<Trash2 size={18} />}
                  >
                    Tranzaksiyani o'chirish
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Transaction Modal */}
      {/* Add Transaction Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Yangi Tranzaksiya"
        width="md"
      >
        <div className="space-y-5">
          <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button 
              onClick={() => setForm({...form, type: 'income', category: INCOME_CATEGORIES[0]})}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${form.type === 'income' ? 'bg-white dark:bg-zinc-700 shadow-sm text-emerald-600' : 'text-zinc-500'}`}
            >
              Kirim
            </button>
            <button 
              onClick={() => setForm({...form, type: 'expense', category: EXPENSE_CATEGORIES[0]})}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${form.type === 'expense' ? 'bg-white dark:bg-zinc-700 shadow-sm text-rose-600' : 'text-zinc-500'}`}
            >
              Chiqim
            </button>
          </div>

          <Input
            type="number"
            label="Summa (UZS)"
            leftIcon={<DollarSign size={18} />}
            value={form.amount || ''}
            onChange={(e) => setForm({...form, amount: Number(e.target.value)})}
            placeholder="0"
          />

          <div className="space-y-1.5 flex flex-col w-full">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</label>
            <select 
              value={form.category}
              onChange={(e) => setForm({...form, category: e.target.value})}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {form.type === 'income' && form.category === 'Kurs to\'lovi' && (
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</label>
              <select 
                value={form.studentId}
                onChange={(e) => {
                  const student = (students || []).find(s => s.id === e.target.value);
                  setForm({...form, studentId: e.target.value, studentName: student?.name || '', description: student ? `${student.name} (Kurs to'lovi)` : ''});
                }}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">O'quvchini tanlang</option>
                {(students || []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {form.type === 'expense' && form.category === 'Oylik' && (
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xodim / O'qituvchi</label>
              <select 
                value={form.staffId}
                onChange={(e) => {
                  const allStaff = [...(staff || []), ...(teachers || [])];
                  const member = allStaff.find(s => s.id.toString() === e.target.value.toString());
                  setForm({...form, staffId: e.target.value, staffName: member?.name || '', description: member ? `${member.name} uchun ish haqi` : ''});
                }}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Xodimni tanlang</option>
                <optgroup label="O'qituvchilar">
                  {(teachers || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
                  ))}
                </optgroup>
                <optgroup label="Xodimlar">
                  {(staff || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

          <div className="space-y-1.5 flex flex-col w-full">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif</label>
            <textarea 
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
              placeholder="Batafsil ma'lumot..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              type="date"
              label="Sana"
              value={form.date}
              onChange={(e) => setForm({...form, date: e.target.value})}
            />
            <div className="space-y-1.5 flex flex-col w-full">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov turi</label>
              <select 
                value={form.method}
                onChange={(e) => setForm({...form, method: e.target.value as any})}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 transition-all outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Karta">Karta</option>
                <option value="Naqd">Naqd</option>
                <option value="Bank">Bank</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Bekor qilish</Button>
            <Button onClick={handleSave}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
