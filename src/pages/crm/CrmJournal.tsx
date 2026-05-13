import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirestore } from '../../hooks/useFirestore';
import { BookOpen, Users, Calendar, MapPin } from 'lucide-react';

export default function CrmJournal() {
  const navigate = useNavigate();
  const { data: groups = [] } = useFirestore<any>('groups');
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');

  const teacherGroups = useMemo(() => {
    if (user.role === 'TEACHER') {
      return groups.filter((g: any) => g.teacherId === user.uid || g.teacher === user.name);
    }
    return groups;
  }, [groups, user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Elektron Jurnal</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Jurnalni to'ldirish uchun guruhingizni tanlang</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teacherGroups.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
            <BookOpen size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
            <h3 className="text-lg font-black text-slate-700 dark:text-zinc-300">Sizga biriktirilgan guruhlar yo'q</h3>
            <p className="text-sm font-bold text-zinc-400 mt-1">Guruh biriktirilgandan so'ng bu yerda paydo bo'ladi.</p>
          </div>
        ) : (
          teacherGroups.map((group: any) => (
            <div
              key={group.id}
              onClick={() => navigate(`/crmtayyorlovmarkaz/groups/${group.id}`)}
              className="bg-white dark:bg-zinc-900 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors">{group.name}</h3>
                  <p className="text-[10px] font-black text-blue-500 tracking-widest uppercase mt-0.5">{group.subject}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <BookOpen size={20} />
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                  <MapPin size={16} className="text-zinc-400" />
                  {typeof group.room === 'object' ? group.room.name : group.room}
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                  <Calendar size={16} className="text-zinc-400" />
                  {group.time} ({(Array.isArray(group.days) ? group.days : []).join(', ')})
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                  <Users size={16} className="text-zinc-400" />
                  {(group.students || []).length} o'quvchi
                </div>
              </div>

              <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, ((group.students || []).length / (group.maxStudents || 15)) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
