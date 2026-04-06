import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Calendar, CreditCard, BookOpen, Clock, 
  MapPin, CheckCircle2, XCircle, FileText, Phone,
  TrendingDown, TrendingUp, Download, ShieldCheck
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { exportReceiptToPDF } from '../../utils/export';
import { Button } from '../../components/ui/Button';

export default function StudentPortal() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<any>(null);
  
  const { data: students = [], loading: loadingStudents } = useFirestore<any>('students');
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: journal = [] } = useFirestore<any>('journal');
  const { data: groups = [] } = useFirestore<any>('groups');

  useEffect(() => {
    if (students.length > 0 && id) {
      const found = students.find((s: any) => s.id === id);
      if (found) setStudent(found);
    }
  }, [students, id]);

  const studentGroups = useMemo(() => {
    if (!student) return [];
    return groups.filter((g: any) => g.students?.includes(student.id) || g.name === student.group);
  }, [student, groups]);

  const studentPayments = useMemo(() => {
    if (!student) return [];
    return transactions.filter((t: any) => t.studentId === student.id).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [student, transactions]);

  const studentAttendance = useMemo(() => {
    if (!student) return [];
    return journal.filter((j: any) => j.studentId === student.id).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [student, journal]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(amount);
  };

  const getAttendanceStats = () => {
    const present = studentAttendance.filter((a: any) => a.status === 'present').length;
    const absent = studentAttendance.filter((a: any) => a.status === 'absent').length;
    const total = present + absent;
    const rate = total > 0 ? (present / total) * 100 : 0;
    return { present, absent, rate };
  };

  if (loadingStudents) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex items-center justify-center p-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <ShieldCheck size={32} className="text-blue-500" />
        </motion.div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="w-20 h-20 bg-rose-100 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Topilmadi</h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium">Kechirasiz, ushbu o'quvchi portali yopiq yoki noto'g'ri havoladan foydalandingiz.</p>
        </div>
      </div>
    );
  }

  const stats = getAttendanceStats();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-slate-900 dark:text-white p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Profile Section */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-10 shadow-lg border border-zinc-200/50 dark:border-zinc-800/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="w-28 h-28 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl shrink-0 flex items-center justify-center text-white text-4xl font-black shadow-xl shadow-blue-500/30">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center md:text-left flex-1">
              <div className="inline-block px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-xs font-black uppercase tracking-widest mb-3">
                O'quvchi Kabineti
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">{student.name}</h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4">
                <span className="flex items-center gap-1.5 text-sm font-bold text-zinc-500">
                  <Phone size={16} className="text-blue-500"/> {student.phone}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-zinc-500">
                  <Calendar size={16} className="text-blue-500"/> Qabul: {student.enrollDate || 'Nomalum'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
              <CreditCard size={48} />
            </div>
            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-1">Mavjud Balans</h3>
            <div className={`text-3xl font-black ${(student.balance || 0) < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
              {formatMoney(student.balance || 0)}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                (student.balance || 0) < 0 ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
              }`}>
                {(student.balance || 0) < 0 ? 'Qarzdorlik' : 'Hammasi joyida'}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-1">Davomat Foizi</h3>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {Math.round(stats.rate)}%
            </div>
            <div className="mt-4 flex items-center gap-2">
               <span className="text-xs font-bold text-zinc-500">
                 {stats.present} Kelgan / {stats.absent} Sababsiz
               </span>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
              <BookOpen size={48} className="text-blue-500" />
            </div>
            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-1">Guruhlar soni</h3>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {studentGroups.length}
            </div>
            <div className="mt-4 flex items-center gap-2">
               <span className="text-xs font-bold text-zinc-500">
                 Faol kurslar
               </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Groups & Schedule */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                <BookOpen size={16} />
              </div>
              <h2 className="text-xl font-black tracking-tight">Guruhlar va Darslar</h2>
            </div>
            
            <div className="space-y-4">
              {studentGroups.length > 0 ? studentGroups.map((g: any, i: number) => (
                <div key={i} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-black">{g.name}</h3>
                      <p className="text-sm font-bold text-blue-500">{g.subject}</p>
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg text-xs font-black uppercase tracking-widest">
                       Faol
                    </span>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <User size={16} className="text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Ustoz: <strong className="text-slate-900 dark:text-white ml-1">{g.teacher}</strong></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock size={16} className="text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                         {g.days?.join(', ')} <strong className="text-slate-900 dark:text-white ml-2">{g.time}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="text-zinc-400" />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{g.room}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-center">
                  <p className="text-sm font-bold text-zinc-500">O'quvchi birorta guruhga biriktirilmagan.</p>
                </div>
              )}
            </div>
          </div>

          {/* Payment History */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <h2 className="text-xl font-black tracking-tight">To'lov Tarixi</h2>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm overflow-hidden">
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {studentPayments.length > 0 ? studentPayments.map((t: any, i: number) => (
                  <div key={i} className="p-4 sm:p-6 flex items-center justify-between group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="flex gap-4 items-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        t.type === 'income' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600'
                      }`}>
                         {t.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{t.category}</p>
                        <p className="text-xs font-bold text-zinc-500 mt-0.5">{t.date} • {t.method}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-base font-black ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                      </span>
                      {t.type === 'income' && (
                        <button 
                           onClick={() => exportReceiptToPDF(t)}
                           className="p-2 text-zinc-400 hover:text-blue-500 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                           title="Chekni yuklash"
                        >
                          <Download size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-sm font-bold text-zinc-500">
                    To'lov tarixi bo'sh.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
