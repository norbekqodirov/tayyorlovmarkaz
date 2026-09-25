/**
 * Telegram Mini App — O'quvchi / Ota-ona Portali
 * Opens inside Telegram via Web App button.
 * Auth: Telegram.WebApp.initData → validated server-side.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen, Calendar, CreditCard, BarChart2,
    CheckCircle2, XCircle, Clock, AlertCircle,
    ChevronRight, RefreshCw, User, Phone,
    MessageCircle, Send, ArrowLeft, Loader2
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
interface PortalChild { id: string; name: string; photo?: string; }
interface MeData { linked: boolean; role: 'student' | 'parent'; student: PortalStudent; groups: Group[]; children?: PortalChild[]; }

interface AttendanceRecord { id: string; date: string; status: string; group: string; course: string; note?: string; }
interface AttendanceSummary { present: number; absent: number; late: number; excused: number; total: number; }

interface PaymentItem { id: string; amount: number; dueDate?: string; month?: string; status: string; notes?: string; }
interface PaidItem { id: string; amount: number; date: string; method: string; month?: string; receiptNo?: string | null; refunded?: boolean; }
// Jonli rejim: CRM bilan bir xil manba — oylar (hisob davrlari) bo'yicha hisob, to'langan, qarz
interface LedgerCharge { id: string; type: string; month: string; groupName: string | null; from: string | null; to: string | null; lessons: number | null; groupLessons: number | null; amount: number; paid: number; debt: number; dueDate: string | null; overdue: boolean; explain?: string; }
interface Ledger { debt: number; credit: number; overdueDebt: number; charges: LedgerCharge[]; }
const dm = (d?: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');
interface MonthlyDueGroup { groupId: string; groupName: string; courseName: string; basePrice: number; absences: number; discountApplied: boolean; discount: number; finalPrice: number; }
interface MonthlyDue { month: string; total: number; totalBeforeDiscount: number; byGroup: MonthlyDueGroup[]; }

interface Assessment { id: string; title: string; type: string; score: number; maxScore: number; percent: number; date: string; subject?: string; }

interface ScheduleDay { day: number; dayName: string; items: ScheduleItem[]; }
interface ScheduleItem { groupName: string; course: string; teacher: string; startTime: string; endTime: string; room: string; }

interface ChatThread { key: string; title: string; subtitle: string; lastMessage: string | null; lastMessageAt: string | null; unread: number; }
interface ChatMessage { id: string; content: string; createdAt: string; fromMe: boolean; }

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

// URL dan token o'qish (bot xabari havola orqali)
function getUrlToken(): string {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
        // localStorage ga saqlash — keyingi tashrif uchun
        localStorage.setItem('portal_url_token', t);
        localStorage.setItem('portal_url_token_ts', String(Date.now()));
    }
    // localStorage dan ham olish
    const stored = localStorage.getItem('portal_url_token');
    const storedTs = parseInt(localStorage.getItem('portal_url_token_ts') || '0');
    if (stored && (Date.now() - storedTs) < 82_800_000) return stored; // 23 soat
    return '';
}

async function portalFetch(endpoint: string, initData: string) {
    const urlToken = getUrlToken();
    const headers: Record<string, string> = {};

    if (urlToken) {
        // URL token prioriteti yuqori
        headers['x-portal-token'] = urlToken;
    } else if (initData) {
        headers['x-telegram-init-data'] = initData;
    }

    // URL ga token qo'shish (server ham query param orqali qabul qiladi)
    const sep = endpoint.includes('?') ? '&' : '?';
    const tokenSuffix = urlToken ? `${sep}t=${encodeURIComponent(urlToken)}` : '';

    const res = await fetch(`${API_BASE}${endpoint}${tokenSuffix}`, { headers });
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const err = new Error(`${res.status}`) as any;
        err.debug = errBody.hint || errBody.error || '';
        throw err;
    }
    return res.json();
}

async function portalPost(endpoint: string, initData: string, body: any) {
    const urlToken = getUrlToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (urlToken) headers['x-portal-token'] = urlToken;
    else if (initData) headers['x-telegram-init-data'] = initData;

    const sep = endpoint.includes('?') ? '&' : '?';
    const tokenSuffix = urlToken ? `${sep}t=${encodeURIComponent(urlToken)}` : '';

    const res = await fetch(`${API_BASE}${endpoint}${tokenSuffix}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

// EDU-08: ota-onaning bir nechta farzandi bo'lsa, so'rov qaysi farzand
// uchunligini serverga aytish uchun `studentId` qo'shamiz.
function withStudentParam(endpoint: string, studentId: string | null): string {
    if (!studentId) return endpoint;
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${sep}studentId=${encodeURIComponent(studentId)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return "0 so'm";
    return Math.round(n).toLocaleString('ru-RU').replace(/\u00A0/g, ' ') + " so'm";
}

// Brauzerlar 'uz-UZ' oy nomlarini bilmaydi ("M09 17") — oy nomlari qo'lda
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function formatDate(d: string | null | undefined): string {
    if (!d) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (m) return `${Number(m[3])}-${UZ_MONTHS[Number(m[2]) - 1] ?? m[2]}`;
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
}

function formatTime(d: string | null | undefined): string {
    if (!d) return '';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
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

type Tab = 'home' | 'attendance' | 'payments' | 'grades' | 'schedule' | 'chat';

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: 'home', label: 'Asosiy', icon: User },
    { id: 'attendance', label: 'Davomat', icon: BookOpen },
    { id: 'payments', label: "To'lovlar", icon: CreditCard },
    { id: 'grades', label: 'Baholar', icon: BarChart2 },
    { id: 'schedule', label: 'Jadval', icon: Calendar },
    { id: 'chat', label: 'Xabar', icon: MessageCircle },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function TelegramPortal() {
    const [initData, setInitData] = useState<string | null>(null); // null = Telegram init kutilmoqda
    const [, setTgUser] = useState<{ name: string; photo?: string } | null>(null);
    const [isDark, setIsDark] = useState(false);

    const [tab, setTab] = useState<Tab>('home');
    const [meData, setMeData] = useState<MeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    // EDU-08: ota-onaning bir nechta farzandi bo'lsa, hozir qaysi biri ko'rsatilyapti
    const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

    // Tab data & error states
    const [attendance, setAttendance] = useState<{ records: AttendanceRecord[]; summary: AttendanceSummary } | null>(null);
    const [payments, setPayments] = useState<{ unpaid: PaymentItem[]; recent: PaidItem[]; totalUnpaid: number; monthlyDue?: MonthlyDue; ledger?: Ledger } | null>(null);
    const [grades, setGrades] = useState<{ assessments: Assessment[]; avgScore: number | null } | null>(null);
    const [schedule, setSchedule] = useState<{ schedule: ScheduleDay[] } | null>(null);
    const [tabLoading, setTabLoading] = useState(false);
    const [tabErrors, setTabErrors] = useState<Partial<Record<Tab, string>>>({});

    // Chat
    const [chatThreads, setChatThreads] = useState<ChatThread[] | null>(null);
    const [activeChatKey, setActiveChatKey] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[] | null>(null);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Init Telegram WebApp
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            const user = tg.initDataUnsafe?.user;
            if (user) setTgUser({ name: user.first_name, photo: user.photo_url });
            setIsDark(tg.colorScheme === 'dark');

            if (tg.initData) {
                // Muvaffaqiyatli Telegram auth — initData saqlash
                localStorage.setItem('tg_init_data', tg.initData);
                localStorage.setItem('tg_init_ts', String(Date.now()));
                setInitData(tg.initData);
            } else {
                // initData bo'sh — localStorage dan olish (so'nggi 23 soat ichida)
                const stored = localStorage.getItem('tg_init_data');
                const storedTs = parseInt(localStorage.getItem('tg_init_ts') || '0');
                const age = (Date.now() - storedTs) / 1000;
                if (stored && age < 82800) { // 23 soat
                    setInitData(stored);
                } else {
                    setInitData('');
                }
            }
        } else {
            // Telegram ichida emas
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
        const currentInitData = initData ?? '';
        try {
            const data = await portalFetch(withStudentParam('/me', activeStudentId), currentInitData);
            setMeData(data);
            if (!activeStudentId) setActiveStudentId(data.student.id);
        } catch (e: any) {
            console.error('Portal fetch error:', e.message, (e as any).debug, 'initData len:', currentInitData.length);
            if (e.message === '404') setError('linked');
            else if (e.message === '401') setError('auth');
            else setError('network');
        } finally {
            setLoading(false);
        }
    };

    const loadTabData = useCallback(async (t: Tab, force = false) => {
        if (t === 'home' || !meData?.linked || initData === null) return;
        setTabErrors(prev => ({ ...prev, [t]: undefined }));
        setTabLoading(true);
        try {
            if (t === 'attendance' && (!attendance || force)) {
                setAttendance(await portalFetch(withStudentParam('/attendance', activeStudentId), initData));
            } else if (t === 'payments' && (!payments || force)) {
                setPayments(await portalFetch(withStudentParam('/payments', activeStudentId), initData));
            } else if (t === 'grades' && (!grades || force)) {
                setGrades(await portalFetch(withStudentParam('/grades', activeStudentId), initData));
            } else if (t === 'schedule' && (!schedule || force)) {
                setSchedule(await portalFetch(withStudentParam('/schedule', activeStudentId), initData));
            } else if (t === 'chat' && (!chatThreads || force)) {
                setChatThreads(await portalFetch(withStudentParam('/chat-threads', activeStudentId), initData));
            }
        } catch (err: any) {
            console.error(`Portal tab [${t}] error:`, err);
            setTabErrors(prev => ({
                ...prev,
                [t]: err?.message === '401' ? "Sessiya muddati tugadi. Telegram bot orqali qayta kiring."
                   : err?.message === '404' ? "Ma'lumotlar topilmadi."
                   : "Ma'lumotlarni yuklashda xatolik yuz berdi."
            }));
        } finally {
            setTabLoading(false);
        }
    }, [initData, meData, attendance, payments, grades, schedule, chatThreads, activeStudentId]);

    const openChatThread = useCallback(async (key: string) => {
        setActiveChatKey(key);
        setChatMessages(null);
        setChatError(null);
        setChatLoading(true);
        try {
            const msgs = await portalFetch(withStudentParam(`/chat-threads/${key}`, activeStudentId), initData ?? '');
            setChatMessages(msgs);
        } catch (err: any) {
            console.error('Chat thread fetch error:', err);
            setChatError("Xabarlarni yuklashda xatolik yuz berdi.");
        } finally {
            setChatLoading(false);
        }
    }, [initData, activeStudentId]);

    const sendChatMessage = useCallback(async () => {
        if (!activeChatKey || !chatInput.trim()) return;
        setChatSending(true);
        try {
            const msg = await portalPost(`/chat-threads/${activeChatKey}`, initData ?? '', { content: chatInput.trim(), studentId: activeStudentId });
            setChatMessages(prev => [...(prev || []), { ...msg, fromMe: true }]);
            setChatInput('');
            setChatThreads(null); // ro'yxatni keyingi ochilishda yangilash uchun
        } catch (err) {
            console.error('Chat message send error:', err);
        } finally {
            setChatSending(false);
        }
    }, [activeChatKey, chatInput, initData, activeStudentId]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatMessages && activeChatKey) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeChatKey]);

    const switchTab = (t: Tab) => {
        setTab(t);
        loadTabData(t);
    };

    // EDU-08: farzand almashtirilganda barcha keshlangan tab ma'lumotlari
    // tozalanadi va joriy tab yangi farzand uchun qayta yuklanadi.
    const selectChild = useCallback((id: string) => {
        if (id === activeStudentId) return;
        setActiveStudentId(id);
        setAttendance(null);
        setPayments(null);
        setGrades(null);
        setSchedule(null);
        setChatThreads(null);
        setActiveChatKey(null);
        setChatMessages(null);
    }, [activeStudentId]);

    // activeStudentId o'zgarganda /me va joriy tabni shu farzand uchun qayta yuklash.
    // Birinchi marta activeStudentId o'rnatilishi fetchMe()ning o'zidan kelib chiqadi
    // (standart farzand) — shu holatda qayta so'rov yubormaslik uchun ref bilan o'tkazib
    // yuboriladi, faqat HAQIQIY almashtirishda (selectChild) qayta yuklanadi.
    const didSetInitialStudent = useRef(false);
    useEffect(() => {
        if (!activeStudentId || initData === null) return;
        if (!didSetInitialStudent.current) {
            didSetInitialStudent.current = true;
            return;
        }
        fetchMe();
        if (tab !== 'home') loadTabData(tab, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeStudentId]);

    // ── Loading & Error states ──────────────────────────────────────────────

    if (loading) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center animate-pulse shadow-lg shadow-blue-500/20">
                    <BookOpen size={24} className="text-white" />
                </div>
                <p className="text-sm font-bold text-zinc-500">Portal yuklanmoqda...</p>
            </div>
        );
    }

    if (error === 'auth' || error === 'network') {
        const isEmpty = (initData?.length ?? 0) === 0;
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center ${isDark ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-zinc-900'}`}>
                <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <XCircle size={32} className="text-red-500" />
                </div>
                <div>
                    <p className="font-bold text-lg">
                        {isEmpty ? "Telegram orqali oching" : "Kirish xatosi"}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                        {isEmpty
                            ? "Portalga kirish uchun botdagi tugmani bosing"
                            : "Telegram autentifikatsiyasi muammosi"}
                    </p>
                </div>
                {isEmpty && (
                    <div className="w-full max-w-xs p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-left space-y-2">
                        {["@tayyorlovmarkazbot ga yozing", "/start buyrug'ini yuboring", "Telefon raqamni ulashing", "\"📱 Portalga kirish\" tugmasini bosing"].map((step, i) => (
                            <div key={i} className="flex items-center gap-2.5 text-sm text-blue-700 dark:text-blue-300">
                                <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</span>
                                {step}
                            </div>
                        ))}
                    </div>
                )}
                {!isEmpty && (
                    <button
                        onClick={fetchMe}
                        className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
                    >
                        <RefreshCw size={15} /> Qayta urinish
                    </button>
                )}
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
                            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</span>
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
            <header className={`sticky top-0 z-10 ${isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-zinc-200'} backdrop-blur-md border-b px-4 py-3`}>
                <div className="flex items-center gap-3">
                    {student.photo
                        ? <img src={student.photo} alt={student.name} className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700" />
                        : <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-base shadow-sm">
                            {student.name.charAt(0)}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate leading-tight">{student.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {role === 'parent' ? '👨‍👩‍👧 Ota-ona' : '👤 O\'quvchi'} •
                            <span className={`ml-1 font-semibold ${student.status === 'active' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                                {student.status === 'active' ? 'Faol' : student.status}
                            </span>
                        </p>
                    </div>
                    <button
                        onClick={fetchMe}
                        aria-label="Yangilash"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors active:scale-95"
                    >
                        <RefreshCw size={16} className="text-zinc-400" />
                    </button>
                </div>

                {/* EDU-08: bir nechta farzand bo'lsa — almashtirish paneli */}
                {meData?.children && meData.children.length > 1 && (
                    <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-0.5" role="tablist" aria-label="Farzandni tanlash">
                        {meData.children.map(c => {
                            const isActive = c.id === activeStudentId;
                            return (
                                <button
                                    key={c.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => selectChild(c.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-bold whitespace-nowrap transition-colors active:scale-95 ${
                                        isActive
                                            ? 'bg-blue-500 text-white'
                                            : isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                                    }`}
                                >
                                    {c.photo
                                        ? <img src={c.photo} alt="" className="w-4 h-4 rounded-full object-cover" />
                                        : <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${isActive ? 'bg-white/20' : 'bg-blue-500/20 text-blue-500'}`}>{c.name.charAt(0)}</span>
                                    }
                                    {c.name}
                                </button>
                            );
                        })}
                    </div>
                )}
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
                                        <EmptyState icon={BookOpen} text="Hali hech qanday guruhga biriktirilmagansiz" />
                                    ) : groups.map(g => (
                                        <div key={g.id} className={`rounded-2xl border p-4 mb-3 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} shadow-sm`}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-base truncate">{g.name}</p>
                                                    <p className="text-xs text-zinc-500 truncate">{g.course}</p>
                                                </div>
                                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${g.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500'}`}>
                                                    {g.status === 'active' ? 'Faol' : g.status}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                                {g.teacher && <div className="text-zinc-500 truncate">👨‍🏫 {g.teacher}</div>}
                                                {g.days && <div className="text-zinc-500 truncate">📅 {g.days}</div>}
                                                {g.time && <div className="text-zinc-500 truncate">🕐 {g.time}</div>}
                                                {g.room && <div className="text-zinc-500 truncate">🏫 {g.room}</div>}
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
                                                className={`min-h-[56px] flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-zinc-200 hover:bg-zinc-50'}`}
                                            >
                                                <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                                                    <item.icon size={18} className="text-white" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-sm truncate">{item.label}</p>
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
                                {tabLoading && <TabSkeleton />}
                                {!tabLoading && tabErrors.attendance && (
                                    <TabErrorState error={tabErrors.attendance} onRetry={() => loadTabData('attendance', true)} />
                                )}
                                {!tabLoading && !tabErrors.attendance && attendance && (
                                    <>
                                        {/* Summary */}
                                        <div className={`rounded-2xl border p-4 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} shadow-sm`}>
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
                                                        <p className="text-xs text-zinc-500 font-medium">{s.label}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            {attendance.summary.total > 0 && (
                                                <div className="mt-3">
                                                    <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-zinc-100 dark:bg-zinc-800">
                                                        {attendance.summary.present > 0 && <div className="bg-emerald-500" style={{ flex: attendance.summary.present }} />}
                                                        {attendance.summary.absent > 0 && <div className="bg-red-500" style={{ flex: attendance.summary.absent }} />}
                                                        {attendance.summary.late > 0 && <div className="bg-amber-500" style={{ flex: attendance.summary.late }} />}
                                                        {attendance.summary.excused > 0 && <div className="bg-blue-500" style={{ flex: attendance.summary.excused }} />}
                                                    </div>
                                                    <p className="text-xs font-bold text-zinc-400 mt-1 text-right">
                                                        {Math.round(attendance.summary.present / attendance.summary.total * 100)}% davomat
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Records */}
                                        {attendance.records.length === 0 ? (
                                            <EmptyState icon={BookOpen} text="Davomat yozuvlari mavjud emas" />
                                        ) : (
                                            <div className="space-y-2">
                                                {attendance.records.map(r => (
                                                    <div key={r.id} className={`flex items-center gap-3 p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${STATUS_COLOR[r.status] || 'bg-zinc-100 text-zinc-600'}`}>
                                                            {STATUS_LABEL[r.status] || r.status}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-bold truncate">{r.group}</p>
                                                            {r.note && <p className="text-xs text-zinc-400 truncate mt-0.5">{r.note}</p>}
                                                        </div>
                                                        <p className="text-xs text-zinc-400 font-medium flex-shrink-0">{formatDate(r.date)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* PAYMENTS TAB */}
                        {tab === 'payments' && (
                            <>
                                {tabLoading && <TabSkeleton />}
                                {!tabLoading && tabErrors.payments && (
                                    <TabErrorState error={tabErrors.payments} onRetry={() => loadTabData('payments', true)} />
                                )}
                                {!tabLoading && !tabErrors.payments && payments && (
                                    <>
                                        {payments.ledger && (
                                            <>
                                                {/* Portal temasi isDark holati bilan boshqariladi (tizim temasi emas) */}
                                                <div className={`rounded-2xl border p-4 shadow-sm ${payments.ledger.debt > 0
                                                    ? (isDark ? 'bg-red-950/40 border-red-900' : 'bg-red-50 border-red-200')
                                                    : (isDark ? 'bg-emerald-950/40 border-emerald-900' : 'bg-emerald-50 border-emerald-200')}`}>
                                                    <p className={`text-xs font-bold ${payments.ledger.debt > 0 ? (isDark ? 'text-red-200' : 'text-red-800') : (isDark ? 'text-emerald-200' : 'text-emerald-800')}`}>
                                                        {payments.ledger.debt > 0 ? 'Jami qarz' : "Qarz yo'q"}
                                                    </p>
                                                    {payments.ledger.debt > 0 && <p className={`text-2xl font-black ${isDark ? 'text-red-400' : 'text-red-600'}`}>{formatMoney(payments.ledger.debt)}</p>}
                                                    {payments.ledger.overdueDebt > 0 && <p className={`text-xs mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>shundan muddati o'tgan: {formatMoney(payments.ledger.overdueDebt)}</p>}
                                                    {payments.ledger.credit > 0 && <p className={`text-xs mt-1 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Avans (keyingi hisoblarga): <b>{formatMoney(payments.ledger.credit)}</b></p>}
                                                </div>
                                                {payments.ledger.charges.length > 0 && (
                                                    <section>
                                                        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Oylik hisoblar</h2>
                                                        <div className="space-y-2">
                                                            {payments.ledger.charges.map(c => {
                                                                const st = c.debt <= 0 ? { t: "To'langan", cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
                                                                    : c.overdue ? { t: "Muddati o'tdi", cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' }
                                                                    : c.paid > 0 ? { t: 'Qisman', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
                                                                    : { t: 'Kutilmoqda', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
                                                                return (
                                                                    <div key={c.id} className={`p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="min-w-0">
                                                                                <p className="font-bold text-sm truncate">{c.groupName || (c.type === 'other_fee' ? "Boshqa to'lov" : 'Hisob')}</p>
                                                                                <p className="text-xs text-zinc-500">
                                                                                    {c.from ? `${dm(c.from)}–${dm(c.to)}` : c.month}
                                                                                    {c.lessons != null ? ` · ${c.lessons} dars` : ''}
                                                                                    {c.debt > 0 && c.dueDate ? ` · ${formatDate(c.dueDate)} gacha` : ''}
                                                                                </p>
                                                                            </div>
                                                                            <div className="text-right flex-shrink-0">
                                                                                <p className="font-bold text-sm">{formatMoney(c.amount)}</p>
                                                                                <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${st.cls}`}>{st.t}</span>
                                                                            </div>
                                                                        </div>
                                                                        {c.explain && <p className="text-[11px] text-zinc-400 mt-1.5">{c.explain}</p>}
                                                                        {c.paid > 0 && c.debt > 0 && (
                                                                            <p className="text-[11px] text-zinc-500 mt-1.5">To'langan {formatMoney(c.paid)} · qoldi <b className="text-red-600 dark:text-red-400">{formatMoney(c.debt)}</b></p>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </section>
                                                )}
                                            </>
                                        )}

                                        {payments.monthlyDue && payments.monthlyDue.byGroup.length > 0 && (
                                            <section>
                                                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                                                    Bu oy uchun hisoblangan to'lov ({payments.monthlyDue.month})
                                                </h2>
                                                <div className={`rounded-2xl border p-4 mb-3 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} shadow-sm`}>
                                                    <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatMoney(payments.monthlyDue.total)}</p>
                                                    {payments.monthlyDue.total < payments.monthlyDue.totalBeforeDiscount && (
                                                        <p className="text-xs text-zinc-400 line-through mt-0.5">{formatMoney(payments.monthlyDue.totalBeforeDiscount)}</p>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    {payments.monthlyDue.byGroup.map(g => (
                                                        <div key={g.groupId} className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm truncate">{g.courseName}</p>
                                                                <p className="text-xs text-zinc-500 truncate">
                                                                    {g.discountApplied
                                                                        ? `${g.absences} dars qoldirilgan — ${formatMoney(g.discount)} chegirma`
                                                                        : g.absences > 0 ? `${g.absences} dars qoldirilgan` : 'Barcha darslarda qatnashgan'}
                                                                </p>
                                                            </div>
                                                            <div className="text-right flex-shrink-0">
                                                                <p className="font-bold text-sm">{formatMoney(g.finalPrice)}</p>
                                                                {g.discountApplied && <p className="text-[10px] text-zinc-400 line-through">{formatMoney(g.basePrice)}</p>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {!payments.ledger && payments.totalUnpaid > 0 && (
                                            <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 shadow-sm">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                                                    <p className="font-bold text-red-800 dark:text-red-200 text-sm">Jami qarzdorlik</p>
                                                </div>
                                                <p className="text-2xl font-black text-red-600 dark:text-red-400">{formatMoney(payments.totalUnpaid)}</p>
                                            </div>
                                        )}

                                        {payments.unpaid.length > 0 && (
                                            <section>
                                                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Kutilayotgan to'lovlar</h2>
                                                <div className="space-y-2">
                                                    {payments.unpaid.map(p => (
                                                        <div key={p.id} className={`flex items-center gap-3 p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                                                                {p.status === 'overdue' ? <XCircle size={18} className="text-red-500" /> : <Clock size={18} className="text-amber-500" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm">{formatMoney(p.amount)}</p>
                                                                <p className="text-xs text-zinc-500 truncate">
                                                                    {p.month || ''} {p.dueDate ? `• ${formatDate(p.dueDate)} gacha` : ''}
                                                                </p>
                                                            </div>
                                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${p.status === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
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
                                                        <div key={p.id} className={`flex items-center gap-3 p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                                                <CheckCircle2 size={18} className="text-emerald-500" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm">{formatMoney(p.amount)}</p>
                                                                <p className="text-xs text-zinc-500 truncate">{p.method}{p.receiptNo ? ` • ${p.receiptNo}` : ''}{p.month ? ` • ${p.month}` : ''}{p.refunded ? ' • qaytarilgan' : ''}</p>
                                                            </div>
                                                            <p className="text-xs text-zinc-400 font-medium flex-shrink-0">{formatDate(p.date)}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {payments.unpaid.length === 0 && payments.recent.length === 0 && (!payments.monthlyDue || payments.monthlyDue.byGroup.length === 0) && !payments.ledger?.charges.length && (
                                            <EmptyState icon={CreditCard} text="Hali to'lovlar mavjud emas" />
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* GRADES TAB */}
                        {tab === 'grades' && (
                            <>
                                {tabLoading && <TabSkeleton />}
                                {!tabLoading && tabErrors.grades && (
                                    <TabErrorState error={tabErrors.grades} onRetry={() => loadTabData('grades', true)} />
                                )}
                                {!tabLoading && !tabErrors.grades && grades && (
                                    <>
                                        {grades.avgScore !== null && (
                                            <div className={`rounded-2xl border p-4 text-center ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} shadow-sm`}>
                                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">O'rtacha ball</p>
                                                <p className={`text-5xl font-black ${grades.avgScore >= 70 ? 'text-emerald-500' : grades.avgScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                    {grades.avgScore}%
                                                </p>
                                            </div>
                                        )}

                                        {grades.assessments.length === 0 ? (
                                            <EmptyState icon={BarChart2} text="Hali baholar kiritilmagan" />
                                        ) : (
                                            <div className="space-y-2">
                                                {grades.assessments.map(a => (
                                                    <div key={a.id} className={`p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm truncate">{a.title}</p>
                                                                <p className="text-xs text-zinc-500 truncate">{a.subject || a.type} • {formatDate(a.date)}</p>
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
                                                                className={`h-full rounded-full transition-all duration-300 ${a.percent >= 70 ? 'bg-emerald-500' : a.percent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                style={{ width: `${Math.min(100, Math.max(0, a.percent))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* SCHEDULE TAB */}
                        {tab === 'schedule' && (
                            <>
                                {tabLoading && <TabSkeleton />}
                                {!tabLoading && tabErrors.schedule && (
                                    <TabErrorState error={tabErrors.schedule} onRetry={() => loadTabData('schedule', true)} />
                                )}
                                {!tabLoading && !tabErrors.schedule && schedule && (
                                    <>
                                        {schedule.schedule.length === 0 ? (
                                            <EmptyState icon={Calendar} text="Dars jadvali mavjud emas" />
                                        ) : (
                                            <div className="space-y-4">
                                                {/* Day chips */}
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                                    {[1, 2, 3, 4, 5, 6, 7].map(d => {
                                                        const hasClass = schedule.schedule.some(s => s.day === d);
                                                        const today = new Date().getDay() || 7;
                                                        return (
                                                            <div
                                                                key={d}
                                                                className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all flex-shrink-0 select-none ${
                                                                    d === today
                                                                        ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                                                                        : hasClass
                                                                            ? (isDark ? 'bg-zinc-800 text-zinc-200 border border-zinc-700' : 'bg-zinc-100 text-zinc-700 border border-zinc-200')
                                                                            : 'opacity-30 ' + (isDark ? 'bg-zinc-900 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                                                                }`}
                                                            >
                                                                {DAY_SHORT[d]}
                                                                {hasClass && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${d === today ? 'bg-white' : 'bg-blue-500'}`} />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {schedule.schedule.map(dayData => (
                                                    <div key={dayData.day}>
                                                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{dayData.dayName}</h3>
                                                        <div className="space-y-2">
                                                            {dayData.items.map((item, i) => (
                                                                <div key={i} className={`flex gap-3 p-3.5 rounded-xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} shadow-sm`}>
                                                                    <div className="text-center flex-shrink-0">
                                                                        <p className="text-sm font-black">{item.startTime}</p>
                                                                        <p className="text-xs text-zinc-400">{item.endTime}</p>
                                                                    </div>
                                                                    <div className="w-px bg-blue-500/30 flex-shrink-0" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-bold text-sm truncate">{item.groupName}</p>
                                                                        <p className="text-xs text-zinc-500 truncate">{item.course}</p>
                                                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                            {item.teacher && <span className="text-xs text-zinc-400 truncate">👨‍🏫 {item.teacher}</span>}
                                                                            {item.room && <span className="text-xs text-zinc-400 truncate">🏫 {item.room}</span>}
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

                        {/* CHAT TAB */}
                        {tab === 'chat' && (
                            <>
                                {!activeChatKey ? (
                                    <>
                                        {tabLoading && <TabSkeleton />}
                                        {!tabLoading && tabErrors.chat && (
                                            <TabErrorState error={tabErrors.chat} onRetry={() => loadTabData('chat', true)} />
                                        )}
                                        {!tabLoading && !tabErrors.chat && chatThreads && (
                                            chatThreads.length === 0 ? (
                                                <EmptyState icon={MessageCircle} text="Suhbatlar mavjud emas" />
                                            ) : (
                                                <div className="space-y-2">
                                                    {chatThreads.map(th => (
                                                        <button
                                                            key={th.key}
                                                            onClick={() => openChatThread(th.key)}
                                                            className={`w-full min-h-[56px] flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors active:scale-[0.99] ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-zinc-200 hover:bg-zinc-50'}`}
                                                        >
                                                            <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0 text-white font-black text-base shadow-sm">
                                                                {th.title.charAt(0)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="font-bold text-sm truncate">{th.title}</p>
                                                                    {th.unread > 0 && (
                                                                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center min-w-[20px]">{th.unread}</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-zinc-500 truncate">{th.subtitle}</p>
                                                                {th.lastMessage && <p className="text-xs text-zinc-400 truncate mt-0.5">{th.lastMessage}</p>}
                                                            </div>
                                                            <ChevronRight size={16} className="text-zinc-400 flex-shrink-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        )}
                                    </>
                                ) : (
                                    <div className="flex flex-col h-[calc(100vh-170px)]">
                                        <button
                                            onClick={() => { setActiveChatKey(null); setChatMessages(null); setChatError(null); }}
                                            className="min-h-[44px] px-3 py-2 text-sm font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl flex items-center gap-2 active:scale-95 transition-all mb-2 flex-shrink-0 self-start"
                                        >
                                            <ArrowLeft size={16} /> {chatThreads?.find(t => t.key === activeChatKey)?.title || 'Orqaga'}
                                        </button>

                                        <div className="flex-1 overflow-y-auto space-y-2 pb-3 px-1">
                                            {chatLoading && <Spinner />}
                                            {!chatLoading && chatError && (
                                                <TabErrorState error={chatError} onRetry={() => openChatThread(activeChatKey)} />
                                            )}
                                            {!chatLoading && !chatError && chatMessages && chatMessages.length === 0 && (
                                                <EmptyState icon={MessageCircle} text="Hali xabar yo'q. Birinchi xabarni yozing." />
                                            )}
                                            {!chatLoading && !chatError && chatMessages && chatMessages.map(m => (
                                                <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm shadow-sm break-words ${m.fromMe ? 'bg-blue-500 text-white rounded-br-xs' : (isDark ? 'bg-zinc-800 text-white rounded-bl-xs' : 'bg-zinc-100 text-slate-900 rounded-bl-xs')}`}>
                                                        <p className="whitespace-pre-wrap">{m.content}</p>
                                                        <p className={`text-[10px] mt-1 text-right font-medium ${m.fromMe ? 'text-blue-100' : 'text-zinc-400'}`}>
                                                            {formatTime(m.createdAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            <div ref={messagesEndRef} />
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                                            <input
                                                type="text"
                                                value={chatInput}
                                                onChange={e => setChatInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !chatSending && chatInput.trim()) sendChatMessage(); }}
                                                placeholder="Xabar yozing..."
                                                className={`flex-1 px-4 py-3 min-h-[44px] rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-slate-900'}`}
                                            />
                                            <button
                                                onClick={sendChatMessage}
                                                disabled={chatSending || !chatInput.trim()}
                                                aria-label="Yuborish"
                                                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-blue-500 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
                                            >
                                                {chatSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            <nav className={`fixed bottom-0 left-0 right-0 ${isDark ? 'bg-zinc-900/95 border-zinc-800' : 'bg-white/95 border-zinc-200'} backdrop-blur-md border-t flex safe-pb z-20`}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => switchTab(t.id)}
                        className={`min-h-[48px] py-2 flex-1 flex flex-col items-center justify-center gap-1 transition-all select-none active:scale-95 ${tab === t.id ? 'text-blue-500 font-bold' : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                        <t.icon size={18} />
                        <span className="text-[10px] leading-none">{t.label}</span>
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

function TabSkeleton() {
    return (
        <div className="space-y-3 animate-pulse py-2">
            <div className="h-24 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-full" />
            <div className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full" />
            <div className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl w-full" />
        </div>
    );
}

function TabErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div className="p-6 text-center rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40 space-y-3 my-2 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-500 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
            </div>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{error}</p>
            <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
            >
                <RefreshCw size={15} /> Qayta urinish
            </button>
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-zinc-400 text-center">
            <Icon size={40} className="opacity-30" />
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{text}</p>
        </div>
    );
}
