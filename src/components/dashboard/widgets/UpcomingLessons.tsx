import { Calendar, Clock, BookOpen } from 'lucide-react';

export function UpcomingLessons({ groups, schedules }: { groups: any[]; schedules: any[] }) {
  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon, 7=Sun
  const dayMap: Record<number, string> = { 1: 'Dush', 2: 'Sesh', 3: 'Chor', 4: 'Pay', 5: 'Jum', 6: 'Shan', 7: 'Yak' };
  const todayDay = dayMap[dayOfWeek];

  // Try from schedule data first, then fallback to groups
  const todaySchedule = schedules.filter(s => {
    const dow = s.dayOfWeek;
    return dow === dayOfWeek;
  }).slice(0, 6);

  const todayGroups = groups.filter(g =>
    (g.days || []).includes(todayDay) && (g.status === 'Faol' || g.status === 'active')
  ).slice(0, 5);

  const items = todaySchedule.length > 0
    ? todaySchedule.map(s => ({
        id: s.id,
        name: groups.find(g => g.id === s.groupId)?.name || s.groupId || 'Guruh',
        teacher: groups.find(g => g.id === s.groupId)?.teacher || '',
        time: `${s.startTime} - ${s.endTime}`,
        room: s.room || '',
      }))
    : todayGroups.map(g => ({
        id: g.id,
        name: g.name,
        teacher: g.teacher,
        time: g.time,
        room: g.room,
      }));

  const now = today.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black text-slate-900 dark:text-white">Bugungi Darslar</p>
          <p className="text-[9px] text-zinc-400 mt-0.5">{today.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-zinc-50 dark:bg-white/[0.03] rounded-lg border border-zinc-100 dark:border-white/[0.04]">
          <Clock size={10} className="text-zinc-400" />
          <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{now}</span>
        </div>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <Calendar size={24} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-[11px] font-bold text-zinc-400">Bugun dars yo'q</p>
            <p className="text-[10px] text-zinc-300 mt-0.5">{todayDay} kuni bo'sh</p>
          </div>
        ) : items.map((g, i) => (
          <div key={g.id || i} className="flex items-center gap-2.5 p-2.5 bg-zinc-50 dark:bg-white/[0.03] rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <BookOpen size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{g.name}</p>
              <p className="text-[9px] text-zinc-400 truncate">{g.teacher}{g.room ? ` • ${g.room}` : ''}</p>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 shrink-0 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-100 dark:border-zinc-700">{g.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
