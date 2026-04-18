import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, Clock, ChevronLeft, ChevronRight, Save,
  Users, Search, Download, Printer, MessageSquare, ClipboardCheck,
  BookOpen, HomeIcon, TrendingUp, Star
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';

interface LessonTopic {
  id: string;
  groupId: string;
  date: string;
  topic: string;
  homework: string;
}

interface Student { id: string; name: string; group: string; }
interface AttendanceRecord { studentId: string; status: 'present' | 'absent' | 'late'; note?: string; }
interface GroupAttendance { id: string; groupId: string; groupName?: string; date: string; records: AttendanceRecord[]; }
interface Assessment { id: string; studentId: string; groupId: string; score: number; comment: string; date: string; }

const DAY_JS_MAP: Record<string, number> = {
  'Dush': 1, 'Sesh': 2, 'Chor': 3, 'Pay': 4, 'Jum': 5, 'Shan': 6, 'Yak': 0
};

const DAY_LABELS: Record<number, string> = { 0: 'Yak', 1: 'Du', 2: 'Se', 3: 'Ch', 4: 'Pa', 5: 'Ju', 6: 'Sh' };

const GRADE_STYLES: Record<number, string> = {
  5: 'bg-emerald-500 text-white',
  4: 'bg-blue-500 text-white',
  3: 'bg-amber-500 text-white',
  2: 'bg-rose-500 text-white',
};

export default function CrmJournal() {
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [] } = useFirestore<Student>('students');
  const { data: attendanceDocs = [], addDocument: addAttendance, updateDocument: updateAttendance } = useFirestore<GroupAttendance>('attendance');
  const { data: assessmentDocs = [], addDocument: addAssessment, updateDocument: updateAssessment, deleteDocument: deleteAssessment } = useFirestore<Assessment>('assessments');
  const { data: lessonTopicDocs = [], addDocument: addLessonTopic, updateDocument: updateLessonTopic } = useFirestore<LessonTopic>('lessonTopics');
  const { showToast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedGroup, setSelectedGroup] = useState('');
  const [attendanceData, setAttendanceData] = useState<GroupAttendance[]>([]);
  const [assessmentData, setAssessmentData] = useState<Assessment[]>([]);
  const [activeCell, setActiveCell] = useState<{ studentId: string; date: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [noteModal, setNoteModal] = useState<{ studentId: string; date: string; text: string } | null>(null);
  const [topicModal, setTopicModal] = useState<{ date: string; topic: string; homework: string; existingId?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'grid' | 'stats'>('grid');

  useEffect(() => { setAttendanceData(attendanceDocs); }, [attendanceDocs]);
  useEffect(() => { setAssessmentData(assessmentDocs); }, [assessmentDocs]);

  const getLessonTopic = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return lessonTopicDocs.find(t => t.groupId === groupKey && t.date === dateStr);
  }, [lessonTopicDocs]);

  const saveLessonTopic = async () => {
    if (!topicModal) return;
    const { date, topic, homework, existingId } = topicModal;
    const payload = { groupId: groupKey, date, topic, homework };
    try {
      if (existingId) { await updateLessonTopic(existingId, payload as any); }
      else { await addLessonTopic(payload as any); }
      showToast('Dars mavzusi saqlandi ✓', 'success');
      setTopicModal(null);
    } catch { showToast('Xatolik!', 'error'); }
  };

  // ── Filtered days based on group schedule ──
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const group = groups.find((g: any) => g.id === selectedGroup || g.name === selectedGroup);
    return eachDayOfInterval({ start, end }).filter(date => {
      const day = date.getDay();
      if (!group?.days?.length) return day !== 0;
      return group.days.map((d: string) => DAY_JS_MAP[d]).includes(day);
    });
  }, [currentDate, selectedGroup, groups]);

  // ── Filtered students ──
  const filteredStudents = useMemo(() => {
    let list = students;
    if (selectedGroup) {
      const g = groups.find((g: any) => g.id === selectedGroup);
      list = list.filter(s => s.group === selectedGroup || s.group === g?.name || g?.name === s.group);
    }
    if (searchQuery) list = list.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [selectedGroup, groups, students, searchQuery]);

  // ── Data getters ──
  const groupKey = useMemo(() => {
    const g = groups.find((g: any) => g.id === selectedGroup || g.name === selectedGroup);
    return g?.id || g?.name || selectedGroup;
  }, [groups, selectedGroup]);

  const getAttendanceStatus = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return attendanceData.find(a => a.groupId === groupKey && a.date === dateStr)
      ?.records.find(r => r.studentId === studentId)?.status ?? null;
  };

  const getGrade = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assessmentData.find(a => a.studentId === studentId && a.date === dateStr && a.groupId === groupKey)?.score || 0;
  };

  const getNote = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const attNote = attendanceData.find(a => a.groupId === groupKey && a.date === dateStr)
      ?.records.find(r => r.studentId === studentId)?.note;
    const assNote = assessmentData.find(a => a.studentId === studentId && a.date === dateStr && a.groupId === groupKey)?.comment;
    return attNote || assNote || '';
  };

  // ── Data setters ──
  const setAttendanceStatus = (studentId: string, date: Date, status: 'present' | 'absent' | 'late' | null) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setAttendanceData(prev => {
      const newData = [...prev];
      let rec = newData.find(a => a.groupId === groupKey && a.date === dateStr);
      if (!rec) {
        if (!status) return newData;
        rec = { id: `temp_${Math.random().toString(36).substr(2, 9)}`, groupId: groupKey, date: dateStr, records: [] };
        newData.push(rec);
      }
      const idx = rec.records.findIndex(r => r.studentId === studentId);
      if (idx >= 0) {
        if (!status) rec.records.splice(idx, 1);
        else rec.records[idx].status = status;
      } else if (status) {
        rec.records.push({ studentId, status });
      }
      return newData;
    });
  };

  const handleGradeChange = (studentId: string, date: Date, score: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setAssessmentData(prev => {
      const newData = [...prev];
      const idx = newData.findIndex(a => a.studentId === studentId && a.date === dateStr && a.groupId === groupKey);
      if (idx >= 0) {
        if (score === 0) newData.splice(idx, 1);
        else newData[idx] = { ...newData[idx], score };
      } else if (score > 0) {
        newData.push({ id: `temp_${Math.random().toString(36).substr(2, 9)}`, studentId, groupId: groupKey, score, comment: '', date: dateStr });
      }
      return newData;
    });
  };

  const handleCellClick = (studentId: string, day: Date) => {
    const key = `${studentId}_${day.toISOString()}`;
    if (activeCell?.studentId === studentId && activeCell.date === day.toISOString()) {
      setActiveCell(null);
    } else {
      setActiveCell({ studentId, date: day.toISOString() });
    }
  };

  const saveAll = async () => {
    setIsSaving(true);
    try {
      for (const record of attendanceData) {
        if (record.id.startsWith('temp_')) {
          const { id, ...rest } = record;
          await addAttendance(rest as any);
        } else {
          const orig = attendanceDocs.find(d => d.id === record.id);
          if (orig && JSON.stringify(orig) !== JSON.stringify(record)) await updateAttendance(record.id, record as any);
        }
      }
      for (const record of assessmentData) {
        if (record.id.startsWith('temp_')) {
          const { id, ...rest } = record;
          await addAssessment(rest as any);
        } else {
          const orig = assessmentDocs.find(d => d.id === record.id);
          if (orig && JSON.stringify(orig) !== JSON.stringify(record)) await updateAssessment(record.id, record as any);
        }
      }
      for (const orig of assessmentDocs) {
        if (!assessmentData.find(d => d.id === orig.id)) await deleteAssessment(orig.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const activeGroupData = groups.find((g: any) => g.id === selectedGroup || g.name === selectedGroup);

  // ── Per-student stats ──
  const getStudentStats = (studentId: string) => {
    const statuses = daysInMonth.map(d => getAttendanceStatus(studentId, d));
    const recorded = statuses.filter(s => s !== null);
    const present = statuses.filter(s => s === 'present' || s === 'late').length;
    const pct = recorded.length > 0 ? Math.round((present / recorded.length) * 100) : null;
    const grades = daysInMonth.map(d => getGrade(studentId, d)).filter(g => g > 0);
    const avg = grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null;
    return { pct, avg, present, absent: recorded.length - present };
  };

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: uz });

  // ── Per-student grade ranking ──
  const studentRankings = useMemo(() => {
    return filteredStudents.map(student => {
      const grades = daysInMonth.map(d => getGrade(student.id, d)).filter(g => g > 0);
      const avg = grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length) : 0;
      const max = grades.length > 0 ? Math.max(...grades) : 0;
      const min = grades.length > 0 ? Math.min(...grades) : 0;
      const stats = getStudentStats(student.id);
      return { ...student, grades, avg, max, min, ...stats };
    }).sort((a, b) => {
      const scoreA = (Number(a.avg) * 0.6) + ((Number(a.pct) || 0) * 0.004);
      const scoreB = (Number(b.avg) * 0.6) + ((Number(b.pct) || 0) * 0.004);
      return scoreB - scoreA;
    });
  }, [filteredStudents, daysInMonth, assessmentData, attendanceData]);

  return (
    <div className="flex flex-col h-full space-y-4 print:space-y-0">

      {/* ── Toolbar ── */}
      <div className="print:hidden">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600">
              <ClipboardCheck size={16} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight">Elektron Jurnal</h1>
              <p className="text-[10px] text-zinc-400 font-medium capitalize">{monthLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="w-8 h-8 rounded-lg bg-white dark:bg-[#111118] border border-zinc-200/80 dark:border-white/[0.05] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all"
            >
              <Printer size={14} strokeWidth={2} />
            </button>
            <button
              onClick={saveAll}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-black rounded-lg transition-all shadow-sm shadow-blue-500/20"
            >
              <Save size={13} strokeWidth={2.5} />
              {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl w-fit mb-3">
          {([['grid', 'Jurnal Jadvali'], ['stats', 'O\'quvchi Reytingi']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${
                activeTab === key ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-[#111118] rounded-xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm">
          {/* Group selector */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Guruh</label>
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-white/5 text-xs font-semibold text-slate-900 dark:text-white rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            >
              <option value="">Guruhni tanlang...</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Month navigator */}
          <div>
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Oy</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <span className="px-3 py-1.5 bg-zinc-100 dark:bg-white/5 rounded-lg text-xs font-bold text-slate-900 dark:text-white min-w-[110px] text-center capitalize">
                {monthLabel}
              </span>
              <button
                onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Qidirish</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="O'quvchi ismi..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-zinc-100 dark:bg-white/5 text-xs font-medium text-slate-900 dark:text-white rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Schedule preview */}
          {activeGroupData?.days?.length > 0 && (
            <div>
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Jadval</label>
              <div className="flex gap-1">
                {activeGroupData.days.map((d: string) => (
                  <span key={d} className="px-2 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded-md">{d}</span>
                ))}
              </div>
            </div>
          )}

          {/* Stats pills */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
              <Users size={12} className="text-zinc-400" />
              <span className="text-xs font-black text-slate-900 dark:text-white">{filteredStudents.length}</span>
              <span className="text-[10px] text-zinc-400">o'quvchi</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-white/5 rounded-lg">
              <span className="text-xs font-black text-slate-900 dark:text-white">{daysInMonth.length}</span>
              <span className="text-[10px] text-zinc-400">dars</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Table or Stats ── */}
      {!selectedGroup ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-[#111118] rounded-xl border border-zinc-200/80 dark:border-white/[0.05] py-24">
          <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-4">
            <ClipboardCheck size={28} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mb-1">Guruhni tanlang</p>
          <p className="text-xs text-zinc-400">Jurnal ko'rish uchun yuqoridan guruh tanlang</p>
        </div>
      ) : activeTab === 'stats' ? (
        /* ── Student Rankings / Stats Panel ── */
        <div className="bg-white dark:bg-[#111118] rounded-xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-white/5">
            <h3 className="font-black text-slate-900 dark:text-white text-sm">O'quvchi Reytingi — {monthLabel}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Davomat (40%) + O'rtacha baho (60%) asosida tartiblab chiqarilgan</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 dark:bg-white/[0.02]">
                  {['#', 'O\'quvchi', 'Jami dars', 'Davomat %', 'O\'rt. Baho', 'Eng yuqori', 'Eng past', 'Holat'].map(h => (
                    <th key={h} className="px-4 py-3.5 text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                {studentRankings.map((s, rank) => (
                  <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                        rank === 0 ? 'bg-amber-100 text-amber-600' :
                        rank === 1 ? 'bg-zinc-100 text-zinc-600' :
                        rank === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-zinc-50 dark:bg-white/5 text-zinc-400'
                      }`}>
                        {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : rank + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-900/10 flex items-center justify-center text-[10px] font-black text-blue-600">
                          {s.name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">{daysInMonth.length}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden min-w-[50px]">
                          <div className={`h-full rounded-full ${
                            (s.pct ?? 0) >= 80 ? 'bg-emerald-500' : (s.pct ?? 0) >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                          }`} style={{ width: `${s.pct ?? 0}%` }} />
                        </div>
                        <span className={`text-xs font-black ${
                          (s.pct ?? 0) >= 80 ? 'text-emerald-600' : (s.pct ?? 0) >= 60 ? 'text-amber-600' : 'text-rose-600'
                        }`}>{s.pct ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-black ${
                        Number(s.avg) >= 4 ? 'text-emerald-600' : Number(s.avg) >= 3 ? 'text-blue-600' : Number(s.avg) > 0 ? 'text-amber-600' : 'text-zinc-400'
                      }`}>{Number(s.avg) > 0 ? Number(s.avg).toFixed(1) : '—'}</span>
                    </td>
                    <td className="px-4 py-3"><span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{s.max > 0 ? s.max : '—'}</span></td>
                    <td className="px-4 py-3"><span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{s.min > 0 ? s.min : '—'}</span></td>
                    <td className="px-4 py-3">
                      {Number(s.avg) >= 4.5 && Number(s.pct) >= 90 ? (
                        <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg text-[10px] font-black">⭐ A'lochilar</span>
                      ) : Number(s.pct) > 0 && Number(s.pct) < 60 ? (
                        <span className="px-2.5 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg text-[10px] font-black">⚠️ Kuzatuv</span>
                      ) : (
                        <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-[10px] font-black">Faol</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden bg-white dark:bg-[#111118] rounded-xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="overflow-auto h-full">
            <table className="w-full border-collapse text-xs" style={{ minWidth: `${Math.max(700, 180 + daysInMonth.length * 44 + 80)}px` }}>
              {/* ── Header ── */}
              <thead>
                <tr className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200/80 dark:border-white/[0.05]">
                  {/* Row number */}
                  <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-[#111118] w-10 px-2 py-3 text-center text-[10px] font-black text-zinc-400 uppercase border-r border-zinc-200/80 dark:border-white/[0.05]">
                    #
                  </th>
                  {/* Student name */}
                  <th className="sticky left-10 z-20 bg-zinc-50 dark:bg-[#111118] px-4 py-3 text-left text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest border-r border-zinc-200/80 dark:border-white/[0.05] min-w-[160px]">
                    O'quvchi
                  </th>
                  {/* Day columns */}
                  {daysInMonth.map((day) => {
                    const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <th
                        key={day.toISOString()}
                        className={`w-11 px-1 py-2 text-center border-r border-zinc-100 dark:border-white/[0.03] ${isToday ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
                      >
                        <div className="text-[9px] font-bold text-zinc-400">{DAY_LABELS[day.getDay()]}</div>
                        <div className={`text-[11px] font-black mt-0.5 ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                          {format(day, 'd')}
                        </div>
                      </th>
                    );
                  })}
                  {/* Summary */}
                  <th className="sticky right-0 z-20 bg-zinc-50 dark:bg-[#111118] px-3 py-3 text-center text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest border-l border-zinc-200/80 dark:border-white/[0.05] w-20">
                    Natija
                  </th>
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03]">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth.length + 3} className="py-16 text-center text-xs text-zinc-400 font-medium">
                      {selectedGroup ? "Bu guruhda o'quvchilar topilmadi" : "Guruhni tanlang"}
                    </td>
                  </tr>
                ) : filteredStudents.map((student, idx) => {
                  const stats = getStudentStats(student.id);
                  return (
                    <tr key={student.id} className="group/row hover:bg-zinc-50/80 dark:hover:bg-white/[0.02] transition-colors">
                      {/* Row number */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-[#111118] group-hover/row:bg-zinc-50/80 dark:group-hover/row:bg-[#111118] px-2 py-0 text-center border-r border-zinc-100 dark:border-white/[0.03] transition-colors">
                        <span className="text-[10px] text-zinc-400 font-bold">{idx + 1}</span>
                      </td>
                      {/* Student name */}
                      <td className="sticky left-10 z-10 bg-white dark:bg-[#111118] group-hover/row:bg-zinc-50/80 dark:group-hover/row:bg-[#111118] px-4 py-3 border-r border-zinc-100 dark:border-white/[0.03] transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-white/10 dark:to-white/5 flex items-center justify-center text-[10px] font-black text-zinc-600 dark:text-zinc-300 shrink-0">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[12px] font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">{student.name}</span>
                        </div>
                      </td>

                      {/* Day cells */}
                      {daysInMonth.map((day) => {
                        const status = getAttendanceStatus(student.id, day);
                        const grade = getGrade(student.id, day);
                        const note = getNote(student.id, day);
                        const isActive = activeCell?.studentId === student.id && activeCell.date === day.toISOString();
                        const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

                        return (
                          <td
                            key={day.toISOString()}
                            className={`relative px-0.5 py-1 text-center border-r border-zinc-100 dark:border-white/[0.03] ${isToday ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
                          >
                            <button
                              onClick={() => handleCellClick(student.id, day)}
                              className={`relative w-10 h-9 rounded-lg flex items-center justify-center mx-auto transition-all group/cell ${isActive ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:bg-zinc-100 dark:hover:bg-white/5'}`}
                            >
                              {/* Absent (X) */}
                              {status === 'absent' && !grade && (
                                <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                                  <X size={14} strokeWidth={2.5} className="text-rose-500" />
                                </div>
                              )}
                              {/* Grade badge */}
                              {grade > 0 && (
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${GRADE_STYLES[grade] || 'bg-zinc-200 text-zinc-700'}`}>
                                  {grade}
                                </div>
                              )}
                              {/* Empty dot */}
                              {!status && !grade && (
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 group-hover/cell:bg-zinc-300 dark:group-hover/cell:bg-zinc-600 transition-colors" />
                              )}
                              {/* Note indicator */}
                              {note && (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                              )}
                            </button>

                            {/* Popover */}
                            <AnimatePresence>
                              {isActive && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setActiveCell(null)} />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.92, y: 6 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.92, y: 6 }}
                                    transition={{ duration: 0.1 }}
                                    className={`absolute z-50 left-1/2 -translate-x-1/2 ${idx > filteredStudents.length - 4 ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                                  >
                                    <div className="bg-white dark:bg-[#1a1a24] rounded-xl shadow-xl border border-zinc-200/80 dark:border-white/10 p-1.5 flex items-center gap-1">
                                      {/* Grade buttons */}
                                      {[5, 4, 3, 2].map(g => (
                                        <button
                                          key={g}
                                          onClick={(e) => { e.stopPropagation(); handleGradeChange(student.id, day, g === grade ? 0 : g); setAttendanceStatus(student.id, day, 'present'); setActiveCell(null); }}
                                          className={`w-9 h-9 rounded-lg text-[12px] font-black transition-all active:scale-95 hover:scale-105 ${g === grade ? (GRADE_STYLES[g] || '') : `hover:${GRADE_STYLES[g]?.split(' ')[0]} text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5`}`}
                                          style={g === grade ? {} : {}}
                                        >
                                          {g}
                                        </button>
                                      ))}
                                      {/* Divider */}
                                      <div className="w-px h-6 bg-zinc-200 dark:bg-white/10 mx-0.5" />
                                      {/* Absent button */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setAttendanceStatus(student.id, day, status === 'absent' ? null : 'absent'); handleGradeChange(student.id, day, 0); setActiveCell(null); }}
                                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95 hover:scale-105 ${status === 'absent' ? 'bg-rose-500 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500'}`}
                                      >
                                        <X size={15} strokeWidth={2.5} />
                                      </button>
                                      {/* Note button */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setNoteModal({ studentId: student.id, date: format(day, 'yyyy-MM-dd'), text: note }); setActiveCell(null); }}
                                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-95 ${note ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'}`}
                                      >
                                        <MessageSquare size={13} strokeWidth={2} />
                                      </button>
                                    </div>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </td>
                        );
                      })}

                      {/* Summary cell */}
                      <td className="sticky right-0 z-10 bg-white dark:bg-[#111118] group-hover/row:bg-zinc-50/80 dark:group-hover/row:bg-[#111118] px-3 py-3 border-l border-zinc-200/80 dark:border-white/[0.05] transition-colors">
                        <div className="flex flex-col items-center gap-1">
                          {stats.pct !== null ? (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${stats.pct >= 80 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : stats.pct >= 50 ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                              {stats.pct}%
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-300 dark:text-zinc-700 font-bold">—</span>
                          )}
                          {stats.avg && (
                            <span className="text-[10px] font-bold text-zinc-400">{stats.avg} b.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Lesson Topic Modal ── */}
      <AnimatePresence>
        {topicModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200/80 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-violet-600" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Dars Mavzusi — {topicModal.date}</h3>
                </div>
                <button onClick={() => setTopicModal(null)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><BookOpen size={10} />Dars Mavzusi</label>
                  <textarea
                    value={topicModal.topic}
                    onChange={e => setTopicModal({ ...topicModal, topic: e.target.value })}
                    placeholder="Bugunga dars mavzusini yozing..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl border border-zinc-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5"><HomeIcon size={10} />Uy Vazifasi</label>
                  <textarea
                    value={topicModal.homework}
                    onChange={e => setTopicModal({ ...topicModal, homework: e.target.value })}
                    placeholder="Bugungi uy vazifasini yozing..."
                    rows={2}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl border border-zinc-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <button onClick={() => setTopicModal(null)} className="flex-1 py-2.5 text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-white/5 rounded-xl hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                  Bekor
                </button>
                <button onClick={saveLessonTopic} className="flex-1 py-2.5 text-xs font-black text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all">
                  Saqlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Legend ── */}
      {selectedGroup && (
        <div className="print:hidden flex flex-wrap items-center gap-4 px-4 py-3 bg-white dark:bg-[#111118] rounded-xl border border-zinc-200/80 dark:border-white/[0.05] shadow-sm">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Belgilar:</span>
          {[
            { label: "A'lo", val: 5, cls: 'bg-emerald-500 text-white' },
            { label: 'Yaxshi', val: 4, cls: 'bg-blue-500 text-white' },
            { label: 'Qoniqarli', val: 3, cls: 'bg-amber-500 text-white' },
            { label: "Qoniqarsiz", val: 2, cls: 'bg-rose-500 text-white' },
          ].map(item => (
            <div key={item.val} className="flex items-center gap-1.5">
              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${item.cls}`}>{item.val}</span>
              <span className="text-[10px] text-zinc-500 font-semibold">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
              <X size={11} strokeWidth={2.5} className="text-rose-500" />
            </div>
            <span className="text-[10px] text-zinc-500 font-semibold">Kelmagan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 block" />
            <span className="text-[10px] text-zinc-500 font-semibold">Izoh bor</span>
          </div>
        </div>
      )}

      {/* ── Note Modal ── */}
      <AnimatePresence>
        {noteModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.12 }}
              className="w-full max-w-sm bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200/80 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-amber-500" strokeWidth={2} />
                  <h3 className="text-xs font-black text-slate-900 dark:text-white">Izoh qo'shish</h3>
                </div>
                <button onClick={() => setNoteModal(null)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors">
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="p-4">
                <textarea
                  value={noteModal.text}
                  onChange={e => setNoteModal({ ...noteModal, text: e.target.value })}
                  placeholder="Izoh yozing..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-zinc-100 dark:bg-white/5 text-sm text-slate-900 dark:text-white rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <button onClick={() => setNoteModal(null)} className="flex-1 py-2 text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-white/5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 transition-all">
                  Bekor
                </button>
                <button
                  onClick={() => {
                    // Save note to attendance & assessment
                    const { studentId, date, text } = noteModal;
                    setAttendanceData(prev => {
                      const newData = [...prev];
                      let rec = newData.find(a => a.groupId === groupKey && a.date === date);
                      if (!rec) {
                        rec = { id: `temp_${Math.random().toString(36).substr(2, 9)}`, groupId: groupKey, date, records: [] };
                        newData.push(rec);
                      }
                      const idx = rec.records.findIndex(r => r.studentId === studentId);
                      if (idx >= 0) rec.records[idx] = { ...rec.records[idx], note: text };
                      else rec.records.push({ studentId, status: 'present', note: text });
                      return newData;
                    });
                    setNoteModal(null);
                  }}
                  className="flex-1 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all"
                >
                  Saqlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
