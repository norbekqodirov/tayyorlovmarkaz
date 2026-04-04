import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Plus, Edit2, Trash2, Shield, X, Eye, EyeOff,
    UserCheck, Megaphone, GraduationCap, Settings, Check,
    Lock, Mail, Phone, User, Search, ChevronDown
} from 'lucide-react';
import api from '../../api/client';

// ─── Permission Definitions ──────────────────────────────────────────
const ALL_PERMISSIONS = [
    { id: 'dashboard', label: 'Dashboard', group: "Asosiy" },
    { id: 'leads', label: 'Lidlar (Voronka)', group: "Marketing" },
    { id: 'marketing', label: 'Marketing', group: "Marketing" },
    { id: 'target_forms', label: 'Target Formalar', group: "Marketing" },
    { id: 'students', label: "O'quvchilar", group: "Ta'lim" },
    { id: 'groups', label: 'Guruhlar', group: "Ta'lim" },
    { id: 'courses', label: 'Kurslar', group: "Ta'lim" },
    { id: 'schedule', label: 'Dars Jadvali', group: "Ta'lim" },
    { id: 'journal', label: 'Elektron Jurnal', group: "Ta'lim" },
    { id: 'attendance', label: 'Davomat', group: "Ta'lim" },
    { id: 'assessments', label: 'Baholash', group: "Ta'lim" },
    { id: 'finance', label: 'Moliya', group: "Moliya" },
    { id: 'bi', label: 'BI Analitika', group: "Moliya" },
    { id: 'rooms', label: 'Xonalar', group: "Resurslar" },
    { id: 'inventory', label: 'Inventar', group: "Resurslar" },
    { id: 'content', label: 'Kontent/Yangiliklar', group: "Tizim" },
    { id: 'settings', label: 'Sozlamalar', group: "Tizim" },
    { id: 'users', label: 'Foydalanuvchilar', group: "Tizim" },
];

const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

// ─── Role Templates ───────────────────────────────────────────────────
const ROLE_TEMPLATES = [
    {
        id: 'ADMIN',
        label: 'Administrator',
        description: "Tizimning barcha qisimlariga to'liq ruxsat",
        icon: Shield,
        color: 'text-purple-600',
        bg: 'bg-purple-100 dark:bg-purple-900/30',
        border: 'border-purple-300 dark:border-purple-700',
        permissions: ALL_PERMISSIONS.map(p => p.id),
    },
    {
        id: 'TEACHER',
        label: 'Ustoz / O\'qituvchi',
        description: "Dars jadvali, jurnal, davomat va baholash",
        icon: GraduationCap,
        color: 'text-blue-600',
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        border: 'border-blue-300 dark:border-blue-700',
        permissions: ['dashboard', 'schedule', 'journal', 'attendance', 'assessments', 'students', 'groups'],
    },
    {
        id: 'MARKETING',
        label: 'Marketing Xodimi',
        description: "Lidlar, marketing kampaniyalar va formalar",
        icon: Megaphone,
        color: 'text-rose-600',
        bg: 'bg-rose-100 dark:bg-rose-900/30',
        border: 'border-rose-300 dark:border-rose-700',
        permissions: ['dashboard', 'leads', 'marketing', 'target_forms'],
    },
    {
        id: 'MANAGER',
        label: 'Menejer',
        description: "O'quvchilar, moliya va guruhlarni boshqarish",
        icon: UserCheck,
        color: 'text-emerald-600',
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        border: 'border-emerald-300 dark:border-emerald-700',
        permissions: ['dashboard', 'students', 'groups', 'courses', 'finance', 'bi', 'leads'],
    },
];

interface CrmUser {
    id: string;
    email: string;
    name: string;
    role: string;
    phone?: string;
    permissions?: string;
    createdAt?: string;
}

const EMPTY_FORM = {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'TEACHER',
    permissions: [] as string[],
};

export default function CrmUsers() {
    const [users, setUsers] = useState<CrmUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CrmUser | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(PERMISSION_GROUPS);

    const loadUsers = useCallback(async () => {
        try {
            const res = await api.get('/auth/users');
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const openCreate = () => {
        setEditingUser(null);
        setForm({ ...EMPTY_FORM });
        setSelectedTemplate('TEACHER');
        applyTemplate('TEACHER');
        setIsModalOpen(true);
    };

    const openEdit = (user: CrmUser) => {
        setEditingUser(user);
        let perms: string[] = [];
        try { perms = JSON.parse(user.permissions || '[]'); } catch { }
        setForm({
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            password: '',
            role: user.role,
            permissions: perms,
        });
        setSelectedTemplate(user.role);
        setIsModalOpen(true);
    };

    const applyTemplate = (templateId: string) => {
        const template = ROLE_TEMPLATES.find(t => t.id === templateId);
        if (!template) return;
        setSelectedTemplate(templateId);
        setForm(prev => ({
            ...prev,
            role: templateId === 'MARKETING' ? 'ADMIN' : templateId,
            permissions: template.permissions,
        }));
    };

    const togglePermission = (permId: string) => {
        setSelectedTemplate('CUSTOM');
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permId)
                ? prev.permissions.filter(p => p !== permId)
                : [...prev.permissions, permId],
        }));
    };

    const toggleGroup = (group: string) => {
        const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.id);
        const allSelected = groupPerms.every(p => form.permissions.includes(p));
        setSelectedTemplate('CUSTOM');
        setForm(prev => ({
            ...prev,
            permissions: allSelected
                ? prev.permissions.filter(p => !groupPerms.includes(p))
                : [...new Set([...prev.permissions, ...groupPerms])],
        }));
    };

    const handleSave = async () => {
        if (!form.name || !form.email) return alert("Ism va email kiritilishi shart!");
        if (!editingUser && !form.password) return alert("Yangi foydalanuvchi uchun parol kiritilishi shart!");
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                email: form.email,
                phone: form.phone,
                role: form.role,
                permissions: form.permissions,
                ...(form.password ? { password: form.password } : {}),
            };
            if (editingUser) {
                await api.put(`/auth/users/${editingUser.id}`, payload);
            } else {
                await api.post('/auth/users', payload);
            }
            await loadUsers();
            setIsModalOpen(false);
        } catch (e: any) {
            alert(e?.response?.data?.message || "Xatolik yuz berdi!");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (user: CrmUser) => {
        if (!window.confirm(`"${user.name}" ni o'chirishni tasdiqlaysizmi?`)) return;
        try {
            await api.delete(`/auth/users/${user.id}`);
            await loadUsers();
        } catch { alert("O'chirishda xatolik!"); }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const getRoleInfo = (role: string) => {
        return ROLE_TEMPLATES.find(t => t.id === role) || ROLE_TEMPLATES[3];
    };

    const getPermCount = (user: CrmUser) => {
        try { return JSON.parse(user.permissions || '[]').length; } catch { return 0; }
    };

    return (
        <div className="space-y-6">
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

            {/* Role Templates Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {ROLE_TEMPLATES.map(t => {
                    const Icon = t.icon;
                    const count = users.filter(u => u.role === t.id || (t.id === 'MARKETING' && u.role === 'MARKETING')).length;
                    return (
                        <div key={t.id} className={`p-4 rounded-2xl border ${t.border} ${t.bg} flex items-center gap-3`}>
                            <div className={`w-10 h-10 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center ${t.color}`}>
                                <Icon size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{t.label}</p>
                                <p className={`text-xl font-black ${t.color}`}>{users.filter(u => u.role === t.id).length} ta</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Ism yoki email bo'yicha qidirish..."
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
            </div>

            {/* Users Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-16 text-center text-zinc-500">Yuklanmoqda...</div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users size={32} className="text-zinc-400" />
                        </div>
                        <p className="font-bold text-zinc-500">Foydalanuvchilar topilmadi</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
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
                                    const roleInfo = getRoleInfo(user.role);
                                    const Icon = roleInfo.icon;
                                    return (
                                        <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${roleInfo.bg} ${roleInfo.color}`}>
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                                                        <p className="text-xs text-zinc-500">{user.email}</p>
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
                                                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user)}
                                                        className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
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
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.97 }}
                            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 my-8"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                        {editingUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi qo\'shish'}
                                    </h3>
                                    <p className="text-sm text-zinc-500 mt-0.5">Ruxsat andozasini tanlang va sozlang</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                    <X size={22} className="text-zinc-500" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Role Templates */}
                                <div>
                                    <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3">Lavozim Andozasi (Template)</p>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        {ROLE_TEMPLATES.map(t => {
                                            const Icon = t.icon;
                                            const isSelected = selectedTemplate === t.id;
                                            return (
                                                <button
                                                    key={t.id}
                                                    onClick={() => applyTemplate(t.id)}
                                                    className={`p-3 rounded-2xl border-2 transition-all text-left ${isSelected
                                                            ? `${t.border} ${t.bg}`
                                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                                        }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${isSelected ? t.bg + ' ' + t.color : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <p className={`text-xs font-black ${isSelected ? t.color : 'text-zinc-600 dark:text-zinc-300'}`}>{t.label}</p>
                                                    {isSelected && <Check size={14} className={`mt-1 ${t.color}`} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Basic Info */}
                                <div className="grid grid-cols-2 gap-4">
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
                                        <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">Telefon</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input
                                                type="text"
                                                value={form.phone}
                                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                                placeholder="+998 90 000 00 00"
                                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">Email (Login) *</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                            <input
                                                type="email"
                                                value={form.email}
                                                onChange={e => setForm({ ...form, email: e.target.value })}
                                                disabled={!!editingUser}
                                                placeholder="example@email.com"
                                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white disabled:opacity-50"
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
                                                placeholder={editingUser ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Parol..."}
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
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Bo'lim Ruxsatlari</p>
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg">
                                            {form.permissions.length} / {ALL_PERMISSIONS.length} ruxsat
                                        </span>
                                    </div>
                                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                                        {PERMISSION_GROUPS.map(group => {
                                            const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group);
                                            const selectedCount = groupPerms.filter(p => form.permissions.includes(p.id)).length;
                                            const allSelected = selectedCount === groupPerms.length;
                                            const isExpanded = expandedGroups.includes(group);
                                            return (
                                                <div key={group} className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group])}
                                                        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
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
                                                            <span className="text-xs text-zinc-500">{selectedCount}/{groupPerms.length}</span>
                                                            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="p-3 grid grid-cols-2 gap-2">
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
                                                                    {perm.label}
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
                            <div className="flex gap-3 p-6 border-t border-zinc-200 dark:border-zinc-800">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
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
