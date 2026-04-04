import React, { useState, useEffect, useMemo } from 'react';
import { Users, TrendingUp, Calendar, FileText, GraduationCap, Layers, ClipboardCheck, Wallet, Star, BookOpen, Package, Clock, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { format, subDays, parseISO, isToday, isAfter, startOfToday } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useFirestore } from '../../hooks/useFirestore';

export default function CrmDashboard() {
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: finance = [] } = useFirestore<any>('finance');
  const { data: assessments = [] } = useFirestore<any>('assessments');
  const { data: attendance = [] } = useFirestore<any>('attendance');
  const { data: schedule = [] } = useFirestore<any>('schedule');
  const { data: courses = [] } = useFirestore<any>('courses');
  const { data: inventory = [] } = useFirestore<any>('inventory');

  const [stats, setStats] = useState([
    { title: "Jami O'quvchilar", value: "0", trend: "+0%", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/20" },
    { title: "Faol Guruhlar", value: "0", trend: "+0", icon: Layers, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/20" },
    { title: "O'rtacha Baho", value: "0", trend: "+0", icon: Star, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/20" },
    { title: "Tushum (Oy)", value: "0", trend: "+0%", icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
  ]);

  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<any[]>([]);
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [upcomingLessons, setUpcomingLessons] = useState<any[]>([]);
  const [inventoryStats, setInventoryStats] = useState({ total: 0, value: 0 });
  const [courseStats, setCourseStats] = useState({ total: 0, active: 0 });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

  useEffect(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyIncome = (finance || [])
      .filter((t: any) => t.type === 'income' && t.date?.startsWith(currentMonth))
      .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

    const avgScore = (assessments || []).length > 0
      ? (assessments.reduce((acc: number, curr: any) => acc + (Number(curr.score) || 0), 0) / assessments.length).toFixed(1)
      : "0";

    // Calculate today's attendance
    const today = new Date().toISOString().split('T')[0];
    let todayPresent = 0;
    let todayTotal = 0;
    (attendance || []).forEach((group: any) => {
      if (group.date === today && Array.isArray(group.records)) {
        group.records.forEach((record: any) => {
          todayTotal++;
          if (record.status === 'present' || record.status === 'late') todayPresent++;
        });
      }
    });
    const attendanceRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;

    setStats([
      { title: "Jami O'quvchilar", value: (students || []).length.toString(), trend: "+5%", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/20" },
      { title: "Faol Guruhlar", value: (groups || []).length.toString(), trend: "+2", icon: Layers, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/20" },
      { title: "O'rtacha Baho", value: avgScore, trend: "+0.2", icon: Star, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/20" },
      { title: "Tushum (Oy)", value: monthlyIncome.toLocaleString() + " so'm", trend: "+12%", icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/20" },
    ]);

    // Inventory & Course Stats
    setInventoryStats({
      total: (inventory || []).length,
      value: (inventory || []).reduce((acc: number, item: any) => acc + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0)
    });
    setCourseStats({
      total: (courses || []).length,
      active: (courses || []).filter((c: any) => c.status === 'active').length
    });

    // Upcoming Lessons (Today's remaining lessons)
    const todayDay = new Date().getDay() || 7;
    const now = format(new Date(), 'HH:mm');
    const todayLessons = (schedule || [])
      .filter((s: any) => (s.days || []).includes(todayDay) && s.startTime >= now)
      .sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 4);
    setUpcomingLessons(todayLessons);

    // Generate some recent activity based on leads
    const activity = (leads || []).slice(0, 5).map((lead: any, index: number) => {
      let timeStr = `${(index + 1) * 10} daqiqa oldin`;
      if (lead.date) {
        try {
          const dateObj = parseISO(lead.date);
          if (!isNaN(dateObj.getTime())) {
            timeStr = format(dateObj, 'dd MMM HH:mm', { locale: uz });
          }
        } catch (e) {
          console.error("Invalid date:", lead.date);
        }
      }
      return {
        id: lead.id,
        title: `Yangi lid qo'shildi: ${lead.name}`,
        description: `Manba: ${lead.source}`,
        time: timeStr,
        initial: (lead.name || '?').charAt(0)
      };
    });
    setRecentActivity(activity);

    // Generate Chart Data
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayIncome = (finance || [])
        .filter((t: any) => t.type === 'income' && t.date === dateStr)
        .reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

      return {
        date: format(d, 'dd MMM', { locale: uz }),
        lidlar: (leads || []).filter((l: any) => l.date?.startsWith(dateStr)).length,
        tushum: dayIncome
      };
    });
    setChartData(last7Days);

    // Generate Attendance Trend Data
    const attendanceHistory = Array.from({ length: 7 }).map((_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      let present = 0;
      let total = 0;

      (attendance || []).forEach((group: any) => {
        if (group.date === dateStr && Array.isArray(group.records)) {
          group.records.forEach((record: any) => {
            total++;
            if (record.status === 'present' || record.status === 'late') present++;
          });
        }
      });

      return {
        date: format(d, 'dd MMM', { locale: uz }),
        rate: total > 0 ? Math.round((present / total) * 100) : 0
      };
    });
    setAttendanceTrend(attendanceHistory);

    // Calculate Top Students
    const studentGrades = (students || []).map((student: any) => {
      const studentAssessments = (assessments || []).filter((a: any) => a.studentId === student.id);
      const avg = studentAssessments.length > 0
        ? studentAssessments.reduce((acc: number, curr: any) => acc + (Number(curr.score) || 0), 0) / studentAssessments.length
        : 0;
      return {
        ...student,
        avgGrade: avg
      };
    })
      .filter((s: any) => s.avgGrade > 0)
      .sort((a: any, b: any) => b.avgGrade - a.avgGrade)
      .slice(0, 5);

    setTopStudents(studentGrades);

    // Generate Source Data
    const sources = (leads || []).reduce((acc: any, lead: any) => {
      const source = lead.source || 'Boshqa';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    const sourceChartData = Object.keys(sources).map(key => ({
      name: key,
      value: sources[key]
    }));

    if (sourceChartData.length === 0) {
      setSourceData([
        { name: 'Instagram', value: 40 },
        { name: 'Telegram', value: 30 },
        { name: 'Tanishlar', value: 20 },
        { name: 'Boshqa', value: 10 },
      ]);
    } else {
      setSourceData(sourceChartData);
    }
  }, [leads, students, groups, finance, assessments, attendance, schedule, courses, inventory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm font-medium">Xush kelibsiz! Tizimdagi so'nggi holat bilan tanishing.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold text-zinc-500 bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4 transition-all hover:shadow-md group">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
              <stat.icon size={24} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{stat.title}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{stat.value}</h3>
                <span className={`text-[10px] font-black ${stat.trend.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {stat.trend}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Faollik va Tushum</h2>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-xs font-bold text-zinc-500">Lidlar</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-bold text-zinc-500">Tushum</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLidlar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTushum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-zinc-800" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                />
                <Area type="monotone" dataKey="lidlar" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLidlar)" />
                <Area type="monotone" dataKey="tushum" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTushum)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Lessons */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bugungi darslar</h2>
            <Link to="/crmtayyorlovmarkaz/schedule" className="text-xs font-bold text-blue-600 hover:underline">Jadvalga o'tish</Link>
          </div>
          <div className="space-y-4">
            {upcomingLessons.length > 0 ? (
              upcomingLessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 group hover:border-blue-200 transition-colors">
                  <div className={`w-12 h-12 rounded-xl ${lesson.color} flex flex-col items-center justify-center text-white`}>
                    <Clock size={16} />
                    <span className="text-[10px] font-black">{lesson.startTime}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{lesson.groupName}</p>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase truncate">{lesson.teacher}</p>
                  </div>
                  <div className="text-[10px] font-black text-zinc-400 bg-white dark:bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {lesson.room}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                  <Calendar size={32} />
                </div>
                <p className="text-sm font-bold text-zinc-500">Bugun boshqa darslar yo'q</p>
              </div>
            )}
          </div>
          {upcomingLessons.length > 0 && (
            <button className="w-full mt-4 py-3 text-xs font-black text-zinc-500 hover:text-slate-900 dark:hover:text-white transition-colors border-t border-zinc-100 dark:border-zinc-800">
              Barcha darslarni ko'rish
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Access Modules */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tezkor Ma'lumotlar</h2>
          <Link to="/crmtayyorlovmarkaz/courses" className="block bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BookOpen size={24} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">Kurslar</p>
                  <p className="text-xs font-bold text-zinc-500">{courseStats.active} ta faol kurs</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-zinc-300 group-hover:text-indigo-600 transition-colors" />
            </div>
          </Link>
          <Link to="/crmtayyorlovmarkaz/inventory" className="block bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Package size={24} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">Inventar</p>
                  <p className="text-xs font-bold text-zinc-500">{inventoryStats.total} ta element</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-zinc-300 group-hover:text-amber-600 transition-colors" />
            </div>
          </Link>
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl text-white shadow-lg shadow-blue-600/20">
            <h3 className="text-lg font-black mb-2">BI Tahlil</h3>
            <p className="text-blue-100 text-xs font-medium mb-4">O'quv markazingiz o'sishini professional tahlillar orqali kuzating.</p>
            <Link to="/crmtayyorlovmarkaz/bi" className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-sm font-black transition-all backdrop-blur-md">
              Tahlilga o'tish
              <TrendingUp size={16} />
            </Link>
          </div>
        </div>

        {/* Top Students */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Eng faol o'quvchilar</h2>
          <div className="space-y-4">
            {topStudents.length > 0 ? (
              topStudents.map((student, idx) => (
                <div key={student.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-amber-100 text-amber-600' :
                        idx === 1 ? 'bg-slate-100 text-slate-600' :
                          idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-zinc-100 text-zinc-500'
                      }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                      <p className="text-[10px] font-medium text-zinc-500 uppercase">{student.group}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500 font-black">
                    <Star size={14} fill="currentColor" />
                    <span className="text-sm">{student.avgGrade.toFixed(1)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-zinc-500 italic text-sm">
                Hozircha baholangan o'quvchilar yo'q
              </div>
            )}
          </div>
        </div>

        {/* Source Distribution */}
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Lidlar manbasi</h2>
          <div className="h-[250px] w-full flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">So'nggi faolliklar</h2>
          <button className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">Barchasini ko'rish</button>
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <div key={activity.id} className="p-4 md:p-6 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  {activity.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{activity.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{activity.description}</p>
                </div>
                <div className="text-xs font-medium text-zinc-400 whitespace-nowrap bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                  {activity.time}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-zinc-500">
              Hozircha faolliklar yo'q
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
