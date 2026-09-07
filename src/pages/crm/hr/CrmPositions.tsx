import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../../../constants/permissions';
import type { Position } from '../../../types/position';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

const ROLE_LABELS = { TEACHER: "O'qituvchi", MANAGER: 'Menejer', ADMIN: 'Administrator' };
type PositionForm = Omit<Position, 'id' | 'defaultPermissions'> & { defaultPermissions: string[] };

function parsePermissions(value: Position['defaultPermissions']): string[] {
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

const emptyForm = (): PositionForm => ({
  name: '', description: '', responsibilities: '', suggestedRole: 'TEACHER', defaultPermissions: [], isActive: true,
});
const fieldClass = 'w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white';

export default function CrmPositions() {
  const canManage = getCurrentRoleLevel() >= ROLE_LEVEL.ADMIN;
  const { data: positions, loading, error, refetch, addDocument, updateDocument, deleteDocument } = useFirestore<Position>('positions');
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const closeModal = useCallback(() => { if (!busy.current) setIsOpen(false); }, []);
  const cancelDelete = useCallback(() => { if (!busy.current) setDeleting(null); }, []);

  const openModal = (position?: Position) => {
    if (!canManage) return;
    setEditingId(position?.id ?? null);
    setForm(position ? {
      name: position.name, description: position.description ?? '', responsibilities: position.responsibilities ?? '',
      suggestedRole: position.suggestedRole, defaultPermissions: parsePermissions(position.defaultPermissions), isActive: position.isActive,
    } : emptyForm());
    setIsOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || busy.current) return;
    if (!form.name.trim()) {
      showToast('Lavozim nomini kiriting', 'error');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), defaultPermissions: JSON.stringify(form.defaultPermissions) };
      if (editingId) await updateDocument(editingId, payload);
      else await addDocument(payload);
      showToast(editingId ? 'Lavozim yangilandi' : "Lavozim qo'shildi", 'success');
      setIsOpen(false);
    } catch {
      showToast("Lavozim saqlanmadi. Qayta urinib ko'ring.", 'error');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || busy.current) return;
    busy.current = true;
    try {
      await deleteDocument(deleting.id);
      showToast("Lavozim o'chirildi", 'success');
      setDeleting(null);
    } catch {
      showToast("Lavozim o'chirilmadi. Qayta urinib ko'ring.", 'error');
    } finally {
      busy.current = false;
    }
  };

  const filtered = positions.filter(position => position.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Lavozimlar</h1>
          <p className="text-zinc-500 text-sm font-medium">Xodimlar lavozimlari, vazifalari va standart ruxsatlarini boshqarish</p>
        </div>
        {canManage && <Button onClick={() => openModal()} leftIcon={<Plus size={20} />}>Yangi lavozim</Button>}
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-md"><Input aria-label="Lavozimlarni qidirish" placeholder="Lavozim nomi bo'yicha qidirish..." leftIcon={<Search size={18} />} value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        {loading ? <p className="p-6 text-zinc-500" role="status">Lavozimlar yuklanmoqda...</p> : error ? (
          <div className="p-6 space-y-3" role="alert"><p className="text-rose-600">Lavozimlar yuklanmadi.</p><Button variant="secondary" onClick={refetch}>Qayta urinish</Button></div>
        ) : filtered.length === 0 ? <p className="p-6 text-zinc-500">{search ? 'Lavozim topilmadi.' : "Hali lavozimlar qo'shilmagan."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500"><tr>
                {['Lavozim', 'Taklif qilinadigan rol', 'Ruxsatlar', 'Holat', 'Amallar'].map(label => <th key={label} scope="col" className="px-6 py-4 font-bold whitespace-nowrap">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map(position => <tr key={position.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-6 py-4"><p className="font-bold text-slate-900 dark:text-white">{position.name}</p><p className="text-zinc-500 line-clamp-2 max-w-sm whitespace-pre-line">{position.description}</p></td>
                  <td className="px-6 py-4 whitespace-nowrap">{ROLE_LABELS[position.suggestedRole]}</td>
                  <td className="px-6 py-4">{parsePermissions(position.defaultPermissions).length} ta</td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${position.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>{position.isActive ? 'Faol' : 'Nofaol'}</span></td>
                  <td className="px-6 py-4">{canManage && <div className="flex gap-2">
                    <Button variant="ghost" aria-label={`${position.name}: tahrirlash`} onClick={() => openModal(position)}><Edit2 size={16} /></Button>
                    <Button variant="ghost" aria-label={`${position.name}: o'chirish`} onClick={() => setDeleting(position)}><Trash2 size={16} className="text-rose-600" /></Button>
                  </div>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal isOpen={canManage && isOpen} onClose={closeModal} title={editingId ? 'Lavozimni tahrirlash' : 'Yangi lavozim'} width="2xl">
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
            <Input id="position-name" label="Nom" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <label className="block space-y-2 text-sm font-bold"> <span>Yo'riqnoma</span><textarea className={fieldClass} rows={3} value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            <label className="block space-y-2 text-sm font-bold"> <span>Vazifalar</span><textarea className={fieldClass} rows={3} value={form.responsibilities ?? ''} onChange={e => setForm({ ...form, responsibilities: e.target.value })} /></label>
            <label className="block space-y-2 text-sm font-bold"><span>Taklif qilinadigan rol</span>
              <select className={fieldClass} value={form.suggestedRole} onChange={e => setForm({ ...form, suggestedRole: e.target.value as Position['suggestedRole'] })}>
                {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-blue-600" />Faol lavozim</label>
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold mb-3">Standart ruxsatlar</legend>
              {PERMISSION_GROUPS.map(group => <div key={group} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">{group}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{ALL_PERMISSIONS.filter(p => p.group === group).map(permission => (
                  <label key={permission.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="size-4 accent-blue-600" checked={form.defaultPermissions.includes(permission.id)} onChange={e => setForm(previous => ({ ...previous, defaultPermissions: e.target.checked ? [...previous.defaultPermissions, permission.id] : previous.defaultPermissions.filter(id => id !== permission.id) }))} />
                    {permission.label}
                  </label>
                ))}</div>
              </div>)}
            </fieldset>
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Bekor qilish</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={canManage && !!deleting} title="Lavozimni o'chirish" message={`“${deleting?.name ?? ''}” lavozimini o'chirmoqchimisiz?`} confirmText="Ha, o'chirish" onConfirm={confirmDelete} onCancel={cancelDelete} />
    </div>
  );
}
