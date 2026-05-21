import { useState, useEffect } from 'react';
import { History, Activity, RotateCcw, Filter, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { FilterPanel } from '../../components/ui/FilterPanel';
import ActivityTimeline, { TimelineItem, TimelineItemType } from '../../components/ui/ActivityTimeline';
import ConfirmDialog from '../../components/ConfirmDialog';

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
  logout: 'Chiqdi',
};

export default function CrmAudit() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (filters.resource) params.resource = filters.resource;
      if (filters.action) params.action = filters.action;
      if (filters.dateRange?.from) params.from = filters.dateRange.from;
      if (filters.dateRange?.to) params.to = filters.dateRange.to;

      const [logsRes, statsRes] = await Promise.all([
        api.get('/audit', { params }),
        api.get('/audit/stats').catch(() => null),
      ]);
      setLogs(logsRes.data?.data || []);
      if (statsRes) setStats(statsRes.data);
    } catch (err) {
      console.warn('Audit yuklab bo\'lmadi', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [JSON.stringify(filters)]);

  const handleRestore = async () => {
    try {
      await api.post(`/audit/${restoreConfirm.id}/restore`);
      showToast('Yozuv tiklandi', 'success');
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
      if (log.action === 'login') return 'login';
      if (log.action === 'logout') return 'logout';
      return 'event';
    })(),
    title: `${ACTION_LABEL[log.action] || log.action}: ${RESOURCE_LABEL[log.resource] || log.resource}`,
    description: log.before?.name || log.after?.name || log.resourceId || '',
    timestamp: log.createdAt,
    user: { name: log.userName, avatar: log.user?.avatar },
    expandable: (
      <div className="space-y-2 text-xs">
        {log.before && (
          <div>
            <p className="font-black text-rose-500 uppercase tracking-widest mb-1">Avval:</p>
            <pre className="bg-rose-50 dark:bg-rose-500/10 p-2 rounded-lg overflow-x-auto text-[10px]">
              {JSON.stringify(log.before, null, 2)}
            </pre>
          </div>
        )}
        {log.after && (
          <div>
            <p className="font-black text-emerald-500 uppercase tracking-widest mb-1">Keyin:</p>
            <pre className="bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg overflow-x-auto text-[10px]">
              {JSON.stringify(log.after, null, 2)}
            </pre>
          </div>
        )}
        {log.ipAddress && (
          <p className="text-zinc-400 text-[10px]">IP: {log.ipAddress}</p>
        )}
        {log.action === 'delete' && log.before && (
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw size={12} />}
              onClick={() => setRestoreConfirm({ open: true, id: log.id })}
              className="text-violet-600"
            >
              Tiklash
            </Button>
          </div>
        )}
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Jami amallar" value={stats.total} icon={<History size={20} />} color="blue" variant="minimal" />
          <StatCard label="So'nggi 24 soat" value={stats.last24h} icon={<Activity size={20} />} color="violet" variant="minimal" />
          <StatCard label="Eng faol foydalanuvchi" value={stats.topUsers?.[0]?.name || '—'} sub={`${stats.topUsers?.[0]?.count || 0} ta`} icon={<AlertCircle size={20} />} color="amber" variant="minimal" />
          <StatCard label="O'chirishlar" value={stats.byAction?.find((a: any) => a.action === 'delete')?.count || 0} icon={<AlertCircle size={20} />} color="rose" variant="minimal" />
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
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
              ],
            },
            { type: 'dateRange', key: 'dateRange', label: 'Sana' },
          ]}
          value={filters}
          onChange={setFilters}
          onClear={() => setFilters({})}
        />
      </div>

      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <ActivityTimeline items={items} loading={loading} groupByDay emptyMessage="Audit log bo'sh" />
      </div>
    </div>
  );
}
