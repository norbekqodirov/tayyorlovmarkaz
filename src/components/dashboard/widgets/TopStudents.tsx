export function TopStudents({ students }: { students: any[] }) {
  const top = students.filter(s => s.status === 'Faol').slice(0, 7);
  return (
    <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] p-4 h-full shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-black text-slate-900 dark:text-white">Faol O'quvchilar</p>
        <p className="text-[9px] text-zinc-400 mt-0.5">Hozir o'qiyotganlar</p>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[260px] pr-0.5">
        {top.length === 0 ? (
          <p className="text-[10px] text-zinc-400 text-center py-4">O'quvchilar yo'q</p>
        ) : top.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2.5 py-2 border-b border-zinc-50 dark:border-white/[0.03] last:border-0">
            <span className="text-[10px] font-black text-zinc-300 w-4 text-center shrink-0">{i + 1}</span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
              {(s.name || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{s.name}</p>
              <p className="text-[9px] text-zinc-400 truncate">{s.course} {s.group ? `• ${s.group}` : ''}</p>
            </div>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
              s.paymentStatus === 'Tolov qilingan' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10'
            }`}>
              {s.paymentStatus === 'Tolov qilingan' ? '✓' : '!'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
