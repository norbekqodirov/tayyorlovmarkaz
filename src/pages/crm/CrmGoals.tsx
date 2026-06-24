import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, Trash2, Edit2, RefreshCw, Loader2,
  CheckCircle, AlertTriangle, TrendingUp, DollarSign,
  Users, Zap, X, Save, BarChart2
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Goal {
  id: string; title: string; description?: string;
  type: string; target: number; current: number; unit: string;
  period: string; month?: number; year: number;
  status: string; assignedTo?: string; createdAt: string;
}

const GOAL_TYPES = [
  { value: 'revenue', label: 'Daromad', icon: DollarSign, color: 'emerald' },
  { value: 'students', label: "Yangi o'quvchilar", icon: Users, color: 'blue' },
  { value: 'leads', label: 'Yangi lidlar', icon: Target, color: 'violet' },
  { value: 'conversion', label: 'Konversiya', icon: TrendingUp, color: 'amber' },
  { value: 'attendance', label: 'Davomat', icon: Zap, color: 'indigo' },
];

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

const fmt = (n: number, unit: string) => {
  if (unit === "so'm") return new Intl.NumberFormat('uz-UZ').format(n) + " so'm";
  if (unit === '%') return n + '%';
  return n + ' ' + unit;
};

export default function CrmGoals() {
  const { showToast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const r = await api.get<{ data: Goal[] }>(`/goals?year=${filterYear}`);
      setGoals(r.data.data ?? []);
    } catch { showToast("Maqsadlarni yuklab bo'lmadi", 'error'); }
    finally { setLoading(false); }
  }, [filterYear]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const handleAutoSync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ metrics: any; updated: number }>('/goals/auto-sync', {});
      showToast(`${r.data.updated} ta maqsad yangilandi`, 'success');
      fetchGoals();
    } catch { showToast('Sinxronlashda xatolik', 'error'); }
    finally { setSyncing(false); }
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
        month: new Date().getMonth() + 1, year: new Date().getFullYear(),
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.target) { showToast("Sarlavha va maqsad kiritilishi shart", 'error'); return; }
    setSaving(true);
    try {
      if (editingGoal) {
        await api.put(`/goals/${editingGoal.id}`, { ...form, target: Number(form.target) });
        showToast('Maqsad yangilandi', 'success');
      } else {
        await api.post('/goals', { ...form, target: Number(form.target) });
        showToast("Yangi maqsad qo'shildi", 'success');
      }
      setIsModalOpen(false);
      fetchGoals();
    } catch (e: any) { showToast(e.response?.data?.error || 'Xatolik', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/goals/${deleteConfirm.id}`);
      showToast("Maqsad o'chirildi", 'success');
      setDeleteConfirm({ open: false, id: '' });
      fetchGoals();
    } catch { showToast("O'chirishda xatolik", 'error'); }
  };

  const typeInfo = (type: string) => GOAL_TYPES.find(t => t.value === type) || GOAL_TYPES[0];

  // Group by month
  const groupedGoals = goals.reduce<Record<string, Goal[]>>((acc, g) => {
    const key = g.month ? MONTHS[g.month - 1] : 'Yillik';
    acc[key] = [...(acc[key] || []), g];
    return acc;
  }, {});

  const inputCls = "w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  // Summary stats
  const totalGoals = goals.length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const avgProgress = goals.length > 0
    ? Math.round(goals.reduce((s, g) => s + Math.min((g.current / g.target) * 100, 100), 0) / goals.length)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <Target className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">KPI & Maqsadlar</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ko'rsatkichlar va rejalar boshqaruvi</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAutoSync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg text-sm font-medium transition-colors">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sinxron
          </button>
          <button onClick={() => openModal()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Maqsad qo'shish
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Jami maqsadlar', value: totalGoals, icon: Target, color: 'violet' },
          { label: 'Bajarilgan', value: completed, icon: CheckCircle, color: 'emerald' },
          { label: "O'rtacha progress", value: `${avgProgress}%`, icon: BarChart2, color: 'blue' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-${s.color}-100 dark:bg-${s.color}-900/30`}>
              <s.icon className={`w-5 h-5 text-${s.color}-600 dark:text-${s.color}-400`} />
            </div>
            <div>
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Year filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">Yil:</span>
        {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
          <button key={y} onClick={() => setFilterYear(y)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterYear === y ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}>{y}</button>
        ))}
      </div>

      {/* Goals */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
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
            const pct = goal.target > 0 ? Math.min(Math.round((goal.current / goal.target) * 100), 100) : 0;
            const isCompleted = goal.status === 'completed' || pct >= 100;
            return (
              <div key={goal.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg bg-${ti.color}-100 dark:bg-${ti.color}-900/30 shrink-0`}>
                      <ti.icon className={`w-4 h-4 text-${ti.color}-600 dark:text-${ti.color}-400`} />
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
                    <button onClick={() => openModal(goal)}
                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ open: true, id: goal.id })}
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

                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Joriy: <b className="text-zinc-700 dark:text-zinc-300">{fmt(goal.current, goal.unit)}</b></span>
                  <span>Maqsad: <b className="text-zinc-700 dark:text-zinc-300">{fmt(goal.target, goal.unit)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
                  {editingGoal ? 'Maqsadni tahrirlash' : "Yangi maqsad qo'shish"}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <div>
                <label className={labelCls}>Sarlavha *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Masalan: Bu oy daromad maqsadi" className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Tur</label>
                <select value={form.type} onChange={e => {
                  const ti = GOAL_TYPES.find(t => t.value === e.target.value);
                  const defaultUnit = e.target.value === 'revenue' ? "so'm" : e.target.value === 'conversion' || e.target.value === 'attendance' ? '%' : 'ta';
                  setForm(p => ({ ...p, type: e.target.value, unit: defaultUnit }));
                }} className={inputCls}>
                  {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Maqsad qiymati *</label>
                  <input type="number" min={0} value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}
                    placeholder="10000000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Birlik</label>
                  <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
                    <option value="ta">ta</option>
                    <option value="so'm">so'm</option>
                    <option value="%">%</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Oy</label>
                  <select value={form.month} onChange={e => setForm(p => ({ ...p, month: +e.target.value }))} className={inputCls}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Yil</label>
                  <input type="number" min={2024} max={2030} value={form.year} onChange={e => setForm(p => ({ ...p, year: +e.target.value }))} className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Tavsif</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Qo'shimcha ma'lumot..." className={`${inputCls} resize-none`} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  Bekor qilish
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Saqlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Maqsadni o'chirish"
        message="Bu maqsadni o'chirishni tasdiqlaysizmi?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
    </div>
  );
}
