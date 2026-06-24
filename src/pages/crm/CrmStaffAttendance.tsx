import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, CheckCircle2, Clock, XCircle, AlertCircle,
  RefreshCw, Calendar, ChevronLeft, ChevronRight,
  MapPin, Fingerprint, Shield, Edit2, Save, X,
  Download, BarChart2, UserCheck, TrendingUp,
} from 'lucide-react';
import api from '../../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AttRow {
  staff: { id: string; name: string; role: string; photo?: string; department: string };
  record: {
    id: string; checkIn?: string; checkOut?: string; status: string;
    faceScore?: number; verifiedBy: string; notes?: string;
    location?: { name: string };
  } | null;
  status: string;
}

interface DaySummary {
  total: number; present: number; late: number; absent: number; pending: number;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  present: { label: 'Keldi',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', icon: CheckCircle2 },
  late:    { label: 'Kechikdi',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',   icon: Clock         },
  absent:  { label: 'Kelmadi',   cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',           icon: XCircle       },
  pending: { label: 'Kutilmoqda',cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',          icon: AlertCircle   },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function VerifyBadge({ by }: { by: string }) {
  if (by === 'face_id') return (
    <span className="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
      <Fingerprint size={10} /> Face ID
    </span>
  );
  if (by === 'admin') return (
    <span className="flex items-center gap-1 text-[10px] text-blue-500 font-semibold">
      <Shield size={10} /> Admin
    </span>
  );
  return null;
}

// ─── Edit modal ──────────────────────────────────────────────────────────────

function EditModal({ row, onClose, onSave }: {
  row: AttRow;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    status: row.record?.status || 'present',
    checkIn: row.record?.checkIn || '',
    checkOut: row.record?.checkOut || '',
    notes: row.record?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white">{row.staff.name}</h3>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="present">Keldi</option>
              <option value="late">Kechikdi</option>
              <option value="absent">Kelmadi</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kirish vaqti</label>
              <input type="time" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Chiqish vaqti</label>
              <input type="time" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Izoh</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Ixtiyoriy..."
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            Bekor
          </button>
          <button onClick={handle} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            Saqlash
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmStaffAttendance() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<{ summary: DaySummary; rows: AttRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editRow, setEditRow] = useState<AttRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'present' | 'late' | 'absent' | 'pending'>('all');
  const [view, setView] = useState<'day' | 'month'>('day');
  const [monthReport, setMonthReport] = useState<any[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const loadDay = useCallback(async (d: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/staff-attendance', { params: { date: d } });
      setData(res.data);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadMonth = useCallback(async (m: string) => {
    setMonthLoading(true);
    try {
      const res = await api.get('/staff-attendance/report', { params: { month: m } });
      setMonthReport(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { /* ignore */ }
    setMonthLoading(false);
  }, []);

  useEffect(() => { loadDay(date); }, [date, loadDay]);
  useEffect(() => { if (view === 'month') loadMonth(month); }, [view, month, loadMonth]);

  // Auto-refresh bugungi kun uchun har 60 soniyada
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (date !== today || view !== 'day') return;
    const timer = setInterval(() => loadDay(date, true), 60_000);
    return () => clearInterval(timer);
  }, [date, view, loadDay]);

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleEdit = async (row: AttRow, formData: any) => {
    try {
      if (row.record) {
        await api.patch(`/staff-attendance/${row.record.id}`, formData);
      } else {
        await api.post('/staff-attendance/manual', {
          staffId: row.staff.id,
          date,
          ...formData,
        });
      }
      setEditRow(null);
      loadDay(date);
    } catch { /* ignore */ }
  };

  const filtered = data?.rows.filter(r => filter === 'all' || r.status === filter) ?? [];
  const today = new Date().toISOString().split('T')[0];
  const isToday = date === today;

  // ─── Month view ────────────────────────────────────────────────────────────

  if (view === 'month') {
    return (
      <div className="space-y-6 pb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">Xodimlar Davomati</h1>
            <p className="text-sm text-zinc-500">Oylik hisobot</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-semibold">
              <button onClick={() => setView('day')} className="px-3 py-2 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">Kunlik</button>
              <button onClick={() => setView('month')} className="px-3 py-2 bg-blue-600 text-white">Oylik</button>
            </div>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
          </div>
        </div>

        {monthLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {monthReport.map((item: any) => {
              const pct = item.summary.total > 0
                ? Math.round(((item.summary.present + item.summary.late) / item.summary.total) * 100)
                : 0;
              return (
                <div key={item.staff.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex-shrink-0">
                      {item.staff.photo
                        ? <img src={item.staff.photo} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">{item.staff.name[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 dark:text-white">{item.staff.name}</div>
                      <div className="text-xs text-zinc-400">{item.staff.role}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black ${pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                        {pct}%
                      </div>
                      <div className="text-xs text-zinc-400">davomat</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {[
                      { label: 'Keldi', val: item.summary.present, cls: 'text-emerald-600' },
                      { label: 'Kechikdi', val: item.summary.late, cls: 'text-amber-600' },
                      { label: 'Kelmadi', val: item.summary.absent, cls: 'text-red-500' },
                      { label: 'Jami', val: item.summary.total, cls: 'text-zinc-600 dark:text-zinc-300' },
                    ].map(s => (
                      <div key={s.label} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl py-2">
                        <div className={`font-bold text-base ${s.cls}`}>{s.val}</div>
                        <div className="text-zinc-400">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ─── Day view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Xodimlar Davomati</h1>
          <p className="text-sm text-zinc-500">
            {isToday ? 'Bugun' : new Date(date).toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-semibold">
            <button onClick={() => setView('day')} className="px-3 py-2 bg-blue-600 text-white">Kunlik</button>
            <button onClick={() => setView('month')} className="px-3 py-2 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">Oylik</button>
          </div>
          <button
            onClick={() => loadDay(date, true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3">
        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-zinc-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-sm font-semibold text-slate-800 dark:text-white bg-transparent border-none outline-none cursor-pointer"
          />
          {isToday && (
            <span className="text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full">
              Bugun
            </span>
          )}
        </div>
        <button
          onClick={() => changeDate(1)}
          disabled={date >= today}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { key: 'present', label: 'Keldi',      val: data.summary.present, icon: CheckCircle2, color: 'emerald' },
            { key: 'late',    label: 'Kechikdi',   val: data.summary.late,    icon: Clock,        color: 'amber'   },
            { key: 'absent',  label: 'Kelmadi',    val: data.summary.absent,  icon: XCircle,      color: 'red'     },
            { key: 'total',   label: 'Jami',       val: data.summary.total,   icon: Users,        color: 'blue'    },
          ].map(s => {
            const Icon = s.icon;
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setFilter(active ? 'all' : s.key as any)}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  active
                    ? `bg-${s.color}-600 border-${s.color}-600 text-white`
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Icon size={16} className={active ? 'opacity-70' : `text-${s.color}-500`} />
                <div className={`text-2xl font-black mt-1 ${active ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                  {s.val}
                </div>
                <div className={`text-xs ${active ? 'text-white/70' : 'text-zinc-400'}`}>{s.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Attendance list */}
      {loading ? (
        <div className="space-y-2">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">Ma'lumot yo'q</div>
          ) : (
            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {filtered.map(row => (
                <div key={row.staff.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ${
                    row.status === 'present' ? 'ring-emerald-300 dark:ring-emerald-700' :
                    row.status === 'late'    ? 'ring-amber-300 dark:ring-amber-700' :
                    row.status === 'absent'  ? 'ring-red-200 dark:ring-red-900' :
                    'ring-zinc-200 dark:ring-zinc-700'
                  }`}>
                    {row.staff.photo
                      ? <img src={row.staff.photo} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-500">
                          {row.staff.name[0]}
                        </div>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 dark:text-white truncate">{row.staff.name}</span>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-zinc-400">{row.staff.role}</span>
                      {row.record?.checkIn && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          <Clock size={10} /> {row.record.checkIn}
                          {row.record.checkOut && <> → {row.record.checkOut}</>}
                        </span>
                      )}
                      {row.record?.location && (
                        <span className="flex items-center gap-1 text-xs text-zinc-400">
                          <MapPin size={10} /> {row.record.location.name}
                        </span>
                      )}
                      {row.record?.verifiedBy && <VerifyBadge by={row.record.verifiedBy} />}
                      {row.record?.faceScore != null && (
                        <span className="text-[10px] text-violet-500 font-semibold">
                          {Math.round(row.record.faceScore * 100)}% mos
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit */}
                  <button
                    onClick={() => setEditRow(row)}
                    className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors flex-shrink-0"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      <AnimatePresence>
        {editRow && (
          <EditModal
            row={editRow}
            onClose={() => setEditRow(null)}
            onSave={formData => handleEdit(editRow, formData)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
