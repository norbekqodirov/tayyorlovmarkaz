import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, DoorOpen, Users, Monitor, Wifi, Wind, X, Edit2, Trash2, CheckCircle2, Download } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ErrorState, EmptyState } from '../../../components/States';
import { exportToExcel } from '../../../utils/export';

interface Room {
  id: string;
  name: string;
  capacity: number;
  type: 'Ma\'ruza' | 'Kompyuter' | 'Laboratoriya';
  amenities: string[];
  status: 'Bo\'sh' | 'Band' | 'Ta\'mirda';
}

const AMENITIES = [
  { id: 'projector', name: 'Proyektor', icon: Monitor },
  { id: 'wifi', name: 'Wi-Fi', icon: Wifi },
  { id: 'ac', name: 'Konditsioner', icon: Wind },
  { id: 'computers', name: 'Kompyuterlar', icon: Monitor },
];

export default function CrmRooms() {
  const canManage = getCurrentRoleLevel() >= ROLE_LEVEL.MANAGER;
  const { data: rooms = [], loading, error, refetch, addDocument, updateDocument, deleteDocument } = useFirestore<Room>('rooms');
  const { data: schedule = [] } = useFirestore<any>('schedule');
  const { data: groups = [] } = useFirestore<any>('groups');
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('Barchasi');
  const [statusFilter, setStatusFilter] = useState('Barchasi');

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string;
    name: string;
    warningMessage?: string;
  }>({ open: false, id: '', name: '' });

  const [formData, setFormData] = useState<Partial<Room>>({
    name: '',
    capacity: 20,
    type: 'Ma\'ruza',
    amenities: [],
    status: 'Bo\'sh'
  });

  const mappedRooms = useMemo(() => {
    return (rooms || []).map((r: any) => {
      let parsed: any = {};
      if (r.color) {
        try { parsed = JSON.parse(r.color); } catch(e) {}
      }
      return {
        ...r,
        type: parsed.type || 'Ma\'ruza',
        status: parsed.status || 'Bo\'sh',
        amenities: parsed.amenities || []
      } as Room;
    });
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    return mappedRooms.filter(room => {
      const matchesSearch = (room.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'Barchasi' || room.type === typeFilter;
      const matchesStatus = statusFilter === 'Barchasi' || room.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [mappedRooms, searchQuery, typeFilter, statusFilter]);

  const handleSave = async () => {
    if (!canManage) return;

    const trimmedName = formData.name?.trim();
    if (!trimmedName) {
      showToast("Xona nomini kiriting!", 'error');
      return;
    }

    const cap = Number(formData.capacity);
    if (isNaN(cap) || cap <= 0) {
      showToast("Xona sig'imi 0 dan katta bo'lishi kerak!", 'error');
      return;
    }

    setIsSaving(true);
    try {
      const dbPayload = {
        name: trimmedName,
        capacity: cap,
        color: JSON.stringify({
          type: formData.type || 'Ma\'ruza',
          amenities: formData.amenities || [],
          status: formData.status || 'Bo\'sh'
        })
      };

      if (editingRoom) {
        await updateDocument(editingRoom.id, dbPayload as any);
      } else {
        await addDocument(dbPayload as any);
      }
      showToast(editingRoom ? 'Xona yangilandi' : 'Xona qo\'shildi', 'success');
      closeModal();
    } catch (error) {
      console.error('Error saving room:', error);
      showToast('Xonani saqlashda xatolik yuz berdi.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (room: Room) => {
    if (!canManage) return;

    // Tekshiruv: ushbu xona biror faol guruh jadvalida ishlatilayotgan bo'lsa ogohlantiramiz
    const activeGroupNames = (schedule || [])
      .filter((s: any) => s.room === room.name || s.room === room.id || s.roomId === room.id)
      .map((s: any) => {
        const group = (groups || []).find((g: any) => g.id === s.groupId);
        if (!group) return s.groupName || null;
        const isInactive = group.status === 'completed' || group.status === 'Yakunlangan' || group.status === 'archived' || group.status === 'Arxiv';
        return isInactive ? null : (group.name || s.groupName);
      })
      .filter(Boolean);

    const uniqueGroups = Array.from(new Set(activeGroupNames));

    let warningMessage = `"${room.name}" xonasini o'chirmoqchimisiz?`;
    if (uniqueGroups.length > 0) {
      warningMessage = `OGOHLANTIRISH: Usbu xona hozirda faol guruh(lar) jadvalida ishlatilmoqda (${uniqueGroups.join(', ')}). Xonani o'chirish jadvalda chalkashlik keltirib chiqarishi mumkin. Baribir o'chirmoqchimisiz?`;
    }

    setDeleteConfirm({
      open: true,
      id: room.id,
      name: room.name,
      warningMessage
    });
  };

  const confirmDelete = async () => {
    if (!canManage) return;
    try {
      await deleteDocument(deleteConfirm.id);
      showToast('Xona o\'chirildi', 'success');
    } catch (error) {
      showToast('Xonani o\'chirishda xatolik yuz berdi.', 'error');
    }
    setDeleteConfirm({ open: false, id: '', name: '' });
  };

  const openModal = (room: Room | null = null) => {
    if (!canManage) return;
    if (room) {
      setEditingRoom(room);
      setFormData(room);
    } else {
      setEditingRoom(null);
      setFormData({
        name: '',
        capacity: 20,
        type: 'Ma\'ruza',
        amenities: [],
        status: 'Bo\'sh'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
  };

  const toggleAmenity = (id: string) => {
    const current = formData.amenities || [];
    if (current.includes(id)) {
      setFormData({ ...formData, amenities: current.filter(a => a !== id) });
    } else {
      setFormData({ ...formData, amenities: [...current, id] });
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-3 p-12 text-zinc-500 font-bold">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        Xonalar ma'lumotlari yuklanmoqda...
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState message="Xonalar ro'yxatini yuklashda xatolik yuz berdi." onRetry={refetch} />
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={canManage && deleteConfirm.open}
        title="Xonani o'chirish"
        message={deleteConfirm.warningMessage || `"${deleteConfirm.name}" xonasini o'chirmoqchimisiz?`}
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Xonalar Boshqaruvi</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi xonalari va ularning jihozlanishi</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToExcel(filteredRooms.map(r => ({
              ...r,
              amenities: Array.isArray(r.amenities) ? r.amenities.join(', ') : '',
            })), [
              { header: 'Xona nomi', key: 'name', width: 20 },
              { header: "Sig'imi", key: 'capacity', width: 10 },
              { header: 'Turi', key: 'type', width: 15 },
              { header: 'Jihozlar', key: 'amenities', width: 30 },
              { header: 'Holat', key: 'status', width: 12 },
            ], 'Xonalar')}
            className="p-2.5 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all"
            title="Excel yuklab olish"
          >
            <Download size={16} />
          </button>
          {canManage && <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            Yangi Xona
          </button>}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Xonalarni qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Barchasi">Barcha turlar</option>
            <option value="Ma'ruza">Ma'ruza</option>
            <option value="Kompyuter">Kompyuter</option>
            <option value="Laboratoriya">Laboratoriya</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Barchasi">Barcha holatlar</option>
            <option value="Bo'sh">Bo'sh</option>
            <option value="Band">Band</option>
            <option value="Ta'mirda">Ta'mirda</option>
          </select>
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <EmptyState
          title={mappedRooms.length === 0 ? "Xonalar mavjud emas" : "Xona topilmadi"}
          message={mappedRooms.length === 0 ? "Hali hech qanday xona qo'shilmagan." : "Qidiruv shartlariga mos xona topilmadi."}
          actionLabel={canManage && mappedRooms.length === 0 ? "Yangi Xona" : undefined}
          onAction={canManage && mappedRooms.length === 0 ? () => openModal() : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map((room) => (
            <motion.div
              key={room.id}
              layoutId={room.id}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden group"
            >
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      room.status === 'Bo\'sh' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' :
                      room.status === 'Band' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}>
                      <DoorOpen size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{room.name}</h3>
                      <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{room.type}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {canManage && <button onClick={() => openModal(room)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-600 transition-colors" title="Tahrirlash">
                      <Edit2 size={16} />
                    </button>}
                    {canManage && <button onClick={() => handleDelete(room)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-rose-600 transition-colors" title="O'chirish">
                      <Trash2 size={16} />
                    </button>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <Users size={16} />
                    <span className="text-sm font-bold">{room.capacity} kishi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      room.status === 'Bo\'sh' ? 'bg-emerald-100 text-emerald-600' :
                      room.status === 'Band' ? 'bg-blue-100 text-blue-600' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>
                      {room.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  {room.amenities.map(amenityId => {
                    const amenity = AMENITIES.find(a => a.id === amenityId);
                    if (!amenity) return null;
                    const Icon = amenity.icon;
                    return (
                      <div key={amenityId} className="flex items-center gap-1 px-2 py-1 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-[10px] font-bold text-zinc-500">
                        <Icon size={12} />
                        {amenity.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {canManage && isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingRoom ? 'Xonani Tahrirlash' : 'Yangi Xona Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xona Nomi<span className="text-rose-500 ml-0.5">*</span></label>
                    <input 
                      type="text" 
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="Masalan: 101-xona"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sig'imi (Kishi)<span className="text-rose-500 ml-0.5">*</span></label>
                    <input 
                      type="number" 
                      min="1"
                      value={formData.capacity ?? 20}
                      onChange={(e) => setFormData({...formData, capacity: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Turi</label>
                    <select 
                      value={formData.type || 'Ma\'ruza'}
                      onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="Ma'ruza">Ma'ruza</option>
                      <option value="Kompyuter">Kompyuter</option>
                      <option value="Laboratoriya">Laboratoriya</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                    <select 
                      value={formData.status || 'Bo\'sh'}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="Bo'sh">Bo'sh</option>
                      <option value="Band">Band</option>
                      <option value="Ta'mirda">Ta'mirda</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jihozlar</label>
                  <div className="grid grid-cols-2 gap-3">
                    {AMENITIES.map(amenity => {
                      const Icon = amenity.icon;
                      const isSelected = formData.amenities?.includes(amenity.id);
                      return (
                        <button
                          key={amenity.id}
                          type="button"
                          onClick={() => toggleAmenity(amenity.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            isSelected 
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600' 
                              : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500'
                          }`}
                        >
                          <Icon size={18} />
                          <span className="text-xs font-bold">{amenity.name}</span>
                          {isSelected && <CheckCircle2 size={14} className="ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
                <button 
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  Bekor qilish
                </button>
                <button 
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                >
                  {isSaving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Saqlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
