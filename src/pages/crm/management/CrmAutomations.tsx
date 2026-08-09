import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Play, Clock, CheckCircle2, XCircle, SkipForward,
  RefreshCw, ChevronDown, ChevronRight, Calendar,
  CreditCard, GraduationCap, Users, AlertTriangle, Activity,
  Timer, CalendarClock, TrendingDown, BarChart3
} from 'lucide-react';
import { useToast } from '../../../components/Toast';
import api from '../../../api/client';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: string;
  isActive: boolean;
  lastRun?: string;
  runCount: number;
  logs: WorkflowLog[];
}

interface WorkflowLog {
  id: string;
  status: 'success' | 'error' | 'skipped';
  output?: string;
  duration?: number;
  createdAt: string;
}

const TRIGGER_ICONS: Record<string, any> = {
  daily_payment_reminder: CreditCard,
  daily_attendance_monitor: GraduationCap,
  hourly_lead_nurturing: Users,
  daily_group_lifecycle: Calendar,
  lead_sla_breach: Timer,
  daily_followup_digest: CalendarClock,
  daily_lead_score_refresh: TrendingDown,
  weekly_marketing_report: BarChart3,
};

const TRIGGER_SCHEDULES: Record<string, string> = {
  daily_payment_reminder: 'Har kuni 09:00',
  daily_attendance_monitor: 'Har kuni 17:30',
  hourly_lead_nurturing: 'Har 2 soatda',
  daily_group_lifecycle: 'Har kuni 10:00',
  lead_sla_breach: 'Har 10 daqiqada',
  daily_followup_digest: 'Har kuni 09:00',
  daily_lead_score_refresh: 'Har kuni 03:00',
  weekly_marketing_report: 'Dushanba 09:00',
};

export default function CrmAutomations() {
  const { showToast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadWorkflows(); }, []);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/workflows');
      setWorkflows(res.data || []);
    } catch {
      showToast('Ma\'lumot yuklanmadi', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleWorkflow = async (wf: Workflow) => {
    try {
      await api.put(`/reports/workflows/${wf.id}`, { isActive: !wf.isActive });
      setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, isActive: !w.isActive } : w));
      showToast(wf.isActive ? 'Workflow o\'chirildi' : 'Workflow yoqildi!', 'success');
    } catch {
      showToast('Xatolik yuz berdi', 'error');
    }
  };

  const runWorkflow = async (wf: Workflow) => {
    setRunningId(wf.id);
    try {
      await api.post(`/reports/workflows/${wf.trigger}/run`);
      showToast(`${wf.name} ishga tushirildi!`, 'success');
      setTimeout(loadWorkflows, 2000);
    } catch {
      showToast('Ishga tushirishda xatolik', 'error');
    } finally {
      setRunningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeCount = workflows.filter(w => w.isActive).length;
  const totalRuns = workflows.reduce((a, w) => a + w.runCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-500 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Avtomatizatsiya</h1>
            <p className="text-sm text-zinc-500">Avtomatik vazifalar va cron joblar</p>
          </div>
        </div>
        <button onClick={loadWorkflows} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <RefreshCw size={16} className="text-zinc-500" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Faol workflow', value: activeCount, color: 'emerald' },
          { label: "Jami ishga tushish", value: totalRuns, color: 'blue' },
          { label: "Jami workflow", value: workflows.length, color: 'violet' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 text-center">
            <p className={`text-2xl font-black text-${s.color}-600`}>{s.value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Workflow'lar Telegram botingiz bilan ishlaydi. Avval <b>Telegram Bot</b> sahifasida sozlamalarni to'ldiring va avtomatik bildirishnomalarni yoqing.
        </p>
      </div>

      {/* Workflows list */}
      <div className="space-y-3">
        {workflows.map(wf => {
          const Icon = TRIGGER_ICONS[wf.trigger] || Zap;
          const schedule = TRIGGER_SCHEDULES[wf.trigger] || wf.trigger;
          const lastLog = wf.logs?.[0];
          const isExpanded = expandedId === wf.id;

          return (
            <motion.div
              key={wf.id}
              layout
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    wf.isActive ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-zinc-100 dark:bg-zinc-800'
                  }`}>
                    <Icon size={20} className={wf.isActive ? 'text-violet-600' : 'text-zinc-400'} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{wf.name}</h3>
                      {lastLog && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          lastLog.status === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          lastLog.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-zinc-100 text-zinc-600 dark:bg-zinc-800'
                        }`}>
                          {lastLog.status === 'success' ? 'OK' : lastLog.status === 'error' ? 'Xato' : 'O\'tkazib'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock size={11} /> {schedule}
                      </span>
                      <span className="text-xs text-zinc-400">·</span>
                      <span className="text-xs text-zinc-500">{wf.runCount} marta ishga tushgan</span>
                      {wf.lastRun && (
                        <>
                          <span className="text-xs text-zinc-400">·</span>
                          <span className="text-xs text-zinc-500">
                            Oxirgi: {new Date(wf.lastRun).toLocaleDateString('uz-UZ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    {/* Run button */}
                    <button
                      onClick={() => runWorkflow(wf)}
                      disabled={runningId === wf.id}
                      title="Hozir ishga tushirish"
                      className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-600 transition-colors"
                    >
                      {runningId === wf.id
                        ? <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        : <Play size={14} />
                      }
                    </button>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleWorkflow(wf)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${wf.isActive ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${wf.isActive ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
                    </button>

                    {/* Expand logs */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                      className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                    </button>
                  </div>
                </div>

                {wf.description && (
                  <p className="text-xs text-zinc-500 mt-2 ml-14">{wf.description}</p>
                )}
              </div>

              {/* Logs */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50">
                      <p className="text-xs font-bold text-zinc-500 mb-3">So'nggi ishga tushirishlar</p>
                      {wf.logs.length === 0 ? (
                        <p className="text-xs text-zinc-400">Hali ishga tushmagan</p>
                      ) : (
                        <div className="space-y-2">
                          {wf.logs.map(log => {
                            let output: any = {};
                            try { output = JSON.parse(log.output || '{}'); } catch {}
                            return (
                              <div key={log.id} className="flex items-start gap-2 text-xs">
                                <div className="mt-0.5">
                                  {log.status === 'success' ? <CheckCircle2 size={12} className="text-emerald-500" /> :
                                   log.status === 'error' ? <XCircle size={12} className="text-red-500" /> :
                                   <SkipForward size={12} className="text-zinc-400" />}
                                </div>
                                <div>
                                  <span className="text-zinc-500">{new Date(log.createdAt).toLocaleString('uz-UZ')}</span>
                                  {log.duration && <span className="text-zinc-400 ml-2">{log.duration}ms</span>}
                                  {output.sent !== undefined && <span className="text-emerald-600 ml-2">{output.sent} xabar yuborildi</span>}
                                  {output.error && <span className="text-red-500 ml-2">{output.error}</span>}
                                  {output.reason && <span className="text-zinc-400 ml-2">({output.reason})</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
