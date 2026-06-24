import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit2, ChevronDown, ChevronRight, GripVertical, Copy, ArrowLeft, BookOpen, Layers, Clock } from 'lucide-react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import api from '../../api/client';

export default function CrmCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [course, setCourse]     = useState<any>(null);
  const [levels, setLevels]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cloning, setCloning]   = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Level modal
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [editingLevel, setEditingLevel]     = useState<any>(null);
  const [levelForm, setLevelForm]           = useState({ name: '', description: '' });
  const [savingLevel, setSavingLevel]       = useState(false);

  // Module modal
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingModule, setEditingModule]     = useState<any>(null);
  const [moduleForm, setModuleForm]           = useState({ title: '', description: '', duration: '' });
  const [activeLevelId, setActiveLevelId]     = useState<string | null>(null);
  const [savingModule, setSavingModule]       = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [courseRes, currRes] = await Promise.all([
        api.get(`/courses/${id}`),
        api.get(`/curriculum/${id}`),
      ]);
      setCourse(courseRes.data);
      const lvls = Array.isArray(currRes.data) ? currRes.data : [];
      setLevels(lvls);
      // auto-expand first
      if (lvls.length > 0) setExpanded({ [lvls[0].id]: true });
    } catch { setCourse(null); }
    setLoading(false);
  };

  // ── Levels ───────────────────────────────────────────────────────────────
  const openCreateLevel = () => {
    setEditingLevel(null);
    setLevelForm({ name: '', description: '' });
    setShowLevelModal(true);
  };
  const openEditLevel = (lv: any) => {
    setEditingLevel(lv);
    setLevelForm({ name: lv.name, description: lv.description || '' });
    setShowLevelModal(true);
  };
  const saveLevel = async () => {
    if (!levelForm.name.trim()) return;
    setSavingLevel(true);
    try {
      if (editingLevel) {
        await api.patch(`/curriculum/levels/${editingLevel.id}`, levelForm);
      } else {
        await api.post(`/curriculum/${id}`, levelForm);
      }
      setShowLevelModal(false);
      load();
    } catch {}
    setSavingLevel(false);
  };
  const deleteLevel = async (lvId: string) => {
    if (!confirm("Darajani o'chirilsinmi? Barcha modullar ham o'chadi.")) return;
    await api.delete(`/curriculum/levels/${lvId}`);
    load();
  };

  // ── Modules ──────────────────────────────────────────────────────────────
  const openCreateModule = (levelId: string) => {
    setActiveLevelId(levelId);
    setEditingModule(null);
    setModuleForm({ title: '', description: '', duration: '' });
    setShowModuleModal(true);
  };
  const openEditModule = (mod: any, levelId: string) => {
    setActiveLevelId(levelId);
    setEditingModule(mod);
    setModuleForm({ title: mod.title, description: mod.description || '', duration: mod.duration ? String(mod.duration) : '' });
    setShowModuleModal(true);
  };
  const saveModule = async () => {
    if (!moduleForm.title.trim()) return;
    setSavingModule(true);
    try {
      const data = { ...moduleForm, duration: moduleForm.duration ? Number(moduleForm.duration) : undefined };
      if (editingModule) {
        await api.patch(`/curriculum/modules/${editingModule.id}`, data);
      } else {
        await api.post(`/curriculum/levels/${activeLevelId}/modules`, data);
      }
      setShowModuleModal(false);
      load();
    } catch {}
    setSavingModule(false);
  };
  const deleteModule = async (modId: string) => {
    if (!confirm("Modulni o'chirilsinmi?")) return;
    await api.delete(`/curriculum/modules/${modId}`);
    load();
  };

  // ── Reorder ──────────────────────────────────────────────────────────────
  const reorderLevels = async (newOrder: any[]) => {
    setLevels(newOrder);
    await api.post('/curriculum/levels/reorder', {
      courseId: id,
      ids: newOrder.map(l => l.id),
    }).catch(() => {});
  };

  const reorderModules = async (levelId: string, newMods: any[]) => {
    setLevels(prev => prev.map(lv => lv.id === levelId ? { ...lv, modules: newMods } : lv));
    await api.post('/curriculum/modules/reorder', {
      levelId,
      ids: newMods.map(m => m.id),
    }).catch(() => {});
  };

  // ── Clone ─────────────────────────────────────────────────────────────────
  const cloneCourse = async () => {
    if (!confirm("Kursni nusxalashni xohlaysizmi?")) return;
    setCloning(true);
    try {
      const res = await api.post(`/curriculum/${id}/clone`);
      navigate(`/crmtayyorlovmarkaz/courses/${res.data.id}`);
    } catch {}
    setCloning(false);
  };

  // ── Counts ────────────────────────────────────────────────────────────────
  const totalModules = levels.reduce((sum, lv) => sum + (lv.modules?.length || 0), 0);
  const totalDuration = levels.reduce((sum, lv) =>
    sum + (lv.modules || []).reduce((s2: number, m: any) => s2 + (m.duration || 0), 0), 0
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!course) return (
    <div className="text-center py-16">
      <p className="text-zinc-500">Kurs topilmadi</p>
      <button onClick={() => navigate('/crmtayyorlovmarkaz/courses')} className="mt-3 text-blue-600 text-sm font-bold">← Kurslarga qaytish</button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/crmtayyorlovmarkaz/courses')} className="mt-1 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">{course.name}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{course.description || 'Tavsif yo\'q'}</p>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Layers size={12} /> {levels.length} daraja
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <BookOpen size={12} /> {totalModules} modul
              </span>
              {totalDuration > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock size={12} /> {Math.round(totalDuration / 60)} soat
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cloneCourse}
            disabled={cloning}
            className="flex items-center gap-2 px-3 py-2 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 transition-all"
          >
            <Copy size={14} /> {cloning ? 'Nusxalanmoqda...' : 'Nusxa olish'}
          </button>
          <button
            onClick={openCreateLevel}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md"
          >
            <Plus size={14} /> Yangi Daraja
          </button>
        </div>
      </div>

      {/* Curriculum */}
      {levels.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Layers size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="font-bold text-zinc-500">Hozircha darajalar yo'q</p>
          <p className="text-sm text-zinc-400 mt-1">Birinchi darajani yarating</p>
          <button onClick={openCreateLevel} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
            <Plus size={13} className="inline mr-1" /> Daraja yaratish
          </button>
        </div>
      ) : (
        <Reorder.Group axis="y" values={levels} onReorder={reorderLevels} className="space-y-3">
          {levels.map((lv, li) => (
            <Reorder.Item key={lv.id} value={lv} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              {/* Level header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
                <div className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-600 hover:text-zinc-400">
                  <GripVertical size={16} />
                </div>
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                  {li + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">{lv.name}</h3>
                  {lv.description && <p className="text-xs text-zinc-500 mt-0.5">{lv.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <BookOpen size={12} /> {lv.modules?.length || 0} modul
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditLevel(lv)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => deleteLevel(lv.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600">
                    <Trash2 size={13} />
                  </button>
                  <button onClick={() => setExpanded(prev => ({ ...prev, [lv.id]: !prev[lv.id] }))}
                    className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                    {expanded[lv.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>

              {/* Modules */}
              <AnimatePresence initial={false}>
                {expanded[lv.id] && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      {(!lv.modules || lv.modules.length === 0) ? (
                        <p className="text-xs text-zinc-400 text-center py-3">Modullar yo'q</p>
                      ) : (
                        <Reorder.Group axis="y" values={lv.modules} onReorder={mods => reorderModules(lv.id, mods)} className="space-y-2">
                          {lv.modules.map((mod: any, mi: number) => (
                            <Reorder.Item key={mod.id} value={mod}
                              className="flex items-center gap-3 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl group">
                              <div className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-400">
                                <GripVertical size={14} />
                              </div>
                              <span className="w-5 h-5 rounded-md bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-600 dark:text-zinc-400 shrink-0">
                                {mi + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{mod.title}</p>
                                {mod.description && <p className="text-xs text-zinc-500 truncate">{mod.description}</p>}
                              </div>
                              {mod.duration && (
                                <span className="text-xs text-zinc-400 flex items-center gap-1 shrink-0">
                                  <Clock size={11} /> {mod.duration}m
                                </span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditModule(mod, lv.id)} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-zinc-400 hover:text-blue-600">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => deleteModule(mod.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      )}
                      <button
                        onClick={() => openCreateModule(lv.id)}
                        className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-blue-400 rounded-xl text-xs font-bold text-zinc-400 hover:text-blue-600 transition-all"
                      >
                        <Plus size={13} /> Modul qo'shish
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Level modal */}
      <AnimatePresence>
        {showLevelModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowLevelModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="font-black text-slate-900 dark:text-white">{editingLevel ? 'Darajani tahrirlash' : 'Yangi daraja'}</h2>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Daraja nomi *</label>
                    <input value={levelForm.name} onChange={e => setLevelForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Boshlang'ich daraja" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Tavsif</label>
                    <textarea value={levelForm.description} onChange={e => setLevelForm(p => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="Daraja haqida qisqacha..." />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button onClick={() => setShowLevelModal(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Bekor</button>
                  <button onClick={saveLevel} disabled={savingLevel || !levelForm.name.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                    {savingLevel ? 'Saqlanmoqda...' : (editingLevel ? 'Saqlash' : "Qo'shish")}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Module modal */}
      <AnimatePresence>
        {showModuleModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setShowModuleModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="font-black text-slate-900 dark:text-white">{editingModule ? 'Modulni tahrirlash' : 'Yangi modul'}</h2>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Modul nomi *</label>
                    <input value={moduleForm.title} onChange={e => setModuleForm(p => ({ ...p, title: e.target.value }))}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="1-dars: Kirish" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Tavsif</label>
                    <textarea value={moduleForm.description} onChange={e => setModuleForm(p => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="Modul haqida..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5 text-zinc-700 dark:text-zinc-300">Davomiyligi (daqiqa)</label>
                    <input type="number" value={moduleForm.duration} onChange={e => setModuleForm(p => ({ ...p, duration: e.target.value }))}
                      className="w-full border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="60" />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <button onClick={() => setShowModuleModal(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">Bekor</button>
                  <button onClick={saveModule} disabled={savingModule || !moduleForm.title.trim()}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold">
                    {savingModule ? 'Saqlanmoqda...' : (editingModule ? 'Saqlash' : "Qo'shish")}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
