/**
 * SavedFiltersDropdown — Save/load/delete named filter configurations per page.
 *
 * Usage:
 *   <SavedFiltersDropdown
 *     page="students"
 *     currentFilters={{ search: 'Ali', status: 'active' }}
 *     onApply={(config) => applyFilters(config)}
 *   />
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronDown, Plus, Trash2, Check } from 'lucide-react';
import api from '../api/client';

interface SavedFilter {
  id: string;
  name: string;
  config: string; // JSON string
}

interface SavedFiltersDropdownProps {
  page: string;
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}

export function SavedFiltersDropdown({ page, currentFilters, onApply }: SavedFiltersDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const userId = (() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}').id || ''; } catch { return ''; }
  })();

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/savedFilters?userId=${userId}&page=${page}`);
      setFilters(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFilters([]);
    }
  }, [userId, page]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const saveFilter = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await api.post('/savedFilters', {
        userId,
        page,
        name: saveName.trim(),
        config: JSON.stringify(currentFilters),
      });
      setSaveName('');
      setShowSaveInput(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteFilter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/savedFilters/${id}`);
      setFilters(prev => prev.filter(f => f.id !== id));
    } catch {}
  };

  const applyFilter = (filter: SavedFilter) => {
    try {
      const config = JSON.parse(filter.config);
      onApply(config);
      setOpen(false);
    } catch {}
  };

  const hasActiveFilters = Object.values(currentFilters).some(v => v && v !== '');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
          filters.length > 0 || hasActiveFilters
            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
            : 'bg-white dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.06]'
        }`}
      >
        <Bookmark size={12} strokeWidth={2} />
        Filterlar
        {filters.length > 0 && (
          <span className="bg-amber-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-black">
            {filters.length}
          </span>
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1a1a28] rounded-2xl border border-zinc-200/60 dark:border-white/10 shadow-xl z-20 overflow-hidden"
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest">
                  Saqlangan Filterlar
                </span>
                {hasActiveFilters && !showSaveInput && (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Plus size={10} strokeWidth={3} /> Saqlash
                  </button>
                )}
              </div>

              {/* Save input */}
              <AnimatePresence>
                {showSaveInput && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-b border-zinc-100 dark:border-white/[0.05] overflow-hidden"
                  >
                    <div className="px-3 py-2.5 flex gap-2">
                      <input
                        type="text"
                        placeholder="Filter nomi..."
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveFilter(); if (e.key === 'Escape') setShowSaveInput(false); }}
                        autoFocus
                        className="flex-1 text-xs px-2.5 py-1.5 bg-zinc-100 dark:bg-white/5 rounded-lg border border-zinc-200 dark:border-white/10 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <button
                        onClick={saveFilter}
                        disabled={saving || !saveName.trim()}
                        className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-all"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Filter list */}
              <div className="max-h-52 overflow-y-auto">
                {filters.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bookmark size={20} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-[11px] text-zinc-400">Hali saqlangan filter yo'q</p>
                    {hasActiveFilters && (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        className="mt-2 text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Joriy filterni saqlash
                      </button>
                    )}
                  </div>
                ) : (
                  filters.map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => applyFilter(filter)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group"
                    >
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate flex-1">
                        {filter.name}
                      </span>
                      <button
                        onClick={e => deleteFilter(filter.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-500 rounded transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SavedFiltersDropdown;
