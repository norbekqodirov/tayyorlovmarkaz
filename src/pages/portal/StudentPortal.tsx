import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User, Calendar, CreditCard, BookOpen, Clock,
  MapPin, CheckCircle2, XCircle, FileText, Phone,
  TrendingDown, TrendingUp, Download, ShieldCheck,
  GraduationCap, Award
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { exportReceiptToPDF } from '../../utils/export';

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

  const attendanceColor = stats.rate >= 80 ? 'text-emerald-500' : stats.rate >= 60 ? 'text-amber-500' : 'text-rose-500';
  const attendanceBarColor = stats.rate >= 80 ? 'bg-emerald-500' : stats.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white font-sans">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600" />

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 md:p-8 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-violet-600/10 pointer-events-none" />
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl font-black shadow-2xl shadow-blue-500/40 shrink-0">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  O'quvchi Kabineti
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                  student.status === 'Faol' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                }`}>{student.status}</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight">{student.name}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5"><Phone size={14} className="text-blue-400" />{student.phone}</span>
                {student.email && <span className="flex items-center gap-1.5"><FileText size={14} className="text-blue-400" />{student.email}</span>}
                {student.joinedDate && <span className="flex items-center gap-1.5"><Calendar size={14} className="text-blue-400" />Qabul: {student.joinedDate}</span>}
                {student.course && <span className="flex items-center gap-1.5"><GraduationCap size={14} className="text-blue-400" />{student.course}</span>}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'Balans',
              value: formatMoney(student.balance || 0),
              icon: CreditCard,
              sub: (student.balance || 0) < 0 ? 'Qarzdorlik bor' : 'To\'lov holati yaxshi',
              color: (student.balance || 0) < 0 ? 'from-rose-600/20 to-rose-900/10 border-rose-500/20' : 'from-emerald-600/20 to-emerald-900/10 border-emerald-500/20',
              iconColor: (student.balance || 0) < 0 ? 'text-rose-400' : 'text-emerald-400',
              valueColor: (student.balance || 0) < 0 ? 'text-rose-400' : 'text-white',
            },
            {
              label: 'Davomat',
              value: `${Math.round(stats.rate)}%`,
              icon: CheckCircle2,
              sub: `${stats.present} kelgan · ${stats.absent} kelmagan`,
              color: 'from-blue-600/20 to-blue-900/10 border-blue-500/20',
              iconColor: 'text-blue-400',
              valueColor: attendanceColor,
            },
            {
              label: 'Guruhlar',
              value: String(studentGroups.length),
              icon: Award,
              sub: `${studentPayments.length} ta to'lov amalga oshirilgan`,
              color: 'from-violet-600/20 to-violet-900/10 border-violet-500/20',
              iconColor: 'text-violet-400',
              valueColor: 'text-white',
            },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`relative bg-gradient-to-br ${s.color} backdrop-blur-xl rounded-2xl border p-5 overflow-hidden`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{s.label}</p>
                <s.icon size={18} className={s.iconColor} />
              </div>
              <p className={`text-3xl font-black ${s.valueColor}`}>{s.value}</p>
              <p className="text-[11px] text-zinc-500 mt-1">{s.sub}</p>
              {s.label === 'Davomat' && (
                <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${attendanceBarColor} rounded-full transition-all`} style={{ width: `${stats.rate}%` }} />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Groups */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <BookOpen size={14} /> Guruhlar va jadval
            </h2>
            {studentGroups.length > 0 ? studentGroups.map((g: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:bg-white/[0.08] transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-black text-white">{g.name}</h3>
                    <p className="text-sm text-blue-400 font-bold mt-0.5">{g.subject}</p>
                  </div>
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-black uppercase">Faol</span>
                </div>
                <div className="space-y-2 pt-3 border-t border-white/10 text-sm text-zinc-400">
                  <div className="flex items-center gap-2"><User size={13} /><span>Ustoz: <span className="text-white font-bold">{g.teacher}</span></span></div>
                  <div className="flex items-center gap-2"><Clock size={13} /><span>{(g.days || []).join(', ')} · <span className="text-white font-bold">{g.time}</span></span></div>
                  {g.room && <div className="flex items-center gap-2"><MapPin size={13} /><span>{g.room}</span></div>}
                </div>
              </motion.div>
            )) : (
              <div className="bg-white/5 rounded-2xl border border-white/10 p-8 text-center text-sm text-zinc-500">
                Hech qanday guruhga biriktirilmagan.
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <FileText size={14} /> To'lov tarixi
            </h2>
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
              {studentPayments.length > 0 ? studentPayments.map((t: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-4 border-b border-white/[0.06] last:border-0 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      t.type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {t.type === 'income' ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{t.category}</p>
                      <p className="text-[11px] text-zinc-500">{t.date}{t.method ? ` · ${t.method}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-black ${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                    </span>
                    {t.type === 'income' && (
                      <button onClick={() => exportReceiptToPDF(t)} className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all">
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-sm text-zinc-500">To'lov tarixi bo'sh.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-[11px] text-zinc-600">
          Tayyorlov Markaz · O'quvchi Kabineti · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
