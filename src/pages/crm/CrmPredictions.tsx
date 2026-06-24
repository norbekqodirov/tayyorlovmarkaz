import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, Users,
  DollarSign, Target, Activity, Loader2, RefreshCw,
  ChevronRight, Phone, ArrowUpRight, ArrowDownRight,
  Zap, BarChart2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import api from '../../api/client';

type Tab = 'dropout' | 'revenue' | 'leads' | 'payment';

interface DropoutRisk {
  id: string; name: string; phone?: string; riskScore: number;
  risk: 'high' | 'medium'; factors: string[]; balance: number; attendanceRate: number;
}
interface RevenueForecast {
  historical: { month: string; actual: number; label: string }[];
  forecast: { amount: number; month: string; trend: number; confidence: string; activeStudents: number; avgFee: number };
}
interface Lead {
  id: string; name: string; phone: string; course?: string;
  stage: string; status: string; priority: number; source?: string;
  lastActivity?: { type: string; content: string; date: string } | null;
}
interface PaymentRisk {
  id: string; name: string; phone?: string; balance: number;
  daysSincePayment: number; severity: string; lastPaymentDate?: string; lastPaymentAmount: number;
}

const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(Math.round(n));

export default function CrmPredictions() {
  const [activeTab, setActiveTab] = useState<Tab>('dropout');
  const [loading, setLoading] = useState(false);

  const [dropoutData, setDropoutData] = useState<{ data: DropoutRisk[]; summary: any } | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueForecast | null>(null);
  const [leadsData, setLeadsData] = useState<Lead[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentRisk[]>([]);

  const fetchData = useCallback(async (tab: Tab) => {
    setLoading(true);
    try {
      switch (tab) {
        case 'dropout': {
          const r = await api.get<{ data: DropoutRisk[]; summary: any }>('/predictions/dropout-risk');
          setDropoutData(r.data);
          break;
        }
        case 'revenue': {
          const r = await api.get<RevenueForecast>('/predictions/revenue-forecast');
          setRevenueData(r.data);
          break;
        }
        case 'leads': {
          const r = await api.get<{ data: Lead[] }>('/predictions/best-leads');
          setLeadsData(r.data.data ?? []);
          break;
        }
        case 'payment': {
          const r = await api.get<{ data: PaymentRisk[] }>('/predictions/payment-risk');
          setPaymentData(r.data.data ?? []);
          break;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(activeTab); }, [activeTab, fetchData]);

  const tabs = [
    { id: 'dropout' as Tab, label: 'Chiqib ketish xavfi', icon: AlertTriangle },
    { id: 'revenue' as Tab, label: 'Daromad bashorati', icon: TrendingUp },
    { id: 'leads' as Tab, label: 'Eng yaxshi lidlar', icon: Target },
    { id: 'payment' as Tab, label: "To'lov xavfi", icon: DollarSign },
  ];

  const riskColor = (r: string) =>
    r === 'high' || r === 'critical' ? 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
    : r === 'medium' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400'
    : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400';

  const stageLabel: Record<string, string> = { new: 'Yangi', contacted: "Aloqada", meeting: "Uchrashuv", won: "Yutildi", lost: "Yo'qotildi" };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10">
            <Brain className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">AI Bashoratlar</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ma'lumotlarga asoslanib tahlil va bashorat</p>
          </div>
        </div>
        <button onClick={() => fetchData(activeTab)} disabled={loading}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Yangilash
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Brain className="w-10 h-10 text-indigo-300 animate-pulse mx-auto" />
            <p className="text-sm text-zinc-400">AI tahlil qilmoqda...</p>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {/* DROPOUT RISK */}
            {activeTab === 'dropout' && dropoutData && (
              <div className="space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Jami faol o'quvchilar", value: dropoutData.summary.total, icon: Users, color: 'blue' },
                    { label: 'Yuqori xavf', value: dropoutData.summary.high, icon: AlertTriangle, color: 'red' },
                    { label: "O'rta xavf", value: dropoutData.summary.medium, icon: Activity, color: 'amber' },
                    { label: 'Xavfsiz', value: dropoutData.summary.low, icon: Zap, color: 'emerald' },
                  ].map(s => (
                    <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                      <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                      <p className={`text-2xl font-bold text-${s.color}-600 dark:text-${s.color}-400`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Students list */}
                {dropoutData.data.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    <Zap className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>Xavf ostidagi o'quvchilar topilmadi</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dropoutData.data.map(s => (
                      <div key={s.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                              s.risk === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>{s.name[0]}</div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                              {s.phone && <p className="text-xs text-zinc-400 flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-zinc-400">Xavf bali</p>
                              <p className={`text-xl font-bold ${s.risk === 'high' ? 'text-red-600' : 'text-amber-600'}`}>{s.riskScore}</p>
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${riskColor(s.risk)}`}>
                              {s.risk === 'high' ? 'Yuqori' : "O'rta"}
                            </span>
                          </div>
                        </div>
                        {/* Stats */}
                        <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-50 dark:border-zinc-800 text-xs text-zinc-500">
                          <span>📅 Davomat: <b className="text-zinc-700 dark:text-zinc-300">{s.attendanceRate}%</b></span>
                          <span>💳 Balans: <b className={s.balance < 0 ? 'text-red-600' : 'text-emerald-600'}>{fmt(s.balance)} so'm</b></span>
                        </div>
                        {/* Factors */}
                        {s.factors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {s.factors.map((f, i) => (
                              <span key={i} className="text-xs bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                                ⚠ {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* REVENUE FORECAST */}
            {activeTab === 'revenue' && revenueData && (
              <div className="space-y-5">
                {/* Forecast card */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-indigo-200 text-sm font-medium">{revenueData.forecast.month} uchun bashorat</p>
                      <p className="text-4xl font-bold mt-1">{fmt(revenueData.forecast.amount)} so'm</p>
                      <div className="flex items-center gap-2 mt-2">
                        {revenueData.forecast.trend >= 0
                          ? <ArrowUpRight className="w-4 h-4 text-emerald-300" />
                          : <ArrowDownRight className="w-4 h-4 text-red-300" />}
                        <span className={`text-sm font-medium ${revenueData.forecast.trend >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {revenueData.forecast.trend > 0 ? '+' : ''}{revenueData.forecast.trend}% o'tgan oyga nisbatan
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-indigo-200 text-xs">Ishonch darajasi</p>
                      <p className="font-bold capitalize">
                        {revenueData.forecast.confidence === 'high' ? 'Yuqori' : revenueData.forecast.confidence === 'medium' ? "O'rta" : 'Past'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6 mt-4 pt-4 border-t border-white/20 text-sm">
                    <span className="text-indigo-200">Faol o'quvchilar: <b className="text-white">{revenueData.forecast.activeStudents}</b></span>
                    <span className="text-indigo-200">O'rt. to'lov: <b className="text-white">{fmt(revenueData.forecast.avgFee)} so'm</b></span>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">So'nggi 6 oy + Bashorat</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={[...revenueData.historical, {
                      month: 'forecast', label: revenueData.forecast.month,
                      actual: 0, forecast: revenueData.forecast.amount
                    }]}>
                      <defs>
                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v)} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`${fmt(v)} so'm`, '']} />
                      <Area type="monotone" dataKey="actual" stroke="#6366f1" fill="url(#colorActual)" strokeWidth={2} name="Haqiqiy" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Historical table */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-zinc-100 dark:border-zinc-800">
                      <tr className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                        <th className="px-5 py-3">Oy</th>
                        <th className="px-5 py-3">Daromad</th>
                        <th className="px-5 py-3">O'zgarish</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                      {revenueData.historical.map((h, i) => {
                        const prev = i > 0 ? revenueData.historical[i - 1].actual : 0;
                        const change = prev > 0 ? ((h.actual - prev) / prev) * 100 : 0;
                        return (
                          <tr key={h.month} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{h.label}</td>
                            <td className="px-5 py-3">{fmt(h.actual)} so'm</td>
                            <td className="px-5 py-3">
                              {i > 0 && (
                                <span className={`flex items-center gap-1 text-xs font-medium ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {change >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-indigo-50 dark:bg-indigo-900/20 font-semibold">
                        <td className="px-5 py-3 text-indigo-700 dark:text-indigo-300">{revenueData.forecast.month} (bashorat)</td>
                        <td className="px-5 py-3 text-indigo-700 dark:text-indigo-300">{fmt(revenueData.forecast.amount)} so'm</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium ${revenueData.forecast.trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {revenueData.forecast.trend > 0 ? '+' : ''}{revenueData.forecast.trend}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* BEST LEADS */}
            {activeTab === 'leads' && (
              <div className="space-y-3">
                {leadsData.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    <Target className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>Aktiv lidlar topilmadi</p>
                  </div>
                ) : leadsData.map((lead, i) => (
                  <div key={lead.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{lead.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          lead.status === 'hot' ? 'bg-red-100 text-red-600 dark:bg-red-900/20' :
                          lead.status === 'warm' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' :
                          'bg-blue-100 text-blue-600 dark:bg-blue-900/20'
                        }`}>{lead.status === 'hot' ? '🔥 Hot' : lead.status === 'warm' ? '🌡 Warm' : '❄ Cold'}</span>
                        <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                          {stageLabel[lead.stage] || lead.stage}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-zinc-400">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>
                        {lead.course && <span>📚 {lead.course}</span>}
                        {lead.source && <span>📌 {lead.source}</span>}
                      </div>
                      {lead.lastActivity && (
                        <p className="text-xs text-zinc-400 mt-1 truncate">
                          Son: {lead.lastActivity.type} — {lead.lastActivity.content}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-400">Ustuvorlik</p>
                      <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{lead.priority}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* PAYMENT RISK */}
            {activeTab === 'payment' && (
              <div className="space-y-3">
                {paymentData.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>To'lov xavfi yo'q</p>
                  </div>
                ) : paymentData.map(s => (
                  <div key={s.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                      s.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      s.severity === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>{s.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</p>
                      <div className="flex gap-3 mt-0.5 text-xs text-zinc-400">
                        {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                        <span>{s.daysSincePayment === 999 ? "Hech qachon to'lamagan" : `${s.daysSincePayment} kun to'lov yo'q`}</span>
                        {s.lastPaymentDate && <span>Son: {s.lastPaymentDate}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-400">Qarz</p>
                      <p className="font-bold text-red-600 dark:text-red-400">{fmt(Math.abs(s.balance))} so'm</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${riskColor(s.severity)}`}>
                      {s.severity === 'critical' ? 'Kritik' : s.severity === 'high' ? 'Yuqori' : "O'rta"}
                    </span>
                  </div>
                ))}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
