import { useState } from 'react';
import { ListChecks, Plus, Check, X } from 'lucide-react';

export function TasksWidget() {
  const [tasks, setTasks] = useState<{ id: string; text: string; done: boolean }[]>(() => {
    try { return JSON.parse(localStorage.getItem('crm_tasks') || '[]'); } catch { return []; }
  });
  const [newTask, setNewTask] = useState('');

  const saveTasks = (t: typeof tasks) => {
    setTasks(t);
    try { localStorage.setItem('crm_tasks', JSON.stringify(t)); } catch {}
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    saveTasks([...tasks, { id: Date.now().toString(), text: newTask.trim(), done: false }]);
    setNewTask('');
  };

  const toggle = (id: string) => saveTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id: string) => saveTasks(tasks.filter(t => t.id !== id));

  const pending = tasks.filter(t => !t.done).length;

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Vazifalar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">{pending} ta bajarilmagan</p>
        </div>
        <ListChecks size={14} className="text-zinc-400" />
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Yangi vazifa..."
          className="flex-1 text-[11px] px-3 py-2 bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] rounded-lg outline-none focus:ring-1 focus:ring-blue-500 dark:text-white"
        />
        <button onClick={addTask} className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors shrink-0">
          <Plus size={14} strokeWidth={3} />
        </button>
      </div>
      <div className="space-y-1.5 overflow-y-auto max-h-[220px] pr-0.5">
        {tasks.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">Vazifalar yo'q</p>
        ) : tasks.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 p-2 rounded-lg transition-all ${t.done ? 'opacity-50' : ''}`}>
            <button onClick={() => toggle(t.id)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600 hover:border-blue-500'}`}>
              {t.done && <Check size={10} strokeWidth={3} className="text-white" />}
            </button>
            <span className={`text-[11px] font-medium flex-1 ${t.done ? 'line-through text-zinc-400' : 'text-slate-800 dark:text-zinc-200'}`}>{t.text}</span>
            <button onClick={() => remove(t.id)} className="text-zinc-300 hover:text-rose-500 transition-colors">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
