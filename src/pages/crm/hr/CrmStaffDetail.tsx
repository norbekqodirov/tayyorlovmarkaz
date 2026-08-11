import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Mail, Phone, Briefcase, DollarSign, Edit2, Trash2,
  ShieldCheck, Clock, Plus, Building2, Calendar
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { ErrorState } from '../../../components/States';
import { SkeletonCard } from '../../../components/Skeleton';
import api from '../../../api/client';
import { formatNumber } from '../../../utils/formatters';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  salary: number;
  joinedDate: string;
  status: 'Faol' | 'Ta\'tilda' | 'Ishdan bo\'shagan';
  department: string;
  address?: string;
  passport?: string;
  education?: string;
  experience?: string;
}

interface AttendanceRow { id: string; date: string; status: string; checkIn?: string; checkOut?: string; notes?: string; }
interface SalaryRow { id: string; month: string; baseSalary: number; bonus: number; deduction: number; total: number; paid: boolean; notes?: string; }
interface TaskRow { id: string; title: string; completed: boolean; priority: 'Low' | 'Medium' | 'High'; deadline?: string; }
interface ReviewRow { id: string; date: string; reviewer: string; feedback: string; rating: number; }
interface DocRow { id: string; name: string; type: string; uploadDate: string; }

const TABS = [
  { id: 'overview', label: 'Umumiy', icon: User },
  { id: 'attendance', label: 'Davomat', icon: Clock },
  { id: 'salary', label: 'Maosh', icon: DollarSign },
  { id: 'tasks', label: 'Vazifalar', icon: Briefcase },
  { id: 'reviews', label: 'Fikrlar', icon: ShieldCheck },
  { id: 'docs', label: 'Hujjatlar', icon: Plus },
] as const;

export default function CrmStaffDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: staff = [], loading } = useFirestore<StaffMember>('staff');
  const { showToast } = useToast();

  const member = (staff || []).find(s => s.id === id) || null;

  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('overview');
  const [isSubModalOpen, setIsSubModalOpen] = useState<{ type: string; isOpen: boolean }>({ type: '', isOpen: false });
  const [deleteSubConfirm, setDeleteSubConfirm] = useState<{ open: boolean; type: string; index: number }>({ open: false, type: '', index: -1 });
  const [editingSubItemIndex, setEditingSubItemIndex] = useState<number | null>(null);
  const [subFormData, setSubFormData] = useState<any>({});
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [docRows, setDocRows] = useState<DocRow[]>([]);

  const loadStaffExtras = useCallback(async (staffId: string) => {
    try {
      const [att, sal, tasks, reviews, docs] = await Promise.all([
        api.get(`/salary/attendance?staffId=${staffId}`),
        api.get(`/salary/staff/${staffId}`),
        api.get('/tasks'),
        api.get('/performanceReviews'),
        api.get('/staffDocuments'),
      ]);
      setAttendanceRows(att.data || []);
      setSalaryRows(sal.data || []);
      setTaskRows((tasks.data || []).filter((t: any) => t.staffId === staffId));
      setReviewRows((reviews.data || []).filter((r: any) => r.staffId === staffId));
      setDocRows((docs.data || []).filter((d: any) => d.staffId === staffId));
    } catch (error) {
      console.error('Error loading staff extras:', error);
    }
  }, []);

  useEffect(() => { if (id) loadStaffExtras(id); }, [id, loadStaffExtras]);

  // type bo'yicha lokal ro'yxat + uni bevosita yangilaydigan setter — har bir
  // "sub-item" turi haqiqiy jadvalga (StaffAttendance/Salary/Task/
  // PerformanceReview/StaffDocument) yoziladi, StaffMember'ning o'ziga emas.
  const subItemRows = (type: string): any[] =>
    type === 'attendance' ? attendanceRows : type === 'salary' ? salaryRows
    : type === 'tasks' ? taskRows : type === 'reviews' ? reviewRows : docRows;
  const setSubItemRows = (type: string, rows: any[]) => {
    if (type === 'attendance') setAttendanceRows(rows);
    else if (type === 'salary') setSalaryRows(rows);
    else if (type === 'tasks') setTaskRows(rows);
    else if (type === 'reviews') setReviewRows(rows);
    else setDocRows(rows);
  };

  const handleAddSubItem = (type: string, index: number | null = null) => {
    setEditingSubItemIndex(index);
    if (index !== null) {
      setSubFormData(subItemRows(type)[index]);
    } else {
      setSubFormData({});
      if (type === 'attendance') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], status: 'present', checkIn: '09:00', checkOut: '18:00' });
      } else if (type === 'salary') {
        setSubFormData({ month: new Date().toISOString().slice(0, 7), baseSalary: member?.salary || 0, bonus: 0, deduction: 0, notes: '' });
      } else if (type === 'tasks') {
        setSubFormData({ title: '', completed: false, priority: 'Medium', deadline: new Date().toISOString().split('T')[0] });
      } else if (type === 'reviews') {
        setSubFormData({ date: new Date().toISOString().split('T')[0], reviewer: 'Admin', feedback: '', rating: 5 });
      } else if (type === 'docs') {
        setSubFormData({ name: '', type: 'Passport nusxasi' });
      }
    }
    setIsSubModalOpen({ type, isOpen: true });
  };

  const handleDeleteSubItem = (type: string, index: number) => {
    setDeleteSubConfirm({ open: true, type, index });
  };

  const confirmDeleteSubItem = async () => {
    const { type, index } = deleteSubConfirm;
    const row = subItemRows(type)[index];
    try {
      if (type === 'attendance') await api.delete(`/staff-attendance/${row.id}`);
      else if (type === 'salary') await api.delete(`/salary/${row.id}`);
      else await api.delete(`/${type === 'tasks' ? 'tasks' : type === 'reviews' ? 'performanceReviews' : 'staffDocuments'}/${row.id}`);
      setSubItemRows(type, subItemRows(type).filter((_, i) => i !== index));
      showToast('Ma\'lumot o\'chirildi', 'success');
    } catch (error) {
      console.error("Error deleting sub item:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
    setDeleteSubConfirm({ open: false, type: '', index: -1 });
  };

  const saveSubItem = async () => {
    if (!member) return;
    const type = isSubModalOpen.type;
    const editingRow = editingSubItemIndex !== null ? subItemRows(type)[editingSubItemIndex] : null;

    try {
      let saved: any;
      if (type === 'attendance') {
        const res = await api.post('/salary/attendance', { staffId: member.id, ...subFormData });
        saved = res.data;
      } else if (type === 'salary') {
        const res = await api.post('/salary', { staffId: member.id, ...subFormData });
        saved = res.data;
      } else if (type === 'tasks') {
        const res = editingRow
          ? await api.put(`/tasks/${editingRow.id}`, subFormData)
          : await api.post('/tasks', { ...subFormData, staffId: member.id });
        saved = res.data;
      } else if (type === 'reviews') {
        const res = editingRow
          ? await api.put(`/performanceReviews/${editingRow.id}`, subFormData)
          : await api.post('/performanceReviews', { ...subFormData, staffId: member.id });
        saved = res.data;
      } else {
        const payload = { ...subFormData, uploadDate: subFormData.uploadDate || new Date().toISOString().split('T')[0] };
        const res = editingRow
          ? await api.put(`/staffDocuments/${editingRow.id}`, payload)
          : await api.post('/staffDocuments', { ...payload, staffId: member.id });
        saved = res.data;
      }

      const rows = subItemRows(type);
      if (editingSubItemIndex !== null && editingRow) {
        setSubItemRows(type, rows.map((r, i) => i === editingSubItemIndex ? saved : r));
      } else {
        setSubItemRows(type, [saved, ...rows]);
      }

      setIsSubModalOpen({ type: '', isOpen: false });
      setEditingSubItemIndex(null);
      showToast('Ma\'lumot saqlandi', 'success');
    } catch (error) {
      console.error("Error saving sub item:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
  };

  const markSalaryPaid = async (salaryId: string) => {
    try {
      const res = await api.put(`/salary/${salaryId}/pay`, {});
      setSalaryRows(rows => rows.map(r => r.id === salaryId ? res.data : r));
      showToast("Oylik to'landi deb belgilandi va moliyaga yozildi", 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (!member) {
    return <ErrorState message="Xodim topilmadi" onRetry={() => navigate('/crmtayyorlovmarkaz/staff')} />;
  }

  return (
    <div className="space-y-5">
      <ConfirmDialog
        isOpen={deleteSubConfirm.open}
        title="Ma'lumotni o'chirish"
        message="Haqiqatan ham ushbu ma'lumotni o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDeleteSubItem}
        onCancel={() => setDeleteSubConfirm({ open: false, type: '', index: -1 })}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/crmtayyorlovmarkaz/staff')}
          className="p-2 rounded-xl bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{member.name}</h1>
          <p className="text-xs text-zinc-400 mt-0.5 font-medium">{member.role} · {member.department}</p>
        </div>
      </div>

      {/* Profile Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 shadow-xl shadow-blue-500/20">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-8 w-44 h-44 rounded-full bg-white/5" />
        </div>
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center text-white text-3xl font-black shadow-2xl shrink-0">
            {(member.name || '?').charAt(0)}
          </div>

          <div className="flex-1 min-w-0 text-white">
            <h2 className="text-2xl font-black leading-tight">{member.name}</h2>
            <p className="text-white/70 text-sm mt-1">{member.role} · {member.department}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-white/70">
              <span className="flex items-center gap-1.5"><Phone size={11} /> {member.phone || '—'}</span>
              <span className="flex items-center gap-1.5"><Mail size={11} /> {member.email || '—'}</span>
              {member.joinedDate && <span className="flex items-center gap-1.5"><Calendar size={11} /> {member.joinedDate}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 shrink-0">
            <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 min-w-[90px]">
              <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Maosh</span>
              <span className="text-white font-black text-sm leading-tight mt-0.5">{formatNumber(member.salary)}</span>
            </div>
            <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 min-w-[90px]">
              <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Holat</span>
              <span className="text-white font-black text-sm leading-tight mt-0.5">{member.status}</span>
            </div>
          </div>

          <Button variant="secondary" onClick={() => navigate(`/crmtayyorlovmarkaz/staff?edit=${member.id}`)} leftIcon={<Edit2 size={14} />} className="!bg-white/15 !text-white hover:!bg-white/25 shrink-0">
            Tahrirlash
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-1 flex overflow-x-auto scrollbar-hide gap-1 shadow-sm">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-6 shadow-sm">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <User size={14} /> Shaxsiy Ma'lumotlar
                </h4>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Passport</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{member.passport || 'Kiritilmagan'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Manzil</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{member.address || 'Kiritilmagan'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Ta'lim</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{member.education || 'Kiritilmagan'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Tajriba</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{member.experience || 'Kiritilmagan'}</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5"><Building2 size={12} /> Ish Faoliyati</h4>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Bo'lim</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{member.department}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Maosh</p>
                    <p className="text-lg font-black text-emerald-600">{formatNumber(member.salary)} UZS</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Ish boshlagan</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{member.joinedDate}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Davomat Tarixi</h4>
              <Button size="sm" onClick={() => handleAddSubItem('attendance')}>Davomatni belgilash</Button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sana</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kelgan vaqti</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ketgan vaqti</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {attendanceRows.map((a, i) => (
                    <tr key={a.id || i} className="group">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${a.status === 'present' ? 'bg-emerald-100 text-emerald-600' : a.status === 'late' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                          {a.status === 'present' ? 'Kelgan' : a.status === 'late' ? 'Kechikkan' : 'Kelmagan'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.checkIn || '--:--'}</td>
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{a.checkOut || '--:--'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleAddSubItem('attendance', i)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteSubItem('attendance', i)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {attendanceRows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-bold italic">Davomat ma'lumotlari mavjud emas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'salary' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">To'lovlar Tarixi</h4>
              <Button size="sm" onClick={() => handleAddSubItem('salary')}>To'lov qo'shish</Button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Oy</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Asosiy + Bonus − Ushlab qolish</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jami</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {salaryRows.map((h, i) => (
                    <tr key={h.id || i} className="group">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-zinc-300">{h.month}</td>
                      <td className="px-6 py-4 text-xs font-bold text-zinc-500">
                        {formatNumber(h.baseSalary)} + {formatNumber(h.bonus)} − {formatNumber(h.deduction)}
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900 dark:text-white">{formatNumber(h.total)} UZS</td>
                      <td className="px-6 py-4">
                        {h.paid ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">To'landi</span>
                        ) : (
                          <button onClick={() => markSalaryPaid(h.id)} className="px-2 py-1 bg-amber-100 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 transition-colors">To'lash</button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleAddSubItem('salary', i)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteSubItem('salary', i)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salaryRows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500 font-bold italic">To'lovlar tarixi mavjud emas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Vazifalar</h4>
              <Button size="sm" onClick={() => handleAddSubItem('tasks')}>Vazifa Qo'shish</Button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {taskRows.map((task, i) => (
                <div key={task.id} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={async () => {
                        const res = await api.put(`/tasks/${task.id}`, { completed: !task.completed });
                        setTaskRows(rows => rows.map(r => r.id === task.id ? res.data : r));
                      }}
                      className={`w-4 h-4 rounded-full border-2 ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-amber-400'}`}
                      title={task.completed ? 'Bajarilgan' : 'Bajarilmagan'}
                    />
                    <div>
                      <p className={`font-bold text-slate-900 dark:text-white ${task.completed ? 'line-through opacity-50' : ''}`}>{task.title}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Muddati: {task.deadline || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${task.priority === 'High' ? 'bg-rose-100 text-rose-600' : task.priority === 'Medium' ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-600'}`}>
                      {task.priority}
                    </span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleAddSubItem('tasks', i)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => handleDeleteSubItem('tasks', i)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {taskRows.length === 0 && (
                <div className="py-12 text-center text-zinc-500 font-bold italic">Vazifalar mavjud emas</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Fikrlar va Baholash</h4>
              <Button size="sm" onClick={() => handleAddSubItem('reviews')}>Fikr Qoldirish</Button>
            </div>
            <div className="space-y-4">
              {reviewRows.map((review, i) => (
                <div key={review.id || i} className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 group relative">
                  <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleAddSubItem('reviews', i)} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 rounded-lg"><Edit2 size={14} /></button>
                    <button onClick={() => handleDeleteSubItem('reviews', i)} className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-black text-slate-900 dark:text-white">{review.reviewer}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{review.date}</p>
                    </div>
                    <div className="flex gap-1 mr-16">
                      {[1, 2, 3, 4, 5].map(star => (
                        <span key={star} className={`text-lg ${star <= review.rating ? 'text-amber-400' : 'text-zinc-300'}`}>★</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-zinc-300 font-medium leading-relaxed">{review.feedback}</p>
                </div>
              ))}
              {reviewRows.length === 0 && (
                <div className="py-12 text-center text-zinc-500 font-bold italic">Fikrlar mavjud emas</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Hujjatlar</h4>
                <p className="text-[10px] text-zinc-400 mt-0.5">Fayl saqlanmaydi — faqat nom/tur/sana yozuvi</p>
              </div>
              <Button size="sm" onClick={() => handleAddSubItem('docs')}>Hujjat Qo'shish</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {docRows.map((doc, i) => (
                <div key={doc.id || i} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between group hover:border-blue-500 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-blue-600 transition-colors">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{doc.name}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{doc.type} • {doc.uploadDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleAddSubItem('docs', i)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg"><Edit2 size={14} /></button>
                    <button onClick={() => handleDeleteSubItem('docs', i)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {docRows.length === 0 && (
                <div className="md:col-span-2 py-12 text-center text-zinc-500 font-bold italic">Hujjatlar mavjud emas</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sub-item Modal */}
      <Modal
        isOpen={isSubModalOpen.isOpen}
        onClose={() => setIsSubModalOpen({ type: '', isOpen: false })}
        title={
          isSubModalOpen.type === 'attendance' ? 'Davomatni belgilash' :
          isSubModalOpen.type === 'salary' ? "To'lov qo'shish" :
          isSubModalOpen.type === 'tasks' ? 'Vazifa qo\'shish' :
          isSubModalOpen.type === 'reviews' ? 'Fikr qoldirish' :
          'Hujjat yuklash'
        }
      >
        <div className="space-y-4">
          {isSubModalOpen.type === 'attendance' && (
            <>
              <Input type="date" label="Sana" value={subFormData.date} onChange={(e) => setSubFormData({ ...subFormData, date: e.target.value })} />
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                <select value={subFormData.status} onChange={(e) => setSubFormData({ ...subFormData, status: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                  <option value="present">Kelgan</option>
                  <option value="absent">Kelmagan</option>
                  <option value="late">Kechikkan</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input type="time" label="Kelgan vaqti" value={subFormData.checkIn} onChange={(e) => setSubFormData({ ...subFormData, checkIn: e.target.value })} />
                <Input type="time" label="Ketgan vaqti" value={subFormData.checkOut} onChange={(e) => setSubFormData({ ...subFormData, checkOut: e.target.value })} />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'salary' && (
            <>
              <Input type="month" label="Oy" value={subFormData.month} onChange={(e) => setSubFormData({ ...subFormData, month: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <MoneyInput label="Asosiy" value={subFormData.baseSalary} onChange={(baseSalary) => setSubFormData({ ...subFormData, baseSalary })} />
                <MoneyInput label="Bonus" value={subFormData.bonus} onChange={(bonus) => setSubFormData({ ...subFormData, bonus })} />
                <MoneyInput label="Ushlab qolish" value={subFormData.deduction} onChange={(deduction) => setSubFormData({ ...subFormData, deduction })} />
              </div>
              <Input label="Izoh (ixtiyoriy)" value={subFormData.notes || ''} onChange={(e) => setSubFormData({ ...subFormData, notes: e.target.value })} />
            </>
          )}

          {isSubModalOpen.type === 'tasks' && (
            <>
              <Input label="Vazifa nomi" value={subFormData.title} onChange={(e) => setSubFormData({ ...subFormData, title: e.target.value })} placeholder="Masalan: Hisobot tayyorlash" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Muhimlik</label>
                  <select value={subFormData.priority} onChange={(e) => setSubFormData({ ...subFormData, priority: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                    <option value="Low">Past</option>
                    <option value="Medium">O'rta</option>
                    <option value="High">Yuqori</option>
                  </select>
                </div>
                <Input type="date" label="Muddati" value={subFormData.deadline} onChange={(e) => setSubFormData({ ...subFormData, deadline: e.target.value })} />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'reviews' && (
            <>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Baholash (1-5)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setSubFormData({ ...subFormData, rating: star })} className={`text-2xl ${star <= subFormData.rating ? 'text-amber-400' : 'text-zinc-300'}`}>★</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fikr-mulohaza</label>
                <textarea value={subFormData.feedback} onChange={(e) => setSubFormData({ ...subFormData, feedback: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white resize-none" rows={4} placeholder="Xodim faoliyati haqida fikringiz..." />
              </div>
            </>
          )}

          {isSubModalOpen.type === 'docs' && (
            <>
              <Input label="Hujjat nomi" value={subFormData.name} onChange={(e) => setSubFormData({ ...subFormData, name: e.target.value })} placeholder="Masalan: Passport nusxasi" />
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Turi</label>
                <select value={subFormData.type} onChange={(e) => setSubFormData({ ...subFormData, type: e.target.value })} className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold dark:text-white">
                  <option value="Passport nusxasi">Passport nusxasi</option>
                  <option value="Diplom">Diplom</option>
                  <option value="Shartnoma">Shartnoma</option>
                  <option value="Sertifikat">Sertifikat</option>
                </select>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={() => setIsSubModalOpen({ type: '', isOpen: false })}>Bekor qilish</Button>
            <Button onClick={saveSubItem}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
