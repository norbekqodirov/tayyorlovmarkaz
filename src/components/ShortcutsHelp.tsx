import { AnimatePresence, motion } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  {
    category: 'Navigatsiya',
    items: [
      { keys: ['Ctrl', 'K'], desc: 'Global qidirish' },
      { keys: ['G', 'D'],    desc: 'Dashboard' },
      { keys: ['G', 'S'],    desc: "O'quvchilar" },
      { keys: ['G', 'F'],    desc: 'Moliya' },
      { keys: ['G', 'L'],    desc: 'Lidlar' },
    ],
  },
  {
    category: 'Amallar',
    items: [
      { keys: ['N'],         desc: 'Yangi yozuv yaratish' },
      { keys: ['E'],         desc: 'Tanlanganni tahrirlash' },
      { keys: ['Del'],       desc: "Tanlanganni o'chirish" },
      { keys: ['Ctrl', 'S'], desc: 'Saqlash' },
      { keys: ['Esc'],       desc: "Modalni yopish / Bekor qilish" },
    ],
  },
  {
    category: 'Boshqa',
    items: [
      { keys: ['?'],          desc: "Klaviatura yorliqlarini ko'rsatish" },
      { keys: ['Ctrl', '/'],  desc: "Yordam" },
      { keys: ['Alt', 'T'],   desc: "Mavzu almashtirish (qorong'u/kunduz)" },
    ],
  },
];

export default function ShortcutsHelp({ isOpen, onClose }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Keyboard size={18} className="text-blue-600" />
                  <h2 className="font-black text-slate-900 dark:text-white">Klaviatura Yorliqlari</h2>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
                {SHORTCUTS.map(section => (
                  <div key={section.category}>
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">
                      {section.category}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                          <span className="text-sm text-slate-900 dark:text-white">{item.desc}</span>
                          <div className="flex items-center gap-1">
                            {item.keys.map((key, ki) => (
                              <span key={ki} className="flex items-center gap-1">
                                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-[11px] font-bold text-zinc-700 dark:text-zinc-300 font-mono shadow-sm">
                                  {key}
                                </kbd>
                                {ki < item.keys.length - 1 && (
                                  <span className="text-[9px] text-zinc-400 font-bold">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 text-center">
                <p className="text-xs text-zinc-400">Yorliqni bosish uchun <kbd className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] font-mono border border-zinc-300 dark:border-zinc-600">?</kbd> ni bosing</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
