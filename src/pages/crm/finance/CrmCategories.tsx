import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Edit2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import api from '../../../api/client';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import type { TransactionCategory } from '../../../types/transactionCategory';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

type CategoryForm = Pick<TransactionCategory, 'name' | 'type' | 'isActive'> & { kind: string };
const emptyForm = (type: TransactionCategory['type'] = 'income'): CategoryForm => ({ name: '', type, isActive: true, kind: '' });

// TQ-E: tur qoidani belgilaydi — kurs to'lovi o'quvchi qarziga yoziladi, boshqa kirim esa yo'q.
const KIND_OPTIONS: Record<TransactionCategory['type'], Array<{ value: string; label: string }>> = {
  income: [
    { value: 'TUITION', label: "Kurs to'lovi (o'quvchi qarzini yopadi)" },
    { value: 'OTHER_INCOME', label: "Boshqa kirim (kitob, forma — qarzga ta'sir qilmaydi)" },
  ],
  expense: [
    { value: 'OPERATING_EXPENSE', label: 'Operatsion xarajat' },
    { value: 'PAYROLL_PAYOUT', label: 'Oylik / maosh' },
    { value: 'STAFF_ADVANCE', label: 'Xodimga avans' },
    { value: 'REFUND', label: 'Qaytarish' },
    { value: 'TRANSFER', label: "O'tkazma" },
  ],
};
// Tanlab bo'lmaydigan, faqat tizim yozadigan turlar (masalan kirimdagi qaytarish — manfiy kirim)
const SYSTEM_KIND_LABELS: Record<string, string> = { REFUND: "O'quvchiga qaytarish", TRANSFER: "O'tkazma" };
const kindLabel = (type: TransactionCategory['type'], kind?: string | null) =>
  kind ? (KIND_OPTIONS[type].find(o => o.value === kind)?.label.split(' (')[0] ?? SYSTEM_KIND_LABELS[kind] ?? kind) : 'Avtomatik (nomdan)';

export default function CrmCategories() {
  const canManage = getCurrentRoleLevel() >= ROLE_LEVEL.MANAGER;
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

  // IP-23: ro'yxatda yo'q (erkin matnli) kategoriya nomlari bilan yozilgan kassa yozuvlari
  const [orphans, setOrphans] = useState<Array<{ name: string; type: TransactionCategory['type']; count: number; amount: number; guessedKind: string }>>([]);
  const loadOrphans = useCallback(() => {
    api.get('/transactionCategories/orphans').then(r => setOrphans(Array.isArray(r.data) ? r.data : [])).catch(() => setOrphans([]));
  }, []);
  useEffect(() => { loadOrphans(); }, [loadOrphans, transactionCategories]);
  const errorText = (e: any, fallback: string) => e?.response?.data?.message || e?.response?.data?.error || fallback;
  const editing = editingId ? transactionCategories.find(c => c.id === editingId) : null;
  const isSystemEditing = !!editing?.systemKey;

  const openModal = (category?: TransactionCategory) => {
    if (!canManage) return;
    setEditingId(category?.id ?? null);
    setForm(category ? {
      name: category.name, type: category.type, isActive: category.isActive, kind: category.kind ?? '',
    } : emptyForm(activeType));
    setIsOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || busy.current) return;
    if (!form.name.trim()) {
      showToast('Kategoriya nomini kiriting', 'error');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      if (editingId) {
        // IP-23: nom o'zgarsa kassa yozuvlari, xarajatlar va byudjetdagi nom ham yangilanadi
        const r = await api.put(`/transactionCategories/${editingId}`, payload);
        const n = r.data?.renamed;
        showToast(n && (n.transactions || n.budgets) ? `Kategoriya yangilandi — ${n.transactions} ta yozuv${n.budgets ? `, ${n.budgets} ta byudjet qatori` : ''}da nom yangilandi` : 'Kategoriya yangilandi', 'success');
        await refetch();
      } else {
        await addDocument(payload);
        showToast("Kategoriya qo'shildi", 'success');
      }
      setIsOpen(false);
    } catch (e) {
      showToast(errorText(e, "Kategoriya saqlanmadi. Qayta urinib ko'ring."), 'error');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!canManage || !deleting || busy.current) return;
    busy.current = true;
    try {
      const r = await api.delete(`/transactionCategories/${deleting.id}`);
      showToast(r.data?.archived ? `Kategoriya ishlatilgan (${r.data.used} ta yozuv) — o'chirilmadi, arxivlandi (nofaol)` : "Kategoriya o'chirildi", 'success');
      setDeleting(null);
      await refetch();
    } catch (e) {
      showToast(errorText(e, "Kategoriya o'chirilmadi. Qayta urinib ko'ring."), 'error');
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
        {canManage && <Button onClick={() => openModal()} leftIcon={<Plus size={20} />}>Yangi kategoriya</Button>}
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
                {['Kategoriya', 'Turi', 'Holat', 'Amallar'].map(label => <th key={label} scope="col" className="px-6 py-4 font-bold whitespace-nowrap">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map(category => <tr key={category.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {category.name}
                      {category.systemKey && <span title="Tizim kategoriyasi: nomini o'zgartirish mumkin, o'chirib yoki turini o'zgartirib bo'lmaydi" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><Lock size={10} /> Tizim</span>}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{kindLabel(category.type, category.kind)}</td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${category.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>{category.isActive ? 'Faol' : 'Nofaol'}</span></td>
                  <td className="px-6 py-4">{canManage && <div className="flex gap-2">
                    <Button variant="ghost" aria-label={`${category.name}: tahrirlash`} onClick={() => openModal(category)}><Edit2 size={16} /></Button>
                    {!category.systemKey && <Button variant="ghost" aria-label={`${category.name}: o'chirish`} onClick={() => setDeleting(category)}><Trash2 size={16} className="text-rose-600" /></Button>}
                  </div>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {orphans.filter(o => o.type === activeType).length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200/70 dark:border-amber-500/20 p-4 space-y-2">
          <p className="text-sm font-black text-amber-800 dark:text-amber-200">Ro'yxatda yo'q kategoriya nomlari (eski yoki erkin matnli yozuvlar)</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">Bu yozuvlar hisobotlarda nomidan taxmin qilingan tur bo'yicha hisoblanadi. Kategoriya sifatida qo'shsangiz, turini aniq belgilash mumkin.</p>
          <div className="flex flex-wrap gap-2">
            {orphans.filter(o => o.type === activeType).map(o => (
              <span key={o.name} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/70 dark:bg-white/5 text-xs">
                <b>{o.name}</b> <span className="text-zinc-500">{o.count} ta yozuv</span>
                {canManage && <button type="button" className="font-bold text-blue-600 hover:underline" onClick={() => { setEditingId(null); setForm({ name: o.name, type: o.type, isActive: true, kind: '' }); setIsOpen(true); }}>Qo'shish</button>}
              </span>
            ))}
          </div>
        </div>
      )}
      <Modal isOpen={canManage && isOpen} onClose={closeModal} title={editingId ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'} width="md">
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={saving} className="space-y-5">
            <Input id="category-name" label="Nom" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <label className="block space-y-1.5">
              <span className="text-sm font-bold text-slate-700 dark:text-zinc-300">Turi</span>
              <select value={form.kind} disabled={isSystemEditing} onChange={e => setForm({ ...form, kind: e.target.value })}
                className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500">
                <option value="">Avtomatik (nomdan aniqlanadi)</option>
                {KIND_OPTIONS[form.type].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {form.type === 'income' && <span className="block text-xs text-zinc-500">"Kurs to'lovi" turida o'quvchi tanlash majburiy va to'lov uning qarziga yoziladi.</span>}
              {isSystemEditing && <span className="block text-xs text-blue-600 dark:text-blue-300">Tizim kategoriyasi: turi va holati o'zgarmaydi. Nomini o'zgartirsangiz, eski yozuvlar va hisobotlarda ham yangi nom ko'rinadi.</span>}
              {!!editingId && !isSystemEditing && <span className="block text-xs text-zinc-500">Nomini o'zgartirsangiz, shu kategoriyadagi eski yozuvlar, xarajatlar va byudjetda ham yangi nom ko'rinadi.</span>}
            </label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isActive} disabled={isSystemEditing} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-blue-600" />Faol kategoriya</label>
          </fieldset>
          <div className="flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Bekor qilish</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog isOpen={canManage && !!deleting} title="Kategoriyani o'chirish" message={`“${deleting?.name ?? ''}” kategoriyasini o'chirmoqchimisiz? Agar u bilan kassa yozuvlari bo'lsa, o'chirilmaydi — arxivlanadi (nofaol bo'ladi, tarix saqlanadi).`} confirmText="Ha, o'chirish" onConfirm={confirmDelete} onCancel={cancelDelete} />
    </div>
  );
}
