/**
 * Telegram Mini App — O'quvchi / Ota-ona Portali
 * Opens inside Telegram via Web App button.
 * Auth: Telegram.WebApp.initData → validated server-side.
 */
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen, Calendar, CreditCard, BarChart2,
    CheckCircle2, XCircle, Clock, AlertCircle,
    ChevronRight, RefreshCw, User, Phone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalStudent {
    id: string; name: string; photo?: string; status: string;
    phone?: string; email?: string;
}
interface Group {
    id: string; name: string; course: string; teacher: string;
    days: string; time: string; room: string; status: string;
}
interface MeData { linked: boolean; role: 'student' | 'parent'; student: PortalStudent; groups: Group[]; }

interface AttendanceRecord { id: string; date: string; status: string; group: string; course: string; note?: string; }
interface AttendanceSummary { present: number; absent: number; late: number; excused: number; total: number; }

interface PaymentItem { id: string; amount: number; dueDate?: string; month?: string; status: string; notes?: string; }
interface PaidItem { id: string; amount: number; date: string; method: string; month?: string; }

interface Assessment { id: string; title: string; type: string; score: number; maxScore: number; percent: number; date: string; subject?: string; }

interface ScheduleDay { day: number; dayName: string; items: ScheduleItem[]; }
interface ScheduleItem { groupName: string; course: string; teacher: string; startTime: string; endTime: string; room: string; }

// ─── Telegram WebApp types ─────────────────────────────────────────────────────

declare global {
    interface Window {
        Telegram?: {
            WebApp: {
                initData: string;
                initDataUnsafe: { user?: { id: number; first_name: string; username?: string; photo_url?: string } };
                ready(): void;
                expand(): void;
                close(): void;
                colorScheme: 'light' | 'dark';
                themeParams: {
                    bg_color?: string; text_color?: string;
                    hint_color?: string; button_color?: string; button_text_color?: string;
                    secondary_bg_color?: string;
                };
                BackButton: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void; };
                MainButton: {
                    text: string; isVisible: boolean;
                    show(): void; hide(): void;
                    setText(t: string): void;
                    onClick(fn: () => void): void;
                };
            }
        }
    }
}

// ─── API ──────────────────────────────────────────────────────────────────────

const API_BASE = '/api/portal';

async function portalFetch(endpoint: string, initData: string) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
            'x-telegram-init-data': initData,
            // Dev fallback: comment in for local testing
            // 'x-dev-chat-id': 'YOUR_CHAT_ID',
        },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number) { return n.toLocaleString('uz-UZ') + ' so\'m'; }
function formatDate(d: string) {
    try { return new Date(d).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' }); }
    catch { return d; }
}
const STATUS_COLOR: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};
const STATUS_LABEL: Record<string, string> = {
    present: '✅ Keldi', absent: '❌ Kelmadi', late: '⏰ Kech', excused: '📋 Sababli',
};
const DAY_SHORT = ['', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'home' | 'attendance' | 'payments' | 'grades' | 'schedule';

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: 'home', label: 'Asosiy', icon: User },
    { id: 'attendance', label: 'Davomat', icon: BookOpen },
    { id: 'payments', label: "To'lovlar", icon: CreditCard },
    { id: 'grades', label: 'Baholar', icon: BarChart2 },
    { id: 'schedule', label: 'Jadval', icon: Calendar },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TelegramPortal() {
    const [initData, setInitData] = useState<string | null>(null); // null = Telegram init kutilmoqda
    const [tgUser, setTgUser] = useState<{ name: string; photo?: string } | null>(null);
    const [isDark, setIsDark] = useState(false);

    const [tab, setTab] = useState<Tab>('home');
    const [meData, setMeData] = useState<MeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Tab data
    const [attendance, setAttendance] = useState<{ records: AttendanceRecord[]; summary: AttendanceSummary } | null>(null);
    const [payments, setPayments] = useState<{ unpaid: PaymentItem[]; recent: PaidItem[]; totalUnpaid: number } | null>(null);
    const [grades, setGrades] = useState<{ assessments: Assessment[]; avgScore: number | null } | null>(null);
    const [schedule, setSchedule] = useState<{ schedule: ScheduleDay[] } | null>(null);
    const [tabLoading, setTabLoading] = useState(false);

    // Init Telegram WebApp
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            const user = tg.initDataUnsafe?.user;
            if (user) setTgUser({ name: user.first_name, photo: user.photo_url });
            setIsDark(tg.colorScheme === 'dark');
            // initData ni eng oxirida set qilish — fetchMe triggerlanishi uchun
            setInitData(tg.initData || '');
        } else {
            // Telegram ichida emas — '' set qilsak 401 xatosi chiqadi
            setInitData('');
        }
    }, []);

    // Fetch me data — faqat initData null bo'lmaganida (Telegram init tugaganidan keyin)
    useEffect(() => {
        if (initData === null) return; // Telegram WebApp hali initsializatsiya bo'lmagan
        fetchMe();
    }, [initData]);

    const fetchMe = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await portalFetch('/me', initData ?? '');
            setMeData(data);
        } catch (e: any) {
            if (e.message === '404') setError('linked');
            else if (e.message === '401') setError('auth');
            else setError('network');
        } finally {
            setLoading(false);
        }
    };

    const loadTabData = useCallback(async (t: Tab) => {
        if (t === 'home' || !meData?.linked || initData === null) return;
        setTabLoading(true);
        try {
            if (t === 'attendance' && !attendance) {
                setAttendance(await portalFetch('/attendance', initData));
            } else if (t === 'payments' && !payments) {
                setPayments(await portalFetch('/payments', initData));
            } else if (t === 'grades' && !grades) {
                setGrades(await portalFetch('/grades', initData));
            } else if (t === 'schedule' && !schedule) {
                setSchedule(await portalFetch('/schedule', initData));
            }
        } catch { /* silently fail - data just won't show */ }
        finally { setTabLoading(false); }
    }, [initData, meData, attendance, payments, grades, schedule]);

    const switchTab = (t: Tab) => {
        setTab(t);
        loadTabData(t);
    };

    // ── Loading & Error states ──────────────────────────────────────────────

    if (loading) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center animate-pulse">
                    <BookOpen size={24} className="text-white" />
                </div>
                <p className="text-sm text-zinc-500">Yuklanmoqda...</p>
            </div>
        );
    }

    if (error === 'auth' || error === 'network') {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
                <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <XCircle size={32} className="text-red-500" />
                </div>
                <div>
                    <p className="font-bold text-lg">Kirish xatosi</p>
                    <p className="text-sm text-zinc-500 mt-1">Telegram orqali kirish talab qilinadi</p>
                </div>
                <button onClick={fetchMe} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold">
                    <RefreshCw size={14} /> Qayta urinish
                </button>
            </div>
        );
    }

    if (error === 'linked' || !meData?.linked) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
                <div className="w-20 h-20 rounded-3xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Phone size={36} className="text-amber-500" />
                </div>
                <div>
                    <p className="font-bold text-xl">Ro'yxatdan o'tilmagan</p>
                    <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                        Sizning Telegram hisobingiz tizimga ulanmagan.<br />
                        Botga <b>/start</b> yozing va telefon raqamingizni ulashing.
                    </p>
                </div>
                <div className="w-full max-w-xs p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-left space-y-2">
                    {['@TayyorlovMarkaz_bot ga yozing', '/start buyrug\'ini yuboring', 'Telefon raqamni ulashing tugmasini bosing', 'Portalga kirish tugmasi paydo bo\'ladi'].map((step, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-sm text-blue-700 dark:text-blue-300">
                            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            {step}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const { student, groups, role } = meData!;

    // ── Main App ────────────────────────────────────────────────────────────

    return (
        <div className={`min-h-screen flex flex-col ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
            {/* Header */}
            <header className={`sticky top-0 z-10 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border-b px-4 py-3`}>
                <div className="flex items-center gap-3">
                    {student.photo
                        ? <img src={student.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                        : <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                            {student.name.charAt(0)}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{student.name}</p>
                        <p className="text-xs text-zinc-500">
                            {role === 'parent' ? '👨‍👩‍👧 Ota-ona' : '👤 O\'quvchi'} •
                            <span className={`ml-1 ${student.status === 'active' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                                {student.status === 'active' ? 'Faol' : student.status}
                            </span>
                        </p>
                    </div>
                    <button onClick={fetchMe} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <RefreshCw size={15} className="text-zinc-400" />
                    </button>
                </div>
            </header>

            {/* Tab content */}
            <main className="flex-1 overflow-y-auto pb-20">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        className="p-4 space-y-4"
                    >
                        {/* HOME TAB */}
                        {tab === 'home' && (
                            <>
                                {/* Guruhlar */}
                                <section>
                                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Guruhlar</h2>
                                    {groups.length === 0 ? (
                                        <div className="text-center py-8 text-zinc-400 text-sm">Guruh yo'q</div>
                                    ) : groups.map(g => (
                                        <div key={g.id} className={`rounded-2xl border p-4 mb-3 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div>
                                                    <p className="font-bold">{g.name}</p>
                                                    <p className="text-sm text-zinc-500">{g.course}</p>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${g.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500'}`}>
                                                    {g.status === 'active' ? 'Faol' : g.status}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                {g.teacher && <div className="text-zinc-500">👨‍🏫 {g.teacher}</div>}
                                                {g.days && <div className="text-zinc-500">📅 {g.days}</div>}
                                                {g.time && <div className="text-zinc-500">🕐 {g.time}</div>}
                                                {g.room && <div className="text-zinc-500">🏫 {g.room}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </section>

                                {/* Quick links */}
                                <section>
                                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Tezkor o'tish</h2>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'attendance' as Tab, label: 'Davomat', icon: BookOpen, color: 'bg-blue-500' },
                                            { id: 'payments' as Tab, label: "To'lovlar", icon: CreditCard, color: 'bg-violet-500' },
                                            { id: 'grades' as Tab, label: 'Baholar', icon: BarChart2, color: 'bg-emerald-500' },
                                            { id: 'schedule' as Tab, label: 'Jadval', icon: Calendar, color: 'bg-amber-500' },
                                        ].map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => switchTab(item.id)}
                                                className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-zinc-200 hover:bg-zinc-50'}`}
                                            >
                                                <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                                                    <item.icon size={18} className="text-white" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm">{item.label}</p>
                                                    <ChevronRight size={12} className="text-zinc-400 mt-0.5" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            </>
                        )}

                        {/* ATTENDANCE TAB */}
                        {tab === 'attendance' && (
                            <>
                                {tabLoading && <Spinner />}
                                {!tabLoading && attendance && (
                                    <>
                                        {/* Summary */}
                                        <div className={`rounded-2xl border p-4 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">So'nggi 30 kun</p>
                                            <div className="grid grid-cols-4 gap-2 text-center">
                                                {[
                                                    { label: 'Keldi', val: attendance.summary.present, color: 'text-emerald-500' },
                                                    { label: 'Kelmadi', val: attendance.summary.absent, color: 'text-red-500' },
                                                    { label: 'Kech', val: attendance.summary.late, color: 'text-amber-500' },
                                                    { label: 'Sababli', val: attendance.summary.excused, color: 'text-blue-500' },
                                                ].map(s => (
                                                    <div key={s.label}>
                                                        <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
                                                        <p className="text-xs text-zinc-500">{s.label}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            {attendance.summary.total > 0 && (
                                                <div className="mt-3">
                                                    <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                                                        {attendance.summary.present > 0 && <div className="bg-emerald-500" style={{ flex: attendance.summary.present }} />}
                                                        {attendance.summary.absent > 0 && <div className="bg-red-500" style={{ flex: attendance.summary.absent }} />}
                                                        {attendance.summary.late > 0 && <div className="bg-amber-500" style={{ flex: attendance.summary.late }} />}
                                                        {attendance.summary.excused > 0 && <div className="bg-blue-500" style={{ flex: attendance.summary.excused }} />}
                                                    </div>
                                                    <p className="text-xs text-zinc-400 mt-1 text-right">
                                                        {Math.round(attendance.summary.present / attendance.summary.total * 100)}% davomat
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Records */}
                                        <div className="space-y-2">
                                            {attendance.records.map(r => (
                                                <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_COLOR[r.status]}`}>
                                                        {STATUS_LABEL[r.status] || r.status}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate">{r.group}</p>
                                                        {r.note && <p className="text-xs text-zinc-400 truncate">{r.note}</p>}
                                                    </div>
                                                    <p className="text-xs text-zinc-400 flex-shrink-0">{formatDate(r.date)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        {/* PAYMENTS TAB */}
                        {tab === 'payments' && (
                            <>
                                {tabLoading && <Spinner />}
                                {!tabLoading && payments && (
                                    <>
                                        {payments.totalUnpaid > 0 && (
                                            <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                                                    <p className="font-bold text-red-800 dark:text-red-200">To'lanmagan</p>
                                                </div>
                                                <p className="text-2xl font-black text-red-600 dark:text-red-400">{formatMoney(payments.totalUnpaid)}</p>
                                            </div>
                                        )}

                                        {payments.unpaid.length > 0 && (
                                            <section>
                                                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Kutilayotgan</h2>
                                                <div className="space-y-2">
                                                    {payments.unpaid.map(p => (
                                                        <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                                                                {p.status === 'overdue' ? <XCircle size={18} className="text-red-500" /> : <Clock size={18} className="text-amber-500" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm">{formatMoney(p.amount)}</p>
                                                                <p className="text-xs text-zinc-500">
                                                                    {p.month || ''} {p.dueDate ? `• ${formatDate(p.dueDate)} gacha` : ''}
                                                                </p>
                                                            </div>
                                                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${p.status === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                                {p.status === 'overdue' ? 'Muddati o\'tdi' : 'Kutilmoqda'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {payments.recent.length > 0 && (
                                            <section>
                                                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">So'nggi to'lovlar</h2>
                                                <div className="space-y-2">
                                                    {payments.recent.map(p => (
                                                        <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                                                <CheckCircle2 size={18} className="text-emerald-500" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm">{formatMoney(p.amount)}</p>
                                                                <p className="text-xs text-zinc-500">{p.method} {p.month ? `• ${p.month}` : ''}</p>
                                                            </div>
                                                            <p className="text-xs text-zinc-400 flex-shrink-0">{formatDate(p.date)}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {payments.unpaid.length === 0 && payments.recent.length === 0 && (
                                            <EmptyState icon={CreditCard} text="To'lov ma'lumotlari yo'q" />
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* GRADES TAB */}
                        {tab === 'grades' && (
                            <>
                                {tabLoading && <Spinner />}
                                {!tabLoading && grades && (
                                    <>
                                        {grades.avgScore !== null && (
                                            <div className={`rounded-2xl border p-4 text-center ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">O'rtacha ball</p>
                                                <p className={`text-5xl font-black ${grades.avgScore >= 70 ? 'text-emerald-500' : grades.avgScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {grades.avgScore}%
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {grades.assessments.map(a => (
                                                <div key={a.id} className={`p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-sm truncate">{a.title}</p>
                                                            <p className="text-xs text-zinc-500">{a.subject || a.type} • {formatDate(a.date)}</p>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className={`font-black text-lg leading-none ${a.percent >= 70 ? 'text-emerald-500' : a.percent >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                                {a.score}
                                                            </p>
                                                            <p className="text-xs text-zinc-400">/ {a.maxScore}</p>
                                                        </div>
                                                    </div>
                                                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${a.percent >= 70 ? 'bg-emerald-500' : a.percent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{ width: `${a.percent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}

                                            {grades.assessments.length === 0 && <EmptyState icon={BarChart2} text="Baho ma'lumotlari yo'q" />}
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        {/* SCHEDULE TAB */}
                        {tab === 'schedule' && (
                            <>
                                {tabLoading && <Spinner />}
                                {!tabLoading && schedule && (
                                    <>
                                        {schedule.schedule.length === 0 ? (
                                            <EmptyState icon={Calendar} text="Jadval ma'lumoti yo'q" />
                                        ) : (
                                            <div className="space-y-4">
                                                {/* Day chips */}
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                                    {[1, 2, 3, 4, 5, 6, 7].map(d => {
                                                        const hasClass = schedule.schedule.some(s => s.day === d);
                                                        const today = new Date().getDay() || 7;
                                                        return (
                                                            <div key={d} className={`flex-shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-colors ${d === today ? 'bg-blue-500 text-white' : hasClass ? (isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-700') : 'opacity-30 ' + (isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-100 text-zinc-400')}`}>
                                                                {DAY_SHORT[d]}
                                                                {hasClass && <div className={`w-1 h-1 rounded-full mt-0.5 ${d === today ? 'bg-white' : 'bg-blue-500'}`} />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {schedule.schedule.map(dayData => (
                                                    <div key={dayData.day}>
                                                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{dayData.dayName}</h3>
                                                        <div className="space-y-2">
                                                            {dayData.items.map((item, i) => (
                                                                <div key={i} className={`flex gap-3 p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                                    <div className="text-center flex-shrink-0">
                                                                        <p className="text-sm font-black">{item.startTime}</p>
                                                                        <p className="text-xs text-zinc-400">{item.endTime}</p>
                                                                    </div>
                                                                    <div className="w-px bg-blue-500/30" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-bold text-sm">{item.groupName}</p>
                                                                        <p className="text-xs text-zinc-500">{item.course}</p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            {item.teacher && <span className="text-xs text-zinc-400">👨‍🏫 {item.teacher}</span>}
                                                                            {item.room && <span className="text-xs text-zinc-400">🏫 {item.room}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            <nav className={`fixed bottom-0 left-0 right-0 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border-t flex safe-pb`}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => switchTab(t.id)}
                        className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${tab === t.id ? 'text-blue-500' : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                        <t.icon size={18} />
                        <span className="text-[10px] font-bold leading-none">{t.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
    return (
        <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
    return (
        <div className="flex flex-col items-center py-12 gap-3 text-zinc-400">
            <Icon size={40} className="opacity-20" />
            <p className="text-sm">{text}</p>
        </div>
    );
}
