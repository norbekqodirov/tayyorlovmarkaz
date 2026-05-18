import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, Search, Check, X as XIcon, Clock,
  MoreVertical, Calendar, User, BookOpen, UserPlus, Trash2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { uz } from 'date-fns/locale';

import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';
import { exportToExcel } from '../../utils/export';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

const TABS = [
  'Davomat', 'Baholash', 'Reyting', 'Imtihonlar', 'Izoh', "To'lov"
];

function getMonthDue(enrollDate: string | undefined, groupPrice: number, year: number, month: number): number {
  if (!enrollDate || !groupPrice) return groupPrice || 0;
  const d = new Date(enrollDate);
  const ey = d.getFullYear(), em = d.getMonth();
  if (year < ey || (year === ey && month < em)) return 0;
  if (year === ey && month === em) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const remaining = daysInMonth - d.getDate() + 1;
    return Math.round((remaining / daysInMonth) * groupPrice);
  }
  return groupPrice;
}

const MONTH_NAMES = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

export default function CrmGroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [], updateDocument: updateStudentDoc } = useFirestore<any>('students');
  const { data: attendanceDocs = [], addDocument: addAtt, updateDocument: updateAtt } = useFirestore<any>('attendance');
  const { data: assessmentDocs = [], addDocument: addAssess, updateDocument: updateAssess } = useFirestore<any>('assessment');
  const { data: examDocs = [], addDocument: addExam, updateDocument: updateExam } = useFirestore<any>('exams');
  const { data: noteDocs = [], addDocument: addNote, updateDocument: updateNote } = useFirestore<any>('notes');
  const { data: financeDocs = [] } = useFirestore<any>('finance');

  const [activeTab, setActiveTab] = useState('Davomat');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [addStudentSearch, setAddStudentSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addingStudentId, setAddingStudentId] = useState<string | null>(null);
  const [pendingEnroll, setPendingEnroll] = useState<{ id: string; name: string } | null>(null);
  const [enrollStartDate, setEnrollStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMonth, setPaymentMonth] = useState(new Date());

  const group = useMemo(() => groups.find((g: any) => g.id === id) || null, [groups, id]);

  // ─── Fetch enrolled students via API ──────────────────────────────────────
  const fetchEnrollments = useCallback(async () => {
    if (!id) return;
    setEnrollmentsLoading(true);
    try {
      const res = await api.get(`/enrollments/group/${id}`);
      // Each enrollment has { id, studentId, student: { ... } }
      const list = (res.data || []).map((e: any) => ({
        ...(e.student || { id: e.studentId }),
        enrollmentStartDate: e.startDate || e.createdAt?.split('T')[0],
      }));
      setEnrolledStudents(list);
    } catch {
      // Fallback: try group.students[] (legacy GenericDocument storage)
      if (group?.students && Array.isArray(group.students)) {
        const enrolled = students.filter((s: any) => group.students.includes(s.id));
        setEnrolledStudents(enrolled);
      } else {
        setEnrolledStudents([]);
      }
    } finally {
      setEnrollmentsLoading(false);
    }
  }, [id, group, students]);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  const groupStudents = enrolledStudents;

  // ─── Add student to group ─────────────────────────────────────────────────
  const handleAddStudent = async (studentId: string, startDate: string) => {
    setAddingStudentId(studentId);
    try {
      await api.post('/enrollments', { studentId, groupId: id, startDate });
      // Save joinedDate and prorated balance onto the student record
      const price = group?.price || 0;
      if (price && startDate) {
        const d = new Date(startDate);
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const remaining = daysInMonth - d.getDate() + 1;
        const proratedBalance = -Math.round((remaining / daysInMonth) * price);
        await updateStudentDoc(studentId, { joinedDate: startDate, balance: proratedBalance });
      }
      await fetchEnrollments();
      setPendingEnroll(null);
      showToast("O'quvchi guruhga qo'shildi!", 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Xatolik yuz berdi", 'error');
    } finally {
      setAddingStudentId(null);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    try {
      await api.delete('/enrollments/remove', { data: { studentId, groupId: id } });
      await fetchEnrollments();
      showToast("O'quvchi guruhdan o'chirildi", 'success');
    } catch {
      showToast("Xatolik yuz berdi", 'error');
    }
  };

  // Available students not yet in this group
  const availableStudents = useMemo(() => {
    const enrolledIds = new Set(enrolledStudents.map((s: any) => s.id));
    return students.filter((s: any) => !enrolledIds.has(s.id) &&
      (!addStudentSearch || s.name?.toLowerCase().includes(addStudentSearch.toLowerCase()) || s.phone?.includes(addStudentSearch))
    );
  }, [students, enrolledStudents, addStudentSearch]);

  const DAY_JS_MAP: Record<string, number> = { 'Dush': 1, 'Sesh': 2, 'Chor': 3, 'Pay': 4, 'Jum': 5, 'Shan': 6, 'Yak': 0 };

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end }).filter(date => {
      const day = date.getDay();
      if (!group?.days?.length) return day !== 0;
      return (Array.isArray(group.days) ? group.days : []).map((d: string) => DAY_JS_MAP[d]).includes(day);
    });
  }, [currentDate, group]);

  const handleAttendanceClick = async (studentId: string, dateStr: string, currentStatus: string | undefined) => {
    // Cycle logic: undefined -> 'present' -> 'absent' -> 'late' -> undefined
    const statusCycle: Record<string, string | null> = {
      'undefined': 'present',
      'present': 'absent',
      'absent': 'late',
      'late': null
    };
    
    const nextStatus = statusCycle[String(currentStatus)];
    const existingDoc = attendanceDocs.find((a: any) => a.groupId === group?.id && a.date === dateStr);

    if (existingDoc) {
      // Update existing
      const records = [...(existingDoc.records || [])];
      const idx = records.findIndex((r: any) => r.studentId === studentId);
      if (idx > -1) {
        if (nextStatus) {
           records[idx].status = nextStatus;
        } else {
           records.splice(idx, 1);
        }
      } else if (nextStatus) {
        records.push({ studentId, status: nextStatus, time: new Date().toISOString() });
      }
      await updateAtt(existingDoc.id, { records });
    } else {
      if (nextStatus) {
        await addAtt({
          groupId: group?.id,
          date: dateStr,
          records: [{ studentId, status: nextStatus, time: new Date().toISOString() }]
        });
      }
    }
  };

  const handleAssessmentChange = async (studentId: string, dateStr: string, score: number) => {
    const existingDoc = assessmentDocs.find((a: any) => a.studentId === studentId && a.groupId === group?.id && a.date === dateStr);
    if (existingDoc) {
      if (score > 0) {
        await updateAssess(existingDoc.id, { score });
      } // Optional: delete assessment if score is 0
    } else if (score > 0) {
      await addAssess({
        groupId: group?.id,
        studentId,
        date: dateStr,
        score
      });
    }
  };

  const handleExamChange = async (studentId: string, examName: string, score: number) => {
    const existingDoc = examDocs.find((a: any) => a.studentId === studentId && a.groupId === group?.id && a.examName === examName);
    if (existingDoc) {
      if (score > 0) await updateExam(existingDoc.id, { score });
    } else if (score > 0) {
      await addExam({ groupId: group?.id, studentId, examName, score });
    }
  };

  const handleNoteChange = async (studentId: string, note: string) => {
    const existingDoc = noteDocs.find((n: any) => n.studentId === studentId && n.groupId === group?.id);
    if (existingDoc) {
      await updateNote(existingDoc.id, { note });
    } else {
      await addNote({ groupId: group?.id, studentId, note });
    }
  };

  const handleExport = () => {
    exportToExcel(groupStudents, [
      { header: 'F.I.SH', key: 'name', width: 25 },
      { header: 'Telefon', key: 'phone', width: 20 },
      { header: 'Holat', key: 'status', width: 15 }
    ], `${group?.name || 'Guruh'} - o'quvchilar`);
  };

  if (!group) {
    return <div className="p-10 flex justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  // Admin/Manager feature wrapper
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isTeacher = user.role === 'TEACHER';

  return (
    <div className="flex gap-6 h-[calc(100vh-100px)] overflow-hidden">
      
      {/* ─── LEFT SIDEBAR (Admin/Manager Only, or we show for everyone to match screenshot? Screenshot 2 has it for a specific role? "oddiy o'qituvchi profilida ko'rinmaydi. Lekin menejer adminda ko'rinadi") ─── */}
      {!isTeacher && (
        <div className="w-[380px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden shrink-0">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-xs font-black text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4 uppercase tracking-widest">
              <ArrowLeft size={14} /> Ortga qaytish
            </button>
            <div className="flex justify-between items-start mb-4">
               <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{group.name}</h1>
               <button className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-1.5 rounded-lg transition-colors">
                  <MoreVertical size={20} />
               </button>
            </div>
            
            <div className="space-y-2 text-sm font-bold text-slate-700 dark:text-zinc-300">
               <p className="flex justify-between items-center"><span className="text-zinc-400">O'qituvchi:</span> <span className="text-blue-500">{group.teacher}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Narx:</span> <span>{new Intl.NumberFormat('uz-UZ').format(group.price)} so'm</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Vaqt:</span> <span>{group.time}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Kurs:</span> <span>{group.subject}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Boshlanish:</span> <span>{group.startDate}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Tugash:</span> <span>{group.endDate || '-'}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">Xona:</span> <span>{group.room && typeof group.room === 'object' ? (group.room as any).name : group.room}</span></p>
               <p className="flex justify-between items-center"><span className="text-zinc-400">O'quvchilar:</span> <span>{groupStudents.length} kishi</span></p>
               <div className="pt-2">
                 <p className="text-zinc-400 mb-1.5">Dars kunlari:</p>
                 <div className="flex gap-2 flex-wrap">
                   {(Array.isArray(group.days) ? group.days : []).map((d: string) => <span key={d} className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] rounded uppercase tracking-widest">{d}</span>)}
                 </div>
               </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1 relative">
            <div className="flex items-center justify-between gap-2 px-2 pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-400">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500" /> Qarzdorlar</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Sinov</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-800 dark:bg-white" /> Faol</span>
            </div>

            {enrollmentsLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : groupStudents.length === 0 ? (
              <div className="text-center py-8">
                <User size={32} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-xs font-bold text-zinc-400">Guruhda o'quvchi yo'q</p>
              </div>
            ) : groupStudents.map((s: any, idx) => {
               let colorClass = 'bg-slate-800 dark:bg-white';
               if (s.paymentStatus === "Qarzdor" || s.paymentStatus === "Qarzdorlik") colorClass = 'bg-rose-500';
               else if (s.status === 'left') colorClass = 'bg-amber-400';
               return (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-zinc-400 w-4 text-right">{idx + 1}</span>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-500">{s.phone?.replace('+998', '').trim()}</span>
                    <button
                      onClick={() => handleRemoveStudent(s.id)}
                      title="Guruhdan chiqarish"
                      className="p-1 text-zinc-300 dark:text-zinc-700 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
               );
            })}
          </div>

          {/* Add Student Panel */}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            {showAddStudent ? (
              <div className="p-3 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={addStudentSearch}
                    onChange={e => setAddStudentSearch(e.target.value)}
                    placeholder="Qidirish..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 dark:text-white"
                    autoFocus
                  />
                </div>
                {pendingEnroll ? (
                  <div className="space-y-2 p-1">
                    <p className="text-xs font-black text-slate-700 dark:text-zinc-200">{pendingEnroll.name}</p>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Boshlanish sanasi</label>
                      <input
                        type="date"
                        value={enrollStartDate}
                        onChange={e => setEnrollStartDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-blue-500 dark:text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddStudent(pendingEnroll.id, enrollStartDate)}
                        disabled={!!addingStudentId}
                        className="flex-1 py-2 bg-blue-500 text-white text-[10px] font-black rounded-xl hover:bg-blue-600 disabled:opacity-50 transition-colors"
                      >
                        {addingStudentId ? "Qo'shilmoqda..." : 'Tasdiqlash'}
                      </button>
                      <button
                        onClick={() => setPendingEnroll(null)}
                        className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[10px] font-black rounded-xl hover:bg-zinc-200 transition-colors"
                      >
                        Orqaga
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {availableStudents.slice(0, 20).map(s => (
                        <button
                          key={s.id}
                          onClick={() => { setPendingEnroll({ id: s.id, name: s.name }); setEnrollStartDate(new Date().toISOString().split('T')[0]); }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 transition-colors"
                        >
                          <span>{s.name}</span>
                          <span className="text-zinc-400">{s.phone?.replace('+998', '')}</span>
                        </button>
                      ))}
                      {availableStudents.length === 0 && (
                        <p className="text-center text-xs text-zinc-400 py-4">O'quvchi topilmadi</p>
                      )}
                    </div>
                    <button onClick={() => { setShowAddStudent(false); setAddStudentSearch(''); setPendingEnroll(null); }} className="w-full text-[10px] font-black text-zinc-400 hover:text-red-500 transition-colors">
                      Yopish
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="p-4 flex justify-between items-center">
                <button onClick={handleExport} className="flex items-center gap-2 text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors uppercase tracking-widest">
                  <Download size={12} /> Excel
                </button>
                <button
                  onClick={() => setShowAddStudent(true)}
                  className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors uppercase tracking-widest"
                >
                  <UserPlus size={12} /> O'quvchi qo'shish
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RIGHT CONTENT (Tabs & Journal) ─── */}
      <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden">
        {/* Tabs Header */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto hide-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-zinc-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {activeTab === 'Davomat' && (
            <div className="flex flex-col h-full space-y-4">
              {/* Controls */}
              <div className="flex items-center gap-3">
                <select 
                   value={currentDate.getFullYear()} 
                   onChange={(e) => setCurrentDate(new Date(Number(e.target.value), currentDate.getMonth(), 1))}
                   className="px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-xs"
                >
                  {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs font-bold divide-x divide-zinc-200 dark:divide-zinc-700">
                   {[
                     { name: 'Yan', i: 0 }, { name: 'Fev', i: 1 }, { name: 'Mar', i: 2 }, { name: 'Apr', i: 3 },
                     { name: 'May', i: 4 }, { name: 'Iyun', i: 5 }, { name: 'Iyul', i: 6 }, { name: 'Avg', i: 7 },
                     { name: 'Sen', i: 8 }, { name: 'Okt', i: 9 }, { name: 'Noy', i: 10 }, { name: 'Dek', i: 11 }
                   ].map(mon => (
                     <button
                       key={mon.i}
                       onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), mon.i, 1))}
                       className={`px-3 py-2 transition-colors ${currentDate.getMonth() === mon.i ? 'bg-emerald-500 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                     >
                       {mon.name}
                     </button>
                   ))}
                </div>
              </div>

              {/* Attendance Grid */}
              <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                  <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                        Talabalar
                      </th>
                      {daysInMonth.map((d, i) => (
                        <th key={i} className="px-2 py-3 text-center text-[10px] font-black text-blue-500 border-l border-zinc-100 dark:border-zinc-800">
                          {format(d, 'dd MMM', { locale: uz })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-300">
                    {groupStudents.map((s: any, idx) => (
                      <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800 min-w-[200px]">
                          <span className="text-zinc-400 mr-2">{idx + 1}</span> {s.name}
                        </td>
                        {daysInMonth.map((d, i) => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          // Fetch real status
                          const rec = attendanceDocs.find((a: any) => a.groupId === group.id && a.date === dateStr);
                          const st = rec?.records?.find((r: any) => r.studentId === s.id)?.status;
                          
                          // Convert old string to styling
                          let cellContent = <div className="w-7 h-7 mx-auto rounded-lg bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer" />;
                          if (st === 'present') cellContent = <div className="w-8 h-8 mx-auto rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/50 cursor-pointer"><Check size={16} /></div>;
                          if (st === 'absent') cellContent = <div className="w-8 h-8 mx-auto rounded-xl bg-rose-500 flex items-center justify-center text-white shadow-sm shadow-rose-500/50 cursor-pointer"><XIcon size={16} /></div>;
                          if (st === 'late') cellContent = <div className="w-8 h-8 mx-auto rounded-xl bg-amber-400 flex items-center justify-center text-white shadow-sm shadow-amber-400/50 cursor-pointer"><Clock size={16} /></div>;

                          return (
                            <td 
                              key={i} 
                              onClick={() => handleAttendanceClick(s.id, dateStr, st)}
                              className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center relative group/cell"
                            >
                              {cellContent}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Footer action */}
              <div className="flex justify-end pt-2">
                 <button className="text-[10px] uppercase font-black tracking-widest text-zinc-400 hover:text-blue-500 transition-colors border border-zinc-200 dark:border-zinc-700 px-4 py-2 rounded-xl">
                   PDF Eksport
                 </button>
              </div>
            </div>
          )}

          {activeTab === 'Baholash' && (
            <div className="flex flex-col h-full space-y-4">
              {/* Controls */}
              <div className="flex items-center gap-3">
                <select 
                   value={currentDate.getFullYear()} 
                   onChange={(e) => setCurrentDate(new Date(Number(e.target.value), currentDate.getMonth(), 1))}
                   className="px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-xs"
                >
                  {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs font-bold divide-x divide-zinc-200 dark:divide-zinc-700">
                   {[
                     { name: 'Yan', i: 0 }, { name: 'Fev', i: 1 }, { name: 'Mar', i: 2 }, { name: 'Apr', i: 3 },
                     { name: 'May', i: 4 }, { name: 'Iyun', i: 5 }, { name: 'Iyul', i: 6 }, { name: 'Avg', i: 7 },
                     { name: 'Sen', i: 8 }, { name: 'Okt', i: 9 }, { name: 'Noy', i: 10 }, { name: 'Dek', i: 11 }
                   ].map(mon => (
                     <button
                       key={mon.i}
                       onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), mon.i, 1))}
                       className={`px-3 py-2 transition-colors ${currentDate.getMonth() === mon.i ? 'bg-indigo-500 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                     >
                       {mon.name}
                     </button>
                   ))}
                </div>
              </div>

              {/* Grading Grid */}
              <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                  <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                        Talabalar
                      </th>
                      {daysInMonth.map((d, i) => (
                        <th key={i} className="px-2 py-3 text-center text-[10px] font-black text-indigo-500 border-l border-zinc-100 dark:border-zinc-800">
                          {format(d, 'dd MMM', { locale: uz })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-300">
                    {groupStudents.map((s: any, idx) => (
                      <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800 min-w-[200px]">
                          <span className="text-zinc-400 mr-2">{idx + 1}</span> {s.name}
                        </td>
                        {daysInMonth.map((d, i) => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          const rec = assessmentDocs.find((a: any) => a.groupId === group.id && a.date === dateStr && a.studentId === s.id);
                          const score = rec?.score || '';
                          
                          return (
                            <td 
                              key={i} 
                              className="px-2 py-1.5 border-l border-zinc-100 dark:border-zinc-800 text-center"
                            >
                              <input 
                                type="number" 
                                min="0" 
                                max="100" 
                                defaultValue={score}
                                onBlur={(e) => {
                                   if (e.target.value !== String(score)) {
                                       handleAssessmentChange(s.id, dateStr, Number(e.target.value));
                                   }
                                }}
                                className="w-10 h-8 text-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-indigo-600 dark:text-indigo-400"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Reyting' && (
            <div className="flex flex-col h-full space-y-6">
              <div className="flex items-center gap-3">
                <select 
                   value={currentDate.getFullYear()} 
                   onChange={(e) => setCurrentDate(new Date(Number(e.target.value), currentDate.getMonth(), 1))}
                   className="px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-xs"
                >
                  {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs font-bold divide-x divide-zinc-200 dark:divide-zinc-700">
                   {[
                     { name: 'Yan', i: 0 }, { name: 'Fev', i: 1 }, { name: 'Mar', i: 2 }, { name: 'Apr', i: 3 },
                     { name: 'May', i: 4 }, { name: 'Iyun', i: 5 }, { name: 'Iyul', i: 6 }, { name: 'Avg', i: 7 },
                     { name: 'Sen', i: 8 }, { name: 'Okt', i: 9 }, { name: 'Noy', i: 10 }, { name: 'Dek', i: 11 }
                   ].map(mon => (
                     <button
                       key={mon.i}
                       onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), mon.i, 1))}
                       className={`px-3 py-2 transition-colors ${currentDate.getMonth() === mon.i ? 'bg-amber-500 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                     >
                       {mon.name}
                     </button>
                   ))}
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-max p-2">
                {[...groupStudents].map(s => {
                  const sAtt = attendanceDocs.filter((a: any) => a.groupId === group.id && a.date.startsWith(format(currentDate, 'yyyy-MM')));
                  let present = 0, totalAtt = sAtt.length;
                  sAtt.forEach((doc: any) => {
                     const r = doc.records?.find((rec: any) => rec.studentId === s.id);
                     if (r?.status === 'present' || r?.status === 'late') present++;
                  });

                  const sAss = assessmentDocs.filter((a: any) => a.groupId === group.id && a.studentId === s.id && a.date.startsWith(format(currentDate, 'yyyy-MM')));
                  const totalScore = sAss.reduce((sum: number, doc: any) => sum + Number(doc.score || 0), 0);
                  const avgScore = sAss.length > 0 ? (totalScore / sAss.length).toFixed(1) : '0.0';

                  // Formula to calculate general performance
                  const performanceIndex = (present * 10) + (Number(avgScore) * 5);
                  
                  return { ...s, present, totalAtt, avgScore, performanceIndex };
                }).sort((a, b) => b.performanceIndex - a.performanceIndex).map((s, idx) => (
                  <div key={s.id} className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-[24px] border border-zinc-100 dark:border-zinc-700 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-full blur-3xl -m-10"></div>
                    
                    <div className="flex justify-between items-start mb-6 relative">
                       <div>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black mb-2 shadow-sm ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : idx === 2 ? 'bg-orange-400 text-white' : 'bg-white dark:bg-zinc-700 text-zinc-400'}`}>#{idx + 1}</div>
                         <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{s.name}</h3>
                         <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{s.phone}</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 relative">
                       <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-3 rounded-xl">
                          <p className="text-[9px] font-black tracking-widest text-zinc-400 uppercase mb-1">O'rtacha Baho</p>
                          <p className={`text-xl font-black ${Number(s.avgScore) >= 80 ? 'text-emerald-500' : Number(s.avgScore) >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{s.avgScore}</p>
                       </div>
                       <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-3 rounded-xl">
                          <p className="text-[9px] font-black tracking-widest text-zinc-400 uppercase mb-1">Davomat</p>
                          <p className="text-xl font-black text-blue-500">{s.present} <span className="text-xs text-zinc-300">/ {s.totalAtt || 12}</span></p>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Imtihonlar' && (
            <div className="flex flex-col h-full space-y-4">
              <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl relative custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                  <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest sticky left-0 bg-white dark:bg-zinc-900 z-20 border-r border-zinc-200 dark:border-zinc-800">
                        Talabalar
                      </th>
                      {['1-Imtihon (Oraliq)', '2-Imtihon (Oraliq)', 'Yakuniy Imtihon'].map((examName, i) => (
                        <th key={i} className="px-6 py-3 text-center text-xs font-black text-purple-600 dark:text-purple-400 border-l border-zinc-100 dark:border-zinc-800">
                          {examName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-300">
                    {groupStudents.map((s: any, idx) => (
                      <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-4 sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800 min-w-[200px]">
                          <span className="text-zinc-400 mr-2">{idx + 1}</span> {s.name}
                        </td>
                         {['1-Imtihon (Oraliq)', '2-Imtihon (Oraliq)', 'Yakuniy Imtihon'].map((examName, i) => {
                          const rec = examDocs.find((a: any) => a.groupId === group.id && a.examName === examName && a.studentId === s.id);
                          const score = rec?.score || '';
                          
                          return (
                            <td 
                              key={i} 
                              className="px-6 py-2 border-l border-zinc-100 dark:border-zinc-800 text-center"
                            >
                              <input 
                                type="number" 
                                min="0" 
                                max="100" 
                                defaultValue={score}
                                placeholder="--"
                                onBlur={(e) => {
                                   if (e.target.value !== String(score)) {
                                       handleExamChange(s.id, examName, Number(e.target.value));
                                   }
                                }}
                                className="w-16 h-10 px-2 text-center bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-black focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-purple-600 dark:text-purple-400"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Izoh' && (
            <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-800/20 rounded-2xl p-4 shadow-inner border border-zinc-100 dark:border-zinc-800">
               <div className="space-y-3">
                 {groupStudents.map((s: any) => {
                    const rec = noteDocs.find((n: any) => n.studentId === s.id && n.groupId === group.id);
                    return (
                      <div key={s.id} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm flex flex-col md:flex-row gap-4">
                         <div className="w-[200px] shrink-0 font-bold text-sm text-slate-800 dark:text-zinc-200 flex items-center">{s.name}</div>
                         <textarea
                           defaultValue={rec?.note || ''}
                           onBlur={(e) => {
                               if (e.target.value !== (rec?.note || '')) {
                                   handleNoteChange(s.id, e.target.value);
                               }
                           }}
                           placeholder="O'quvchi haqida qisqacha izoh yozish..."
                           className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 text-sm font-medium resize-none focus:outline-none focus:border-blue-500 transition-all min-h-[80px] dark:text-zinc-300"
                         />
                      </div>
                    );
                 })}
               </div>
            </div>
          )}

          {activeTab === "To'lov" && (
            <div className="flex flex-col h-full space-y-4">
              {/* Month selector */}
              <div className="flex items-center gap-3">
                <select
                  value={paymentMonth.getFullYear()}
                  onChange={e => setPaymentMonth(new Date(Number(e.target.value), paymentMonth.getMonth(), 1))}
                  className="px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-xs"
                >
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden text-xs font-bold divide-x divide-zinc-200 dark:divide-zinc-700">
                  {MONTH_NAMES.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => setPaymentMonth(new Date(paymentMonth.getFullYear(), i, 1))}
                      className={`px-3 py-2 transition-colors ${paymentMonth.getMonth() === i ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      {name.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment table */}
              <div className="flex-1 overflow-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 z-10">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest">O'quvchi</th>
                      <th className="px-4 py-3 text-xs font-black text-zinc-400 uppercase tracking-widest">Qo'shilgan sana</th>
                      <th className="px-4 py-3 text-xs font-black text-zinc-400 uppercase tracking-widest text-right">Kerakli to'lov</th>
                      <th className="px-4 py-3 text-xs font-black text-zinc-400 uppercase tracking-widest text-right">To'langan</th>
                      <th className="px-4 py-3 text-xs font-black text-zinc-400 uppercase tracking-widest text-center">Holat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {groupStudents.map((s: any) => {
                      const yr = paymentMonth.getFullYear();
                      const mo = paymentMonth.getMonth();
                      const enrollDate = s.enrollmentStartDate || s.joinedDate;
                      const expected = getMonthDue(enrollDate, group.price || 0, yr, mo);
                      const paid = financeDocs
                        .filter((f: any) =>
                          f.type === 'income' &&
                          f.studentId === s.id &&
                          f.date && new Date(f.date).getFullYear() === yr &&
                          new Date(f.date).getMonth() === mo
                        )
                        .reduce((acc: number, f: any) => acc + (f.amount || 0), 0);
                      const status = expected === 0
                        ? 'Hali emas'
                        : paid >= expected
                          ? "To'langan"
                          : paid > 0
                            ? "Qisman"
                            : "Qarzdor";
                      const statusColor = status === "To'langan"
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700'
                        : status === 'Qisman'
                          ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700'
                          : status === 'Hali emas'
                            ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'
                            : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700';
                      return (
                        <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-sm font-bold text-slate-800 dark:text-zinc-200">{s.name}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{enrollDate || '—'}</td>
                          <td className="px-4 py-3 text-right text-sm font-black text-slate-700 dark:text-zinc-300">
                            {expected > 0 ? `${new Intl.NumberFormat('uz-UZ').format(expected)} so'm` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">
                            {paid > 0 ? `${new Intl.NumberFormat('uz-UZ').format(paid)} so'm` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${statusColor}`}>{status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
