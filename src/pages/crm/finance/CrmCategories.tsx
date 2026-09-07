import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Edit2, Plus, Search, Trash2 } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import type { TransactionCategory } from '../../../types/transactionCategory';

type CategoryForm = Pick<TransactionCategory, 'name' | 'type' | 'isActive'>;
const emptyForm = (type: TransactionCategory['type'] = 'income'): CategoryForm => ({ name: '', type, isActive: true });

export default function CrmCategories() {
  const { data: transactionCategories, loading, error, refetch, addDocument, updateDocument, deleteDocument } = useFirestore<TransactionCategory>('transactionCategories');
  const [activeType, setActiveType] = useState<TransactionCategory['type']>('income');
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => emptyForm());
  const [deleting, setDeleting] = useState<TransactionCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const closeModal = useCallback(() => { if (!busy.current) setIsOpen(false); }, []);
  const cancelDelete = useCallback(() => { if (!busy.current) setDeleting(null); }, []);

  const openModal = (category?: TransactionCategory) => {
    setEditingId(category?.id ?? null);
    setForm(category ? {
      name: category.name, type: category.type, isActive: category.isActive,
    } : emptyForm(activeType));
    setIsOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    if (!form.name.trim()) {
      showToast('Kategoriya nomini kiriting', 'error');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      if (editingId) await updateDocument(editingId, payload);
      else await addDocument(payload);
      showToast(editingId ? 'Kategoriya yangilandi' : "Kategoriya qo'shildi", 'success');
      setIsOpen(false);
    } catch {
      showToast("Kategoriya saqlanmadi. Qayta urinib ko'ring.", 'error');
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
      showToast("Kategoriya o'chirildi", 'success');
      setDeleting(null);
    } catch {
      showToast("Kategoriya o'chirilmadi. Qayta urinib ko'ring.", 'error');
    } finally {
      busy.current = false;
    }
  };

  const filtered = transactionCategories.filter(category => category.type === activeType && category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Kirim/Chiqim kategoriyalari</h1>
          <p className="text-zinc-500 text-sm font-medium">Kirim va chiqim kategoriyalari hamda ularning faolligini boshqarish</p>
        </div>
        <Button onClick={() => openModal()} leftIcon={<Plus size={20} />}>Yangi kategoriya</Button>
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Kategoriya turi">
            {(['income', 'expense'] as const).map(type => <Button key={type} variant={activeType === type ? 'primary' : 'secondary'} aria-pressed={activeType === type} onClick={() => setActiveType(type)}>{type === 'income' ? 'Kirim kategoriyalari' : 'Chiqim kategoriyalari'}</Button>)}
          </div>
          <div className="max-w-md"><Input aria-label="Kirim/Chiqim kategoriyalarini qidirish" placeholder="Kategoriya nomi bo'yicha qidirish..." leftIcon={<Search size={18} />} value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        {loading ? <p className="p-6 text-zinc-500" role="status">Kirim/Chiqim kategoriyalari yuklanmoqda...</p> : error ? (
          <div className="p-6 space-y-3" role="alert"><p className="text-rose-600">Kirim/Chiqim kategoriyalari yuklanmadi.</p><Button variant="secondary" onClick={refetch}>Qayta urinish</Button></div>
        ) : filtered.length === 0 ? <p className="p-6 text-zinc-500">{search ? 'Kategoriya topilmadi.' : "Hali kategoriyalar qo'shilmagan."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500"><tr>
                {['Kategoriya', 'Holat', 'Amallar'].map(label => <th key={label} scope="col" className="px-6 py-4 font-bold whitespace-nowrap">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map(category => <tr key={category.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-6 py-4"><p className="font-bold text-slate-900 dark:text-white">{category.name}</p></td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${category.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>{category.isActive ? 'Faol' : 'Nofaol'}</span></td>
                  <td className="px-6 py-4"><div className="flex gap-2">
                    <Button variant="ghost" aria-label={`${category.name}: tahrirlash`} onClick={() => openModal(category)}><Edit2 size={16} /></Button>
                    <Button variant="ghost" aria-label={`${category.name}: o'chirish`} onClick={() => setDeleting(category)}><Trash2 size={16} className="text-rose-600" /></Button>
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal isOpen={isOpen} onClose={closeModal} title={editingId ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'} width="md">
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
            <Input id="category-name" label="Nom" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-blue-600" />Faol kategoriya</label>
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Bekor qilish</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={!!deleting} title="Kategoriyani o'chirish" message={`“${deleting?.name ?? ''}” kategoriyasini o'chirmoqchimisiz?`} confirmText="Ha, o'chirish" onConfirm={confirmDelete} onCancel={cancelDelete} />
    </div>
  );
}
