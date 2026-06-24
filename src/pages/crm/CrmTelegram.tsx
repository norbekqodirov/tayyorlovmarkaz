import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Send, Settings, CheckCircle2, XCircle, Users, MessageSquare,
    RefreshCw, Bot, Megaphone, Radio, GraduationCap,
    Eye, EyeOff, BarChart2, Copy, Smartphone, Zap, Shield,
    Search, Loader2, Check, Link2, Info,
} from 'lucide-react';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramStats {
    messages: { total: number; sent: number; failed: number; today: number };
    coverage: { students: number; parents: number; totalStudents: number; studentPct: number; parentPct: number };
    byType: { type: string; count: number }[];
}
interface TelegramSettings {
    botTokenSet: boolean;
    adminChatId: string;
    autoAttendance: boolean;
    autoPayment: boolean;
    autoLead: boolean;
    miniAppUrl: string;
    staffMiniAppUrl: string;
}
interface BotStatus {
    ok: boolean;
    username?: string;
    name?: string;
    error?: string;
    messagesToday: number;
    sentToday: number;
    linkedStudents: number;
    totalStudents: number;
}

const TYPE_LABELS: Record<string, string> = {
    attendance: 'Davomat', payment: "To'lov", grade: 'Baho',
    lead: 'Lid', broadcast: 'Ommaviy', manual: "Qo'lda",
};
const TYPE_COLORS: Record<string, string> = {
    attendance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    payment: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    grade: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    lead: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    broadcast: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    manual: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

type ActiveTab = 'overview' | 'broadcast' | 'link' | 'settings' | 'history' | 'staffbot';

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrmTelegram() {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
    const [stats, setStats] = useState<TelegramStats | null>(null);
    const [settings, setSettings] = useState<TelegramSettings | null>(null);
    const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
    const [loading, setLoading] = useState(true);

    // Settings form
    const [tokenInput, setTokenInput] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [adminChatId, setAdminChatId] = useState('');
    const [autoAttendance, setAutoAttendance] = useState(false);
    const [autoPayment, setAutoPayment] = useState(false);
    const [autoLead, setAutoLead] = useState(false);
    const [miniAppUrl, setMiniAppUrl] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);

    // Broadcast
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [broadcastTarget, setBroadcastTarget] = useState('all');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [broadcastResult, setBroadcastResult] = useState<{ sent: number; total: number } | null>(null);

    // Student link
    const [students, setStudents] = useState<any[]>([]);
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [chatIdInput, setChatIdInput] = useState('');
    const [linking, setLinking] = useState(false);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyFilter, setHistoryFilter] = useState('');
    const [historyLoading, setHistoryLoading] = useState(false);

    // Staff Bot
    const [staffWebhookInfo, setStaffWebhookInfo] = useState<any>(null);
    const [staffWebhookUrl, setStaffWebhookUrl] = useState('');
    const [settingStaffWebhook, setSettingStaffWebhook] = useState(false);
    const [staffTokenInput, setStaffTokenInput] = useState('');
    const [showStaffToken, setShowStaffToken] = useState(false);
    const [savingStaffToken, setSavingStaffToken] = useState(false);
    const [staffMiniAppUrl, setStaffMiniAppUrl] = useState('');
    const [savingStaffMiniApp, setSavingStaffMiniApp] = useState(false);
    const [staffBroadcastMsg, setStaffBroadcastMsg] = useState('');
    const [staffBroadcastRole, setStaffBroadcastRole] = useState('');
    const [sendingStaffBroadcast, setSendingStaffBroadcast] = useState(false);
    const [staffBroadcastResult, setStaffBroadcastResult] = useState<{ sent: number; failed: number } | null>(null);

    // ─── Data Loading ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, settingsRes, statusRes] = await Promise.all([
                api.get('/telegram/stats'),
                api.get('/telegram/settings'),
                api.get('/telegram/status'),
            ]);
            setStats(statsRes.data);
            setSettings(settingsRes.data);
            setBotStatus(statusRes.data);
            setAdminChatId(settingsRes.data.adminChatId || '');
            setAutoAttendance(settingsRes.data.autoAttendance || false);
            setAutoPayment(settingsRes.data.autoPayment || false);
            setAutoLead(settingsRes.data.autoLead || false);
            setMiniAppUrl(settingsRes.data.miniAppUrl || '');
        } catch {
            showToast("Ma'lumot yuklanmadi", 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const url = `/telegram/messages?page=${historyPage}&limit=20${historyFilter ? `&type=${historyFilter}` : ''}`;
            const res = await api.get(url);
            setHistory(res.data.data || []);
            setHistoryTotal(res.data.total || 0);
        } catch { }
        finally { setHistoryLoading(false); }
    }, [historyPage, historyFilter]);

    const loadStudents = useCallback(async () => {
        try {
            const r = await api.get('/students?limit=200');
            setStudents(r.data.data || r.data || []);
        } catch { }
    }, []);

    const loadStaffBotData = useCallback(async () => {
        try {
            const [webhookRes, settingsRes] = await Promise.all([
                api.get('/staff-telegram/webhook-info').catch(() => ({ data: null })),
                api.get('/telegram/settings'),
            ]);
            setStaffWebhookInfo(webhookRes.data?.result || webhookRes.data);
            setStaffMiniAppUrl(settingsRes.data?.staffMiniAppUrl || '');
            if (!staffWebhookUrl) {
                setStaffWebhookUrl(`${window.location.origin}/api/staff-telegram/webhook`);
            }
        } catch { }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);
    useEffect(() => { if (activeTab === 'link') loadStudents(); }, [activeTab, loadStudents]);
    useEffect(() => { if (activeTab === 'staffbot') loadStaffBotData(); }, [activeTab, loadStaffBotData]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            const payload: any = { adminChatId, autoAttendance, autoPayment, autoLead, miniAppUrl };
            if (tokenInput.trim()) payload.botToken = tokenInput.trim();
            await api.put('/telegram/settings', payload);
            showToast('Sozlamalar saqlandi!', 'success');
            setTokenInput('');
            loadData();
        } catch { showToast('Saqlashda xatolik', 'error'); }
        finally { setSavingSettings(false); }
    };

    const sendBroadcastMsg = async () => {
        if (!broadcastMessage.trim()) return showToast('Xabar matnini kiriting', 'error');
        setSendingBroadcast(true);
        try {
            const res = await api.post('/telegram/broadcast', {
                message: broadcastMessage, targetType: broadcastTarget,
            });
            setBroadcastResult({ sent: res.data.sent, total: res.data.total || 0 });
            showToast(`${res.data.sent} kishiga xabar yuborildi!`, 'success');
            setBroadcastMessage('');
        } catch { showToast('Server xatosi', 'error'); }
        finally { setSendingBroadcast(false); }
    };

    const handleLinkStudent = async () => {
        if (!selectedStudent || !chatIdInput.trim()) return showToast("O'quvchi va Chat ID kiriting", 'error');
        setLinking(true);
        try {
            await api.post('/telegram/link-direct', {
                studentId: selectedStudent.id, telegramChatId: chatIdInput.trim(),
            });
            showToast(`${selectedStudent.name} ulandi!`, 'success');
            setSelectedStudent(null);
            setChatIdInput('');
            setStudentSearch('');
            loadStudents();
        } catch (e: any) { showToast(e.response?.data?.error || 'Xatolik', 'error'); }
        finally { setLinking(false); }
    };

    const saveStaffToken = async () => {
        if (!staffTokenInput.trim()) return showToast('Token kiriting', 'error');
        setSavingStaffToken(true);
        try {
            await api.put('/telegram/settings', { staffBotToken: staffTokenInput.trim() });
            showToast('Staff bot token saqlandi!', 'success');
            setStaffTokenInput('');
        } catch { showToast('Saqlashda xatolik', 'error'); }
        finally { setSavingStaffToken(false); }
    };

    const saveStaffMiniApp = async () => {
        setSavingStaffMiniApp(true);
        try {
            await api.put('/telegram/settings', { staffMiniAppUrl: staffMiniAppUrl.trim() });
            showToast('Staff portal URL saqlandi!', 'success');
        } catch { showToast('Saqlashda xatolik', 'error'); }
        finally { setSavingStaffMiniApp(false); }
    };

    const setStaffWebhookHandler = async () => {
        if (!staffWebhookUrl.trim()) return showToast('Webhook URL kiriting', 'error');
        setSettingStaffWebhook(true);
        try {
            const res = await api.post('/staff-telegram/set-webhook', { url: staffWebhookUrl.trim() });
            if (res.data.ok) { showToast("Staff bot webhook o'rnatildi! ✅", 'success'); loadStaffBotData(); }
            else showToast('Xato: ' + (res.data.description || ''), 'error');
        } catch { showToast('Server xatosi', 'error'); }
        finally { setSettingStaffWebhook(false); }
    };

    const sendStaffBroadcastHandler = async () => {
        if (!staffBroadcastMsg.trim()) return showToast('Xabar matnini kiriting', 'error');
        setSendingStaffBroadcast(true);
        try {
            const res = await api.post('/staff-telegram/broadcast', {
                text: staffBroadcastMsg, role: staffBroadcastRole || undefined,
            });
            setStaffBroadcastResult({ sent: res.data.sent, failed: res.data.failed });
            showToast(`${res.data.sent} xodimga xabar yuborildi!`, 'success');
            setStaffBroadcastMsg('');
        } catch { showToast('Server xatosi', 'error'); }
        finally { setSendingStaffBroadcast(false); }
    };

    // ─── Helpers ──────────────────────────────────────────────────────────────

    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.phone?.includes(studentSearch)
    ).slice(0, 20);
    const linkedCount = students.filter(s => s.telegramChatId).length;

    const inputCls = "w-full px-3 py-2 text-sm rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

    // ─── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const tabs: { id: ActiveTab; label: string; icon: any }[] = [
        { id: 'overview', label: 'Umumiy', icon: BarChart2 },
        { id: 'broadcast', label: 'Yuborish', icon: Megaphone },
        { id: 'link', label: 'Ulash', icon: Link2 },
        { id: 'settings', label: 'Sozlama', icon: Settings },
        { id: 'history', label: 'Tarix', icon: MessageSquare },
        { id: 'staffbot', label: 'Staff Bot', icon: Shield },
    ];

    return (
        <div className="p-6 space-y-5 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Telegram Bot</h1>
                        <p className="text-xs text-zinc-400">
                            {botStatus?.ok
                                ? <span className="text-emerald-500">✓ @{botStatus.username} — faol</span>
                                : <span className="text-red-400">✗ Bot ulanmagan</span>}
                        </p>
                    </div>
                </div>
                <button onClick={loadData} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-2xl overflow-x-auto scrollbar-hide">
                {tabs.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                                activeTab === t.id
                                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                            }`}
                        >
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
            {activeTab === 'overview' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    {/* Status card */}
                    <div className={`rounded-2xl border p-5 ${botStatus?.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                        <div className="flex items-center gap-3 mb-3">
                            {botStatus?.ok
                                ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                : <XCircle className="w-6 h-6 text-red-500" />}
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                    {botStatus?.ok ? `@${botStatus.username}` : 'Bot ulanmagan'}
                                </p>
                                <p className="text-xs text-zinc-500">{botStatus?.name || 'Sozlamalar → Bot tokenini kiriting'}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: "Bugun xabar", value: botStatus?.messagesToday ?? 0, icon: MessageSquare },
                                { label: "Ulangan o'quvchi", value: `${botStatus?.linkedStudents ?? 0}/${botStatus?.totalStudents ?? 0}`, icon: Users },
                                { label: "Jami yuborilgan", value: stats?.messages.sent ?? 0, icon: Send },
                            ].map(s => (
                                <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-xl p-3 text-center">
                                    <s.icon size={14} className="mx-auto mb-1 text-zinc-400" />
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{s.value}</p>
                                    <p className="text-[10px] text-zinc-400">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Coverage */}
                    {stats && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                            <p className="font-bold text-slate-900 dark:text-white mb-3">Qamrov</p>
                            <div className="space-y-3">
                                {[
                                    { label: "O'quvchilar", pct: stats.coverage.studentPct, count: stats.coverage.students, total: stats.coverage.totalStudents, color: 'bg-blue-500' },
                                    { label: "Ota-onalar", pct: stats.coverage.parentPct, count: stats.coverage.parents, total: stats.coverage.totalStudents, color: 'bg-violet-500' },
                                ].map(r => (
                                    <div key={r.label}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.label}</span>
                                            <span className="text-zinc-400">{r.count}/{r.total} ({r.pct}%)</span>
                                        </div>
                                        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <motion.div className={`h-full rounded-full ${r.color}`} initial={{ width: 0 }} animate={{ width: `${r.pct}%` }} transition={{ duration: 0.6 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Type breakdown */}
                    {stats?.byType && stats.byType.length > 0 && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                            <p className="font-bold text-slate-900 dark:text-white mb-3">Xabar turlari</p>
                            <div className="flex flex-wrap gap-2">
                                {stats.byType.map(b => (
                                    <div key={b.type} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${TYPE_COLORS[b.type] || 'bg-zinc-100 text-zinc-600'}`}>
                                        {TYPE_LABELS[b.type] || b.type}: {b.count}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Komandalar */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <p className="font-bold text-slate-900 dark:text-white mb-3">Bot komandalar</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { cmd: '/start', desc: "Asosiy menyu" },
                                { cmd: '/balance', desc: "Balans ko'rish" },
                                { cmd: '/attendance', desc: "Davomat tarixi" },
                                { cmd: '/pay <summa>', desc: "To'lov havolasi" },
                                { cmd: '/leads', desc: "Admin: lidlar" },
                                { cmd: '/stats', desc: "Admin: statistika" },
                            ].map(c => (
                                <div key={c.cmd} className="flex items-start gap-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                                    <code className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">{c.cmd}</code>
                                    <span className="text-xs text-zinc-500">{c.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ── BROADCAST ──────────────────────────────────────────────────── */}
            {activeTab === 'broadcast' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Megaphone size={16} className="text-blue-500" /> Ommaviy xabar</h3>
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Kimga yuborish</label>
                            <select value={broadcastTarget} onChange={e => setBroadcastTarget(e.target.value)} className={inputCls}>
                                <option value="all">Barcha faol o'quvchilar</option>
                                <option value="debtors">Faqat qarzdorlar</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Xabar matni (HTML qo'llab-quvvatlanadi)</label>
                            <textarea
                                value={broadcastMessage}
                                onChange={e => setBroadcastMessage(e.target.value)}
                                rows={5}
                                placeholder="<b>Hurmatli o'quvchi!</b>&#10;&#10;Bu yerga xabar yozing..."
                                className={`${inputCls} resize-none`}
                            />
                        </div>
                        {broadcastResult && (
                            <div className="flex gap-3">
                                <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Yuborildi</p>
                                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{broadcastResult.sent}</p>
                                </div>
                                <div className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-center">
                                    <p className="text-xs text-zinc-400">Jami</p>
                                    <p className="text-xl font-black text-zinc-700 dark:text-zinc-300">{broadcastResult.total}</p>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={sendBroadcastMsg}
                            disabled={sendingBroadcast || !broadcastMessage.trim()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                        >
                            {sendingBroadcast ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            {sendingBroadcast ? 'Yuborilmoqda...' : 'Yuborish'}
                        </button>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p className="font-bold flex items-center gap-1"><Info size={12} /> Eslatma</p>
                        <p>Faqat Telegram ga ulangan o'quvchilarga yuboriladi. Ulash uchun "Ulash" tabini ishlating.</p>
                    </div>
                </motion.div>
            )}

            {/* ── LINK ───────────────────────────────────────────────────────── */}
            {activeTab === 'link' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Link2 size={16} className="text-blue-500" /> O'quvchini ulash</h3>
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg font-bold">
                                {linkedCount}/{students.length} ulangan
                            </span>
                        </div>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                value={studentSearch}
                                onChange={e => { setStudentSearch(e.target.value); setSelectedStudent(null); }}
                                placeholder="O'quvchi ismi yoki telefon..."
                                className={`${inputCls} pl-8`}
                            />
                        </div>
                        {studentSearch && !selectedStudent && (
                            <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800 max-h-48 overflow-y-auto">
                                {filteredStudents.length === 0
                                    ? <p className="p-3 text-sm text-zinc-400 text-center">Topilmadi</p>
                                    : filteredStudents.map(s => (
                                        <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentSearch(s.name); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left">
                                            <GraduationCap size={14} className="text-zinc-400 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.name}</p>
                                                <p className="text-xs text-zinc-400">{s.phone}</p>
                                            </div>
                                            {s.telegramChatId && <Check size={14} className="ml-auto text-emerald-500 shrink-0" />}
                                        </button>
                                    ))}
                            </div>
                        )}
                        {selectedStudent && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center gap-2">
                                <GraduationCap size={14} className="text-blue-500" />
                                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{selectedStudent.name}</span>
                                {selectedStudent.telegramChatId && <span className="text-xs text-emerald-500 ml-auto">✓ allaqachon ulangan</span>}
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Telegram Chat ID</label>
                            <input
                                type="text"
                                value={chatIdInput}
                                onChange={e => setChatIdInput(e.target.value)}
                                placeholder="123456789"
                                className={inputCls}
                            />
                            <p className="text-xs text-zinc-400 mt-1">O'quvchi botga /start yuborsin → @userinfobot orqali ID olsin</p>
                        </div>
                        <button
                            onClick={handleLinkStudent}
                            disabled={linking || !selectedStudent || !chatIdInput.trim()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
                        >
                            {linking ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                            Ulash
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ── SETTINGS ───────────────────────────────────────────────────── */}
            {activeTab === 'settings' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Settings size={16} className="text-blue-500" /> Bot Sozlamalari</h3>

                        {/* Token */}
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                                Bot Token {settings?.botTokenSet && <span className="text-emerald-500 normal-case font-normal ml-1">✓ o'rnatilgan</span>}
                            </label>
                            <div className="relative">
                                <input type={showToken ? 'text' : 'password'} value={tokenInput}
                                    onChange={e => setTokenInput(e.target.value)}
                                    placeholder={settings?.botTokenSet ? "O'zgartirish uchun yangi token kiriting" : "1234567890:ABCDEFGabcdefg..."}
                                    className={`${inputCls} pr-10`} />
                                <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">@BotFather → /newbot → tokenni nusxa oling</p>
                        </div>

                        {/* Admin Chat ID */}
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Admin Chat ID</label>
                            <input value={adminChatId} onChange={e => setAdminChatId(e.target.value)}
                                placeholder="123456789" className={inputCls} />
                            <p className="text-xs text-zinc-400 mt-1">Bot ga /start yuboring → @userinfobot orqali ID olsin</p>
                        </div>

                        {/* Mini App URL */}
                        <div>
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">O'quvchi Mini App URL</label>
                            <div className="flex gap-2">
                                <input value={miniAppUrl} onChange={e => setMiniAppUrl(e.target.value)}
                                    placeholder="https://yoursite.com/portal" className={`${inputCls} flex-1`} />
                                <button onClick={() => { navigator.clipboard.writeText(miniAppUrl); showToast('Nusxalandi', 'success'); }}
                                    className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Auto toggles */}
                        <div className="space-y-2 pt-1">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Avtomatik Bildirishnomalar</p>
                            {[
                                { label: "Davomat: kelmagan kun ota-onaga xabar", value: autoAttendance, setter: setAutoAttendance },
                                { label: "To'lov: muddati o'tganda eslatma", value: autoPayment, setter: setAutoPayment },
                                { label: "Lid: yangi lid kelganda admin alert", value: autoLead, setter: setAutoLead },
                            ].map((item, i) => (
                                <label key={i} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl cursor-pointer">
                                    <button type="button" onClick={() => item.setter(!item.value)}
                                        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${item.value ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.value ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </button>
                                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.label}</span>
                                </label>
                            ))}
                        </div>

                        <button onClick={saveSettings} disabled={savingSettings}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                            {savingSettings ? <Loader2 size={15} className="animate-spin" /> : <Settings size={15} />}
                            Saqlash
                        </button>
                    </div>

                    {/* Webhook info */}
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Webhook manzil</p>
                        <div className="flex items-center gap-2">
                            <code className="text-xs text-zinc-600 dark:text-zinc-400 break-all flex-1">
                                {window.location.origin}/api/telegram/webhook
                            </code>
                            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/telegram/webhook`); showToast('Nusxalandi', 'success'); }}
                                className="shrink-0 p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 transition-colors">
                                <Copy size={13} />
                            </button>
                        </div>
                        <p className="text-xs text-zinc-400">BotFather → @{botStatus?.username || 'botingiz'} → Edit Bot → Edit Commands</p>
                    </div>
                </motion.div>
            )}

            {/* ── HISTORY ────────────────────────────────────────────────────── */}
            {activeTab === 'history' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {[
                            { value: '', label: 'Barchasi' }, { value: 'attendance', label: 'Davomat' },
                            { value: 'payment', label: "To'lov" }, { value: 'broadcast', label: 'Ommaviy' },
                            { value: 'manual', label: "Qo'lda" },
                        ].map(f => (
                            <button key={f.value} onClick={() => { setHistoryFilter(f.value); setHistoryPage(1); }}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${historyFilter === f.value ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <p className="font-bold text-slate-900 dark:text-white">Xabarlar tarixi</p>
                            <span className="text-xs text-zinc-400">{historyTotal} ta</span>
                        </div>

                        {historyLoading
                            ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-300" /></div>
                            : history.length === 0
                                ? <div className="p-10 text-center"><MessageSquare size={32} className="mx-auto mb-2 text-zinc-200 dark:text-zinc-700" /><p className="text-sm text-zinc-400">Xabarlar yo'q</p></div>
                                : <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {history.map(msg => (
                                        <div key={msg.id} className="flex items-start gap-3 p-4">
                                            <div className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${msg.status === 'sent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                                                {msg.status === 'sent' ? '✓' : '✗'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${TYPE_COLORS[msg.type] || 'bg-zinc-100 text-zinc-500'}`}>
                                                        {TYPE_LABELS[msg.type] || msg.type}
                                                    </span>
                                                    <span className="text-xs text-zinc-400 font-mono">→ {msg.chatId}</span>
                                                </div>
                                                <p className="text-sm text-slate-900 dark:text-white line-clamp-2">{msg.message}</p>
                                                {msg.error && <p className="text-xs text-red-500 mt-0.5">{msg.error}</p>}
                                            </div>
                                            <span className="text-xs text-zinc-400 shrink-0">{new Date(msg.createdAt).toLocaleDateString('uz-UZ')}</span>
                                        </div>
                                    ))}
                                </div>
                        }

                        {historyTotal > 20 && (
                            <div className="p-4 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
                                <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                                    className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 font-bold">← Oldingi</button>
                                <span className="text-sm text-zinc-500">{historyPage} / {Math.ceil(historyTotal / 20)}</span>
                                <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage >= Math.ceil(historyTotal / 20)}
                                    className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 disabled:opacity-40 font-bold">Keyingi →</button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── STAFF BOT ──────────────────────────────────────────────────── */}
            {activeTab === 'staffbot' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    {/* Webhook */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <Radio size={15} className="text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Webhook holati</p>
                                <p className="text-xs text-zinc-400">{staffWebhookInfo?.url || "O'rnatilmagan"}</p>
                            </div>
                            <span className={`ml-auto text-xs px-2 py-1 rounded-lg font-bold ${staffWebhookInfo?.url ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                {staffWebhookInfo?.url ? '✓ Faol' : "⚠ Yo'q"}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <input value={staffWebhookUrl} onChange={e => setStaffWebhookUrl(e.target.value)}
                                placeholder={`${window.location.origin}/api/staff-telegram/webhook`}
                                className={`${inputCls} flex-1`} />
                            <button onClick={setStaffWebhookHandler} disabled={settingStaffWebhook}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                {settingStaffWebhook ? <Loader2 size={14} className="animate-spin" /> : "O'rnat"}
                            </button>
                        </div>
                    </div>

                    {/* Staff bot token */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Shield size={15} className="text-violet-500" /> Staff Bot Token</p>
                        <p className="text-xs text-zinc-400">O'quvchi botidan alohida, xodimlar uchun bot</p>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input type={showStaffToken ? 'text' : 'password'} value={staffTokenInput}
                                    onChange={e => setStaffTokenInput(e.target.value)}
                                    placeholder="1234567890:ABCdef..."
                                    className={`${inputCls} pr-9`} />
                                <button onClick={() => setShowStaffToken(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                                    {showStaffToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            <button onClick={saveStaffToken} disabled={savingStaffToken}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                {savingStaffToken ? <Loader2 size={14} className="animate-spin" /> : 'Saqlash'}
                            </button>
                        </div>
                    </div>

                    {/* Staff Mini App URL */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Smartphone size={15} className="text-violet-500" /> Staff Portal URL</p>
                        <div className="flex gap-2">
                            <input value={staffMiniAppUrl} onChange={e => setStaffMiniAppUrl(e.target.value)}
                                placeholder="https://yoursite.com/staff-portal" className={`${inputCls} flex-1`} />
                            <button onClick={saveStaffMiniApp} disabled={savingStaffMiniApp}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                {savingStaffMiniApp ? <Loader2 size={14} className="animate-spin" /> : 'Saqlash'}
                            </button>
                        </div>
                    </div>

                    {/* Staff Broadcast */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Megaphone size={15} className="text-violet-500" /> Xodimlarga xabar</p>
                        <select value={staffBroadcastRole} onChange={e => setStaffBroadcastRole(e.target.value)} className={inputCls}>
                            <option value="">Barcha xodimlar</option>
                            <option value="TEACHER">Faqat o'qituvchilar</option>
                            <option value="MANAGER">Faqat menejerlar</option>
                            <option value="ADMIN">Faqat adminlar</option>
                        </select>
                        <textarea value={staffBroadcastMsg} onChange={e => setStaffBroadcastMsg(e.target.value)}
                            placeholder="Xodimlar uchun xabar..." rows={3}
                            className={`${inputCls} resize-none`} />
                        {staffBroadcastResult && (
                            <div className="flex gap-3">
                                <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                                    <p className="text-xs text-emerald-600">Yuborildi</p>
                                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{staffBroadcastResult.sent}</p>
                                </div>
                                <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                                    <p className="text-xs text-red-600">Xato</p>
                                    <p className="text-xl font-black text-red-700 dark:text-red-300">{staffBroadcastResult.failed}</p>
                                </div>
                            </div>
                        )}
                        <button onClick={sendStaffBroadcastHandler} disabled={sendingStaffBroadcast || !staffBroadcastMsg.trim()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
                            {sendingStaffBroadcast ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {sendingStaffBroadcast ? 'Yuborilmoqda...' : 'Yuborish'}
                        </button>
                    </div>

                    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 text-xs text-violet-700 dark:text-violet-300 space-y-1">
                        <p className="font-bold flex items-center gap-1"><Zap size={11} /> Staff Bot komandalar</p>
                        <p className="opacity-80">/start — telefon so'raydi → avtomatik ulash</p>
                        <p className="opacity-80">/today — bugungi darslar</p>
                        <p className="opacity-80">/mygroups — o'z guruhlari</p>
                        <p className="opacity-80">/stats — statistika (admin/manager)</p>
                        <p className="opacity-80">Webhook: {window.location.origin}/api/staff-telegram/webhook</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
