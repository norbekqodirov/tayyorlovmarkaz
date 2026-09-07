import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Target, Plus, Trash2, Edit2, RefreshCw, Loader2,
  CheckCircle, TrendingUp, DollarSign,
  Users, Zap, Save, BarChart2
} from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { Modal } from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { formatNumber } from '../../../utils/formatters';

interface Goal {
  id: string; title: string; description?: string;
  type: string; target: number; current: number; unit: string;
  period: string; month?: number | null; year: number;
  status: string; assignedTo?: string; createdAt: string;
}

const GOAL_TYPES = [
  { value: 'revenue', label: 'Daromad', icon: DollarSign, color: 'emerald' },
  { value: 'students', label: "Yangi o'quvchilar", icon: Users, color: 'blue' },
  { value: 'leads', label: 'Yangi lidlar', icon: Target, color: 'violet' },
  { value: 'conversion', label: 'Konversiya', icon: TrendingUp, color: 'amber' },
  { value: 'attendance', label: 'Davomat', icon: Zap, color: 'indigo' },
];

const COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400' },
};
const progress = (g: Goal) => g.target > 0 ? Math.max(0, Math.min(g.current / g.target * 100, 100)) : 0;
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

const fmt = (n: number, unit: string) => {
  if (unit === "so'm") return formatNumber(n) + " so'm";
  if (unit === '%') return n + '%';
  return n + ' ' + unit;
};

export default function CrmGoals() {
  const { showToast } = useToast();
  const [canWrite] = useState(() => {
    try { return ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(JSON.parse(localStorage.getItem('crm_user') || '{}').role); }
    catch { return false; }
  });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const writing = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const [form, setForm] = useState({
    title: '', description: '', type: 'revenue', target: '',
    unit: "so'm", period: 'monthly', month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [saving, setSaving] = useState(false);

  const fetchGoals = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const r = await api.get<{ data: Goal[] }>(`/goals?year=${filterYear}`);
      if (request === requestId.current) setGoals(r.data.data ?? []);
    } catch { if (request === requestId.current) { setError(true); setGoals([]); } }
    finally { if (request === requestId.current) setLoading(false); }
  }, [filterYear]);

  useEffect(() => { fetchGoals(); return () => { requestId.current++; }; }, [fetchGoals]);
  const closeModal = useCallback(() => { if (!writing.current) setIsModalOpen(false); }, []);

  const handleAutoSync = async () => {
    if (!canWrite || writing.current) return;
    writing.current = true;
    setSyncing(true);
    try {
      const r = await api.post<{ updated: number }>('/goals/auto-sync', {});
      showToast(`${r.data.updated} ta maqsad yangilandi`, 'success');
      fetchGoals();
    } catch { showToast('Sinxronlashda xatolik', 'error'); }
    finally { writing.current = false; setSyncing(false); }
  };

  const openModal = (goal?: Goal) => {
    if (goal) {
      setEditingGoal(goal);
      setForm({
        title: goal.title, description: goal.description || '',
        type: goal.type, target: String(goal.target),
        unit: goal.unit, period: goal.period,
        month: goal.month || new Date().getMonth() + 1,
        year: goal.year,
      });
    } else {
      setEditingGoal(null);
      setForm({
        title: '', description: '', type: 'revenue', target: '',
        unit: "so'm", period: 'monthly',
        month: new Date().getMonth() + 1, year: filterYear,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!canWrite || writing.current) return;
    const target = Number(form.target);
    if (!form.title.trim() || !Number.isFinite(target) || target <= 0) {
      showToast("Sarlavha va noldan katta maqsad qiymatini kiriting", 'error'); return;
    }
    if ((form.type === 'attendance' || form.type === 'conversion') && target > 100) {
      showToast("Foiz 100 dan oshmasligi kerak", 'error'); return;
    }
    if ((form.type === 'students' || form.type === 'leads') && !Number.isInteger(target)) {
      showToast("Maqsad soni butun bo'lishi kerak", 'error'); return;
    }
    if (!Number.isInteger(form.year) || form.year < 2024 || form.year > 2030) {
      showToast("Yil 2024–2030 oralig'ida bo'lishi kerak", 'error'); return;
    }
    const payload = { ...form, title: form.title.trim(), description: form.description.trim(), target,
      month: form.period === 'yearly' ? null : form.month };
    writing.current = true;
    setSaving(true);
    try {
      if (editingGoal) {
        await api.put(`/goals/${editingGoal.id}`, payload);
        showToast('Maqsad yangilandi', 'success');
      } else {
        await api.post('/goals', payload);
        showToast("Yangi maqsad qo'shildi", 'success');
      }
      setIsModalOpen(false);
      if (form.year !== filterYear) setFilterYear(form.year);
      else fetchGoals();
    } catch (e: any) { showToast(e.response?.data?.error || e.response?.data?.message || 'Xatolik', 'error'); }
    finally { writing.current = false; setSaving(false); }
  };

  const handleDelete = async () => {
    if (!canWrite || writing.current) return;
    writing.current = true;
    setDeleting(true);
    try {
      await api.delete(`/goals/${deleteConfirm.id}`);
      showToast("Maqsad o'chirildi", 'success');
      setDeleteConfirm({ open: false, id: '' });
      fetchGoals();
    } catch { showToast("O'chirishda xatolik", 'error'); }
    finally { writing.current = false; setDeleting(false); }
  };

  const typeInfo = (type: string) => GOAL_TYPES.find(t => t.value === type) || GOAL_TYPES[0];

  // Group by month
  const groupedGoals = goals.reduce<Record<string, Goal[]>>((acc, g) => {
    const key = g.period === 'quarterly' && g.month ? `${Math.ceil(g.month / 3)}-chorak`
      : g.period !== 'yearly' && g.month ? MONTHS[g.month - 1] : 'Yillik';
    acc[key] = [...(acc[key] || []), g];
    return acc;
  }, {});

  const inputCls = "w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  // Summary stats
  const totalGoals = goals.length;
  const completed = goals.filter(g => g.status === 'completed' || progress(g) >= 100).length;
  const avgProgress = goals.length > 0
    ? Math.round(goals.reduce((s, g) => s + progress(g), 0) / goals.length)
    : 0;

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <Target className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">KPI & Maqsadlar</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ko'rsatkichlar va rejalar boshqaruvi</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleAutoSync} disabled={!canWrite || syncing || saving || deleting}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg text-sm font-medium transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Joriy oyni sinxronlash
          </button>
          <button disabled={!canWrite || syncing || deleting} onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Maqsad qo'shish
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Sinxronlash joriy oyning faol maqsadlarini yangilaydi. Davomat va yillik maqsadlar avtomatik hisoblanmaydi.</p>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Jami maqsadlar', value: totalGoals, icon: Target, color: 'violet' },
          { label: 'Bajarilgan', value: completed, icon: CheckCircle, color: 'emerald' },
          { label: "O'rtacha progress", value: `${avgProgress}%`, icon: BarChart2, color: 'blue' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${COLORS[s.color].bg}`}>
              <s.icon className={`w-5 h-5 ${COLORS[s.color].text}`} />
            </div>
            <div>
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{loading || error ? '—' : s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Year filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Yil:</span>
        {[...new Set([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, filterYear])].sort().map(y => (
          <button key={y} disabled={syncing || saving || deleting} onClick={() => setFilterYear(y)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterYear === y ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}>{y}</button>
        ))}
      </div>

      {/* Goals */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
      ) : error ? (
        <div role="alert" className="text-center py-12 space-y-3">
          <p>Maqsadlarni yuklab bo'lmadi</p>
          <button onClick={fetchGoals} className="text-violet-600 underline">Qayta urinish</button>
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Hali maqsadlar yo'q</p>
          <p className="text-sm mt-1">Yangi maqsad qo'shing</p>
        </div>
      ) : Object.entries(groupedGoals).map(([monthLabel, monthGoals]) => (
        <div key={monthLabel} className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{monthLabel}</h3>
          {monthGoals.map(goal => {
            const ti = typeInfo(goal.type);
            const pct = Math.floor(progress(goal));
            const isCompleted = goal.status === 'completed' || pct >= 100;
            return (
              <div key={goal.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${COLORS[ti.color].bg} shrink-0`}>
                      <ti.icon className={`w-4 h-4 ${COLORS[ti.color].text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{goal.title}</p>
                      {goal.description && <p className="text-xs text-zinc-400 truncate">{goal.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isCompleted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : pct >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {isCompleted ? '✓ Bajarildi' : `${pct}%`}
                    </span>
                    <button aria-label="Maqsadni tahrirlash" disabled={!canWrite || syncing || deleting} onClick={() => openModal(goal)}
                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button aria-label="Maqsadni o'chirish" disabled={!canWrite || syncing || deleting} onClick={() => setDeleteConfirm({ open: true, id: goal.id })}
                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-2">
                  <motion.div
                    className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-violet-500'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>

                <div className="flex flex-wrap gap-2 items-center justify-between text-xs text-zinc-400">
                  <span>Joriy: <b className="text-zinc-700 dark:text-zinc-300">{fmt(goal.current, goal.unit)}</b></span>
                  <span>Maqsad: <b className="text-zinc-700 dark:text-zinc-300">{fmt(goal.target, goal.unit)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingGoal ? 'Maqsadni tahrirlash' : "Yangi maqsad qo'shish"}>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">
            <div>
              <label htmlFor="goal-field-1" className={labelCls}>Sarlavha *</label>
              <input id="goal-field-1" type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Masalan: Bu oy daromad maqsadi" className={inputCls} />
            </div>

            <div>
              <label htmlFor="goal-field-2" className={labelCls}>Tur</label>
              <select id="goal-field-2" disabled={!!editingGoal} value={form.type} onChange={e => {
                const defaultUnit = e.target.value === 'revenue' ? "so'm" : e.target.value === 'conversion' || e.target.value === 'attendance' ? '%' : 'ta';
                setForm(p => ({ ...p, type: e.target.value, unit: defaultUnit }));
              }} className={inputCls}>
                {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {editingGoal && <p className="text-xs text-zinc-500 mt-1">Maqsad turini tahrirlab bo'lmaydi.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="goal-field-3" className={labelCls}>Maqsad qiymati *</label>
                <input id="goal-field-3" type="number" min={0.01} step="any" required value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}
                  placeholder="10000000" className={inputCls} />
              </div>
              <div>
                <label htmlFor="goal-field-4" className={labelCls}>Birlik</label>
                <select id="goal-field-4" disabled value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
                  <option value="ta">ta</option>
                  <option value="so'm">so'm</option>
                  <option value="%">%</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="goal-field-5" className={labelCls}>Davr</label>
                <select id="goal-field-5" aria-label="Davr" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} className={inputCls}>
                  <option value="monthly">Oylik</option><option value="yearly">Yillik</option>
                  {editingGoal?.period === 'quarterly' && <option value="quarterly">Choraklik</option>}
                </select>
                <label htmlFor="goal-field-6" className={labelCls}>Oy</label>
                <select id="goal-field-6" disabled={form.period === 'yearly'} value={form.month} onChange={e => setForm(p => ({ ...p, month: +e.target.value }))} className={inputCls}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="goal-field-7" className={labelCls}>Yil</label>
                <input id="goal-field-7" type="number" min={2024} max={2030} value={form.year} onChange={e => setForm(p => ({ ...p, year: +e.target.value }))} className={inputCls} />
              </div>
            </div>

            <div>
              <label htmlFor="goal-field-8" className={labelCls}>Tavsif</label>
              <textarea id="goal-field-8" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Qo'shimcha ma'lumot..." className={`${inputCls} resize-none`} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={closeModal}
                className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Bekor qilish
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Saqlash
              </button>
            </div>
          </fieldset>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Maqsadni o'chirish"
        message="Bu maqsadni o'chirishni tasdiqlaysizmi?"
        onConfirm={handleDelete}
        confirmText={deleting ? "O'chirilmoqda..." : "Ha, o'chirish"}
        onCancel={() => { if (!writing.current) setDeleteConfirm({ open: false, id: '' }); }}
      />
    </div>
  );
}
