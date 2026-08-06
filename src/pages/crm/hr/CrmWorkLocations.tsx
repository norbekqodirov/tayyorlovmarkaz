import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, Edit2, Trash2, Clock, Radio, Building2,
  CheckCircle2, XCircle, Navigation, Users, ChevronRight,
  AlertCircle, Save, X, Eye, EyeOff,
} from 'lucide-react';
import api from '../../../api/client';

interface WorkLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  workStartTime: string;
  lateAfterMin: number;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
}

const DEFAULT_FORM = {
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radius: '200',
  workStartTime: '09:00',
  lateAfterMin: '15',
  branchId: '',
};

function LocBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      active
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
      {active ? 'Faol' : 'Nofaol'}
    </span>
  );
}

export default function CrmWorkLocations() {
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [faceProfiles, setFaceProfiles] = useState<any[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);

  useEffect(() => { load(); loadFaceProfiles(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/work-locations/all');
      setLocations(Array.isArray(res.data) ? res.data : []);
    } catch { setLocations([]); }
    setLoading(false);
  };

  const loadFaceProfiles = async () => {
    try {
      const res = await api.get('/staff-attendance/face-profiles');
      setFaceProfiles(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...DEFAULT_FORM });
    setError('');
    setShowModal(true);
  };

  const openEdit = (loc: WorkLocation) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      address: loc.address || '',
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius: String(loc.radius),
      workStartTime: loc.workStartTime,
      lateAfterMin: String(loc.lateAfterMin),
      branchId: loc.branchId || '',
    });
    setError('');
    setShowModal(true);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(7),
          longitude: pos.coords.longitude.toFixed(7),
        }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const save = async () => {
    if (!form.name.trim()) return setError('Nom kiritilishi shart');
    if (!form.latitude || !form.longitude) return setError('Koordinatalar kiritilishi shart');
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        address: form.address || null,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        radius: parseInt(form.radius) || 200,
        workStartTime: form.workStartTime,
        lateAfterMin: parseInt(form.lateAfterMin) || 15,
        branchId: form.branchId || null,
      };

      if (editing) {
        await api.put(`/work-locations/${editing.id}`, body);
      } else {
        await api.post('/work-locations', body);
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Xatolik yuz berdi');
    }
    setSaving(false);
  };

  const toggleActive = async (loc: WorkLocation) => {
    try {
      await api.put(`/work-locations/${loc.id}`, { isActive: !loc.isActive });
      load();
    } catch { /* ignore */ }
  };

  const remove = async (id: string) => {
    if (!confirm("Ish joyini o'chirilsinmi? (Davomat yozuvlari saqlanib qoladi)")) return;
    await api.delete(`/work-locations/${id}`);
    load();
  };

  const deleteProfile = async (staffId: string) => {
    setDeletingProfile(staffId);
    try {
      await api.delete(`/staff-attendance/face-profiles/${staffId}`);
      loadFaceProfiles();
    } finally {
      setDeletingProfile(null);
    }
  };

  const registered = faceProfiles.filter(p => p.faceProfile);
  const unregistered = faceProfiles.filter(p => !p.faceProfile);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">Ish Joylari</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {locations.filter(l => l.isActive).length} ta faol joylashuv
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md"
        >
          <Plus size={15} strokeWidth={2.5} /> Yangi Joy
        </button>
      </div>

      {/* Locations grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0,1,2].map(i => (
            <div key={i} className="h-52 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MapPin size={48} className="text-zinc-300 dark:text-zinc-600 mb-4" />
          <p className="text-zinc-500 font-medium">Hali ish joylari qo'shilmagan</p>
          <p className="text-zinc-400 text-sm mt-1">Yangi joy qo'shib, davomat tizimini ishga tushiring</p>
          <button onClick={openCreate} className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
            + Birinchi joy qo'shish
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {locations.map(loc => (
            <motion.div
              key={loc.id}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-white dark:bg-zinc-900 rounded-2xl border p-5 space-y-3 ${
                loc.isActive
                  ? 'border-zinc-200 dark:border-zinc-700'
                  : 'border-zinc-100 dark:border-zinc-800 opacity-60'
              }`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <MapPin size={16} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{loc.name}</div>
                    {loc.address && (
                      <div className="text-xs text-zinc-400 truncate">{loc.address}</div>
                    )}
                  </div>
                </div>
                <LocBadge active={loc.isActive} />
              </div>

              {/* Coords */}
              <div className="text-xs text-zinc-400 font-mono bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-zinc-50 dark:bg-zinc-800/40 rounded-xl py-2">
                  <div className="text-sm font-bold text-slate-800 dark:text-white">{loc.radius}m</div>
                  <div className="text-[10px] text-zinc-400">Radius</div>
                </div>
                <div className="text-center bg-zinc-50 dark:bg-zinc-800/40 rounded-xl py-2">
                  <div className="text-sm font-bold text-slate-800 dark:text-white">{loc.workStartTime}</div>
                  <div className="text-[10px] text-zinc-400">Boshlanish</div>
                </div>
                <div className="text-center bg-zinc-50 dark:bg-zinc-800/40 rounded-xl py-2">
                  <div className="text-sm font-bold text-amber-600">+{loc.lateAfterMin}d</div>
                  <div className="text-[10px] text-zinc-400">Kechikish</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => openEdit(loc)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Edit2 size={12} /> Tahrirlash
                </button>
                <button
                  onClick={() => toggleActive(loc)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    loc.isActive
                      ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                      : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                  }`}
                >
                  {loc.isActive ? <EyeOff size={12} /> : <Eye size={12} />}
                  {loc.isActive ? 'O\'chirish' : 'Yoqish'}
                </button>
                <button
                  onClick={() => remove(loc.id)}
                  className="p-1.5 rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Face Profiles section */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setShowProfiles(v => !v)}
          className="w-full flex items-center justify-between p-5 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
              <Users size={16} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Yuz ID Profillari</div>
              <div className="text-xs text-zinc-400">
                {registered.length} ta ro'yxatdan o'tgan · {unregistered.length} ta o'tmagan
              </div>
            </div>
          </div>
          <ChevronRight size={16} className={`text-zinc-400 transition-transform ${showProfiles ? 'rotate-90' : ''}`} />
        </button>

        <AnimatePresence>
          {showProfiles && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {faceProfiles.length === 0 ? (
                  <div className="p-6 text-center text-zinc-400 text-sm">
                    Xodimlar topilmadi
                  </div>
                ) : (
                  faceProfiles.map(staff => (
                    <div key={staff.id} className="flex items-center gap-3 px-5 py-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex-shrink-0">
                        {staff.faceProfile?.photoUrl ? (
                          <img src={staff.faceProfile.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : staff.photo ? (
                          <img src={staff.photo} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                            {staff.name?.slice(0, 1)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{staff.name}</div>
                        <div className="text-xs text-zinc-400">{staff.role}</div>
                      </div>

                      {staff.faceProfile ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 size={12} /> Ro'yxatdan o'tgan
                          </span>
                          <button
                            onClick={() => deleteProfile(staff.id)}
                            disabled={deletingProfile === staff.id}
                            className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-zinc-400">
                          <AlertCircle size={12} /> O'tmagan
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {unregistered.length > 0 && (
                <div className="px-5 py-3 bg-amber-50 dark:bg-amber-500/5 border-t border-amber-100 dark:border-amber-500/10">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle size={11} className="inline mr-1" />
                    {unregistered.length} xodim hali yuz ID ni ro'yxatdan o'tkazmaganligi sababli davomat tizimidan foydalana olmaydi.
                    Ular Staff Bot orqali o'z yuzlarini ro'yxatdan o'tkazishlari kerak.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* How it works */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-5">
        <h3 className="font-bold text-sm text-blue-900 dark:text-blue-300 mb-3">Face ID Davomat — Qanday ishlaydi?</h3>
        <div className="space-y-2.5">
          {[
            { num: '1', text: "HR ish joyini qo'shadi (manzil, koordinata, radius, ish vaqti)" },
            { num: '2', text: "Xodim Staff Bot Mini App da bir marta yuzini ro'yxatdan o'tkazadi" },
            { num: '3', text: "Har kuni ishga kelganda: Kamera → Yuz tekshirish → GPS → Kirib keldi!" },
            { num: '4', text: "O'z vaqtida kelsa 'Keldi', kechiksa 'Kechikdi' statusida belgilanadi" },
            { num: '5', text: "HR CRM dan real-time davomatni kuzatib boradi" },
          ].map(step => (
            <div key={step.num} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step.num}
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="font-bold text-slate-900 dark:text-white">
                  {editing ? 'Ish joyini tahrirlash' : 'Yangi ish joyi'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Nom */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Nom *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Masalan: Bosh ofis, 1-filial"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Manzil */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Manzil</label>
                  <input
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Ko'cha, shahar"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Koordinatalar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Koordinatalar *</label>
                    <button
                      onClick={detectLocation}
                      disabled={locating}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      <Navigation size={11} className={locating ? 'animate-spin' : ''} />
                      {locating ? 'Aniqlanmoqda...' : 'Joylashuvni aniqlash'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.0000001"
                      value={form.latitude}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                      placeholder="Kenglik (lat)"
                      className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      step="0.0000001"
                      value={form.longitude}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                      placeholder="Uzunlik (lng)"
                      className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    Google Maps dan koordinatani nusxa oling yoki yuqoridagi tugmani bosing
                  </p>
                </div>

                {/* Radius */}
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Radius: <span className="text-blue-600">{form.radius}m</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="50"
                    value={form.radius}
                    onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
                    className="mt-2 w-full accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-zinc-400 mt-1">
                    <span>50m</span><span>500m</span><span>1km</span>
                  </div>
                </div>

                {/* Ish vaqti */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Ish boshlanishi</label>
                    <input
                      type="time"
                      value={form.workStartTime}
                      onChange={e => setForm(f => ({ ...f, workStartTime: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Kechikish (daqiqa)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={form.lateAfterMin}
                      onChange={e => setForm(f => ({ ...f, lateAfterMin: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 rounded-xl text-sm text-red-600 dark:text-red-400">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Bekor
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                    {editing ? 'Saqlash' : 'Qo\'shish'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
