import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, Search, Calendar as CalendarIcon, Users, ChevronRight,
  Save, AlertCircle, Clock, Download, TrendingUp, AlertTriangle,
  FileSpreadsheet, FileText, BarChart2
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import { exportToExcel, exportToPDF } from '../../utils/export';
import { format, subDays, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';

interface Student { id: string; name: string; phone: string; }
interface AttendanceRecord { studentId: string; status: 'present' | 'absent' | 'late'; note?: string; }
interface GroupAttendance { id: string; groupId: string; groupName: string; date: string; records: AttendanceRecord[]; }

const STATUS_CONFIG = {
  present: { label: 'Keldi', bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-100 dark:bg-emerald-900/30' },
  absent: { label: 'Kelmadi', bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-100 dark:bg-rose-900/30' },
  late: { label: 'Kechikdi', bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-100 dark:bg-amber-900/30' },
};

export default function CrmAttendance() {
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [] } = useFirestore<Student>('students');
  const { data: allAttendance = [], addDocument, updateDocument } = useFirestore<GroupAttendance>('attendance');
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'journal' | 'stats' | 'calendar'>('journal');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) setSelectedGroup(groups[0].id);
  }, [groups, selectedGroup]);

  const groupStudents = useMemo(() => {
    const group = groups.find((g: any) => g.id === selectedGroup);
    if (!group || !group.students) return [];
    return students.filter(s => group.students.includes(s.id));
  }, [selectedGroup, groups, students]);

  useEffect(() => {
    if (!selectedGroup || !selectedDate) return;
    const existing = allAttendance.find(a => a.groupId === selectedGroup && a.date === selectedDate);
    if (existing) {
      setAttendance(existing.records || []);
      setIsSaved(true);
    } else {
      setAttendance(groupStudents.map(s => ({ studentId: s.id, status: 'present' as const, note: '' })));
      setIsSaved(false);
    }
  }, [selectedGroup, selectedDate, groupStudents, allAttendance]);

  const handleStatusChange = useCallback((studentId: string, status: 'present' | 'absent' | 'late') => {
    setAttendance(prev => prev.map(r => r.studentId === studentId ? { ...r, status } : r));
    setIsSaved(false);
  }, []);

  const handleNoteChange = useCallback((studentId: string, note: string) => {
    setAttendance(prev => prev.map(r => r.studentId === studentId ? { ...r, note } : r));
    setIsSaved(false);
  }, []);

  const saveAttendance = async () => {
    setIsSaving(true);
    try {
      const existing = allAttendance.find(a => a.groupId === selectedGroup && a.date === selectedDate);
      const payload = {
        groupId: selectedGroup,
        groupName: groups.find((g: any) => g.id === selectedGroup)?.name || '',
        date: selectedDate,
        records: attendance,
      };
      if (existing) {
        await updateDocument(existing.id, payload);
      } else {
        await addDocument(payload);
      }
      setIsSaved(true);
      showToast('Davomat saqlandi ✓', 'success');
    } catch {
      showToast('Saqlashda xatolik!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Per-student stats ───────────────────────────────
  const studentStats = useMemo(() => {
    return groupStudents.map(student => {
      const records = allAttendance
        .filter(a => a.groupId === selectedGroup)
        .flatMap(a => a.records.filter(r => r.studentId === student.id));
      const total = records.length;
      const present = records.filter(r => r.status === 'present').length;
      const absent = records.filter(r => r.status === 'absent').length;
      const late = records.filter(r => r.status === 'late').length;
      const percent = total > 0 ? Math.round((present / total) * 100) : 100;

      // Consecutive absences check (last N sessions)
      const sortedDates = [...allAttendance]
        .filter(a => a.groupId === selectedGroup)
        .sort((a, b) => b.date.localeCompare(a.date));
      let consecutive = 0;
      for (const att of sortedDates) {
        const rec = att.records.find(r => r.studentId === student.id);
        if (rec?.status === 'absent') consecutive++;
        else break;
      }

      return { ...student, total, present, absent, late, percent, consecutiveAbsences: consecutive };
    });
  }, [allAttendance, groupStudents, selectedGroup]);

  // ─── Calendar view (last 30 days) ─────────────────
  const calendarData = useMemo(() => {
    const end = new Date();
    const start = subDays(end, 29);
    const days = eachDayOfInterval({ start, end });
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const attOnDay = allAttendance.find(a => a.groupId === selectedGroup && a.date === dateStr);
      const counts = { present: 0, absent: 0, late: 0, total: groupStudents.length };
      attOnDay?.records.forEach(r => {
        if (r.status === 'present') counts.present++;
        else if (r.status === 'absent') counts.absent++;
        else if (r.status === 'late') counts.late++;
      });
      return { date: day, dateStr, ...counts, hasData: !!attOnDay };
    });
  }, [allAttendance, selectedGroup, groupStudents]);

  // ─── Summary stats for current view ────────────────
  const summary = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter(r => r.status === 'present').length;
    const absent = attendance.filter(r => r.status === 'absent').length;
    const late = attendance.filter(r => r.status === 'late').length;
    return { total, present, absent, late, percent: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [attendance]);

  // ─── Export handlers ──────────────────────────────
  const handleExportExcel = () => {
    const groupName = groups.find((g: any) => g.id === selectedGroup)?.name || 'Guruh';
    const rows = groupStudents.map(s => {
      const rec = attendance.find(r => r.studentId === s.id);
      return { name: s.name, phone: s.phone, status: rec?.status === 'present' ? 'Keldi' : rec?.status === 'absent' ? 'Kelmadi' : 'Kechikdi', note: rec?.note || '' };
    });
    exportToExcel(rows, [
      { header: 'F.I.O', key: 'name', width: 25 },
      { header: 'Telefon', key: 'phone', width: 16 },
      { header: 'Holat', key: 'status', width: 12 },
      { header: 'Izoh', key: 'note', width: 30 },
    ], `Davomat_${groupName}_${selectedDate}`);
    showToast('Excel fayl yuklandi ✓', 'success');
  };

  const handleExportPDF = () => {
    const groupName = groups.find((g: any) => g.id === selectedGroup)?.name || 'Guruh';
    const rows = groupStudents.map(s => {
      const rec = attendance.find(r => r.studentId === s.id);
      return { name: s.name, phone: s.phone, status: rec?.status === 'present' ? 'Keldi' : rec?.status === 'absent' ? 'Kelmadi' : 'Kechikdi', note: rec?.note || '' };
    });
    exportToPDF(rows, [
      { header: 'F.I.O', key: 'name' },
      { header: 'Telefon', key: 'phone' },
      { header: 'Holat', key: 'status' },
      { header: 'Izoh', key: 'note' },
    ], `Davomat — ${groupName} — ${selectedDate}`, `Davomat_${groupName}_${selectedDate}`);
    showToast('PDF fayl yuklandi ✓', 'success');
  };

  const dangerStudents = studentStats.filter(s => s.consecutiveAbsences >= 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Davomat Jurnali</h1>
          <p className="text-xs text-zinc-400 mt-0.5">O'quvchilarning darslardagi ishtirokini nazorat qilish</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Danger alert */}
          {dangerStudents.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl text-rose-600 text-xs font-black">
              <AlertTriangle size={14} />
              {dangerStudents.length} ta o'quvchi 3+ dars qoldirdi!
            </div>
          )}
          {/* Date */}
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 shadow-sm">
            <CalendarIcon size={15} className="text-zinc-400" />
            <input
              type="date" value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none dark:text-white"
            />
          </div>
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">
              <Download size={16} />Eksport
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[160px]">
              <button onClick={handleExportExcel} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-t-xl transition-colors">
                <FileSpreadsheet size={15} className="text-emerald-600" /> Excel (.xlsx)
              </button>
              <button onClick={handleExportPDF} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-b-xl transition-colors">
                <FileText size={15} className="text-rose-500" /> PDF (.pdf)
              </button>
            </div>
          </div>
          {/* Save */}
          <button
            onClick={saveAttendance}
            disabled={isSaved || isSaving}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              isSaved ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20'
            }`}
          >
            <Save size={16} />
            {isSaving ? 'Saqlanmoqda...' : isSaved ? 'Saqlandi ✓' : 'Saqlash'}
          </button>
        </div>
      </div>

      {/* Danger Banner */}
      {dangerStudents.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-rose-600" />
            <h3 className="text-sm font-black text-rose-700 dark:text-rose-400">Xavf Ostidagi O'quvchilar (3+ ketma-ket dars qoldirildi)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {dangerStudents.map(s => (
              <span key={s.id} className="px-3 py-1.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-black">
                ⚠️ {s.name} — {s.consecutiveAbsences} dars
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-2xl w-fit">
        {([['journal', 'Jurnal'], ['stats', 'Statistika'], ['calendar', 'Kalendar']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${
              activeTab === key ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Group list */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Guruh</h3>
            <div className="space-y-1.5">
              {(groups || []).map((group: any) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedGroup === group.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="truncate mr-2">{group.name}</span>
                  <span className="text-[10px] font-black opacity-70">{(group.students || []).length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Bugungi Holat</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Keldi</span>
                </div>
                <span className="text-sm font-black text-emerald-600">{summary.present}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Kelmadi</span>
                </div>
                <span className="text-sm font-black text-rose-600">{summary.absent}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Kechikdi</span>
                </div>
                <span className="text-sm font-black text-amber-600">{summary.late}</span>
              </div>
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-zinc-500">Davomat %</span>
                  <span className="text-sm font-black text-blue-600">{summary.percent}%</span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${summary.percent}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="md:col-span-3">
          {activeTab === 'journal' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-sm">
                  {groups.find((g: any) => g.id === selectedGroup)?.name || 'Guruh'} — {selectedDate}
                </h3>
                {!isSaved && (
                  <span className="flex items-center gap-1.5 text-amber-600 text-xs font-bold">
                    <AlertCircle size={13} />Saqlanmagan o'zgarishlar
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="px-5 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</th>
                      <th className="px-4 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Keldi</th>
                      <th className="px-4 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Kechikdi</th>
                      <th className="px-4 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Kelmadi</th>
                      <th className="px-5 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Izoh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {groupStudents.map(student => {
                      const record = attendance.find(r => r.studentId === student.id);
                      const stats = studentStats.find(s => s.id === student.id);
                      return (
                        <tr key={student.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                stats && stats.consecutiveAbsences >= 3 ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                              }`}>
                                {stats && stats.consecutiveAbsences >= 3 ? '⚠️' : (student.name || '?').charAt(0)}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                                <p className="text-[10px] text-zinc-400 font-medium">{student.phone}</p>
                              </div>
                            </div>
                          </td>
                          {(['present', 'late', 'absent'] as const).map(status => (
                            <td key={status} className="px-4 py-3.5 text-center">
                              <button
                                onClick={() => handleStatusChange(student.id, status)}
                                className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all ${
                                  record?.status === status
                                    ? status === 'present' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' :
                                      status === 'late' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' :
                                      'bg-rose-100 dark:bg-rose-900/30 text-rose-600'
                                    : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-500'
                                }`}
                              >
                                {status === 'present' ? <Check size={18} strokeWidth={3} /> :
                                 status === 'late' ? <Clock size={18} strokeWidth={3} /> :
                                 <X size={18} strokeWidth={3} />}
                              </button>
                            </td>
                          ))}
                          <td className="px-5 py-3.5">
                            <input
                              type="text"
                              value={record?.note || ''}
                              onChange={(e) => handleNoteChange(student.id, e.target.value)}
                              placeholder="Izoh..."
                              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {groupStudents.length === 0 && (
                      <tr><td colSpan={5} className="py-16 text-center">
                        <Users size={36} className="mx-auto text-zinc-200 mb-3" />
                        <p className="text-sm font-bold text-zinc-400">Guruhda o'quvchilar yo'q</p>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">O'quvchi bo'yicha umumiy davomat statistikasi</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">Barcha sana bo'yicha yig'ilgan ma'lumot</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                        {['O\'quvchi', 'Jami Dars', 'Keldi', 'Kelmadi', 'Kechikdi', 'Davomat %', 'Holat'].map(h => (
                          <th key={h} className="px-4 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {studentStats.map(s => (
                        <tr key={s.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${s.consecutiveAbsences >= 3 ? 'bg-rose-50/50 dark:bg-rose-900/5' : ''}`}>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {s.consecutiveAbsences >= 3 && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                              <span className="font-bold text-sm text-slate-900 dark:text-white">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5"><span className="font-black text-slate-700 dark:text-zinc-300 text-sm">{s.total}</span></td>
                          <td className="px-4 py-3.5"><span className="font-black text-emerald-600 text-sm">{s.present}</span></td>
                          <td className="px-4 py-3.5"><span className="font-black text-rose-600 text-sm">{s.absent}</span></td>
                          <td className="px-4 py-3.5"><span className="font-black text-amber-600 text-sm">{s.late}</span></td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden min-w-[60px]">
                                <div
                                  className={`h-full rounded-full ${s.percent >= 80 ? 'bg-emerald-500' : s.percent >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${s.percent}%` }}
                                />
                              </div>
                              <span className={`text-xs font-black ${s.percent >= 80 ? 'text-emerald-600' : s.percent >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {s.percent}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {s.consecutiveAbsences >= 3 ? (
                              <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg text-[10px] font-black uppercase">⚠️ Xavf</span>
                            ) : s.percent >= 80 ? (
                              <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg text-[10px] font-black uppercase">A'lo</span>
                            ) : (
                              <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg text-[10px] font-black uppercase">Kuzat</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5">
              <h3 className="font-black text-slate-900 dark:text-white text-sm mb-4">So'nggi 30 kun — Davomat Kalendari</h3>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {[
                  { color: 'bg-emerald-500', label: 'Keldi' },
                  { color: 'bg-rose-500', label: 'Kelmadi' },
                  { color: 'bg-amber-500', label: 'Kechikdi' },
                  { color: 'bg-zinc-200 dark:bg-zinc-700', label: 'Ma\'lumot yo\'q' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                    <div className={`w-3 h-3 rounded-sm ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-10 gap-1.5">
                {calendarData.map(({ date, dateStr, hasData, present, absent, late, total }) => {
                  const dominantStatus = !hasData ? 'none'
                    : present > absent && present > late ? 'present'
                    : absent > present && absent > late ? 'absent'
                    : 'late';
                  const cellColor =
                    dominantStatus === 'present' ? 'bg-emerald-400 hover:bg-emerald-500' :
                    dominantStatus === 'absent' ? 'bg-rose-400 hover:bg-rose-500' :
                    dominantStatus === 'late' ? 'bg-amber-400 hover:bg-amber-500' :
                    'bg-zinc-100 dark:bg-zinc-800';
                  return (
                    <div
                      key={dateStr}
                      className={`relative ${cellColor} rounded-lg aspect-square flex flex-col items-center justify-center cursor-default group transition-colors`}
                      title={`${dateStr}: Keldi=${present}, Kelmadi=${absent}, Kechikdi=${late}`}
                    >
                      <span className={`text-[9px] font-black ${hasData ? 'text-white' : 'text-zinc-400'}`}>
                        {format(date, 'd')}
                      </span>
                      {hasData && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none whitespace-nowrap bg-slate-900 text-white text-[9px] font-bold px-2 py-1 rounded-lg shadow-lg">
                          ✅{present} ❌{absent} ⏰{late}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
