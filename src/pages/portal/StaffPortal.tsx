/**
 * Staff Bot Mini App — Xodimlar Portali
 * O'qituvchi, Menejer, Admin, HR uchun alohida Telegram Mini App.
 * Auth: JWT token (bot /start havola) yoki Staff Bot initData.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, Users, CheckSquare, BarChart2, User,
    ChevronRight, RefreshCw, Clock, CheckCircle2, XCircle,
    AlertCircle, UserCheck, Search, Building2, BookOpen,
    TrendingUp, CreditCard, GraduationCap, Save, ArrowLeft,
    Fingerprint,
} from 'lucide-react';
import FaceIdCheckin from '../../components/portal/FaceIdCheckin';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffUser {
    id: string; name: string; role: string; avatar?: string; telegramChatId?: string;
    stats: Record<string, any>;
}

interface Lesson {
    scheduleId: string; groupId: string; groupName: string; course: string;
    teacher: string; teacherId: string; startTime: string; endTime: string;
    room: string; studentCount: number; attendanceMarked: boolean;
}

interface TodayData {
    dayName: string; day: number; date: string; lessons: Lesson[];
}

interface Group {
    id: string; name: string; course: string; teacher: string;
    studentCount: number; schedules: any[]; room: string; attendancePercent: number | null;
}

interface Student { id: string; name: string; photo?: string; phone?: string; status: string; groups: string[]; }

interface AttendanceRow { studentId: string; studentName: string; studentPhoto?: string; status: string; note?: string; }

type AttStatus = 'present' | 'absent' | 'late' | 'excused';
const ATT_CYCLE: AttStatus[] = ['present', 'absent', 'late', 'excused'];
const ATT_LABEL: Record<AttStatus, string> = { present: 'Keldi', absent: 'Kelmadi', late: 'Kechikdi', excused: 'Sababli' };
const ATT_COLOR: Record<AttStatus, string> = {
    present: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    late: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    excused: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

interface StatsData {
    studentCount: number; groupCount: number;
    today: { present: number; absent: number; total: number; percent: number | null };
    unpaid: { count: number; total: number };
    monthRevenue: number; newStudentsMonth: number;
}

// Telegram WebApp types are declared in TelegramPortal.tsx (global)

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_BASE = '/api/staff-portal';

function getUrlToken(): string {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
        localStorage.setItem('staff_url_token', t);
        localStorage.setItem('staff_url_token_ts', String(Date.now()));
    }
    const stored = localStorage.getItem('staff_url_token');
    const storedTs = parseInt(localStorage.getItem('staff_url_token_ts') || '0');
    if (stored && (Date.now() - storedTs) < 82_800_000) return stored; // 23h
    return '';
}

async function staffFetch(endpoint: string, initData: string, opts?: RequestInit) {
    const urlToken = getUrlToken();
    const headers: Record<string, string> = {
        ...(opts?.headers as Record<string, string> || {}),
    };

    if (urlToken) {
        headers['x-portal-token'] = urlToken;
    } else if (initData) {
        headers['x-telegram-init-data'] = initData;
    }

    const sep = endpoint.includes('?') ? '&' : '?';
    const tokenSuffix = urlToken ? `${sep}t=${encodeURIComponent(urlToken)}` : '';

    const res = await fetch(`${API_BASE}${endpoint}${tokenSuffix}`, {
        ...opts,
        headers,
    });

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const err = new Error(`${res.status}`) as any;
        err.debug = errBody.hint || errBody.error || '';
        throw err;
    }
    return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('uz-UZ') + ' so\'m'; }

function RoleLabel({ role }: { role: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        SUPER_ADMIN: { label: 'Super Admin', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
        ADMIN: { label: 'Admin', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
        MANAGER: { label: 'Menejer', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
        TEACHER: { label: "O'qituvchi", cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
        HR: { label: 'HR', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    };
    const r = map[role] || { label: role, cls: 'bg-zinc-100 text-zinc-700' };
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.cls}`}>{r.label}</span>;
}

// ─── Tab configs ──────────────────────────────────────────────────────────────

type TabId = 'today' | 'groups' | 'attendance' | 'grades' | 'profile' | 'stats' | 'students' | 'faceid';

function getTabsForRole(role: string): { id: TabId; label: string; icon: any }[] {
    const faceTab = { id: 'faceid' as TabId, label: 'Davomat', icon: Fingerprint };
    const base = [
        { id: 'today' as TabId, label: 'Bugun', icon: Calendar },
        { id: 'groups' as TabId, label: role === 'TEACHER' ? 'Guruhlarim' : 'Guruhlar', icon: Users },
        { id: 'attendance' as TabId, label: 'Jurnal', icon: CheckSquare },
        { id: 'profile' as TabId, label: 'Profil', icon: User },
    ];

    if (role === 'TEACHER') {
        return [
            base[0], base[1], faceTab, base[2],
            { id: 'grades' as TabId, label: 'Natijalar', icon: BarChart2 },
            base[3],
        ];
    }

    if (['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
        return [
            base[0], base[1], faceTab,
            { id: 'stats' as TabId, label: 'Statistika', icon: TrendingUp },
            base[3],
        ];
    }

    // HR
    return [
        { id: 'groups' as TabId, label: 'Xodimlar', icon: Users },
        faceTab,
        base[2],
        base[3],
    ];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-zinc-200 dark:bg-zinc-700 rounded ${className}`} />;
}

function StatCard({ label, value, icon: Icon, color = 'blue' }: {
    label: string; value: string | number; icon: any; color?: string;
}) {
    const colors: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400',
        green: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400',
        amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40 text-amber-600 dark:text-amber-400',
        red: 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/40 text-red-600 dark:text-red-400',
    };
    return (
        <div className={`rounded-xl border p-3 ${colors[color] || colors.blue}`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="opacity-70" />
                <span className="text-xs opacity-70 font-medium">{label}</span>
            </div>
            <div className="text-xl font-bold">{value}</div>
        </div>
    );
}

// ─── Tab: Today ───────────────────────────────────────────────────────────────

function TodayTab({ initData, role }: { initData: string; role: string }) {
    const [data, setData] = useState<TodayData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        staffFetch('/today', initData)
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [initData]);

    if (loading) return (
        <div className="space-y-3 p-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
    );

    if (!data || data.lessons.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <Calendar size={40} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">Bugun darslar yo'q</p>
                <p className="text-xs mt-1 opacity-60">{data?.dayName || ''}</p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {data.dayName} · {data.lessons.length} dars
            </p>
            {data.lessons.map((lesson, i) => (
                <motion.div
                    key={lesson.scheduleId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-3.5 shadow-sm"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate">
                                {lesson.groupName}
                            </div>
                            {lesson.course && (
                                <div className="text-xs text-zinc-400 mt-0.5">{lesson.course}</div>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                                <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {lesson.startTime}–{lesson.endTime}
                                </span>
                                {lesson.room && (
                                    <span className="flex items-center gap-1">
                                        <Building2 size={11} />
                                        {lesson.room}
                                    </span>
                                )}
                                <span className="flex items-center gap-1">
                                    <Users size={11} />
                                    {lesson.studentCount}
                                </span>
                            </div>
                            {role !== 'TEACHER' && lesson.teacher && (
                                <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                                    <User size={11} />
                                    {lesson.teacher}
                                </div>
                            )}
                        </div>
                        <div className="ml-2 shrink-0">
                            {lesson.attendanceMarked ? (
                                <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                                    ✓ Belgilangan
                                </span>
                            ) : (
                                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                    Belgilanmagan
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ─── Tab: Groups ──────────────────────────────────────────────────────────────

function GroupsTab({ initData, role, onSelectGroup }: {
    initData: string; role: string; onSelectGroup?: (g: Group) => void;
}) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        staffFetch('/groups', initData)
            .then(d => setGroups(d.groups || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [initData]);

    if (loading) return (
        <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
    );

    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <Users size={40} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">Guruhlar topilmadi</p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {groups.length} ta guruh
            </p>
            {groups.map((g, i) => (
                <motion.button
                    key={g.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => onSelectGroup?.(g)}
                    className="w-full bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-3.5 shadow-sm text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
                >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate">{g.name}</div>
                        <div className="text-xs text-zinc-400 mt-0.5 truncate">
                            {g.course || 'Kurs'}
                            {role !== 'TEACHER' && g.teacher ? ` · ${g.teacher}` : ''}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                            <span>{g.studentCount} o'quvchi</span>
                            {g.attendancePercent !== null && (
                                <span className={g.attendancePercent >= 80 ? 'text-emerald-500' : g.attendancePercent >= 60 ? 'text-amber-500' : 'text-red-500'}>
                                    {g.attendancePercent}% davomat
                                </span>
                            )}
                        </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-300 shrink-0" />
                </motion.button>
            ))}
        </div>
    );
}

// ─── Tab: Attendance ──────────────────────────────────────────────────────────

function AttendanceTab({ initData, role }: { initData: string; role: string }) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [students, setStudents] = useState<Student[]>([]);
    const [statuses, setStatuses] = useState<Record<string, AttStatus>>({});
    const [existingRecords, setExistingRecords] = useState<Record<string, AttStatus>>({});
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        staffFetch('/groups', initData)
            .then(d => setGroups(d.groups || []))
            .finally(() => setLoadingGroups(false));
    }, [initData]);

    const loadStudents = useCallback(async (group: Group, d: string) => {
        setLoadingStudents(true);
        setStudents([]);
        setStatuses({});
        setExistingRecords({});
        setSaved(false);
        try {
            const [studentsData, attData] = await Promise.all([
                staffFetch(`/groups/${group.id}/students`, initData),
                staffFetch(`/attendance?groupId=${group.id}&date=${d}`, initData).catch(() => ({ records: [] })),
            ]);

            const studs: Student[] = studentsData.students || [];
            setStudents(studs);

            const existing: Record<string, AttStatus> = {};
            for (const r of attData.records || []) {
                existing[r.studentId] = r.status as AttStatus;
            }
            setExistingRecords(existing);

            // Default: present (or existing)
            const init: Record<string, AttStatus> = {};
            for (const s of studs) {
                init[s.id] = existing[s.id] || 'present';
            }
            setStatuses(init);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingStudents(false);
        }
    }, [initData]);

    const handleSelectGroup = (g: Group) => {
        setSelectedGroup(g);
        loadStudents(g, date);
    };

    const handleDateChange = (d: string) => {
        setDate(d);
        if (selectedGroup) loadStudents(selectedGroup, d);
    };

    const cycleStatus = (studentId: string) => {
        setStatuses(prev => {
            const cur = prev[studentId] || 'present';
            const idx = ATT_CYCLE.indexOf(cur);
            const next = ATT_CYCLE[(idx + 1) % ATT_CYCLE.length];
            return { ...prev, [studentId]: next };
        });
        setSaved(false);
    };

    const handleSave = async () => {
        if (!selectedGroup) return;
        setSaving(true);
        try {
            const records = Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }));
            await staffFetch('/attendance', initData, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId: selectedGroup.id, date, records }),
            });
            setSaved(true);
            setExistingRecords({ ...statuses });
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    if (loadingGroups) return (
        <div className="space-y-3 p-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
    );

    // Group selection screen
    if (!selectedGroup) {
        return (
            <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Guruh tanlang</p>
                {groups.length === 0 && (
                    <div className="text-center py-10 text-zinc-400 text-sm">Guruhlar yo'q</div>
                )}
                {groups.map(g => (
                    <button
                        key={g.id}
                        onClick={() => handleSelectGroup(g)}
                        className="w-full bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-3.5 shadow-sm text-left flex items-center gap-3 active:scale-[0.98] transition-transform"
                    >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {g.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate">{g.name}</div>
                            <div className="text-xs text-zinc-400">{g.studentCount} o'quvchi</div>
                        </div>
                        <ChevronRight size={15} className="text-zinc-300 shrink-0" />
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSelectedGroup(null)}
                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <div className="font-semibold text-sm">{selectedGroup.name}</div>
                        <div className="text-xs text-zinc-400">{students.length} o'quvchi</div>
                    </div>
                </div>
                <input
                    type="date"
                    value={date}
                    onChange={e => handleDateChange(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Students list */}
            <div className="flex-1 overflow-auto p-4 space-y-2">
                {loadingStudents ? (
                    [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14" />)
                ) : students.length === 0 ? (
                    <div className="text-center py-10 text-zinc-400 text-sm">O'quvchilar topilmadi</div>
                ) : (
                    students.map(s => {
                        const st = statuses[s.id] || 'present';
                        const isChanged = st !== (existingRecords[s.id] || 'present');
                        return (
                            <button
                                key={s.id}
                                onClick={() => cycleStatus(s.id)}
                                className="w-full bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-3 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-transform"
                            >
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                                    {s.photo
                                        ? <img src={s.photo} alt="" className="w-full h-full object-cover" />
                                        : s.name.slice(0, 1)}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="font-medium text-sm text-zinc-800 dark:text-zinc-100 truncate">
                                        {s.name}
                                        {isChanged && <span className="ml-1 text-xs text-amber-500">●</span>}
                                    </div>
                                </div>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ATT_COLOR[st]}`}>
                                    {ATT_LABEL[st]}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Save button */}
            {students.length > 0 && (
                <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={handleSave}
                        disabled={saving || saved}
                        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                            saved
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]'
                        } disabled:opacity-60`}
                    >
                        {saving ? (
                            <RefreshCw size={15} className="animate-spin" />
                        ) : saved ? (
                            <><CheckCircle2 size={15} /> Saqlandi</>
                        ) : (
                            <><Save size={15} /> Saqlash ({students.length} ta)</>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Tab: Stats ───────────────────────────────────────────────────────────────

function StatsTab({ initData }: { initData: string }) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        staffFetch('/stats', initData)
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [initData]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="p-4 grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
    );

    if (!stats) return <div className="text-center py-16 text-zinc-400 text-sm">Statistika yuklanmadi</div>;

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Real-time statistika</p>
                <button onClick={load} className="text-xs text-blue-500 flex items-center gap-1">
                    <RefreshCw size={11} />
                    Yangilash
                </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <StatCard label="Faol o'quvchilar" value={stats.studentCount} icon={GraduationCap} color="blue" />
                <StatCard label="Faol guruhlar" value={stats.groupCount} icon={Users} color="green" />
                <StatCard
                    label="Bugungi davomat"
                    value={stats.today.percent !== null ? `${stats.today.percent}%` : '—'}
                    icon={UserCheck}
                    color={stats.today.percent !== null ? (stats.today.percent >= 80 ? 'green' : stats.today.percent >= 60 ? 'amber' : 'red') : 'blue'}
                />
                <StatCard label="Bugun keldi" value={stats.today.present} icon={CheckCircle2} color="green" />
                <StatCard label="Bugun kelmadi" value={stats.today.absent} icon={XCircle} color="red" />
                <StatCard label="Qarzdorlar" value={stats.unpaid.count} icon={AlertCircle} color="amber" />
            </div>
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Moliya</p>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">To'lanmagan jami</span>
                    <span className="font-bold text-red-600 dark:text-red-400 text-sm">{fmt(stats.unpaid.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Bu oy tushum</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{fmt(stats.monthRevenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Yangi o'quvchilar (bu oy)</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">+{stats.newStudentsMonth}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Tab: Students ────────────────────────────────────────────────────────────

function StudentsTab({ initData }: { initData: string }) {
    const [students, setStudents] = useState<Student[]>([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const load = useCallback((q: string) => {
        setLoading(true);
        staffFetch(`/students?search=${encodeURIComponent(q)}&limit=30`, initData)
            .then(d => { setStudents(d.students || []); setTotal(d.total || 0); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [initData]);

    useEffect(() => { load(''); }, [load]);

    const handleSearch = (v: string) => {
        setSearch(v);
        clearTimeout(debounce.current);
        debounce.current = setTimeout(() => load(v), 400);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Ism yoki telefon bo'yicha qidirish..."
                        className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <p className="text-xs text-zinc-400 mt-2">{total} ta o'quvchi</p>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-2">
                {loading ? (
                    [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14" />)
                ) : students.length === 0 ? (
                    <div className="text-center py-10 text-zinc-400 text-sm">O'quvchilar topilmadi</div>
                ) : (
                    students.map(s => (
                        <div key={s.id} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 p-3 shadow-sm flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                                {s.photo ? <img src={s.photo} alt="" className="w-full h-full object-cover" /> : s.name.slice(0, 1)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-zinc-800 dark:text-zinc-100 truncate">{s.name}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {s.phone && <span className="text-xs text-zinc-400">{s.phone}</span>}
                                    {s.groups.length > 0 && (
                                        <span className="text-xs text-blue-500 truncate">{s.groups.join(', ')}</span>
                                    )}
                                </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-zinc-100 text-zinc-500'
                            }`}>
                                {s.status === 'active' ? 'Faol' : s.status === 'graduated' ? 'Bitirdi' : "Ketdi"}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

function ProfileTab({ staffUser, initData }: { staffUser: StaffUser; initData: string }) {
    const { name, role, avatar, telegramChatId, stats } = staffUser;
    const isTeacher = role === 'TEACHER';

    return (
        <div className="p-4 space-y-4">
            {/* Avatar & info */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold overflow-hidden shrink-0">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : name.slice(0, 1)}
                </div>
                <div>
                    <div className="font-bold text-lg">{name}</div>
                    <RoleLabel role={role} />
                    <div className="text-xs text-white/70 mt-1">
                        {telegramChatId ? '🔗 Telegram ulangan' : '⚠️ Telegram ulanmagan'}
                    </div>
                </div>
            </div>

            {/* Stats */}
            {isTeacher && (
                <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Guruhlar" value={stats.groupCount || 0} icon={Users} color="blue" />
                    <StatCard label="Bugungi dars" value={stats.todayLessons || 0} icon={Calendar} color="green" />
                    <StatCard label="Davomat belgilandi" value={stats.attendanceMarkedToday || 0} icon={CheckSquare} color="amber" />
                </div>
            )}

            {/* Telegram info */}
            {!telegramChatId && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-semibold mb-1">⚠️ Telegram ulanmagan</p>
                    <p className="text-xs">Admin CRM orqali Telegram ID'ingizni bog'lashi kerak. Yoki /start buyrug'ini yuboring va Admin'ga Telegram ID'ingizni bering.</p>
                </div>
            )}

            {/* Info cards */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-100 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-700 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3">
                    <User size={15} className="text-zinc-400" />
                    <span className="text-sm text-zinc-500">Ism</span>
                    <span className="ml-auto text-sm font-medium">{name}</span>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                    <BookOpen size={15} className="text-zinc-400" />
                    <span className="text-sm text-zinc-500">Rol</span>
                    <span className="ml-auto"><RoleLabel role={role} /></span>
                </div>
                {telegramChatId && (
                    <div className="px-4 py-3 flex items-center gap-3">
                        <UserCheck size={15} className="text-zinc-400" />
                        <span className="text-sm text-zinc-500">Telegram ID</span>
                        <span className="ml-auto text-sm font-mono text-zinc-400">{telegramChatId}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StaffPortal() {
    const [initData, setInitData] = useState<string | null>(null);
    const [isDark, setIsDark] = useState(false);
    const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('today');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ msg: string; hint?: string } | null>(null);

    // Init Telegram WebApp
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            setIsDark(tg.colorScheme === 'dark');

            if (tg.initData) {
                localStorage.setItem('staff_tg_init_data', tg.initData);
                localStorage.setItem('staff_tg_init_ts', String(Date.now()));
                setInitData(tg.initData);
            } else {
                const stored = localStorage.getItem('staff_tg_init_data');
                const storedTs = parseInt(localStorage.getItem('staff_tg_init_ts') || '0');
                const age = (Date.now() - storedTs) / 1000;
                if (stored && age < 82800) {
                    setInitData(stored);
                } else {
                    setInitData('');
                }
            }
        } else {
            setInitData('');
        }
    }, []);

    // Dark mode
    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    // Fetch /me when initData ready
    useEffect(() => {
        if (initData === null) return;
        const urlToken = getUrlToken();
        if (!initData && !urlToken) {
            setError({ msg: 'Kirish xatosi', hint: 'Staff botdan /start buyrug\'ini yuboring va havolaga bosing' });
            return;
        }

        setLoading(true);
        setError(null);
        staffFetch('/me', initData)
            .then((data: StaffUser) => {
                setStaffUser(data);
                // Default tab by role
                if (['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(data.role)) {
                    setActiveTab('today');
                }
            })
            .catch((err: any) => {
                setError({
                    msg: err.message === '401' ? 'Autentifikatsiya xatosi' : `Xato: ${err.message}`,
                    hint: err.debug || 'Staff botdan /start buyrug\'ini yuboring',
                });
            })
            .finally(() => setLoading(false));
    }, [initData]);

    const tabs = staffUser ? getTabsForRole(staffUser.role) : [];

    // ── Loading screen
    if (loading || initData === null) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-4 border-blue-600/20 border-t-blue-600 animate-spin" />
                    <p className="text-sm text-zinc-400 font-medium">Yuklanmoqda...</p>
                </div>
            </div>
        );
    }

    // ── Error screen
    if (error) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center p-6 gap-4 ${isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
                <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <AlertCircle size={28} className="text-red-500" />
                </div>
                <div className="text-center">
                    <p className="font-bold text-lg">{error.msg}</p>
                    {error.hint && <p className="text-sm text-zinc-400 mt-2 max-w-xs">{error.hint}</p>}
                </div>
            </div>
        );
    }

    if (!staffUser) return null;

    return (
        <div className={`min-h-screen flex flex-col ${isDark ? 'dark bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>

            {/* Top bar */}
            <div className="bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
                    {staffUser.avatar
                        ? <img src={staffUser.avatar} alt="" className="w-full h-full object-cover" />
                        : staffUser.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{staffUser.name}</div>
                    <RoleLabel role={staffUser.role} />
                </div>
                <div className="text-xs text-zinc-400 hidden">Staff Portal</div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto pb-20">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="h-full"
                    >
                        {activeTab === 'today' && (
                            <TodayTab initData={initData} role={staffUser.role} />
                        )}
                        {activeTab === 'groups' && (
                            <GroupsTab initData={initData} role={staffUser.role} />
                        )}
                        {activeTab === 'attendance' && (
                            <AttendanceTab initData={initData} role={staffUser.role} />
                        )}
                        {activeTab === 'stats' && (
                            <StatsTab initData={initData} />
                        )}
                        {activeTab === 'students' && (
                            <StudentsTab initData={initData} />
                        )}
                        {activeTab === 'grades' && (
                            <div className="p-4 text-center text-zinc-400 py-16 text-sm">
                                <BarChart2 size={36} className="mx-auto mb-3 opacity-30" />
                                Natijalar bo'limi tez orada
                            </div>
                        )}
                        {activeTab === 'faceid' && (
                            <FaceIdCheckin initData={initData} staffName={staffUser.name} />
                        )}
                        {activeTab === 'profile' && (
                            <ProfileTab staffUser={staffUser} initData={initData} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Bottom nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-around px-2 py-2 z-20">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                                active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 dark:text-zinc-500'
                            }`}
                        >
                            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                            <span className={`text-[10px] font-medium ${active ? 'opacity-100' : 'opacity-60'}`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
