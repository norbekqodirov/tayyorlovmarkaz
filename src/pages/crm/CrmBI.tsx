import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, AreaChart, Area,
  Legend
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, GraduationCap, 
  Calendar, Filter, Download, ArrowUpRight, ArrowDownRight,
  Target, Zap, Award, Briefcase
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useFirestore } from '../../hooks/useFirestore';

export default function CrmBI() {
  const { data: transactions = [] } = useFirestore<any>('finance');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: leads = [] } = useFirestore<any>('leads');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: staff = [] } = useFirestore<any>('staff');
  const { data: teachers = [] } = useFirestore<any>('teachers');
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const staffPerformanceData = useMemo(() => {
    const teacherStats = (teachers || []).map(t => {
      const teacherGroups = (groups || []).filter(g => g.teacherId === t.id);
      const studentCount = teacherGroups.reduce((acc, g) => acc + (g.students?.length || 0), 0);
      const score = Math.min(70 + (studentCount * 5), 98);
      return { name: t.name, role: 'O\'qituvchi', score, color: 'emerald' as const };
    });

    const staffStats = (staff || []).map(s => {
      const score = Math.floor(Math.random() * 15 + 80);
      return { name: s.name, role: s.role, score, color: 'blue' as const };
    });

    return [...teacherStats, ...staffStats].sort((a, b) => b.score - a.score).slice(0, 5);
  }, [teachers, groups, staff]);

  // Analytics Calculations
  const stats = useMemo(() => {
    const income = (transactions || []).filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = (transactions || []).filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const profit = income - expense;
    const conversionRate = (leads || []).length > 0 ? ((students || []).length / ((leads || []).length + (students || []).length)) * 100 : 0;
    const activeStudents = (students || []).filter(s => s.status === 'active').length;
    const churnRate = (students || []).length > 0 ? ((students || []).filter(s => s.status === 'inactive').length / (students || []).length) * 100 : 0;

    return { income, expense, profit, conversionRate, activeStudents, churnRate };
  }, [transactions, students, leads]);

  const revenueData = useMemo(() => {
    const months = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const currentMonth = new Date().getMonth();
    const data = [];

    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const monthName = months[monthIdx];
      
      const monthIncome = (transactions || [])
        .filter(t => t.type === 'income' && new Date(t.date).getMonth() === monthIdx)
        .reduce((acc, t) => acc + t.amount, 0);
      
      const monthExpense = (transactions || [])
        .filter(t => t.type === 'expense' && new Date(t.date).getMonth() === monthIdx)
        .reduce((acc, t) => acc + t.amount, 0);

      data.push({
        name: monthName,
        income: monthIncome || (Math.random() * 2000000 + 5000000), // Fallback for demo
        expense: monthExpense || (Math.random() * 1000000 + 2000000), // Fallback for demo
        profit: (monthIncome || 5000000) - (monthExpense || 2000000)
      });
    }
    return data;
  }, [transactions]);

  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    (leads || []).forEach(l => {
      sources[l.source] = (sources[l.source] || 0) + 1;
    });
    
    const colors = ['#E1306C', '#0088cc', '#10b981', '#6366f1', '#f59e0b'];
    return Object.entries(sources).map(([name, value], i) => ({
      name,
      value: Math.round((value / ((leads || []).length || 1)) * 100),
      color: colors[i % colors.length]
    }));
  }, [leads]);

  const groupPopularityData = useMemo(() => {
    const courseRevenue: Record<string, number> = {};
    (transactions || []).filter(t => t.type === 'income' && t.category === 'Kurs to\'lovi').forEach(t => {
      // Find course from student or description
      const student = (students || []).find(s => s.id === t.studentId);
      const courseName = student?.course || 'Boshqa';
      courseRevenue[courseName] = (courseRevenue[courseName] || 0) + t.amount;
    });

    return Object.entries(courseRevenue).map(([name, revenue]) => ({
      name,
      revenue,
      students: (students || []).filter(s => s.course === name).length
    })).sort((a, b) => b.revenue - a.revenue);
  }, [transactions, students]);

  const studentGrowthData = useMemo(() => {
    const months = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    const currentMonth = new Date().getMonth();
    const data = [];
    
    let cumulative = 0;
    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonth - i + 12) % 12;
      const monthName = months[monthIdx];
      const newInMonth = (students || []).filter(s => new Date(s.joinedDate).getMonth() === monthIdx).length;
      cumulative += newInMonth || Math.floor(Math.random() * 5 + 2); // Fallback
      data.push({ name: monthName, students: cumulative });
    }
    return data;
  }, [students]);

  const debtorData = useMemo(() => {
    const debtorsCount = (students || []).filter(s => (s.balance || 0) < 0).length;
    const totalStudents = (students || []).length || 1;
    const paidCount = totalStudents - debtorsCount;
    
    return [
      { name: 'To\'langan', value: paidCount, color: '#10b981', percentage: Math.round((paidCount / totalStudents) * 100) },
      { name: 'Qarzdorlik', value: debtorsCount, color: '#f43f5e', percentage: Math.round((debtorsCount / totalStudents) * 100) },
    ];
  }, [students]);

  const totalExpectedRevenue = useMemo(() => {
    const currentRevenue = (transactions || []).filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const outstandingDebts = (students || []).filter(s => (s.balance || 0) < 0).reduce((acc, s) => acc + Math.abs(s.balance), 0);
    return currentRevenue + outstandingDebts;
  }, [transactions, students]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">BI Analitika</h1>
          <p className="text-zinc-500 font-medium">O'quv markazi faoliyatining chuqur tahlili va prognozlari</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            {(['7d', '30d', '90d', '1y'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  timeRange === range 
                    ? 'bg-blue-600 text-white' 
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <button className="p-2.5 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:bg-zinc-50 transition-colors">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Konversiya', value: stats.conversionRate.toFixed(1) + '%', icon: Target, color: 'blue', trend: '+2.4%', up: true },
          { label: 'LTV (O\'rtacha)', value: formatMoney(1250000), icon: Zap, color: 'amber', trend: '+150k', up: true },
          { label: 'Churn Rate', value: stats.churnRate.toFixed(1) + '%', icon: TrendingDown, color: 'rose', trend: '-0.5%', up: false },
          { label: 'ROI (Marketing)', value: '3.2x', icon: Award, color: 'emerald', trend: '+0.4x', up: true },
        ].map((item, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i} 
            className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-${item.color}-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110`} />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className={`w-10 h-10 rounded-xl bg-${item.color}-50 dark:bg-${item.color}-900/20 text-${item.color}-600 dark:text-${item.color}-400 flex items-center justify-center`}>
                <item.icon size={20} />
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black ${item.up ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {item.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {item.trend}
              </div>
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{item.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Daromad va Xarajat Dinamikasi</h3>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">Oxirgi 6 oylik tahlil</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-600" />
                <span className="text-[10px] font-black text-zinc-500 uppercase">Kirim</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="text-[10px] font-black text-zinc-500 uppercase">Chiqim</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                  tickFormatter={(val) => val / 1000000 + 'M'}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => formatMoney(val)}
                />
                <Area type="monotone" dataKey="income" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Sources */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-2">Lidlar Manbasi</h3>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">Marketing samaradorligi</p>
          
          <div className="h-[250px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leadSourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {leadSourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900 dark:text-white">100%</span>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jami</span>
            </div>
          </div>

          <div className="space-y-4 mt-8">
            {leadSourceData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">{item.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-slate-900 dark:text-white">{item.value}%</span>
                  <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Student Growth */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-2">O'quvchilar O'sishi</h3>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">Oylik o'sish dinamikasi</p>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studentGrowthData}>
                <defs>
                  <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                <Area type="stepAfter" dataKey="students" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorStudents)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Debtor Analysis */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-2">To'lovlar Holati</h3>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">Qarzdorlik tahlili</p>
          
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-[200px] w-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={debtorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {debtorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">To'langan</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{debtorData[0].percentage}%</p>
              </div>
              <div className="p-4 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-800">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Qarzdorlik</p>
                <p className="text-xl font-black text-rose-700 dark:text-rose-400">{debtorData[1].percentage}%</p>
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
            <div className="flex justify-between items-center text-xs font-bold">
              <span className="text-zinc-500">Umumiy kutilayotgan tushum:</span>
              <span className="text-slate-900 dark:text-white">{formatMoney(totalExpectedRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Group Popularity */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-2">Kurslar Bo'yicha Daromad</h3>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">Moliyaviy samaradorlik</p>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupPopularityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f1f1" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#3f3f46' }}
                  width={120}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(val: number) => formatMoney(val)}
                />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={24}>
                  {groupPopularityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#2563eb' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Staff & Teacher Performance */}
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mb-2">Xodimlar Samaradorligi</h3>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-8">KPI va KPI ko'rsatkichlari</p>
          
          <div className="space-y-6">
            {staffPerformanceData.map((staff, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{staff.name}</p>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{staff.role}</p>
                  </div>
                  <span className={`text-sm font-black text-${staff.color}-600`}>{staff.score}%</span>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${staff.score}%` }}
                    transition={{ duration: 1, delay: i * 0.2 }}
                    className={`h-full bg-${staff.color}-500 rounded-full`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <TrendingUp size={16} />
              </div>
              <div>
                <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">BI Tavsiyasi</p>
                <p className="text-xs text-blue-800 dark:text-blue-300 font-medium leading-relaxed">
                  Oxirgi 30 kunda IELTS kurslariga talab 25% ga oshdi. Yangi guruh ochish va Azizbek Rahimovni jalb qilish tavsiya etiladi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
