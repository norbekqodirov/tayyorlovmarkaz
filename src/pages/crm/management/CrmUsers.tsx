import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Plus, Edit2, Trash2, Shield, X, Eye, EyeOff,
    UserCheck, GraduationCap, Settings, Check,
    Lock, Mail, Phone, User, Search, ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { ErrorState, EmptyState } from '../../../components/States';

// ─── Permission Definitions ──────────────────────────────────────────
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../../../constants/permissions';

// 2026-09-15: statik ROLE_TEMPLATES ro'yxati olib tashlandi — endi yagona
// manba Sozlamalar > Rollar va Ruxsatlar sahifasida yaratiladigan haqiqiy
// Role/RolePermission jadvallari (server/routes/roles.ts, dbRoles state).
// Ko'rinish (rang/ikonka) esa baseRoleLevel'dan hosila qilinadi — bitta
// darajada ko'plab turli nomdagi Role bo'lishi mumkin (masalan "Menejer" va
// "Marketing Xodimi" ikkalasi ham MANAGER darajasida).
const BASE_LEVEL_STYLE: Record<string, { icon: LucideIcon; label: string; color: string; bg: string; border: string }> = {
    SUPER_ADMIN: { icon: Shield, label: 'Super Admin', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-300 dark:border-amber-700' },
    ADMIN: { icon: Shield, label: 'Administrator', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-300 dark:border-purple-700' },
    MANAGER: { icon: UserCheck, label: 'Menejer', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700' },
    TEACHER: { icon: GraduationCap, label: "O'qituvchi", color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700' },
};
const FALLBACK_LEVEL_STYLE = { icon: Settings, label: 'Boshqa', color: 'text-zinc-500', bg: 'bg-zinc-100 dark:bg-zinc-800', border: 'border-zinc-300 dark:border-zinc-700' };
function styleForLevel(level: string) {
    return BASE_LEVEL_STYLE[level] || FALLBACK_LEVEL_STYLE;
}
// Pastdan yuqoriga — "Maxsus" (hech qanday Role'ga bog'lanmagan) tanlovda
// asosiy ROLE_LEVEL darajasini qo'lda tanlash uchun.
const BASE_LEVELS = ['TEACHER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

function parsePerms(raw?: string): string[] {
    try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function permKey(perms: string[]): string {
    return [...perms].sort().join(',');
}

// Foydalanuvchiga ENG MOS Role'ni topadi — faqat KO'RSATISH uchun, hech
// qachon avtomatik `roleId` yozilmaydi (bu funksiya chaqirilgan joyda ham).
// Avval haqiqiy `roleId` (hali faol bo'lsa) tekshiriladi; aks holda —
// 2026-09-13'gacha (RBAC qayta qurishdan oldin) yoki eski andoza orqali
// yaratilgan/tahrirlangan, hali haqiqiy Role'ga bog'lanmagan foydalanuvchilar
// uchun — saqlangan role (ROLE_LEVEL) darajasidagi Role'lar orasidan xuddi
// shu permissions to'plamiga ega bo'lganini qidiradi. ADMIN va SUPER_ADMIN
// tizim rollari bir xil (to'liq) permissions to'plamiga ega bo'lgani uchun
// ular orasidagi farq faqat baseRoleLevel bo'yicha (permissions bo'yicha
// emas) hal qilinadi.
function resolveDisplayRole(user: { role: string; roleId?: string | null; permissions?: string }, dbRoles: DbRole[]): DbRole | null {
    if (user.roleId) {
        const linked = dbRoles.find(r => r.id === user.roleId);
        if (linked) return linked;
    }
    const sameLevel = dbRoles.filter(r => r.baseRoleLevel === user.role);
    if (sameLevel.length <= 1) return sameLevel[0] ?? null;
    const userKey = permKey(parsePerms(user.permissions));
    return sameLevel.find(r => permKey(r.permissionKeys) === userKey) ?? null;
}

interface CrmUser {
    id: string;
    email?: string;
    name: string;
    role: string;
    phone?: string;
    permissions?: string;
    isActive?: boolean;
    createdAt?: string;
    roleId?: string | null;
    roleRef?: { id: string; name: string; label: string } | null;
}

interface DbRole {
    id: string;
    label: string;
    baseRoleLevel: string;
    isActive: boolean;
    isSystem: boolean;
    permissionCount: number;
    permissionKeys: string[];
}

const EMPTY_FORM = {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'TEACHER',
    permissions: [] as string[],
    roleId: null as string | null,
};

export default function CrmUsers() {
    const [users, setUsers] = useState<CrmUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CrmUser | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<string[]>(PERMISSION_GROUPS);
    const { showToast } = useToast();
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; user: CrmUser | null }>({ open: false, user: null });

    // RBAC Bosqich 3 — Sozlamalar > Rollar va Ruxsatlar sahifasida
    // yaratilgan/tahrirlangan haqiqiy Role'lar. Yagona rol tanlash manbasi —
    // biriktirilganda foydalanuvchining role/permissions'i shu Role'dan
    // hosila bo'ladi (server/routes/auth.ts'dagi resolveRoleAssignment()).
    const [dbRoles, setDbRoles] = useState<DbRole[]>([]);
    const [accessInfo, setAccessInfo] = useState<any>(null);
    const [loadingAccess, setLoadingAccess] = useState(false);

    useEffect(() => {
        api.get('/roles').then(res => setDbRoles(Array.isArray(res.data) ? res.data.filter((r: DbRole) => r.isActive) : [])).catch(() => {});
    }, []);

    // Hozirgi kirgan foydalanuvchi ID si
    const currentUserId = (() => {
        try {
            return JSON.parse(localStorage.getItem('crm_user') || '{}')?.id;
        } catch {
            return null;
        }
    })();

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await api.get('/auth/users');
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setUsers([]);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const openCreate = () => {
        setEditingUser(null);
        setAccessInfo(null);
        setForm({ ...EMPTY_FORM });
        // Standart holat — tizim TEACHER roli (agar hali yuklangan/mavjud
        // bo'lsa); aks holda EMPTY_FORM'ning qo'lda belgilangan standarti
        // (role:'TEACHER', permissions:[]) qoladi.
        const defaultRole = dbRoles.find(r => r.isSystem && r.baseRoleLevel === 'TEACHER') || dbRoles[0];
        if (defaultRole) void applyDbRole(defaultRole.id);
        setIsModalOpen(true);
    };

    const openEdit = (user: CrmUser) => {
        setEditingUser(user);
        setAccessInfo(null);
        setForm({
            name: user.name,
            email: user.email || '',
            phone: user.phone || '',
            password: '',
            role: user.role,
            permissions: parsePerms(user.permissions),
            roleId: user.roleId || null,
        });
        setIsModalOpen(true);

        setLoadingAccess(true);
        api.get(`/auth/users/${user.id}/access`)
            .then(res => setAccessInfo(res.data))
            .catch(() => setAccessInfo(null))
            .finally(() => setLoadingAccess(false));
    };

    // Rol tanlash — endi yagona mexanizm: bo'sh roleId "Maxsus" (qo'lda
    // ruxsat belgilash, `form.role`/`form.permissions` o'zgarishsiz qoladi),
    // aks holda tanlangan Role'ning baseRoleLevel/permissionKeys'i
    // to'g'ridan-to'g'ri qo'llanadi.
    const applyDbRole = async (roleId: string) => {
        if (!roleId) {
            setForm(prev => ({ ...prev, roleId: null }));
            return;
        }
        try {
            const res = await api.get(`/roles/${roleId}`);
            setForm(prev => ({
                ...prev,
                role: res.data.baseRoleLevel,
                permissions: res.data.permissionKeys || [],
                roleId,
            }));
        } catch {
            showToast('Rolni yuklab bo\'lmadi', 'error');
        }
    };

    const togglePermission = (permId: string) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permId)
                ? prev.permissions.filter(p => p !== permId)
                : [...prev.permissions, permId],
            roleId: null,
        }));
    };

    const toggleGroup = (group: string) => {
        const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.id);
        const allSelected = groupPerms.every(p => form.permissions.includes(p));
        setForm(prev => ({
            ...prev,
            permissions: allSelected
                ? prev.permissions.filter(p => !groupPerms.includes(p))
                : [...new Set([...prev.permissions, ...groupPerms])],
            roleId: null,
        }));
    };

    const selectAllPermissions = () => {
        setForm(prev => ({
            ...prev,
            permissions: ALL_PERMISSIONS.map(p => p.id),
            roleId: null,
        }));
    };

    const deselectAllPermissions = () => {
        setForm(prev => ({
            ...prev,
            permissions: [],
            roleId: null,
        }));
    };

    const handleSave = async () => {
        const trimmedName = form.name.trim();
        if (!trimmedName) {
            showToast("Ism kiritilishi shart!", 'error');
            return;
        }

        const phoneDigits = form.phone.replace(/\D/g, '');
        if (phoneDigits.length !== 12) {
            showToast("Telefon raqami to'liq kiritilishi kerak (9 ta raqam)!", 'error');
            return;
        }

        if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
            showToast("Email manzili noto'g'ri shaklda!", 'error');
            return;
        }

        if (!editingUser && (!form.password || form.password.length < 6)) {
            showToast("Yangi foydalanuvchi uchun parol kamida 6 ta belgidan iborat bo'lishi kerak!", 'error');
            return;
        }

        if (editingUser && form.password && form.password.length < 6) {
            showToast("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak!", 'error');
            return;
        }

        // Oxirgi SUPER_ADMIN rolini tushirib qo'ymaslik xavfsizlik tekshiruvi.
        // MUHIM: faqat haqiqiy user.role/form.role maydoniga qaraladi —
        // resolveDisplayRole() faqat UI'da ko'rsatish uchun taxmin qiluvchi
        // evristika (jadvaldagi rol yorlig'i uchun), xavfsizlik qarori uchun
        // hech qachon ishlatilmasligi kerak.
        const superAdminCount = users.filter(u => u.role === 'SUPER_ADMIN').length;
        if (editingUser) {
            const isCurrentlySuperAdmin = editingUser.role === 'SUPER_ADMIN';
            const willBeSuperAdmin = form.role === 'SUPER_ADMIN';
            if (isCurrentlySuperAdmin && !willBeSuperAdmin && superAdminCount <= 1) {
                showToast("Tizimda kamida bitta Super Admin bo'lishi shart! Oxirgi Super Admin rolini tushira olmaysiz.", 'error');
                return;
            }

            // O'zini o'zi pastroq rolga tushirish ogohlantirishi
            if (currentUserId && editingUser.id === currentUserId && editingUser.role !== form.role) {
                const confirmed = window.confirm("Diqqat: O'z rolingizni o'zgartiryapsiz! Saqlangach ushbu sahifaga kirish huquqini yo'qotishingiz yoki ruxsatlaringiz cheklanishi mumkin. Davom etasizmi?");
                if (!confirmed) return;
            }
        }

        setSaving(true);
        try {
            const payload = {
                name: trimmedName,
                email: form.email ? form.email.trim() : null,
                phone: form.phone,
                role: form.role,
                permissions: form.permissions,
                roleId: form.roleId,
                ...(form.password ? { password: form.password } : {}),
            };

            if (editingUser) {
                await api.put(`/auth/users/${editingUser.id}`, payload);
                // Agar o'zining profilingiz tahrirlangan bo'lsa, localStorage session sync
                if (currentUserId === editingUser.id) {
                    try {
                        const localUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
                        localStorage.setItem('crm_user', JSON.stringify({
                            ...localUser,
                            name: trimmedName,
                            email: payload.email,
                            phone: payload.phone,
                            role: payload.role,
                            permissions: JSON.stringify(payload.permissions),
                        }));
                    } catch { /* noop */ }
                }
            } else {
                await api.post('/auth/users', payload);
            }
            await loadUsers();
            setIsModalOpen(false);
            showToast(editingUser ? 'Foydalanuvchi yangilandi' : 'Foydalanuvchi qo\'shildi', 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.message || "Xatolik yuz berdi!", 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (user: CrmUser) => {
        if (currentUserId && user.id === currentUserId) {
            showToast("O'zingizning hisobingizni o'chira olmaysiz!", 'error');
            return;
        }

        const superAdminCount = users.filter(u => u.role === 'SUPER_ADMIN').length;
        if (user.role === 'SUPER_ADMIN' && superAdminCount <= 1) {
            showToast("Tizimda kamida bitta Super Admin bo'lishi shart! Oxirgi Super Adminni o'chira olmaysiz.", 'error');
            return;
        }

        setDeleteConfirm({ open: true, user });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm.user) return;

        if (currentUserId && deleteConfirm.user.id === currentUserId) {
            showToast("O'zingizning hisobingizni o'chira olmaysiz!", 'error');
            setDeleteConfirm({ open: false, user: null });
            return;
        }

        const superAdminCount = users.filter(u => u.role === 'SUPER_ADMIN').length;
        if (deleteConfirm.user.role === 'SUPER_ADMIN' && superAdminCount <= 1) {
            showToast("Tizimda kamida bitta Super Admin bo'lishi shart! Oxirgi Super Adminni o'chira olmaysiz.", 'error');
            setDeleteConfirm({ open: false, user: null });
            return;
        }

        try {
            await api.delete(`/auth/users/${deleteConfirm.user.id}`);
            await loadUsers();
            showToast('Foydalanuvchi o\'chirildi', 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.message || "O'chirishda xatolik!", 'error');
        }
        setDeleteConfirm({ open: false, user: null });
    };

    const cleanSearch = search.trim().toLowerCase();
    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(cleanSearch) ||
        (u.phone || '').includes(cleanSearch) ||
        (u.email || '').toLowerCase().includes(cleanSearch) ||
        getRoleInfo(u).label.toLowerCase().includes(cleanSearch)
    );

    function getRoleInfo(user: CrmUser) {
        const role = resolveDisplayRole(user, dbRoles);
        const style = styleForLevel(user.role);
        return {
            label: role ? role.label : `${style.label} (maxsus)`,
            icon: style.icon,
            color: style.color,
            bg: style.bg,
            border: style.border,
        };
    }

    function getPermCount(user: CrmUser) {
        try { return JSON.parse(user.permissions || '[]').length; } catch { return 0; }
    }

    if (error) {
        return (
            <ErrorState
                message="Foydalanuvchilar ro'yxatini yuklashda xatolik yuz berdi."
                onRetry={loadUsers}
            />
        );
    }

    return (
        <div className="space-y-6">
            <ConfirmDialog
                isOpen={deleteConfirm.open}
                title="Foydalanuvchini o'chirish"
                message={`"${deleteConfirm.user?.name}" ni o'chirishni tasdiqlaysizmi?`}
                confirmText="Ha, o'chirish"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirm({ open: false, user: null })}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Foydalanuvchilar</h1>
                    <p className="text-zinc-500 text-sm font-medium">Xodimlar va ularning tizimga kirish huquqlarini boshqarish</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                    <Plus size={20} />
                    Yangi Foydalanuvchi
                </button>
            </div>

            {/* Rollar bo'yicha statistika — Sozlamalar > Rollar va Ruxsatlar'da
                yaratilgan haqiqiy Role'lar asosida */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {dbRoles.map(role => {
                    const style = styleForLevel(role.baseRoleLevel);
                    const Icon = style.icon;
                    const count = users.filter(u => resolveDisplayRole(u, dbRoles)?.id === role.id).length;
                    return (
                        <div key={role.id} className={`p-4 rounded-2xl border ${style.border} ${style.bg} flex items-center gap-3`}>
                            <div className={`w-10 h-10 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center ${style.color}`}>
                                <Icon size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest truncate">{role.label}</p>
                                <p className={`text-xl font-black ${style.color}`}>{count} ta</p>
                            </div>
                        </div>
                    );
                })}
                {(() => {
                    const customCount = users.filter(u => !resolveDisplayRole(u, dbRoles)).length;
                    if (customCount === 0) return null;
                    const style = FALLBACK_LEVEL_STYLE;
                    const Icon = style.icon;
                    return (
                        <div className={`p-4 rounded-2xl border ${style.border} ${style.bg} flex items-center gap-3`}>
                            <div className={`w-10 h-10 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center ${style.color}`}>
                                <Icon size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Maxsus</p>
                                <p className={`text-xl font-black ${style.color}`}>{customCount} ta</p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Ism, telefon, email yoki rol bo'yicha qidirish..."
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
            </div>

            {/* Content Container */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span className="font-medium text-sm">Foydalanuvchilar yuklanmoqda...</span>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <EmptyState
                        title="Foydalanuvchilar topilmadi"
                        message={search ? "Qidiruv bo'yicha hech qanday foydalanuvchi topilmadi." : "Hali birorta ham foydalanuvchi qo'shilmagan."}
                        actionLabel="Yangi Foydalanuvchi"
                        onAction={openCreate}
                        icon={<Users size={40} />}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (Visible under md) */}
                        <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredUsers.map(user => {
                                const roleInfo = getRoleInfo(user);
                                const Icon = roleInfo.icon;
                                const isSelf = currentUserId === user.id;
                                return (
                                    <div key={user.id} className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${roleInfo.bg} ${roleInfo.color}`}>
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                                                        {isSelf && (
                                                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-black px-1.5 py-0.5 rounded">
                                                                Siz
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-zinc-500 font-medium">{user.phone || user.email || 'Aloqa yo\'q'}</p>
                                                </div>
                                            </div>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${roleInfo.bg} ${roleInfo.color}`}>
                                                <Icon size={12} />
                                                {roleInfo.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                                            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                                                <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full"
                                                        style={{ width: `${(getPermCount(user) / ALL_PERMISSIONS.length) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-zinc-500 font-medium">{getPermCount(user)}/{ALL_PERMISSIONS.length}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => openEdit(user)}
                                                    className="p-2 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 bg-zinc-100 dark:bg-zinc-800 rounded-lg transition-colors"
                                                    title="Tahrirlash"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user)}
                                                    className="p-2 text-zinc-600 dark:text-zinc-300 hover:text-rose-600 bg-zinc-100 dark:bg-zinc-800 rounded-lg transition-colors"
                                                    title="O'chirish"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table (Hidden on mobile) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">Foydalanuvchi</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">Rol</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ruxsatlar</th>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest">Qo'shilgan</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {filteredUsers.map(user => {
                                        const roleInfo = getRoleInfo(user);
                                        const Icon = roleInfo.icon;
                                        const isSelf = currentUserId === user.id;
                                        return (
                                            <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${roleInfo.bg} ${roleInfo.color}`}>
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                                                                {isSelf && (
                                                                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-black px-1.5 py-0.5 rounded">
                                                                        Siz
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-zinc-500">{user.phone || user.email || '—'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${roleInfo.bg} ${roleInfo.color}`}>
                                                        <Icon size={12} />
                                                        {roleInfo.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden w-24">
                                                            <div
                                                                className="h-full bg-blue-500 rounded-full"
                                                                style={{ width: `${(getPermCount(user) / ALL_PERMISSIONS.length) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-bold text-zinc-500">{getPermCount(user)}/{ALL_PERMISSIONS.length}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs text-zinc-500">
                                                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('uz-UZ') : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => openEdit(user)}
                                                            className="p-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                            title="Tahrirlash"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(user)}
                                                            className="p-2 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                                                            title="O'chirish"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.97 }}
                            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 my-4 sm:my-8"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                                        {editingUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi qo\'shish'}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">Rolni tanlang va kerak bo'lsa ruxsatlarni moslashtiring</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                    <X size={22} className="text-zinc-500" />
                                </button>
                            </div>

                            <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                                {/* Rol — yagona tanlov manbasi: Sozlamalar > Rollar va Ruxsatlar
                                    sahifasida yaratilgan haqiqiy Role'lar + "Maxsus" (qo'lda
                                    ruxsat belgilash). */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Rol</p>
                                        <a href="/crmtayyorlovmarkaz/roles" className="text-[11px] font-bold text-blue-600 hover:underline">Rollarni boshqarish</a>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                        {dbRoles.map(role => {
                                            const style = styleForLevel(role.baseRoleLevel);
                                            const Icon = style.icon;
                                            const isSelected = form.roleId === role.id;
                                            return (
                                                <button
                                                    key={role.id}
                                                    type="button"
                                                    onClick={() => applyDbRole(role.id)}
                                                    className={`p-2.5 sm:p-3 rounded-2xl border-2 transition-all text-left ${isSelected
                                                            ? `${style.border} ${style.bg}`
                                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                                        }`}
                                                >
                                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1.5 ${isSelected ? style.bg + ' ' + style.color : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <p className={`text-xs font-black truncate ${isSelected ? style.color : 'text-zinc-600 dark:text-zinc-300'}`}>{role.label}</p>
                                                    <p className="text-[10px] text-zinc-400 font-medium">{role.permissionCount} ta ruxsat</p>
                                                    {isSelected && <Check size={14} className={`mt-1 ${style.color}`} />}
                                                </button>
                                            );
                                        })}
                                        {(() => {
                                            const isSelected = !form.roleId;
                                            const style = FALLBACK_LEVEL_STYLE;
                                            const Icon = style.icon;
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => applyDbRole('')}
                                                    className={`p-2.5 sm:p-3 rounded-2xl border-2 transition-all text-left ${isSelected
                                                            ? `${style.border} ${style.bg}`
                                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                                        }`}
                                                >
                                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1.5 ${isSelected ? style.bg + ' ' + style.color : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <p className={`text-xs font-black truncate ${isSelected ? style.color : 'text-zinc-600 dark:text-zinc-300'}`}>Maxsus</p>
                                                    <p className="text-[10px] text-zinc-400 font-medium">Qo'lda belgilash</p>
                                                    {isSelected && <Check size={14} className={`mt-1 ${style.color}`} />}
                                                </button>
                                            );
                                        })()}
                                    </div>

                                    {form.roleId && (
                                        <p className="text-[11px] text-blue-600 mt-2.5">
                                            Ushbu foydalanuvchining ruxsatlari endi shu roldan boshqariladi — pastdagi katakchalarni qo'lda o'zgartirsangiz, rol biriktiruvi bekor bo'ladi.
                                        </p>
                                    )}

                                    {!form.roleId && (() => {
                                        // Legacy: hali haqiqiy Role'ga bog'lanmagan, lekin saqlangan
                                        // permissions to'plami mavjud rollardan biriga mos keladigan
                                        // foydalanuvchi — faqat ma'lumot uchun, roleId majburiy
                                        // tayinlanmaydi (foydalanuvchi o'zi yuqoridan tanlashi kerak).
                                        const guessed = editingUser ? resolveDisplayRole(editingUser, dbRoles) : null;
                                        return (
                                            <div className="mt-3 space-y-2.5">
                                                {guessed && (
                                                    <p className="text-[11px] text-amber-600">
                                                        Joriy ruxsatlar "{guessed.label}" roliga mos keladi, lekin hali rasman bog'lanmagan — bog'lash uchun yuqoridan shu rolni tanlang.
                                                    </p>
                                                )}
                                                <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest">Asosiy daraja</label>
                                                <select
                                                    value={form.role}
                                                    onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                                                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                                >
                                                    {BASE_LEVELS.map(level => (
                                                        <option key={level} value={level}>{BASE_LEVEL_STYLE[level].label}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[11px] text-zinc-400">
                                                    Tizimning asosiy xavfsizlik darajasi — pastda ruxsatlarni qo'lda belgilang.
                                                </p>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Effective Access Viewer — faqat tahrirlashda, RBAC Bosqich 3 */}
                                {editingUser && (
                                    <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Samarali Ruxsatlar (joriy holat)</p>
                                        {loadingAccess ? (
                                            <p className="text-xs text-zinc-500">Yuklanmoqda...</p>
                                        ) : accessInfo ? (
                                            <div className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                                <p><span className="font-bold">Rol:</span> {accessInfo.roleRef?.label || accessInfo.role}</p>
                                                {accessInfo.department && <p><span className="font-bold">Bo'lim:</span> {accessInfo.department}</p>}
                                                <p><span className="font-bold">Samarali ruxsatlar:</span> {accessInfo.effectivePermissionCount} ta</p>
                                                {accessInfo.overrides?.length > 0 && (
                                                    <div>
                                                        <span className="font-bold">Individual istisnolar:</span>
                                                        <ul className="mt-1 space-y-0.5 pl-3.5 list-disc">
                                                            {accessInfo.overrides.map((o: any) => (
                                                                <li key={o.permissionKey}>
                                                                    {o.permissionKey} — <span className={o.effect === 'ALLOW' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{o.effect === 'ALLOW' ? 'RUXSAT' : 'TAQIQ'}</span>
                                                                    {o.reason ? ` (${o.reason})` : ''}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-zinc-500">Ma'lumot topilmadi</p>
                                        )}
                                    </div>
                                )}

                                {/* Basic Info */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">Ism Familiya *</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input
                                                type="text"
                                                value={form.name}
                                                onChange={e => setForm({ ...form, name: e.target.value })}
                                                placeholder="To'liq ism..."
                                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <PhoneInput
                                            label="Telefon (Login) *"
                                            value={form.phone || ''}
                                            onChange={(phone) => setForm({ ...form, phone })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">Email (ixtiyoriy)</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input
                                                type="email"
                                                value={form.email}
                                                onChange={e => setForm({ ...form, email: e.target.value })}
                                                placeholder="email@example.com"
                                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">
                                            Parol {editingUser ? '(o\'zgartirmoqchi bo\'lsangiz)' : '*'}
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={form.password}
                                                onChange={e => setForm({ ...form, password: e.target.value })}
                                                placeholder={editingUser ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Kamida 6 ta belgi..."}
                                                className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Granular Permissions */}
                                <div>
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Bo'lim Ruxsatlari</p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={selectAllPermissions}
                                                className="text-[11px] font-bold text-blue-600 hover:underline"
                                            >
                                                Barchasini tanlash
                                            </button>
                                            <span className="text-zinc-300 dark:text-zinc-700 text-xs">|</span>
                                            <button
                                                type="button"
                                                onClick={deselectAllPermissions}
                                                className="text-[11px] font-bold text-zinc-500 hover:underline"
                                            >
                                                Tozalash
                                            </button>
                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg ml-1">
                                                {form.permissions.length} / {ALL_PERMISSIONS.length}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-3 max-h-60 sm:max-h-72 overflow-y-auto pr-1">
                                        {PERMISSION_GROUPS.map(group => {
                                            const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group);
                                            const selectedCount = groupPerms.filter(p => form.permissions.includes(p.id)).length;
                                            const allSelected = selectedCount === groupPerms.length;
                                            const isExpanded = expandedGroups.includes(group);
                                            return (
                                                <div key={group} className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group])}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
                                                            }
                                                        }}
                                                        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={e => { e.stopPropagation(); toggleGroup(group); }}
                                                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allSelected ? 'bg-blue-600 border-blue-600' : selectedCount > 0 ? 'bg-blue-200 border-blue-400' : 'border-zinc-300 dark:border-zinc-600'
                                                                    }`}
                                                            >
                                                                {allSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                                                {!allSelected && selectedCount > 0 && <div className="w-2 h-0.5 bg-blue-600 rounded" />}
                                                            </button>
                                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{group}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-zinc-500 font-medium">{selectedCount}/{groupPerms.length}</span>
                                                            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {groupPerms.map(perm => (
                                                                <button
                                                                    key={perm.id}
                                                                    type="button"
                                                                    onClick={() => togglePermission(perm.id)}
                                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${form.permissions.includes(perm.id)
                                                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                                                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
                                                                        }`}
                                                                >
                                                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${form.permissions.includes(perm.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600'
                                                                        }`}>
                                                                        {form.permissions.includes(perm.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                                                                    </div>
                                                                    <span className="truncate">{perm.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex gap-3 p-4 sm:p-6 border-t border-zinc-200 dark:border-zinc-800">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 text-sm"
                                >
                                    {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                                    {editingUser ? 'Saqlash' : 'Qo\'shish'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
