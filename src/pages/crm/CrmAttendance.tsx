import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Search, Calendar as CalendarIcon, Users, ChevronLeft, ChevronRight, Save, Filter, AlertCircle, Clock, Download } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useToast } from '../../components/Toast';
import { exportToExcel } from '../../utils/export';

interface Student {
  id: string;
  name: string;
  phone: string;
}

interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent' | 'late';
  note?: string;
}

interface GroupAttendance {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  records: AttendanceRecord[];
}

export default function CrmAttendance() {
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [] } = useFirestore<Student>('students');
  const { data: allAttendance = [], addDocument, updateDocument } = useFirestore<GroupAttendance>('attendance');

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroup]);

  const groupStudents = useMemo(() => {
    const group = groups.find(g => g.id === selectedGroup);
    if (!group || !group.students) return [];
    return students.filter(s => group.students.includes(s.id));
  }, [selectedGroup, groups, students]);

  useEffect(() => {
    if (!selectedGroup || !selectedDate) return;

    const existingRecord = allAttendance.find((a: GroupAttendance) => 
      a.groupId === selectedGroup && a.date === selectedDate
    );

    if (existingRecord) {
      setAttendance(existingRecord.records);
      setIsSaved(true);
    } else {
      setAttendance(groupStudents.map(s => ({ studentId: s.id, status: 'present', note: '' })));
      setIsSaved(false);
    }
  }, [selectedGroup, selectedDate, groupStudents, allAttendance]);

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late') => {
    setAttendance(prev => prev.map(r => r.studentId === studentId ? { ...r, status } : r));
    setIsSaved(false);
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setAttendance(prev => prev.map(r => r.studentId === studentId ? { ...r, note } : r));
    setIsSaved(false);
  };

  const saveAttendance = async () => {
    const existingRecord = allAttendance.find((a: GroupAttendance) => 
      a.groupId === selectedGroup && a.date === selectedDate
    );

    const newRecordData = {
      groupId: selectedGroup,
      groupName: groups.find(g => g.id === selectedGroup)?.name || '',
      date: selectedDate,
      records: attendance
    };

    try {
      if (existingRecord) {
        await updateDocument(existingRecord.id, newRecordData);
      } else {
        await addDocument(newRecordData);
      }
      setIsSaved(true);
      alert('Davomat muvaffaqiyatli saqlandi!');
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Davomatni saqlashda xatolik yuz berdi.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Davomat Jurnali</h1>
          <p className="text-zinc-500 text-sm font-medium">O'quvchilarning darslardagi ishtirokini nazorat qilish</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 shadow-sm">
            <CalendarIcon size={16} className="text-zinc-400" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold focus:outline-none dark:text-white"
            />
          </div>
          <button 
            onClick={saveAttendance}
            disabled={isSaved}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg ${
              isSaved 
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed shadow-none' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            <Save size={20} />
            Saqlash
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">Guruhni Tanlang</h3>
            <div className="space-y-2">
              {(groups || []).map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedGroup === group.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="truncate">{group.name}</span>
                  <ChevronRight size={16} className={selectedGroup === group.id ? 'opacity-100' : 'opacity-0'} />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">Statistika</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500">Kelganlar</span>
                <span className="text-sm font-black text-emerald-600">{attendance.filter(r => r.status === 'present').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500">Kelmaganlar</span>
                <span className="text-sm font-black text-rose-600">{attendance.filter(r => r.status === 'absent').length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500">Kechikkanlar</span>
                <span className="text-sm font-black text-amber-600">{attendance.filter(r => r.status === 'late').length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {groups.find(g => g.id === selectedGroup)?.name || 'Guruh'} - {selectedDate}
              </h3>
              {!isSaved && (
                <div className="flex items-center gap-2 text-amber-600 text-xs font-bold">
                  <AlertCircle size={14} />
                  Saqlanmagan o'zgarishlar mavjud
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Keldi</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Kechikdi</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Kelmidi</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Eslatma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(groupStudents || []).map((student) => {
                    const record = attendance.find(r => r.studentId === student.id);
                    return (
                      <tr key={student.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-500">
                              {(student.name || '?').charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{student.name}</p>
                              <p className="text-[10px] text-zinc-500 font-medium">{student.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleStatusChange(student.id, 'present')}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all ${
                              record?.status === 'present'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-400'
                            }`}
                          >
                            <Check size={20} strokeWidth={3} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleStatusChange(student.id, 'late')}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all ${
                              record?.status === 'late'
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-400'
                            }`}
                          >
                            <Clock size={20} strokeWidth={3} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleStatusChange(student.id, 'absent')}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto transition-all ${
                              record?.status === 'absent'
                                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600'
                                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-400'
                            }`}
                          >
                            <X size={20} strokeWidth={3} />
                          </button>
                        </td>
                        <td className="px-6 py-4">
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
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-zinc-400">
                          <Users size={40} strokeWidth={1} />
                          <p className="text-sm font-bold">Ushbu guruhda o'quvchilar yo'q</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
