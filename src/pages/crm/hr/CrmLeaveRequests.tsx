import { useState, useEffect } from 'react';
import { CalendarCheck, Clock, CheckCircle2, XCircle, User } from 'lucide-react';
import api from '../../../api/client';

const TYPE_LABELS: Record<string, string> = {
  annual: 'Yillik ta\'til', sick: 'Kasallik', personal: 'Shaxsiy', unpaid: 'Haqsiz',
};
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Kutilmoqda', color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-500/10' },
  approved: { label: 'Tasdiqlangan', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  rejected: { label: 'Rad etilgan', color: 'text-rose-600',   bg: 'bg-rose-50 dark:bg-rose-500/10' },
};

export default function CrmLeaveRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionNotes, setActionNotes] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/leave');
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch { setRequests([]); }
    setLoading(false);
  };

  const approve = async (id: string) => {
    setActing(id);
    try {
      await api.patch(`/leave/${id}/approve`, { notes: actionNotes });
      load();
    } catch {}
    setActing(null);
    setActionNotes('');
  };

  const reject = async (id: string) => {
    setActing(id);
    try {
      await api.patch(`/leave/${id}/reject`, { notes: actionNotes });
      load();
    } catch {}
    setActing(null);
    setActionNotes('');
  };

  const filtered = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const daysBetween = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Ta'til So'rovlari</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {requests.length} ta so'rov{pendingCount > 0 && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">{pendingCount} kutilmoqda</span>}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === s
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-400'
            }`}
          >
            {s === 'all' ? 'Barchasi' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CalendarCheck size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">So'rovlar yo'q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const days = daysBetween(req.startDate, req.endDate);
            return (
              <div key={req.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <User size={16} className="text-zinc-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-white">{req.staff?.name || 'Noma\'lum'}</h3>
                        <p className="text-xs text-zinc-500">{req.staff?.role}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      <span className="font-semibold text-slate-900 dark:text-white">{TYPE_LABELS[req.type] || req.type}</span>
                      <span className="flex items-center gap-1 text-zinc-500">
                        <Clock size={12} />
                        {req.startDate} → {req.endDate}
                        <span className="ml-1 font-bold text-blue-600">{days} kun</span>
                      </span>
                    </div>
                    {req.reason && <p className="mt-1.5 text-xs text-zinc-500 italic">"{req.reason}"</p>}
                    {req.approvedBy && (
                      <p className="mt-1 text-xs text-zinc-400">
                        {req.status === 'approved' ? '✓ Tasdiqladi' : '✗ Rad etdi'}: {req.approvedBy}
                      </p>
                    )}

                    {req.status === 'pending' && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
                        <input
                          value={actionNotes}
                          onChange={e => setActionNotes(e.target.value)}
                          placeholder="Izoh (ixtiyoriy)..."
                          className="flex-1 min-w-0 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => approve(req.id)}
                          disabled={acting === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} /> Tasdiqlash
                        </button>
                        <button
                          onClick={() => reject(req.id)}
                          disabled={acting === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        >
                          <XCircle size={13} /> Rad etish
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
