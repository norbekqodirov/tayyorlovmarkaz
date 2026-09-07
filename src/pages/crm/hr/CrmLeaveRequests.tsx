import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, Clock, CheckCircle2, XCircle, User, Plus } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

const TYPE_LABELS: Record<string, string> = {
  annual: "Yillik ta'til",
  sick: 'Kasallik',
  personal: 'Shaxsiy',
  unpaid: 'Haqsiz',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Kutilmoqda', color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-500/10' },
  approved: { label: 'Tasdiqlangan', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  rejected: { label: 'Rad etilgan', color: 'text-rose-600',   bg: 'bg-rose-50 dark:bg-rose-500/10' },
};

interface StaffOption {
  id: string;
  name: string;
  role?: string;
}

export default function CrmLeaveRequests() {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  // New leave request modal state
  const [showModal, setShowModal] = useState(false);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    staffId: '',
    type: 'annual',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const userRoleLevel = getCurrentRoleLevel();
  // server/routes/leave.ts requiring requireMinRole('ADMIN') -> ROLE_LEVEL.ADMIN (3)
  const canApproveReject = userRoleLevel >= ROLE_LEVEL.ADMIN;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/leave');
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Ta'til so'rovlarini yuklashda xatolik yuz berdi.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await api.get('/staff-attendance');
      const rows = Array.isArray(res.data?.rows) ? res.data.rows : [];
      const list = rows.map((r: any) => r.staff).filter(Boolean);
      setStaffList(list);
    } catch {
      setStaffList([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const openNewRequestModal = () => {
    setForm({
      staffId: '',
      type: 'annual',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      reason: '',
    });
    setFormError(null);
    setShowModal(true);
    if (staffList.length === 0) {
      loadStaff();
    }
  };

  const handleCreateRequest = async () => {
    setFormError(null);
    if (!form.staffId) {
      setFormError("Xodimni tanlang.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      setFormError("Boshlanish va tugash sanalarini kiriting.");
      return;
    }
    if (form.startDate > form.endDate) {
      setFormError("Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas.");
      return;
    }
    if (!form.reason || !form.reason.trim()) {
      setFormError("Ta'til sababi kiritilishi shart.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/leave', {
        staffId: form.staffId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      });
      showToast("Ta'til so'rovi yuborildi", 'success');
      setShowModal(false);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || "So'rov yuborishda xatolik yuz berdi.";
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    if (!canApproveReject) {
      showToast("Sizda tasdiqlash uchun ruxsat yetarli emas", 'error');
      return;
    }
    setActing(id);
    try {
      const notes = actionNotes[id] || '';
      await api.patch(`/leave/${id}/approve`, { notes });
      showToast("Ta'til so'rovi tasdiqlandi", 'success');
      setActionNotes(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Tasdiqlashda xatolik yuz berdi", 'error');
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    if (!canApproveReject) {
      showToast("Sizda rad etish uchun ruxsat yetarli emas", 'error');
      return;
    }
    setActing(id);
    try {
      const notes = actionNotes[id] || '';
      await api.patch(`/leave/${id}/reject`, { notes });
      showToast("Ta'til so'rovi rad etildi", 'success');
      setActionNotes(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Rad etishda xatolik yuz berdi", 'error');
    } finally {
      setActing(null);
    }
  };

  const filtered = statusFilter === 'all' ? requests : requests.filter(r => r.status === statusFilter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const daysBetween = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 ? days : 1;
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Ta'til So'rovlari</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {requests.length} ta so'rov
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold">
                {pendingCount} kutilmoqda
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openNewRequestModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <Plus size={16} /> Yangi so'rov
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap overflow-x-auto pb-1">
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

      {/* Body state handling */}
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <CalendarCheck size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">So'rovlar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-3 overflow-x-auto">
          {filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            const days = daysBetween(req.startDate, req.endDate);
            return (
              <div key={req.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm min-w-[300px]">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <User size={16} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-white">{req.staff?.name || 'Noma\'lum'}</h3>
                        <p className="text-xs text-zinc-500">{req.staff?.role || 'Xodim'}</p>
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

                    {req.status === 'pending' && canApproveReject && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
                        <input
                          value={actionNotes[req.id] || ''}
                          onChange={e => setActionNotes({ ...actionNotes, [req.id]: e.target.value })}
                          placeholder="Izoh (ixtiyoriy)..."
                          className="flex-1 min-w-[150px] border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => approve(req.id)}
                            disabled={acting === req.id}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} /> Tasdiqlash
                          </button>
                          <button
                            onClick={() => reject(req.id)}
                            disabled={acting === req.id}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                          >
                            <XCircle size={13} /> Rad etish
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Yangi ta'til so'rovi moduli */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Yangi Ta'til So'rovi" width="md">
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-900/30 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Xodim *</label>
            {staffLoading ? (
              <p className="text-xs text-zinc-400 mt-1">Xodimlari ro'yxati yuklanmoqda...</p>
            ) : (
              <select
                value={form.staffId}
                onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-800 dark:text-white"
              >
                <option value="">-- Xodimni tanlang --</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.role ? `(${s.role})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Ta'til turi *</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-800 dark:text-white"
            >
              <option value="annual">Yillik ta'til</option>
              <option value="sick">Kasallik</option>
              <option value="personal">Shaxsiy</option>
              <option value="unpaid">Haqsiz ta'til</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label="Boshlanish sanasi *"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            />
            <Input
              type="date"
              label="Tugash sanasi *"
              value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Ta'til sababi *</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Sabab va izoh qoldiring..."
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-slate-800 dark:text-white resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Bekor qilish</Button>
            <Button onClick={handleCreateRequest} isLoading={submitting}>Yuborish</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
