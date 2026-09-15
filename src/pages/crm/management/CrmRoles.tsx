import { useCallback, useEffect, useState } from 'react';
import { Copy, Edit2, Plus, Search, Shield, Trash2 } from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';

// RBAC qayta qurish — Bosqich 3 (C:\Users\user\.claude\plans\cosmic-fluttering-quill.md).
// Bu sahifa server/routes/roles.ts orqali HAQIQIY Role/Permission/
// RolePermission jadvallarini boshqaradi — bu yerda yaratilgan/tahrirlangan
// Role'lar CrmUsers.tsx'ning (2026-09-15'dan, eski statik ROLE_TEMPLATES
// olib tashlangandan keyin) yagona "Rol" tanlovida foydalanuvchiga
// biriktiriladi.

const BASE_ROLE_LABELS: Record<string, string> = {
    TEACHER: "O'qituvchi darajasi",
    MANAGER: 'Menejer darajasi',
    ADMIN: 'Administrator darajasi',
    SUPER_ADMIN: 'Super Admin darajasi',
};

interface RoleRow {
    id: string;
    name: string;
    label: string;
    description: string | null;
    baseRoleLevel: string;
    isSystem: boolean;
    isActive: boolean;
    permissionCount: number;
    userCount: number;
}

interface PermissionRow {
    id: string;
    key: string;
    label: string;
    group: string;
}

interface RoleForm {
    label: string;
    description: string;
    baseRoleLevel: string;
    permissions: string[];
}

const EMPTY_FORM: RoleForm = { label: '', description: '', baseRoleLevel: 'TEACHER', permissions: [] };

export default function CrmRoles() {
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [permissions, setPermissions] = useState<PermissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingIsSystem, setEditingIsSystem] = useState(false);
    const [form, setForm] = useState<RoleForm>({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<RoleRow | null>(null);
    const { showToast } = useToast();

    const groups = [...new Set(permissions.map(p => p.group))];

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const [rolesRes, permsRes] = await Promise.all([api.get('/roles'), api.get('/roles/permissions')]);
            setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
            setPermissions(Array.isArray(permsRes.data) ? permsRes.data : []);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        setEditingId(null);
        setEditingIsSystem(false);
        setForm({ ...EMPTY_FORM });
        setIsOpen(true);
    };

    const openEdit = async (role: RoleRow) => {
        try {
            const res = await api.get(`/roles/${role.id}`);
            setEditingId(role.id);
            setEditingIsSystem(role.isSystem);
            setForm({
                label: res.data.label,
                description: res.data.description || '',
                baseRoleLevel: res.data.baseRoleLevel,
                permissions: res.data.permissionKeys || [],
            });
            setIsOpen(true);
        } catch {
            showToast('Rol tafsilotlarini yuklab bo\'lmadi', 'error');
        }
    };

    const togglePermission = (key: string) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(key)
                ? prev.permissions.filter(k => k !== key)
                : [...prev.permissions, key],
        }));
    };

    const toggleGroup = (group: string) => {
        const groupKeys = permissions.filter(p => p.group === group).map(p => p.key);
        const allSelected = groupKeys.every(k => form.permissions.includes(k));
        setForm(prev => ({
            ...prev,
            permissions: allSelected
                ? prev.permissions.filter(k => !groupKeys.includes(k))
                : [...new Set([...prev.permissions, ...groupKeys])],
        }));
    };

    const handleSave = async () => {
        if (!form.label.trim()) {
            showToast('Rol nomini kiriting', 'error');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/roles/${editingId}`, {
                    label: form.label.trim(),
                    description: form.description || null,
                    ...(editingIsSystem ? {} : { baseRoleLevel: form.baseRoleLevel }),
                    permissions: form.permissions,
                });
            } else {
                await api.post('/roles', {
                    label: form.label.trim(),
                    description: form.description || null,
                    baseRoleLevel: form.baseRoleLevel,
                    permissions: form.permissions,
                });
            }
            await load();
            setIsOpen(false);
            showToast(editingId ? 'Rol yangilandi' : "Rol yaratildi", 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.message || 'Xatolik yuz berdi', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async (role: RoleRow) => {
        try {
            await api.post(`/roles/${role.id}/duplicate`);
            await load();
            showToast('Rol nusxalandi', 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.message || 'Nusxalab bo\'lmadi', 'error');
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await api.delete(`/roles/${deleting.id}`);
            await load();
            showToast("Rol o'chirildi", 'success');
        } catch (e: any) {
            showToast(e?.response?.data?.message || "O'chirib bo'lmadi", 'error');
        } finally {
            setDeleting(null);
        }
    };

    const filtered = roles.filter(r => r.label.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Rollar va Ruxsatlar</h1>
                    <p className="text-zinc-500 text-sm font-medium">Har bir rol qanday ruxsatlar berishini shu yerda tuzing — CrmUsers sahifasida foydalanuvchiga biriktiriladi</p>
                </div>
                <Button onClick={openCreate} leftIcon={<Plus size={20} />}>Yangi rol</Button>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="max-w-md">
                        <Input aria-label="Rollarni qidirish" placeholder="Rol nomi bo'yicha qidirish..." leftIcon={<Search size={18} />} value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
                {loading ? <p className="p-6 text-zinc-500" role="status">Rollar yuklanmoqda...</p> : error ? (
                    <div className="p-6 space-y-3" role="alert"><p className="text-rose-600">Rollar yuklanmadi.</p><Button variant="secondary" onClick={load}>Qayta urinish</Button></div>
                ) : filtered.length === 0 ? <p className="p-6 text-zinc-500">{search ? 'Rol topilmadi.' : 'Hali rol yaratilmagan.'}</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500"><tr>
                                {['Rol', 'Asosiy daraja', 'Ruxsatlar', 'Foydalanuvchilar', 'Holat', 'Amallar'].map(label => (
                                    <th key={label} scope="col" className="px-6 py-4 font-bold whitespace-nowrap">{label}</th>
                                ))}
                            </tr></thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {filtered.map(role => (
                                    <tr key={role.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {role.isSystem && <Shield size={14} className="text-amber-500 shrink-0" />}
                                                <p className="font-bold text-slate-900 dark:text-white">{role.label}</p>
                                            </div>
                                            {role.description && <p className="text-zinc-500 text-xs mt-0.5 max-w-sm line-clamp-2">{role.description}</p>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">{BASE_ROLE_LABELS[role.baseRoleLevel] || role.baseRoleLevel}</td>
                                        <td className="px-6 py-4">{role.permissionCount} ta</td>
                                        <td className="px-6 py-4">{role.userCount} ta</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${role.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>
                                                {role.isActive ? 'Faol' : 'Nofaol'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                <Button variant="ghost" aria-label={`${role.label}: tahrirlash`} onClick={() => openEdit(role)}><Edit2 size={16} /></Button>
                                                <Button variant="ghost" aria-label={`${role.label}: nusxalash`} onClick={() => handleDuplicate(role)}><Copy size={16} /></Button>
                                                {!role.isSystem && (
                                                    <Button variant="ghost" aria-label={`${role.label}: o'chirish`} onClick={() => setDeleting(role)}>
                                                        <Trash2 size={16} className="text-rose-600" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editingId ? 'Rolni tahrirlash' : 'Yangi rol'} width="2xl">
                <div className="space-y-5">
                    <fieldset disabled={saving} className="space-y-5">
                        <Input id="role-label" label="Rol nomi" required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Masalan: Matematika O'qituvchisi" />
                        <label className="block space-y-2 text-sm font-bold">
                            <span>Izoh (ixtiyoriy)</span>
                            <textarea
                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                rows={2}
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                            />
                        </label>
                        <label className="block space-y-2 text-sm font-bold">
                            <span>Asosiy daraja {editingIsSystem && <span className="text-zinc-400 font-medium">(tizim roli — o'zgartirib bo'lmaydi)</span>}</span>
                            <select
                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white disabled:opacity-60"
                                value={form.baseRoleLevel}
                                disabled={editingIsSystem}
                                onChange={e => setForm({ ...form, baseRoleLevel: e.target.value })}
                            >
                                {Object.entries(BASE_ROLE_LABELS).map(([level, label]) => <option key={level} value={level}>{label}</option>)}
                            </select>
                            <span className="block text-[11px] text-zinc-500 font-medium">
                                Bu foydalanuvchi tizimning qaysi ROLE_LEVEL'iga tegishli bo'lishini belgilaydi (backend'dagi asosiy xavfsizlik chegarasi) — quyidagi ruxsatlar esa faqat menyu/sahifa ko'rinishini nozikroq sozlaydi.
                            </span>
                        </label>
                        <fieldset className="space-y-4">
                            <legend className="text-sm font-bold mb-3">Ruxsatlar ({form.permissions.length} / {permissions.length} tanlangan)</legend>
                            {groups.map(group => {
                                const groupPerms = permissions.filter(p => p.group === group);
                                const selectedCount = groupPerms.filter(p => form.permissions.includes(p.key)).length;
                                const allSelected = selectedCount === groupPerms.length;
                                return (
                                    <div key={group} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">{group}</h3>
                                            <button type="button" onClick={() => toggleGroup(group)} className="text-[11px] font-bold text-blue-600 hover:underline">
                                                {allSelected ? 'Barchasini bekor qilish' : 'Barchasini tanlash'}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {groupPerms.map(permission => (
                                                <label key={permission.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="size-4 accent-blue-600"
                                                        checked={form.permissions.includes(permission.key)}
                                                        onChange={() => togglePermission(permission.key)}
                                                    />
                                                    {permission.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </fieldset>
                    </fieldset>
                    <div className="flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={saving}>Bekor qilish</Button>
                        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleting}
                title="Rolni o'chirish"
                message={`"${deleting?.label ?? ''}" rolini o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.`}
                confirmText="Ha, o'chirish"
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
}
