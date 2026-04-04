import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, DoorOpen, Users, Monitor, Wifi, Wind, X, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

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
  const { data: rooms = [], addDocument, updateDocument, deleteDocument } = useFirestore<Room>('rooms');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<Partial<Room>>({
    name: '',
    capacity: 20,
    type: 'Ma\'ruza',
    amenities: [],
    status: 'Bo\'sh'
  });

  const handleSave = async () => {
    try {
      if (editingRoom) {
        await updateDocument(editingRoom.id, formData);
      } else {
        await addDocument(formData as Omit<Room, 'id'>);
      }
      closeModal();
    } catch (error) {
      console.error('Error saving room:', error);
      alert('Xonani saqlashda xatolik yuz berdi.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Haqiqatan ham ushbu xonani o\'chirmoqchimisiz?')) {
      try {
        await deleteDocument(id);
      } catch (error) {
        console.error('Error deleting room:', error);
        alert('Xonani o\'chirishda xatolik yuz berdi.');
      }
    }
  };

  const openModal = (room: Room | null = null) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Xonalar Boshqaruvi</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quv markazi xonalari va ularning jihozlanishi</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus size={20} />
          Yangi Xona
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(rooms || []).map((room) => (
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
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(room)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-600 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(room.id)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-rose-600 transition-colors">
                    <Trash2 size={16} />
                  </button>
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

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
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
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Xona Nomi</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="Masalan: 101-xona"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sig'imi (Kishi)</label>
                    <input 
                      type="number" 
                      value={formData.capacity}
                      onChange={(e) => setFormData({...formData, capacity: Number(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Turi</label>
                    <select 
                      value={formData.type}
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
                      value={formData.status}
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
                  onClick={closeModal}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  Bekor qilish
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20"
                >
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
