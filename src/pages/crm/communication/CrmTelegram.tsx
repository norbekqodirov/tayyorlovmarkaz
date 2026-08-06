import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Send, Settings, CheckCircle2, XCircle, Users, MessageSquare,
    RefreshCw, AlertCircle, Bot, Megaphone, Bell, Radio,
    GraduationCap, Eye, EyeOff, BarChart2, Link2, Copy,
    Smartphone, QrCode, Zap, Info,
    ArrowRight, Check,
} from 'lucide-react';
import { useToast } from '../../../components/Toast';
import api from '../../../api/client';

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
}

const TYPE_LABELS: Record<string, string> = {
    attendance: 'Davomat',
    payment: "To'lov",
    grade: 'Baho',
    lead: 'Lid',
    broadcast: 'Ommaviy',
    manual: "Qo'lda",
};
const TYPE_COLORS: Record<string, string> = {
    attendance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    payment: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    grade: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    lead: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    broadcast: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    manual: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

type ActiveTab = 'overview' | 'broadcast' | 'miniapp' | 'settings' | 'history' | 'staffbot';

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
    const [savingSettings, setSavingSettings] = useState(false);

    // Mini App
    const [miniAppUrl, setMiniAppUrl] = useState('');
    const [savingMiniApp, setSavingMiniApp] = useState(false);
    const [urlCopied, setUrlCopied] = useState(false);

    // Test
    const [testChatId, setTestChatId] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [sendingTest, setSendingTest] = useState(false);

    // Broadcast
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [broadcastTarget, setBroadcastTarget] = useState('all_parents');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);
    const [broadcastPreview, setBroadcastPreview] = useState(false);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyFilter, setHistoryFilter] = useState('');

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

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, historyPage, historyFilter]);
    useEffect(() => { if (activeTab === 'staffbot') loadStaffBotData(); }, [activeTab]);

    const loadData = async () => {
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
    };

    const loadHistory = async () => {
        try {
            const url = `/telegram/messages?page=${historyPage}&limit=20${historyFilter ? `&type=${historyFilter}` : ''}`;
            const res = await api.get(url);
            setHistory(res.data.data || []);
            setHistoryTotal(res.data.total || 0);
        } catch { }
    };

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            const payload: any = { adminChatId, autoAttendance, autoPayment, autoLead };
            if (tokenInput.trim()) payload.token = tokenInput.trim();
            await api.put('/telegram/settings', payload);
            showToast('Sozlamalar saqlandi!', 'success');
            setTokenInput('');
            loadData();
        } catch {
            showToast('Saqlashda xatolik', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const saveMiniApp = async () => {
        if (!miniAppUrl.trim()) return showToast('URL kiriting', 'error');
        if (!miniAppUrl.startsWith('https://')) return showToast("URL https:// bilan boshlanishi kerak", 'error');
        setSavingMiniApp(true);
        try {
            const res = await api.post('/telegram/set-menu-button', { url: miniAppUrl.trim() });
            showToast(res.data.message || 'Saqlandi!', res.data.ok ? 'success' : 'warning');
            loadData();
        } catch {
            showToast('Xatolik', 'error');
        } finally {
            setSavingMiniApp(false);
        }
    };

    const copyUrl = () => {
        navigator.clipboard.writeText(miniAppUrl).then(() => {
            setUrlCopied(true);
            setTimeout(() => setUrlCopied(false), 2000);
        });
    };

    const sendTest = async () => {
        if (!testChatId) return showToast('Chat ID kiriting', 'error');
        setSendingTest(true);
        try {
            const res = await api.post('/telegram/test', { chatId: testChatId, message: testMessage || undefined });
            if (res.data.ok) showToast('Test xabar yuborildi! ✅', 'success');
            else showToast('Xabar yuborishda xatolik: ' + (res.data.message || ''), 'error');
        } catch {
            showToast('Server xatosi', 'error');
        } finally {
            setSendingTest(false);
        }
    };

    const sendBroadcastMsg = async () => {
        if (!broadcastMessage.trim()) return showToast('Xabar matnini kiriting', 'error');
        setSendingBroadcast(true);
        try {
            const res = await api.post('/telegram/broadcast', { message: broadcastMessage, targetGroup: broadcastTarget });
            if (res.data.ok) {
                showToast(`${res.data.sent} kishiga xabar yuborildi!`, 'success');
                setBroadcastMessage('');
                loadData();
            } else {
                showToast(res.data.message || 'Xabar yuborishda xatolik', 'error');
            }
        } catch {
            showToast('Server xatosi', 'error');
        } finally {
            setSendingBroadcast(false);
        }
    };

    const loadStaffBotData = async () => {
        try {
            const [webhookRes, settingsRes] = await Promise.all([
                api.get('/staff-telegram/webhook-info').catch(() => ({ data: null })),
                api.get('/telegram/settings').catch(() => ({ data: {} })),
            ]);
            setStaffWebhookInfo(webhookRes.data?.result || webhookRes.data);
            setStaffMiniAppUrl((settingsRes.data as any).staffMiniAppUrl || '');
            if (!staffWebhookUrl) {
                setStaffWebhookUrl(`${window.location.origin}/api/staff-telegram/webhook`);
            }
        } catch {}
    };

    const saveStaffToken = async () => {
        if (!staffTokenInput.trim()) return showToast('Token kiriting', 'error');
        setSavingStaffToken(true);
        try {
            await api.put('/telegram/settings', { staff_bot_token: staffTokenInput.trim() });
            showToast('Staff bot token saqlandi!', 'success');
            setStaffTokenInput('');
            loadStaffBotData();
        } catch { showToast('Saqlashda xatolik', 'error'); }
        finally { setSavingStaffToken(false); }
    };

    const saveStaffMiniApp = async () => {
        if (!staffMiniAppUrl.trim()) return showToast('URL kiriting', 'error');
        setSavingStaffMiniApp(true);
        try {
            await api.put('/telegram/settings', { staffMiniAppUrl: staffMiniAppUrl.trim() });
            showToast('Staff portal URL saqlandi!', 'success');
        } catch { showToast('Saqlashda xatolik', 'error'); }
        finally { setSavingStaffMiniApp(false); }
    };

    const setStaffWebhookHandler = async () => {
        if (!staffWebhookUrl.trim()) return showToast("Webhook URL kiriting", 'error');
        setSettingStaffWebhook(true);
        try {
            const res = await api.post('/staff-telegram/set-webhook', { url: staffWebhookUrl.trim() });
            if (res.data.ok) {
                showToast("Staff bot webhook o'rnatildi! ✅", 'success');
                loadStaffBotData();
            } else {
                showToast('Xato: ' + (res.data.description || ''), 'error');
            }
        } catch { showToast('Server xatosi', 'error'); }
        finally { setSettingStaffWebhook(false); }
    };

    const sendStaffBroadcastHandler = async () => {
        if (!staffBroadcastMsg.trim()) return showToast('Xabar matnini kiriting', 'error');
        setSendingStaffBroadcast(true);
        try {
            const res = await api.post('/staff-telegram/broadcast', { text: staffBroadcastMsg, role: staffBroadcastRole || undefined });
            setStaffBroadcastResult({ sent: res.data.sent, failed: res.data.failed });
            showToast(`${res.data.sent} xodimga xabar yuborildi!`, 'success');
            setStaffBroadcastMsg('');
        } catch { showToast('Server xatosi', 'error'); }
        finally { setSendingStaffBroadcast(false); }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const tabs: { id: ActiveTab; label: string; icon: typeof Bot }[] = [
        { id: 'overview', label: 'Umumiy', icon: BarChart2 },
        { id: 'broadcast', label: 'Yuborish', icon: Send },
        { id: 'miniapp', label: 'Mini App', icon: Smartphone },
        { id: 'settings', label: 'Sozlama', icon: Settings },
        { id: 'history', label: 'Tarix', icon: MessageSquare },
        { id: 'staffbot', label: 'Staff Bot', icon: Radio },
    ];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Bot size={22} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-white">Telegram Bot</h1>
                        <p className="text-sm text-zinc-500">Bildirishnomalar · Mini App · Ommaviy xabarlar</p>
                    </div>
                </div>
                <button onClick={loadData} className="p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <RefreshCw size={16} className="text-zinc-500" />
                </button>
            </div>

            {/* Bot status banner */}
            <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-4 p-4 rounded-2xl border ${botStatus?.ok
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}
            >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${botStatus?.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
                    <Bot size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    {botStatus?.ok ? (
                        <>
                            <p className="font-bold text-emerald-800 dark:text-emerald-200">
                                @{botStatus.username}
                                <span className="ml-2 text-xs font-normal bg-emerald-200 dark:bg-emerald-800 px-2 py-0.5 rounded-full">Faol</span>
                            </p>
                            <p className="text-sm text-emerald-700 dark:text-emerald-400">Bugun {botStatus.sentToday} xabar yuborildi</p>
                        </>
                    ) : (
                        <>
                            <p className="font-bold text-red-800 dark:text-red-200">Bot ulanmagan</p>
                            <p className="text-sm text-red-600 dark:text-red-400">{botStatus?.error || 'Sozlamalar → Bot Token kiriting'}</p>
                        </>
                    )}
                </div>
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${botStatus?.ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            </motion.div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl overflow-x-auto scrollbar-hide">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`flex items-center gap-1.5 flex-shrink-0 py-2 px-3 rounded-xl text-sm font-bold transition-all ${activeTab === t.id
                            ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* OVERVIEW */}
            {activeTab === 'overview' && stats && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Jami xabar', value: stats.messages.total, icon: MessageSquare, color: 'blue' },
                            { label: 'Yuborilgan', value: stats.messages.sent, icon: CheckCircle2, color: 'emerald' },
                            { label: 'Xato', value: stats.messages.failed, icon: XCircle, color: 'red' },
                            { label: 'Bugun', value: stats.messages.today, icon: Radio, color: 'violet' },
                        ].map(s => (
                            <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                                <div className={`w-9 h-9 rounded-xl bg-${s.color}-100 dark:bg-${s.color}-900/30 flex items-center justify-center mb-3`}>
                                    <s.icon size={18} className={`text-${s.color}-600 dark:text-${s.color}-400`} />
                                </div>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{s.value.toLocaleString()}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Users size={16} className="text-blue-500" /> Qamrov darajasi
                        </h3>
                        <div className="space-y-5">
                            {[
                                { label: "O'quvchilar", val: stats.coverage.students, total: stats.coverage.totalStudents, pct: stats.coverage.studentPct, color: 'bg-blue-500', icon: GraduationCap },
                                { label: 'Ota-onalar', val: stats.coverage.parents, total: stats.coverage.totalStudents, pct: stats.coverage.parentPct, color: 'bg-emerald-500', icon: Users },
                            ].map(item => (
                                <div key={item.label}>
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-bold">
                                            <item.icon size={14} /> {item.label}
                                        </span>
                                        <span className="text-zinc-900 dark:text-white font-black">
                                            {item.val} / {item.total}
                                            <span className="text-zinc-400 font-normal ml-1.5 text-xs">({item.pct}%)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }} animate={{ width: `${item.pct}%` }}
                                            transition={{ duration: 0.8, ease: 'easeOut' }}
                                            className={`h-full ${item.color} rounded-full`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-start gap-2">
                            <Zap size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                O'quvchilar bot orqali /start yuborganda telefon raqami avtomatik tizimga ulanadi.
                            </p>
                        </div>
                    </div>

                    {stats.byType.length > 0 && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Bell size={16} className="text-violet-500" /> Xabar turlari
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {stats.byType.map(t => (
                                    <div key={t.type} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${TYPE_COLORS[t.type] || 'bg-zinc-100 text-zinc-500'}`}>
                                            {TYPE_LABELS[t.type] || t.type}
                                        </span>
                                        <span className="font-black text-slate-900 dark:text-white">{t.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* BROADCAST */}
            {activeTab === 'broadcast' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Zap size={16} className="text-amber-500" /> Test Xabar
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Telegram Chat ID</label>
                                <input value={testChatId} onChange={e => setTestChatId(e.target.value)} placeholder="Masalan: 123456789"
                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Xabar (ixtiyoriy)</label>
                                <textarea value={testMessage} onChange={e => setTestMessage(e.target.value)}
                                    placeholder="Bo'sh qoldirsangiz, standart test xabar yuboriladi" rows={2}
                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
                            </div>
                            <button onClick={sendTest} disabled={sendingTest || !testChatId}
                                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                                {sendingTest ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={15} />}
                                Test Yuborish
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Megaphone size={16} className="text-violet-500" /> Ommaviy Xabar
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Kimga?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: 'all_parents', label: 'Barcha ota-onalar', count: stats?.coverage.parents },
                                        { value: 'all_students', label: "Barcha o'quvchilar", count: stats?.coverage.students },
                                    ].map(opt => (
                                        <button key={opt.value} onClick={() => setBroadcastTarget(opt.value)}
                                            className={`text-left px-4 py-3 rounded-xl border text-sm font-bold transition-all ${broadcastTarget === opt.value
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                                            {opt.label}
                                            <span className="block text-xs font-normal text-zinc-400 mt-0.5">{opt.count ?? '—'} kishi</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Xabar matni</label>
                                    <button onClick={() => setBroadcastPreview(!broadcastPreview)} className="text-xs text-blue-500 font-bold">
                                        {broadcastPreview ? 'Yopish' : 'Preview'}
                                    </button>
                                </div>
                                {broadcastPreview && broadcastMessage ? (
                                    <div className="w-full min-h-[100px] px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm whitespace-pre-wrap">
                                        {broadcastMessage}
                                    </div>
                                ) : (
                                    <textarea value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)}
                                        placeholder="Xabar matnini kiriting... HTML teglari qo'llab-quvvatlanadi: <b>, <i>, <a href=''>"
                                        rows={5} className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
                                )}
                                <p className="text-xs text-zinc-400 mt-1">{broadcastMessage.length} belgi</p>
                            </div>
                            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                                <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 dark:text-amber-300">Bu xabar faqat Telegram Chat ID qo'shilgan kishilarga yuboriladi.</p>
                            </div>
                            <button onClick={sendBroadcastMsg} disabled={sendingBroadcast || !broadcastMessage.trim()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                                {sendingBroadcast ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Megaphone size={16} />}
                                Ommaviy Yuborish
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* MINI APP */}
            {activeTab === 'miniapp' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl p-6 text-white overflow-hidden relative">
                        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center"><Smartphone size={20} /></div>
                                <div>
                                    <p className="font-black text-lg">Telegram Mini App</p>
                                    <p className="text-sm text-blue-100">O'quvchi / Ota-ona Portali</p>
                                </div>
                            </div>
                            <p className="text-sm text-blue-100 leading-relaxed">
                                O'quvchilar va ota-onalar Telegram ichida to'g'ridan portalni ochib, davomat, to'lovlar va baho ma'lumotlarini ko'rishi mumkin.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4">
                                {["📚 Davomat", "💰 To'lovlar", '📊 Baholar', '📅 Jadval'].map(f => (
                                    <span key={f} className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-bold">{f}</span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                            <Link2 size={16} className="text-blue-500" /> Mini App URL
                        </h3>
                        <p className="text-xs text-zinc-500 mb-4">
                            Bu URL <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">/portal</code> sahifasiga to'g'ri yo'naltirilishi kerak.
                        </p>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input value={miniAppUrl} onChange={e => setMiniAppUrl(e.target.value)} placeholder="https://sizningsayt.uz/portal"
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                {miniAppUrl && (
                                    <button onClick={copyUrl} className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                        {urlCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-zinc-500" />}
                                    </button>
                                )}
                            </div>
                            {settings?.miniAppUrl && (
                                <div className="flex items-center gap-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(settings.miniAppUrl)}&bgcolor=ffffff&color=1e293b&margin=4`}
                                        alt="QR kod" className="w-20 h-20 rounded-lg"
                                    />
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                            <QrCode size={14} className="text-blue-500" /> QR kod
                                        </p>
                                        <p className="text-xs text-zinc-500 mt-1">Telegram da skaner qilish uchun</p>
                                        <p className="text-xs text-zinc-400 mt-0.5 font-mono break-all">{settings.miniAppUrl.substring(0, 40)}...</p>
                                    </div>
                                </div>
                            )}
                            <button onClick={saveMiniApp} disabled={savingMiniApp || !miniAppUrl.trim()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                                {savingMiniApp ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight size={15} />}
                                Saqlash va Bot Menu Button o'rnatish
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Info size={16} className="text-blue-500" /> Sozlash yo'riqnomasi
                        </h3>
                        <div className="space-y-3">
                            {[
                                { step: 1, title: 'Bot token kiriting', desc: "Sozlama → Bot Token maydoniga @BotFather dan olgan tokeningizni kiriting" },
                                { step: 2, title: 'Saytingizni deploy qiling', desc: "Mini App HTTPS URL kerak. Masalan: Vercel, Netlify, yoki o'z serveringiz" },
                                { step: 3, title: 'URL ni saqlang', desc: "Yuqoridagi maydonga URL kiriting va 'Saqlash' tugmasini bosing" },
                                { step: 4, title: "O'quvchilar ulashsin", desc: "O'quvchilar botga /start yuboring va telefon raqamini ulashsin" },
                                { step: 5, title: 'Portalni oching', desc: "Bot chat da paydo bo'ladigan 📱 Portal tugmasi orqali ochiladi" },
                            ].map(item => (
                                <div key={item.step} className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                                        {item.step}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                                        <p className="text-xs text-zinc-500">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                <Zap size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="font-bold text-emerald-800 dark:text-emerald-200">Avtomatik bog'lash</p>
                                <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                                    O'quvchi yoki ota-ona /start bosib telefon raqamini ulashsa, tizim avtomatik profiliga Telegram ID ni bog'laydi.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {["O'quvchi telefoni → student.telegramChatId", 'Ota-ona telefoni → student.parentTelegramId'].map(t => (
                                        <span key={t} className="text-xs bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 rounded-full font-bold">{t}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* SETTINGS */}
            {activeTab === 'settings' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                        <h3 className="font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                            <Settings size={16} className="text-blue-500" /> Bot Sozlamalari
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                                    Bot Token {settings?.botTokenSet && <span className="ml-2 text-emerald-500 normal-case font-normal">✓ o'rnatilgan</span>}
                                </label>
                                <div className="relative">
                                    <input type={showToken ? 'text' : 'password'} value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                                        placeholder={settings?.botTokenSet ? "O'zgartirish uchun yangi token kiriting" : "1234567890:ABCDEFGabcdefg..."}
                                        className="w-full px-4 py-2.5 pr-10 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                    <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                                        {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">@BotFather → /newbot → tokenni nusxa oling</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Admin Chat ID</label>
                                <input value={adminChatId} onChange={e => setAdminChatId(e.target.value)} placeholder="123456789"
                                    className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                                <p className="text-xs text-zinc-400 mt-1">Bot da /id buyrug'ini yuboring → raqamni oling</p>
                            </div>
                            <div className="space-y-2 pt-1">
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Avtomatik Bildirishnomalar</p>
                                {[
                                    { key: 'att', label: 'Davomat: kelmagan kun ota-onaga xabar', emoji: '📚', value: autoAttendance, setter: setAutoAttendance },
                                    { key: 'pay', label: "To'lov: muddati o'tganda eslatma", emoji: '💰', value: autoPayment, setter: setAutoPayment },
                                    { key: 'lead', label: 'Lid: yangi lid kelganda admin alert', emoji: '🎯', value: autoLead, setter: setAutoLead },
                                ].map(item => (
                                    <label key={item.key} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl cursor-pointer">
                                        <button type="button" onClick={() => item.setter(!item.value)}
                                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${item.value ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.value ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                        <span className="text-sm text-zinc-700 dark:text-zinc-300">{item.emoji} {item.label}</span>
                                    </label>
                                ))}
                            </div>
                            <button onClick={saveSettings} disabled={savingSettings}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                                {savingSettings ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Settings size={15} />}
                                Saqlash
                            </button>
                        </div>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Webhook manzil</p>
                        <code className="text-xs text-zinc-600 dark:text-zinc-400 break-all">
                            {window.location.origin}/api/telegram/webhook
                        </code>
                    </div>
                </motion.div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {[
                            { value: '', label: 'Barchasi' },
                            { value: 'attendance', label: 'Davomat' },
                            { value: 'payment', label: "To'lov" },
                            { value: 'broadcast', label: 'Ommaviy' },
                            { value: 'manual', label: "Qo'lda" },
                        ].map(f => (
                            <button key={f.value} onClick={() => { setHistoryFilter(f.value); setHistoryPage(1); }}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${historyFilter === f.value ? 'bg-blue-500 text-white' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <p className="font-bold text-slate-900 dark:text-white">Xabarlar tarixi</p>
                            <span className="text-xs text-zinc-400">{historyTotal} ta</span>
                        </div>
                        {history.length === 0 ? (
                            <div className="p-10 text-center">
                                <MessageSquare size={32} className="mx-auto mb-2 text-zinc-200 dark:text-zinc-700" />
                                <p className="text-sm text-zinc-400">Xabarlar yo'q</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {history.map(msg => (
                                    <div key={msg.id} className="flex items-start gap-3 p-4">
                                        <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${msg.status === 'sent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
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
                                        <span className="text-xs text-zinc-400 flex-shrink-0">
                                            {new Date(msg.createdAt).toLocaleDateString('uz-UZ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
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

            {/* STAFF BOT */}
            {activeTab === 'staffbot' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <Radio size={16} className="text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Webhook holati</p>
                                {staffWebhookInfo?.url
                                    ? <p className="text-xs text-zinc-400 truncate max-w-[260px]">{staffWebhookInfo.url}</p>
                                    : <p className="text-xs text-zinc-400">Webhook o'rnatilmagan</p>}
                            </div>
                            <div className="ml-auto">
                                {staffWebhookInfo?.url
                                    ? <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-1 rounded-lg font-bold">✓ Faol</span>
                                    : <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-1 rounded-lg font-bold">⚠ O'rnatilmagan</span>}
                            </div>
                        </div>
                        {staffWebhookInfo?.last_error_message && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-600 dark:text-red-400">
                                Oxirgi xato: {staffWebhookInfo.last_error_message}
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Webhook URL o'rnatish</label>
                            <div className="flex gap-2">
                                <input value={staffWebhookUrl} onChange={e => setStaffWebhookUrl(e.target.value)}
                                    placeholder="https://example.com/api/staff-telegram/webhook"
                                    className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                                <button onClick={setStaffWebhookHandler} disabled={settingStaffWebhook}
                                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                    {settingStaffWebhook ? <RefreshCw size={14} className="animate-spin" /> : "O'rnat"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Settings size={15} className="text-violet-500" /> Staff Bot Token
                        </p>
                        <p className="text-xs text-zinc-400">@BotFather dan olingan alohida staff bot token (o'quvchi botidan farqli)</p>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input type={showStaffToken ? 'text' : 'password'} value={staffTokenInput} onChange={e => setStaffTokenInput(e.target.value)}
                                    placeholder="1234567890:ABCdef..."
                                    className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-3 pr-9 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                                <button onClick={() => setShowStaffToken(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                                    {showStaffToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            <button onClick={saveStaffToken} disabled={savingStaffToken}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                {savingStaffToken ? <RefreshCw size={14} className="animate-spin" /> : 'Saqlash'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Smartphone size={15} className="text-violet-500" /> Staff Portal URL
                        </p>
                        <p className="text-xs text-zinc-400">Staff bot xabari havolasida ishlatiladi.</p>
                        <div className="flex gap-2">
                            <input value={staffMiniAppUrl} onChange={e => setStaffMiniAppUrl(e.target.value)}
                                placeholder="https://yoursite.com/staff-portal"
                                className="flex-1 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                            <button onClick={saveStaffMiniApp} disabled={savingStaffMiniApp}
                                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all">
                                {savingStaffMiniApp ? <RefreshCw size={14} className="animate-spin" /> : 'Saqlash'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Megaphone size={15} className="text-violet-500" /> Xodimlarga xabar yuborish
                        </p>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Maqsadli guruh</label>
                                <select value={staffBroadcastRole} onChange={e => setStaffBroadcastRole(e.target.value)}
                                    className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500">
                                    <option value="">Barcha xodimlar</option>
                                    <option value="TEACHER">Faqat o'qituvchilar</option>
                                    <option value="MANAGER">Faqat menejerlar</option>
                                    <option value="ADMIN">Faqat adminlar</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 block">Xabar matni</label>
                                <textarea value={staffBroadcastMsg} onChange={e => setStaffBroadcastMsg(e.target.value)}
                                    placeholder="Xodimlar uchun xabar..." rows={4}
                                    className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                            </div>
                            <button onClick={sendStaffBroadcastHandler} disabled={sendingStaffBroadcast || !staffBroadcastMsg.trim()}
                                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                                {sendingStaffBroadcast
                                    ? <><RefreshCw size={14} className="animate-spin" /> Yuborilmoqda...</>
                                    : <><Send size={14} /> Yuborish</>}
                            </button>
                            {staffBroadcastResult && (
                                <div className="flex gap-3">
                                    <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                                        <p className="text-xs text-emerald-600 font-medium">Yuborildi</p>
                                        <p className="font-bold text-lg text-emerald-700 dark:text-emerald-300">{staffBroadcastResult.sent}</p>
                                    </div>
                                    <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                                        <p className="text-xs text-red-600 font-medium">Xato</p>
                                        <p className="font-bold text-lg text-red-700 dark:text-red-300">{staffBroadcastResult.failed}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 text-sm text-violet-700 dark:text-violet-300 space-y-2">
                        <p className="font-bold">ℹ️ Staff Bot haqida</p>
                        <ul className="text-xs space-y-1 list-disc list-inside opacity-80">
                            <li>Xodimlar CRM sahifasidan Telegram ulash: Xodimlar → Telegram ID maydoni</li>
                            <li>Bot komandalar: /start, /today, /mygroups, /stats, /link</li>
                            <li>O'qituvchi faqat o'z guruhlarini ko'radi</li>
                            <li>Menejer/Admin barcha guruhlar va statistikani ko'radi</li>
                            <li>Webhook URL: {window.location.origin}/api/staff-telegram/webhook</li>
                        </ul>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
