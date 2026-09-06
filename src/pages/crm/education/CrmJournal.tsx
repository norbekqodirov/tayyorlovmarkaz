import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFirestore } from '../../../hooks/useFirestore';
import { Button } from '../../../components/ui/Button';
import { BookOpen, Users, Calendar, MapPin } from 'lucide-react';

export default function CrmJournal() {
  const { data: groups = [], loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useFirestore<any>('groups');
  const { data: schedules = [], loading: schedulesLoading, error: schedulesError, refetch: refetchSchedules } = useFirestore<any>('schedule');
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');

  const teacherGroups = useMemo(() => {
    if (user.role === 'TEACHER') {
      return groups.filter((g: any) => g.teacherId === user.id);
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

      {!groupsLoading && !groupsError && teacherGroups.length > 0 && schedulesError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p>Dars jadvalini yuklab bo'lmadi. Guruhni ochishingiz mumkin.</p>
          <Button variant="secondary" isLoading={schedulesLoading} onClick={() => void refetchSchedules()}>
            Jadvalni qayta yuklash
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groupsLoading ? (
          <p role="status" className="col-span-full py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">Guruhlar yuklanmoqda...</p>
        ) : groupsError ? (
          <div role="alert" className="col-span-full py-20 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">Guruhlarni yuklab bo'lmadi. Qayta urinib ko'ring.</p>
            <Button onClick={() => void refetchGroups()}>Qayta urinish</Button>
          </div>
        ) : teacherGroups.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
            <BookOpen size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
            <h3 className="text-lg font-black text-slate-700 dark:text-zinc-300">{user.role === 'TEACHER' ? "Sizga biriktirilgan guruhlar yo'q" : "Guruhlar yo'q"}</h3>
            <p className="text-sm font-bold text-zinc-400 mt-1">{user.role === 'TEACHER' ? "Guruh biriktirilgandan so'ng bu yerda paydo bo'ladi." : "Guruh yaratilgandan so'ng bu yerda paydo bo'ladi."}</p>
          </div>
        ) : (
          teacherGroups.map((group: any) => {
            const sched = schedules.find((s: any) => s.groupId === group.id);
            const studentCount = group._count?.enrollments ?? 0;
            const maxSize = group.maxSize || 15;
            return (
              <Link
                key={group.id}
                to={`/crmtayyorlovmarkaz/groups/${group.id}`}
                aria-label={`${group.name} guruhini ochish`}
                className="min-w-0 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 group"
              >
                <div className="flex justify-between items-start gap-3 mb-4">
                  <div className="min-w-0 break-words">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors">{group.name}</h3>
                    <p className="text-[10px] font-black text-blue-500 tracking-widest uppercase mt-0.5">{group.course?.name || 'Kurssiz'}</p>
                  </div>
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <BookOpen size={20} />
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                    <MapPin size={16} className="shrink-0 text-zinc-400" />
                    <span className="min-w-0 break-words">{schedulesLoading ? 'Xona yuklanmoqda...' : schedulesError ? "Xona ma'lumoti yuklanmadi" : sched?.room || "Xona belgilanmagan"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                    <Calendar size={16} className="shrink-0 text-zinc-400" />
                    <span className="min-w-0 break-words">{schedulesLoading ? 'Jadval yuklanmoqda...' : schedulesError ? 'Jadval yuklanmadi' : sched ? `${sched.startTime} - ${sched.endTime}` : 'Jadval belgilanmagan'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
                    <Users size={16} className="text-zinc-400" />
                    {studentCount} o'quvchi
                  </div>
                </div>

                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, (studentCount / maxSize) * 100)}%` }}
                  />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
