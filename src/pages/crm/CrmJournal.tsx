import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, X, Clock, Calendar as CalendarIcon, 
  ChevronLeft, ChevronRight, Save, Users, 
  Star, Info, Filter, Download, Settings2,
  MoreHorizontal, Search, FileText, MessageSquare, Printer
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, isToday } from 'date-fns';
import { uz } from 'date-fns/locale';
import { useFirestore } from '../../hooks/useFirestore';

interface Student {
  id: string;
  name: string;
  group: string;
}

interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent' | 'late';
  note?: string;
}

interface GroupAttendance {
  id: string;
  groupId: string;
  groupName?: string;
  date: string;
  records: AttendanceRecord[];
}

interface Assessment {
  id: string;
  studentId: string;
  groupId: string;
  score: number;
  comment: string;
  date: string;
}

export default function CrmJournal() {
  const { documents: groups } = useFirestore<any>('groups');
  const { documents: students } = useFirestore<Student>('students');
  const { documents: attendanceDocs, addDocument: addAttendance, updateDocument: updateAttendance } = useFirestore<GroupAttendance>('attendance');
  const { documents: assessmentDocs, addDocument: addAssessment, updateDocument: updateAssessment, deleteDocument: deleteAssessment } = useFirestore<Assessment>('assessments');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [attendanceData, setAttendanceData] = useState<GroupAttendance[]>([]);
  const [assessmentData, setAssessmentData] = useState<Assessment[]>([]);
  const [viewMode, setViewMode] = useState<'attendance' | 'assessment' | 'both'>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedNote, setSelectedNote] = useState<{ studentId: string, date: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  // Sync with Firestore
  useEffect(() => {
    setAttendanceData(attendanceDocs);
  }, [attendanceDocs]);

  useEffect(() => {
    setAssessmentData(assessmentDocs);
  }, [assessmentDocs]);

  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const filteredStudents = useMemo(() => {
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    let list = students;
    if (group) {
      if (group.students) {
        list = students.filter(s => group.students.includes(s.id));
      } else {
        list = students.filter(s => s.group === group.name);
      }
    }
    if (searchQuery) {
      list = list.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return list;
  }, [selectedGroup, groups, students, searchQuery]);

  const handleAttendanceToggle = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return;

    setAttendanceData(prev => {
      const newData = [...prev];
      let groupRecord = newData.find(a => a.groupId === (group.id || group.name) && a.date === dateStr);
      
      if (!groupRecord) {
        groupRecord = {
          id: `temp_${Math.random().toString(36).substr(2, 9)}`,
          groupId: group.id || group.name,
          groupName: group.name,
          date: dateStr,
          records: []
        };
        newData.push(groupRecord);
      }

      const studentRecordIndex = groupRecord.records.findIndex(r => r.studentId === studentId);
      if (studentRecordIndex >= 0) {
        const currentStatus = groupRecord.records[studentRecordIndex].status;
        const nextStatus: any = currentStatus === 'present' ? 'absent' : currentStatus === 'absent' ? 'late' : 'present';
        groupRecord.records[studentRecordIndex].status = nextStatus;
      } else {
        groupRecord.records.push({ studentId, status: 'present' });
      }

      return newData;
    });
  };

  const handleGradeChange = (studentId: string, date: Date, score: number) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return;

    setAssessmentData(prev => {
      const newData = [...prev];
      const existingIndex = newData.findIndex(a => a.studentId === studentId && a.date === dateStr && a.groupId === (group.id || group.name));

      if (existingIndex >= 0) {
        if (score === 0) {
          newData.splice(existingIndex, 1);
        } else {
          newData[existingIndex] = { ...newData[existingIndex], score };
        }
      } else if (score > 0) {
        newData.push({
          id: `temp_${Math.random().toString(36).substr(2, 9)}`,
          studentId,
          groupId: group.id || group.name,
          score,
          comment: '',
          date: dateStr
        });
      }
      return newData;
    });
  };

  const getAttendanceStatus = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return null;
    const groupRecord = attendanceData.find(a => a.groupId === (group.id || group.name) && a.date === dateStr);
    return groupRecord?.records.find(r => r.studentId === studentId)?.status;
  };

  const getGrade = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return 0;
    return assessmentData.find(a => a.studentId === studentId && a.date === dateStr && a.groupId === (group.id || group.name))?.score || 0;
  };

  const getNote = (studentId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return '';
    
    // Check attendance records for notes
    const groupRecord = attendanceData.find(a => a.groupId === (group.id || group.name) && a.date === dateStr);
    const attendanceNote = groupRecord?.records.find(r => r.studentId === studentId)?.note;
    
    // Check assessment records for comments
    const assessmentNote = assessmentData.find(a => a.studentId === studentId && a.date === dateStr && a.groupId === (group.id || group.name))?.comment;
    
    return attendanceNote || assessmentNote || '';
  };

  const handleSaveNote = () => {
    if (!selectedNote) return;
    const { studentId, date } = selectedNote;
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    if (!group) return;

    // Update attendance note
    setAttendanceData(prev => {
      const newData = [...prev];
      let groupRecord = newData.find(a => a.groupId === (group.id || group.name) && a.date === date);
      if (groupRecord) {
        const studentRecordIndex = groupRecord.records.findIndex(r => r.studentId === studentId);
        if (studentRecordIndex >= 0) {
          groupRecord.records[studentRecordIndex].note = noteText;
        } else {
          groupRecord.records.push({ studentId, status: 'present', note: noteText });
        }
      }
      return newData;
    });

    // Update assessment comment
    setAssessmentData(prev => {
      const newData = [...prev];
      const existingIndex = newData.findIndex(a => a.studentId === studentId && a.date === date && a.groupId === (group.id || group.name));
      if (existingIndex >= 0) {
        newData[existingIndex].comment = noteText;
      }
      return newData;
    });

    setSelectedNote(null);
    setNoteText('');
  };

  const exportToCSV = () => {
    if (!selectedGroup) return;
    const group = groups.find(g => g.id === selectedGroup || g.name === selectedGroup);
    const fileName = `Jurnal_${group?.name || 'Guruh'}_${format(currentDate, 'MMMM_yyyy', { locale: uz })}.csv`;
    
    let csvContent = "O'quvchi ismi," + (daysInMonth || []).map(d => format(d, 'dd.MM')).join(',') + ",Davomat %,O'rtacha baho\n";
    
    (filteredStudents || []).forEach(student => {
      const row = [student.name];
      (daysInMonth || []).forEach(day => {
        const status = getAttendanceStatus(student.id, day);
        const grade = getGrade(student.id, day);
        let cell = "";
        if (status) cell += status.charAt(0).toUpperCase();
        if (grade) cell += (cell ? "/" : "") + grade;
        row.push(cell || "-");
      });
      
      const monthAttendance = (daysInMonth || []).map(d => getAttendanceStatus(student.id, d));
      const presentCount = monthAttendance.filter(s => s === 'present' || s === 'late').length;
      const totalDays = monthAttendance.filter(s => s !== null && s !== undefined).length;
      const attendancePercent = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;
      const monthGrades = (daysInMonth || []).map(d => getGrade(student.id, d)).filter(g => g > 0);
      const avgGrade = monthGrades.length > 0 ? (monthGrades.reduce((a, b) => a + b, 0) / monthGrades.length).toFixed(1) : '-';
      
      row.push(`${attendancePercent}%`);
      row.push(avgGrade);
      csvContent += row.join(',') + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const saveAll = async () => {
    setIsSaving(true);
    try {
      // Save attendance
      for (const record of attendanceData) {
        if (record.id.startsWith('temp_')) {
          const { id, ...rest } = record;
          await addAttendance(rest);
        } else {
          const original = attendanceDocs.find(d => d.id === record.id);
          if (original && JSON.stringify(original) !== JSON.stringify(record)) {
            await updateAttendance(record.id, record);
          }
        }
      }

      // Save assessments
      for (const record of assessmentData) {
        if (record.id.startsWith('temp_')) {
          const { id, ...rest } = record;
          await addAssessment(rest);
        } else {
          const original = assessmentDocs.find(d => d.id === record.id);
          if (original && JSON.stringify(original) !== JSON.stringify(record)) {
            await updateAssessment(record.id, record);
          }
        }
      }

      // Handle deleted assessments
      for (const original of assessmentDocs) {
        if (!assessmentData.find(d => d.id === original.id)) {
          await deleteAssessment(original.id);
        }
      }

      alert('Ma\'lumotlar muvaffaqiyatli saqlandi!');
    } catch (error) {
      console.error('Error saving journal:', error);
      alert('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 print:space-y-0 print:p-0">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">ELEKTRON JURNAL</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Davomat va baholashning yagona tizimi</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <button 
              onClick={() => setViewMode('attendance')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'attendance' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              Davomat
            </button>
            <button 
              onClick={() => setViewMode('assessment')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'assessment' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              Baholash
            </button>
            <button 
              onClick={() => setViewMode('both')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'both' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              Hammasi
            </button>
          </div>
          <button 
            onClick={exportToCSV}
            disabled={!selectedGroup}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold text-sm hover:bg-zinc-50 transition-all shadow-sm"
          >
            <Download size={18} />
            Eksport
          </button>
          <button 
            onClick={handlePrint}
            disabled={!selectedGroup}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold text-sm hover:bg-zinc-50 transition-all shadow-sm"
          >
            <Printer size={18} />
            Chop etish
          </button>
          <button 
            onClick={saveAll}
            disabled={isSaving || !selectedGroup}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20"
          >
            {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
            Saqlash
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 print:hidden">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">Guruh</label>
          <select 
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          >
            <option value="">Guruhni tanlang</option>
            {(groups || []).map(g => (
              <option key={g.id} value={g.id || g.name}>{g.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div>
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 block">Oy</label>
            <span className="text-sm font-black text-slate-900 dark:text-white capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: uz })}
            </span>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 block">O'quvchi qidirish</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ism bo'yicha..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>
        </div>

        <div className="hidden lg:flex bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm items-center justify-around">
          <div className="text-center">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">O'quvchilar</p>
            <p className="text-xl font-black text-blue-600">{filteredStudents.length}</p>
          </div>
          <div className="w-px h-8 bg-zinc-100 dark:bg-zinc-800" />
          <div className="text-center">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Darslar</p>
            <p className="text-xl font-black text-purple-600">{daysInMonth.length}</p>
          </div>
        </div>
      </div>

      {/* Journal Grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden print:shadow-none print:border-none print:rounded-none">
        {!selectedGroup ? (
          <div className="p-20 text-center print:hidden">
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="text-blue-600" size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Guruh tanlanmagan</h3>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">Jurnalni ko'rish va to'ldirish uchun yuqoridan guruhni tanlang</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-800">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-800/90 px-6 py-4 text-left min-w-[240px] border-r border-zinc-200 dark:border-zinc-800 print:bg-white print:text-black">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest print:text-black">O'quvchi ismi</span>
                  </th>
                  {(daysInMonth || []).map(day => (
                    <th 
                      key={day.toISOString()} 
                      className={`px-2 py-4 min-w-[50px] text-center border-r border-zinc-200 dark:border-zinc-800 ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/20' : ''} print:bg-white print:text-black print:border-black`}
                    >
                      <p className="text-[10px] font-black text-zinc-400 uppercase print:text-black">{format(day, 'EEE', { locale: uz })}</p>
                      <p className={`text-sm font-black ${isToday(day) ? 'text-blue-600' : 'text-slate-900 dark:text-white'} print:text-black`}>{format(day, 'd')}</p>
                    </th>
                  ))}
                  <th className="px-4 py-4 min-w-[80px] text-center bg-zinc-100 dark:bg-zinc-800/80 sticky right-0 z-20 print:bg-white print:text-black print:border-black">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest print:text-black">Natija</p>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 print:divide-black">
                  {(filteredStudents || []).map((student, idx) => {
                    // Calculate stats for the month
                    const monthAttendance = (daysInMonth || []).map(d => getAttendanceStatus(student.id, d));
                    const presentCount = monthAttendance.filter(s => s === 'present' || s === 'late').length;
                    const totalDays = monthAttendance.filter(s => s !== null && s !== undefined).length;
                    const attendancePercent = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;

                    const monthGrades = (daysInMonth || []).map(d => getGrade(student.id, d)).filter(g => g > 0);
                  const avgGrade = monthGrades.length > 0 ? (monthGrades.reduce((a, b) => a + b, 0) / monthGrades.length).toFixed(1) : '-';

                  return (
                    <tr key={student.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors print:hover:bg-transparent">
                      <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900/95 px-6 py-4 border-r border-zinc-200 dark:border-zinc-800 shadow-[4px_0_8px_rgba(0,0,0,0.02)] print:bg-white print:text-black print:border-black print:shadow-none">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-zinc-400 w-4 print:text-black">{idx + 1}.</span>
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate print:text-black">{student.name}</p>
                        </div>
                      </td>
                      {(daysInMonth || []).map(day => {
                        const status = getAttendanceStatus(student.id, day);
                        const grade = getGrade(student.id, day);
                        const note = getNote(student.id, day);
                        
                        return (
                          <td 
                            key={day.toISOString()} 
                            className={`p-1 border-r border-zinc-100 dark:border-zinc-800 text-center relative group/cell ${isToday(day) ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''} print:bg-white print:border-black`}
                          >
                            <div className="flex flex-col items-center justify-center min-h-[56px] gap-1">
                              {/* Attendance Indicator */}
                              {(viewMode === 'attendance' || viewMode === 'both') && (
                                <button 
                                  onClick={() => handleAttendanceToggle(student.id, day)}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                    status === 'present' ? 'bg-emerald-100 text-emerald-600 shadow-sm shadow-emerald-100' :
                                    status === 'absent' ? 'bg-rose-100 text-rose-600 shadow-sm shadow-rose-100' :
                                    status === 'late' ? 'bg-amber-100 text-amber-600 shadow-sm shadow-amber-100' :
                                    'bg-zinc-50 dark:bg-zinc-800 text-zinc-200 hover:bg-zinc-100'
                                  } print:bg-transparent print:text-black print:border print:border-black print:shadow-none`}
                                >
                                  {status === 'present' && <Check size={12} strokeWidth={4} />}
                                  {status === 'absent' && <X size={12} strokeWidth={4} />}
                                  {status === 'late' && <Clock size={12} strokeWidth={4} />}
                                  {!status && <div className="w-1 h-1 bg-zinc-300 rounded-full print:hidden" />}
                                </button>
                              )}

                              {/* Grade Indicator */}
                              {(viewMode === 'assessment' || viewMode === 'both') && (
                                <div className="relative">
                                  <input 
                                    type="text"
                                    value={grade || ''}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      if (isNaN(val)) handleGradeChange(student.id, day, 0);
                                      else if (val >= 1 && val <= 5) handleGradeChange(student.id, day, val);
                                    }}
                                    placeholder="-"
                                    className={`w-7 h-7 text-center text-xs font-black rounded-lg border focus:outline-none transition-all ${
                                      grade === 5 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                                      grade === 4 ? 'bg-blue-50 border-blue-200 text-blue-600' :
                                      grade === 3 ? 'bg-amber-50 border-amber-200 text-amber-600' :
                                      grade > 0 ? 'bg-rose-50 border-rose-200 text-rose-600' :
                                      'bg-transparent border-transparent text-zinc-400 hover:border-zinc-200'
                                    } print:bg-transparent print:text-black print:border-none`}
                                  />
                                </div>
                              )}

                              {/* Note Indicator */}
                              <button 
                                onClick={() => {
                                  setSelectedNote({ studentId: student.id, date: format(day, 'yyyy-MM-dd') });
                                  setNoteText(note);
                                }}
                                className={`absolute top-0 right-0 p-0.5 transition-opacity print:hidden ${note ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover/cell:opacity-100 text-zinc-300'}`}
                              >
                                <MessageSquare size={8} fill={note ? "currentColor" : "none"} />
                              </button>
                            </div>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-zinc-50 dark:bg-zinc-800/95 px-4 py-4 border-l border-zinc-200 dark:border-zinc-800 shadow-[-4px_0_8px_rgba(0,0,0,0.02)] print:bg-white print:text-black print:border-black print:shadow-none">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black ${attendancePercent > 80 ? 'text-emerald-600' : 'text-rose-600'} print:text-black`}>
                            {attendancePercent}%
                          </span>
                          <span className="text-xs font-black text-blue-600 print:text-black">
                            {avgGrade}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><Check size={10} strokeWidth={4} /></div>
          <span className="text-xs font-bold text-zinc-500">Kelgan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center text-rose-600"><X size={10} strokeWidth={4} /></div>
          <span className="text-xs font-bold text-zinc-500">Kelmagan</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><Clock size={10} strokeWidth={4} /></div>
          <span className="text-xs font-bold text-zinc-500">Kechikkan</span>
        </div>
        <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700" />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-[10px] font-black">5</div>
          <span className="text-xs font-bold text-zinc-500">A'lo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 text-[10px] font-black">4</div>
          <span className="text-xs font-bold text-zinc-500">Yaxshi</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 text-[10px] font-black">3</div>
          <span className="text-xs font-bold text-zinc-500">Qoniqarli</span>
        </div>
      </div>

      {/* Note Modal */}
      <AnimatePresence>
        {selectedNote && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="text-blue-600" size={20} />
                  Izoh qoldirish
                </h3>
                <button onClick={() => setSelectedNote(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
                {format(parseISO(selectedNote.date), 'd MMMM, yyyy', { locale: uz })}
              </p>
              <textarea 
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Dars yoki o'quvchi haqida izoh..."
                className="w-full h-32 p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
              />
              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setSelectedNote(null)}
                  className="flex-1 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl font-bold hover:bg-zinc-200 transition-all"
                >
                  Bekor qilish
                </button>
                <button 
                  onClick={handleSaveNote}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
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
