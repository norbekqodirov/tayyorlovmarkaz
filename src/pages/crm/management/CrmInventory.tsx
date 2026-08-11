import { useState } from 'react';
import {
  Plus, Search, Edit2, Trash2, Package,
  MapPin, DollarSign, CheckCircle2, AlertCircle,
  Download
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { MoneyInput } from '../../../components/ui/MoneyInput';
import { exportToExcel } from '../../../utils/export';
import { formatNumber } from '../../../utils/formatters';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  location: string; // e.g., "1-xona", "Reception"
  purchaseDate: string;
  price: number;
  quantity: number;
  condition: 'Yaxshi' | 'Ta\'mirda' | 'Eskirgan';
  notes: string;
}

const CATEGORIES = ['Mebel', 'Texnika', 'O\'quv qurollari', 'Xo\'jalik mollari', 'Boshqa'];
const LOCATIONS = ['Reception', '1-xona', '2-xona', '3-xona', '4-xona', 'Oshxona', 'Ombor'];

export default function CrmInventory() {
  const { data: items = [], addDocument, updateDocument, deleteDocument } = useFirestore<InventoryItem>('inventory');
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('Barchasi');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    name: '',
    category: 'Texnika',
    location: 'Reception',
    purchaseDate: new Date().toISOString().split('T')[0],
    price: 0,
    quantity: 1,
    condition: 'Yaxshi',
    notes: ''
  });

  const handleSave = async () => {
    if (!formData.name) {
      showToast('Iltimos, jihoz nomini kiriting!', 'error');
      return;
    }

    if (editingItem) {
      await updateDocument(editingItem.id, formData);
    } else {
      await addDocument(formData as Omit<InventoryItem, 'id'>);
    }
    showToast(editingItem ? 'Jihoz yangilandi' : 'Jihoz qo\'shildi', 'success');
    closeModal();
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    await deleteDocument(deleteConfirm.id);
    showToast('Jihoz o\'chirildi', 'success');
    setDeleteConfirm({ open: false, id: '' });
  };

  const openModal = (item: InventoryItem | null = null) => {
    if (item) {
      setEditingItem(item);
      setFormData(item);
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        category: 'Texnika',
        location: 'Reception',
        purchaseDate: new Date().toISOString().split('T')[0],
        price: 0,
        quantity: 1,
        condition: 'Yaxshi',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const safeItems = items || [];
  const filteredItems = (safeItems || []).filter(i => {
    const matchesSearch = (i.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'Barchasi' || i.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const formatMoney = (amount: number) => {
    return formatNumber(amount || 0) + ' UZS';
  };

  const totalValue = (safeItems || []).reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Jihozni o'chirish"
        message="Haqiqatan ham bu jihozni o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Inventarizatsiya</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi jihozlari va aktivlari boshqaruvi</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(filteredItems.map(i => ({
              ...i,
              price: i.price ? Number(i.price).toLocaleString() + " so'm" : '',
              totalValue: i.price && i.quantity ? (Number(i.price) * Number(i.quantity)).toLocaleString() + " so'm" : '',
            })), [
              { header: 'Jihoz nomi', key: 'name', width: 25 },
              { header: 'Kategoriya', key: 'category', width: 15 },
              { header: 'Joylashuv', key: 'location', width: 15 },
              { header: 'Soni', key: 'quantity', width: 8 },
              { header: 'Narxi', key: 'price', width: 18 },
              { header: 'Umumiy qiymat', key: 'totalValue', width: 18 },
              { header: 'Holat', key: 'condition', width: 12 },
              { header: 'Sotib olingan', key: 'purchaseDate', width: 15 },
            ], 'Inventar')}
            className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all"
            title="Excel yuklab olish"
          >
            <Download size={16} />
          </button>
          <Button onClick={() => openModal()} leftIcon={<Plus size={20} />}>
            Yangi Jihoz
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard variant="gradient" color="blue" label="Jami Jihoz" value={safeItems.length} sub="Ro'yxatda" icon={<Package size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="emerald" label="Umumiy Qiymat" value={formatNumber(totalValue)} sub="so'm" icon={<DollarSign size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="violet" label="Yaxshi Holatda" value={safeItems.filter(i => i.condition === 'Yaxshi').length} sub="Ishlaydigan" icon={<CheckCircle2 size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="amber" label="Ta'mirda" value={safeItems.filter(i => i.condition === 'Ta\'mirda' || i.condition === 'Eskirgan').length} sub="Diqqat kerak" icon={<AlertCircle size={17} strokeWidth={2.5} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input
            type="text"
            placeholder="Jihozlarni qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
          />
        </div>
        <div className="md:col-span-1">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-4 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm dark:text-white"
          >
            <option value="Barchasi">Barcha kategoriyalar</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jihoz</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Joylashuv</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Soni</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Narxi</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(filteredItems || []).map(item => (
                <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                        <Package size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                        <p className="text-[10px] text-zinc-500 font-medium">{item.purchaseDate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full text-[10px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                      <MapPin size={14} className="text-zinc-400" />
                      {item.location}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-slate-900 dark:text-white">{item.quantity}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-black text-blue-600">{formatMoney(item.price)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
                      item.condition === 'Yaxshi' ? 'text-emerald-600' :
                      item.condition === 'Ta\'mirda' ? 'text-amber-600' :
                      'text-rose-600'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        item.condition === 'Yaxshi' ? 'bg-emerald-600' :
                        item.condition === 'Ta\'mirda' ? 'bg-amber-600' :
                        'bg-rose-600'
                      }`} />
                      {item.condition}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openModal(item)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-xl transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Jihozni Tahrirlash' : "Yangi Jihoz Qo'shish"}
        width="lg"
      >
        <div className="space-y-6">
          <Input
            label="Jihoz Nomi"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="Masalan: Ofis stoli"
          />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kategoriya</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Joylashuv</label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Input
              type="date"
              label="Sotib olingan sana"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({...formData, purchaseDate: e.target.value})}
            />
            <Input
              type="number"
              label="Soni"
              value={formData.quantity}
              onChange={(e) => setFormData({...formData, quantity: Number(e.target.value)})}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <MoneyInput
              label="Narxi (dona)"
              value={formData.price}
              onChange={(price) => setFormData({...formData, price})}
            />
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({...formData, condition: e.target.value as any})}
                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Yaxshi">Yaxshi</option>
                <option value="Ta'mirda">Ta'mirda</option>
                <option value="Eskirgan">Eskirgan</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tavsif</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white min-h-[100px]"
              placeholder="Jihoz haqida batafsil..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal}>Bekor qilish</Button>
            <Button onClick={handleSave}>Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
