import React, { useState, useEffect } from 'react';
import { Calendar, Clock, BookOpen, CheckCircle2, XCircle, AlertCircle, Star, Wallet, GraduationCap, BarChart3 } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

export default function StudentPortal() {
  const { data: schedule = [] } = useFirestore<any>('schedules');
  const { data: attendance = [] } = useFirestore<any>('attendance');
  const { data: assessments = [] } = useFirestore<any>('assessments');
  const { data: payments = [] } = useFirestore<any>('payments');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: courses = [] } = useFirestore<any>('courses');

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem('crm_user');
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch {}
    }
  }, []);

  // Note: In a full implementation, we'd filter by the student's ID linked to their user account
  // For now, show all data as a demonstration of the portal layout

  const todayDay = new Date().getDay() || 7;
  const todaySchedule = schedule.filter((s: any) => s.dayOfWeek === todayDay);

  const totalAttendance = attendance.length;
  const presentCount = attendance.filter((a: any) => a.status === 'present' || a.status === 'late').length;
  const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

  const avgScore = assessments.length > 0
    ? (assessments.reduce((sum: number, a: any) => sum + (Number(a.score) || 0), 0) / assessments.length).toFixed(1)
    : '0';

  const totalPaid = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Xush kelibsiz{user?.name ? `, ${user.name}` : ''}!
        </h1>
        <p className="text-sm text-zinc-500 mt-1">O'quv jarayoningiz haqida ma'lumotlar</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
            <GraduationCap size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Guruhlar</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{groups.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Davomat</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{attendanceRate}%</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
            <Star size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">O'rtacha ball</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{avgScore}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
            <Wallet size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Jami to'lov</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{totalPaid.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              Bugungi dars jadvali
            </h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {todaySchedule.length > 0 ? todaySchedule.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                  <Clock size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{s.groupName || 'Dars'}</p>
                  <p className="text-xs text-zinc-500">{s.startTime} - {s.endTime}</p>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-zinc-500 text-sm">Bugun darslar yo'q</div>
            )}
          </div>
        </div>

        {/* Recent Grades */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={20} className="text-amber-600" />
              So'nggi baholar
            </h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {assessments.slice(0, 8).map((a: any) => (
              <div key={a.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{a.title}</p>
                  <p className="text-xs text-zinc-500">{a.date} {a.subject ? `- ${a.subject}` : ''}</p>
                </div>
                <div className={`text-lg font-black ${Number(a.score) >= 70 ? 'text-emerald-600' : Number(a.score) >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {a.score}/{a.maxScore || 100}
                </div>
              </div>
            ))}
            {assessments.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-sm">Hozircha baholar yo'q</div>
            )}
          </div>
        </div>
      </div>

      {/* Attendance History */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen size={20} className="text-emerald-600" />
            Davomat tarixi
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 font-bold">
              <tr>
                <th className="px-6 py-3">Sana</th>
                <th className="px-6 py-3">Holat</th>
                <th className="px-6 py-3">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {attendance.slice(0, 20).map((a: any) => (
                <tr key={a.id}>
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{a.date}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      a.status === 'present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      a.status === 'late' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      a.status === 'excused' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                      {a.status === 'present' && <><CheckCircle2 size={12} /> Bor</>}
                      {a.status === 'absent' && <><XCircle size={12} /> Yo'q</>}
                      {a.status === 'late' && <><AlertCircle size={12} /> Kech</>}
                      {a.status === 'excused' && <><AlertCircle size={12} /> Sababli</>}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-zinc-500">{a.note || '-'}</td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-zinc-500">Davomat ma'lumotlari yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet size={20} className="text-purple-600" />
            To'lov tarixi
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 font-bold">
              <tr>
                <th className="px-6 py-3">Sana</th>
                <th className="px-6 py-3">Summa</th>
                <th className="px-6 py-3">Usul</th>
                <th className="px-6 py-3">Oy</th>
                <th className="px-6 py-3">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {payments.slice(0, 20).map((p: any) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{p.date}</td>
                  <td className="px-6 py-3 font-bold text-emerald-600">{Number(p.amount).toLocaleString()} so'm</td>
                  <td className="px-6 py-3 text-zinc-500">{p.method}</td>
                  <td className="px-6 py-3 text-zinc-500">{p.month || '-'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'overdue' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {p.status === 'paid' ? "To'langan" : p.status === 'overdue' ? 'Muddati o\'tgan' : 'Kutilmoqda'}
                    </span>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500">To'lov ma'lumotlari yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
