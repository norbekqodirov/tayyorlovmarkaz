import { useState, useEffect } from 'react';
import { History, Activity, RotateCcw, AlertCircle } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import PageHeader from '../../../components/ui/PageHeader';
import StatCard from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { FilterPanel } from '../../../components/ui/FilterPanel';
import ActivityTimeline, { TimelineItem, TimelineItemType } from '../../../components/ui/ActivityTimeline';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  resource: string;
  resourceId: string | null;
  before: any;
  after: any;
  ipAddress: string | null;
  createdAt: string;
  user?: { name: string; avatar?: string };
}

const RESOURCE_LABEL: Record<string, string> = {
  student: 'O\'quvchi',
  lead: 'Lid',
  group: 'Guruh',
  course: 'Kurs',
  payment: 'To\'lov',
  transaction: 'Tranzaksiya',
  user: 'Foydalanuvchi',
  auth: 'Tizimga kirish',
  staffMember: 'Xodim',
  inventoryItem: 'Inventar',
  test: 'Test',
  certificate: 'Sertifikat',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Yaratildi',
  update: 'Yangilandi',
  delete: 'O\'chirildi',
  restore: 'Tiklandi',
  login: 'Kirdi',
  login_failed: 'Noto\'g\'ri parol',
  logout: 'Chiqdi',
};

export default function CrmAudit() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { showToast } = useToast();

  // Role permission: Restore operations require ADMIN+
  const canRestore = getCurrentRoleLevel() >= ROLE_LEVEL.ADMIN;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: 100 };
      if (filters.resource) params.resource = filters.resource;
      if (filters.action) params.action = filters.action;
      if (filters.dateRange?.from) params.from = filters.dateRange.from;
      if (filters.dateRange?.to) params.to = filters.dateRange.to;

      const [logsRes, statsRes] = await Promise.allSettled([
        api.get('/audit', { params }),
        api.get('/audit/stats'),
      ]);

      if (logsRes.status === 'fulfilled') {
        setLogs(logsRes.value.data?.data || []);
      } else {
        const errMessage = logsRes.reason?.response?.data?.message || logsRes.reason?.message || "Audit loglarini yuklab bo'lmadi";
        setError(errMessage);
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
    } catch (err: any) {
      console.error('Audit load error:', err);
      setError(err?.response?.data?.message || err?.message || "Audit jurnalini yuklashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [JSON.stringify(filters)]);

  const handleRestore = async () => {
    if (!canRestore) {
      showToast('Tiklash uchun ADMIN ruxsati kerak', 'error');
      setRestoreConfirm({ open: false, id: '' });
      return;
    }
    try {
      await api.post(`/audit/${restoreConfirm.id}/restore`);
      showToast('Yozuv muvaffaqiyatli tiklandi', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Tiklab bo\'lmadi', 'error');
    }
    setRestoreConfirm({ open: false, id: '' });
  };

  const items: TimelineItem[] = logs.map(log => ({
    id: log.id,
    type: ((): TimelineItemType => {
      if (log.action === 'create') return 'create';
      if (log.action === 'update') return 'update';
      if (log.action === 'delete') return 'delete';
      if (log.action === 'restore') return 'restore';
      if (log.action === 'login' || log.action === 'login_failed') return 'login';
      if (log.action === 'logout') return 'logout';
      return 'event';
    })(),
    title: `${ACTION_LABEL[log.action] || log.action}: ${RESOURCE_LABEL[log.resource] || log.resource}`,
    description: log.resource === 'auth'
      ? [log.userName, log.ipAddress && `IP ${log.ipAddress}`].filter(Boolean).join(' · ')
      : log.before?.name || log.before?.title || log.after?.name || log.after?.title || log.resourceId || '—',
    timestamp: log.createdAt || new Date().toISOString(),
    user: { name: log.userName || 'Tizim', avatar: log.user?.avatar },
    expandable: (
      <div className="space-y-2 text-xs">
        {log.before && (
          <div>
            <p className="font-black text-rose-500 uppercase tracking-widest mb-1">Avval:</p>
            <pre className="bg-rose-50 dark:bg-rose-500/10 p-2.5 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {JSON.stringify(log.before, null, 2)}
            </pre>
          </div>
        )}
        {log.after && (
          <div>
            <p className="font-black text-emerald-500 uppercase tracking-widest mb-1">Keyin:</p>
            <pre className="bg-emerald-50 dark:bg-emerald-500/10 p-2.5 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {JSON.stringify(log.after, null, 2)}
            </pre>
          </div>
        )}
        {log.ipAddress && (
          <p className="text-zinc-400 text-[10px]">IP manzil: {log.ipAddress}</p>
        )}
        {canRestore && log.action === 'delete' && log.before && (
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw size={12} />}
              onClick={() => setRestoreConfirm({ open: true, id: log.id })}
              className="text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
            >
              Tiklash
            </Button>
          </div>
        )}
      </div>
    ),
  }));

  return (
    <div className="space-y-6 page-enter">
      <ConfirmDialog
        isOpen={restoreConfirm.open}
        title="Yozuvni tiklash"
        message="Bu yozuv o'chirilgan holatdan tiklanadi. Davom etasizmi?"
        confirmText="Tiklash"
        onConfirm={handleRestore}
        onCancel={() => setRestoreConfirm({ open: false, id: '' })}
      />

      <PageHeader
        title="Audit Log"
        subtitle="Tizimdagi barcha o'zgarishlar tarixi va tiklash"
        badge={{ label: 'Admin', color: 'rose' }}
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Jami amallar" value={stats.total ?? 0} icon={<History size={20} />} color="blue" variant="minimal" />
          <StatCard label="So'nggi 24 soat" value={stats.last24h ?? 0} icon={<Activity size={20} />} color="violet" variant="minimal" />
          <StatCard label="Eng faol foydalanuvchi" value={stats.topUsers?.[0]?.name || '—'} sub={`${stats.topUsers?.[0]?.count || 0} ta`} icon={<AlertCircle size={20} />} color="amber" variant="minimal" />
          <StatCard label="O'chirishlar" value={stats.byAction?.find((a: any) => a.action === 'delete')?.count || 0} icon={<AlertCircle size={20} />} color="rose" variant="minimal" />
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 p-3 sm:p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <FilterPanel
          filters={[
            {
              type: 'select',
              key: 'resource',
              label: 'Resurs',
              options: Object.entries(RESOURCE_LABEL).map(([v, l]) => ({ value: v, label: l })),
            },
            {
              type: 'pills',
              key: 'action',
              label: 'Amal',
              options: [
                { value: 'create', label: 'Yaratish' },
                { value: 'update', label: 'Yangilash' },
                { value: 'delete', label: 'O\'chirish' },
                { value: 'restore', label: 'Tiklash' },
                { value: 'login', label: 'Kirish' },
                { value: 'login_failed', label: 'Noto\'g\'ri parol' },
              ],
            },
            { type: 'dateRange', key: 'dateRange', label: 'Sana' },
          ]}
          value={filters}
          onChange={setFilters}
          onClear={() => setFilters({})}
        />
      </div>

      <div className="bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <ActivityTimeline items={items} loading={loading} groupByDay emptyMessage="Audit log bo'sh" />
        )}
      </div>
    </div>
  );
}
