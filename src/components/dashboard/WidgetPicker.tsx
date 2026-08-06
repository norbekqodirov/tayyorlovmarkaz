import { motion } from 'framer-motion';
import { X, Check, Plus } from 'lucide-react';
import { WIDGET_REGISTRY } from './registry';

export function WidgetPicker({ activeWidgets, onAdd, onClose }: {
  activeWidgets: string[];
  role: string;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const categories = Array.from(new Set(WIDGET_REGISTRY.map(w => w.category)));
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200/80 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Widget qo'shish</h2>
            <p className="text-[10px] text-zinc-400 mt-0.5">Dashboardga qo'shmoqchi bo'lgan widgetni tanlang</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {categories.map(cat => {
            const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat);
            return (
              <div key={cat}>
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">{cat}</p>
                <div className="space-y-1.5">
                  {catWidgets.map(w => {
                    const isActive = activeWidgets.includes(w.id);
                    return (
                      <button key={w.id} onClick={() => !isActive && onAdd(w.id)} disabled={isActive}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all border ${
                          isActive ? 'bg-zinc-50 dark:bg-white/5 opacity-60 cursor-not-allowed border-zinc-100 dark:border-white/[0.05]'
                          : 'bg-zinc-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 border-zinc-100 dark:border-white/[0.05] cursor-pointer'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{w.title}</p>
                          <p className="text-[9px] text-zinc-400 mt-0.5">{w.size === 'lg' ? 'Katta' : w.size === 'md' ? "O'rta" : 'Kichik'} widget</p>
                        </div>
                        {isActive
                          ? <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center"><Check size={10} strokeWidth={3} className="text-zinc-500" /></div>
                          : <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 flex items-center justify-center"><Plus size={10} strokeWidth={3} /></div>
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
