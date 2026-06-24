import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, User,
  GraduationCap, DollarSign, CheckCircle2, AlertTriangle,
  Clock, TrendingUp, BookOpen, Edit2, Save, X,
  BarChart3, FileText, UserPlus
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

interface StudentProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: string | null;
  parentName: string | null;
  parentPhone: string | null;
  course: string | null;
  group: string | null;
  paymentStatus: string | null;
  balance: number | null;
  status: string;
  joinedDate: string | null;
  notes: string | null;
  source: string | null;
  photo: string | null;
  enrollments: { id: string; group: { id: string; name: string; course: { name: string } | null } }[];
  payments: { id: string; amount: number; date: string; method: string; status: string; notes: string | null }[];
  assessments: { id: string; title: string | null; type: string; score: number; maxScore: number; date: string; subject: string | null }[];
  attendanceRecords: { id: string; date: string; status: string; note: string | null }[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  Faol: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  graduated: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  Bitiruvchi: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  left: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  'Tark etgan': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  Muzlatilgan: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Faol', Faol: 'Faol',
  graduated: 'Bitiruvchi', Bitiruvchi: 'Bitiruvchi',
  left: 'Tark etgan', 'Tark etgan': 'Tark etgan',
  Muzlatilgan: 'Muzlatilgan',
};

function formatMoney(v: number) {
  return new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m';
}

export default function CrmStudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'attendance' | 'grades'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StudentProfile>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/students/${id}`)
      .then(r => { setStudent(r.data); setEditForm(r.data); })
      .catch(() => showToast("Ma'lumot yuklanmadi", 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!id || !editForm) return;
    try {
      await api.put(`/students/${id}`, editForm);
      setStudent(s => s ? { ...s, ...editForm } : s);
      setIsEditing(false);
      showToast("Ma'lumotlar saqlandi", 'success');
    } catch { showToast("Saqlashda xatolik", 'error'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-10 h-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );

  if (!student) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <AlertTriangle size={32} className="text-zinc-300" />
      <p className="text-zinc-500 font-bold">Talaba topilmadi</p>
      <Button onClick={() => navigate(-1)} leftIcon={<ArrowLeft size={14} />} variant="secondary">Orqaga</Button>
    </div>
  );

  const totalPaid = student.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const presentCount = student.attendanceRecords.filter(a => a.status === 'present').length;
  const attendanceRate = student.attendanceRecords.length > 0
    ? Math.round((presentCount / student.attendanceRecords.length) * 100) : 0;
  const avgScore = student.assessments.length > 0
    ? Math.round(student.assessments.reduce((s, a) => s + (a.score / a.maxScore) * 100, 0) / student.assessments.length) : 0;

  const paymentChartData = (() => {
    const byMonth: Record<string, number> = {};
    student.payments.forEach(p => {
      const month = (p.date || '').slice(0, 7);
      if (month) byMonth[month] = (byMonth[month] || 0) + p.amount;
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
      .map(([month, amount]) => ({ month: month.slice(5), amount }));
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
          <ArrowLeft size={18} className="text-zinc-500" />
        </button>
        <div>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Talaba Profili</p>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">{student.name}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(false)} leftIcon={<X size={14} />}>Bekor</Button>
              <Button onClick={handleSave} leftIcon={<Save size={14} />}>Saqlash</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setIsEditing(true)} leftIcon={<Edit2 size={14} />}>Tahrirlash</Button>
          )}
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm p-5">
        <div className="flex flex-col md:flex-row gap-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shrink-0">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{student.name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS_COLORS[student.status] || STATUS_COLORS.left}`}>
                  {STATUS_LABELS[student.status] || student.status}
                </span>
              </div>
              {isEditing ? (
                <div className="space-y-2 mt-2">
                  <input placeholder="Telefon" value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="block w-full px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                  <input placeholder="Email" value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="block w-full px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                  <input placeholder="Manzil" value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                    className="block w-full px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {student.phone && <span className="text-sm text-zinc-500 flex items-center gap-1.5"><Phone size={12} /> {student.phone}</span>}
                  {student.email && <span className="text-sm text-zinc-500 flex items-center gap-1.5"><Mail size={12} /> {student.email}</span>}
                  {student.address && <span className="text-sm text-zinc-500 flex items-center gap-1.5"><MapPin size={12} /> {student.address}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="md:ml-auto grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Jami to'lagan", value: formatMoney(totalPaid), icon: DollarSign, color: 'text-emerald-600' },
              { label: 'Davomat', value: `${attendanceRate}%`, icon: CheckCircle2, color: 'text-blue-600' },
              { label: "O'rt. baho", value: `${avgScore}%`, icon: BarChart3, color: 'text-violet-600' },
              { label: 'Guruhlar', value: String(student.enrollments.length), icon: GraduationCap, color: 'text-amber-600' },
            ].map((stat, i) => (
              <div key={i} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl text-center">
                <stat.icon size={16} className={`mx-auto mb-1 ${stat.color}`} />
                <p className="text-sm font-black text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-[10px] text-zinc-400 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Kurs', value: student.course || '—', icon: BookOpen },
            { label: 'Guruh', value: student.group || '—', icon: GraduationCap },
            { label: "Qo'shilgan sana", value: student.joinedDate || '—', icon: Calendar },
            { label: 'Manba', value: student.source || '—', icon: TrendingUp },
          ].map((info, i) => (
            <div key={i}>
              <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-0.5">{info.label}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <info.icon size={12} className="text-zinc-400" /> {info.value}
              </p>
            </div>
          ))}
        </div>

        {/* Ota-ona */}
        {(student.parentName || student.parentPhone) && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-2">Ota-ona</p>
            <div className="flex items-center gap-4">
              {student.parentName && (
                <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <UserPlus size={12} className="text-zinc-400" /> {student.parentName}
                </span>
              )}
              {student.parentPhone && (
                <a href={`tel:${student.parentPhone}`} className="text-sm text-blue-500 font-bold flex items-center gap-1.5 hover:underline">
                  <Phone size={12} /> {student.parentPhone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Izoh */}
        {isEditing ? (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-1.5">Izohlar</p>
            <textarea rows={3} placeholder="Talaba haqida izoh..." value={editForm.notes || ''}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none" />
          </div>
        ) : student.notes ? (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-1">Izohlar</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{student.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700">
        {[
          { key: 'overview', label: 'Umumiy' },
          { key: 'payments', label: `To'lovlar (${student.payments.length})` },
          { key: 'attendance', label: `Davomat (${student.attendanceRecords.length})` },
          { key: 'grades', label: `Baholar (${student.assessments.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.key ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm p-5">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">To'lov Tarixi Grafigi</h3>
            {paymentChartData.length > 0 ? (
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={paymentChartData}>
                    <defs>
                      <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a', fontWeight: 700 }} width={50}
                      tickFormatter={v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : String(v)} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ borderRadius: '10px', fontSize: 11 }} />
                    <Area type="monotone" dataKey="amount" name="To'lov" stroke="#3b82f6" fill="url(#payGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center">
                <p className="text-sm text-zinc-400">To'lovlar mavjud emas</p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm p-5">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Guruhlar Tarixi</h3>
            {student.enrollments.length === 0 ? (
              <p className="text-sm text-zinc-400">Guruhga yozilmagan</p>
            ) : (
              <div className="space-y-2">
                {student.enrollments.map(e => (
                  <Link key={e.id} to={`/crmtayyorlovmarkaz/groups/${e.group.id}`}
                    className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors group">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600">{e.group.name}</p>
                      {e.group.course && <p className="text-[10px] text-zinc-400">{e.group.course.name}</p>}
                    </div>
                    <GraduationCap size={14} className="text-zinc-400 group-hover:text-blue-500" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payments */}
      {activeTab === 'payments' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          {student.payments.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">To'lovlar mavjud emas</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sana</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Summa</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Usul</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Holat</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Izoh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {student.payments.sort((a, b) => b.date.localeCompare(a.date)).map(p => (
                  <tr key={p.id}>
                    <td className="px-5 py-3"><span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{p.date}</span></td>
                    <td className="px-5 py-3 font-black text-sm text-emerald-600">+{formatMoney(p.amount)}</td>
                    <td className="px-5 py-3 text-sm text-zinc-600 dark:text-zinc-400">{p.method}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status === 'paid' ? "To'landi" : 'Kutilmoqda'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-400">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Attendance */}
      {activeTab === 'attendance' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-zinc-500">Keldi: {presentCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-xs font-bold text-zinc-500">Kelmadi: {student.attendanceRecords.filter(a => a.status === 'absent').length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs font-bold text-zinc-500">Kech: {student.attendanceRecords.filter(a => a.status === 'late').length}</span>
            </div>
            <span className="ml-auto text-sm font-black text-blue-600">{attendanceRate}%</span>
          </div>
          {student.attendanceRecords.length === 0 ? (
            <div className="py-12 text-center">
              <Clock size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Davomat yozuvlari yo'q</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[400px] overflow-y-auto">
              {student.attendanceRecords.sort((a, b) => b.date.localeCompare(a.date)).map(a => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{a.date}</span>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                    a.status === 'present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                    a.status === 'absent' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                    a.status === 'late' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>
                    {a.status === 'present' ? 'Keldi' : a.status === 'absent' ? 'Kelmadi' : a.status === 'late' ? 'Kech' : 'Uzrli'}
                  </span>
                  {a.note && <span className="text-xs text-zinc-400">{a.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grades */}
      {activeTab === 'grades' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          {student.assessments.length === 0 ? (
            <div className="py-12 text-center">
              <FileText size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Baholar mavjud emas</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sana</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Nom</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Tur</th>
                  <th className="px-5 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Ball</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {student.assessments.sort((a, b) => b.date.localeCompare(a.date)).map(a => {
                  const pct = Math.round((a.score / a.maxScore) * 100);
                  return (
                    <tr key={a.id}>
                      <td className="px-5 py-3"><span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{a.date}</span></td>
                      <td className="px-5 py-3 text-sm font-bold text-slate-900 dark:text-white">{a.title || a.subject || 'Test'}</td>
                      <td className="px-5 py-3"><span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-[10px] font-bold">{a.type}</span></td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-black text-sm ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {a.score}/{a.maxScore}
                        </span>
                        <span className="text-[10px] text-zinc-400 ml-1">({pct}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
