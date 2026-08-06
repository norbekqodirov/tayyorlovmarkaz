/**
 * CrmGroupDetail.tsx (Faza 0.3 — refactored)
 *
 * Orchestrator page: holds shared state, data fetching, and event handlers.
 * Rendering is delegated to sub-components in src/components/group-detail/.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { useFirestore } from '../../../hooks/useFirestore';
import { exportToExcel } from '../../../utils/export';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';

import GroupSidebar from '../../../components/group-detail/GroupSidebar';
import AttendanceTab from '../../../components/group-detail/AttendanceTab';
import AssessmentTab from '../../../components/group-detail/AssessmentTab';
import RatingTab from '../../../components/group-detail/RatingTab';
import ExamTab from '../../../components/group-detail/ExamTab';
import NotesTab from '../../../components/group-detail/NotesTab';

const TABS = ['Davomat', 'Baholash', 'Reyting', 'Imtihonlar', 'Izoh'];

export default function CrmGroupDetail() {
  const { id } = useParams();
  const { showToast } = useToast();

  // ─── Data sources ───────────────────────────────────────────────────────────
  const { data: groups = [] } = useFirestore<any>('groups');
  const { data: students = [] } = useFirestore<any>('students');
  const { data: schedules = [] } = useFirestore<any>('schedule');
  const { data: attendanceDocs = [], addDocument: addAtt, updateDocument: updateAtt } = useFirestore<any>('attendance');
  const { data: assessmentDocs = [], addDocument: addAssess, updateDocument: updateAssess } = useFirestore<any>('assessment');
  const { data: examDocs = [], addDocument: addExam, updateDocument: updateExam } = useFirestore<any>('exams');
  const { data: noteDocs = [], addDocument: addNote, updateDocument: updateNote } = useFirestore<any>('notes');

  // ─── UI State ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('Davomat');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [addStudentSearch, setAddStudentSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addingStudentId, setAddingStudentId] = useState<string | null>(null);

  const group = useMemo(() => groups.find((g: any) => g.id === id) || null, [groups, id]);
  // Vaqt/kunlar/xona Group modelida emas, alohida GroupSchedule ("schedule"
  // kolleksiyasi) da saqlanadi — shu yozuvni topib group bilan birlashtiramiz,
  // shunda AttendanceTab/AssessmentTab/GroupSidebar haqiqiy dars kunlarini
  // ko'radi (avval group.days doim undefined bo'lgani uchun "yakshanbadan
  // boshqa har kuni" degan noto'g'ri standart holatga tushib qolardi).
  const groupSchedule = useMemo(() => schedules.find((s: any) => s.groupId === id) || null, [schedules, id]);
  const groupWithSchedule = useMemo(() => {
    if (!group) return null;
    // GroupSchedule.days raqam sifatida saqlanadi (1=Dush...7=Yak, CrmGroups.tsx
    // DAY_MAP bilan bir xil), lekin Attendance/Assessment tab'lari o'zbekcha
    // qisqartma kod kutadi ('Dush','Sesh',...) — shu yerda mos ravishda o'giramiz.
    const NUM_TO_DAY: Record<number, string> = { 1: 'Dush', 2: 'Sesh', 3: 'Chor', 4: 'Pay', 5: 'Jum', 6: 'Shan', 7: 'Yak' };
    const days = Array.isArray(groupSchedule?.days) ? groupSchedule.days.map((n: number) => NUM_TO_DAY[n]).filter(Boolean) : [];
    return {
      ...group,
      days,
      time: groupSchedule ? `${groupSchedule.startTime} - ${groupSchedule.endTime}` : '',
      room: groupSchedule?.room || group.room,
    };
  }, [group, groupSchedule]);

  // ─── Fetch enrolled students ────────────────────────────────────────────────
  // Enrollment — Group.students kabi maydon sxemada yo'q (haqiqiy ro'yxatga
  // olish faqat Enrollment jadvali orqali). Xato bo'lsa bo'sh ro'yxat ko'rsatib,
  // sababini toast bilan aytamiz — jimgina "hech kim yo'q" deb ko'rsatmaymiz.
  const fetchEnrollments = useCallback(async () => {
    if (!id) return;
    setEnrollmentsLoading(true);
    try {
      const res = await api.get(`/enrollments/group/${id}`);
      setEnrolledStudents((res.data || []).map((e: any) => e.student || { id: e.studentId }));
    } catch {
      setEnrolledStudents([]);
      showToast("O'quvchilar ro'yxatini yuklashda xatolik yuz berdi", 'error');
    } finally {
      setEnrollmentsLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  // ─── Enrollment actions ─────────────────────────────────────────────────────
  const handleAddStudent = async (studentId: string) => {
    setAddingStudentId(studentId);
    try {
      await api.post('/enrollments', { studentId, groupId: id });
      await fetchEnrollments();
      showToast("O'quvchi guruhga qo'shildi!", 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Xatolik yuz berdi', 'error');
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
      showToast('Xatolik yuz berdi', 'error');
    }
  };

  const availableStudents = useMemo(() => {
    const enrolledIds = new Set(enrolledStudents.map((s: any) => s.id));
    return students.filter((s: any) =>
      !enrolledIds.has(s.id) &&
      (!addStudentSearch ||
        s.name?.toLowerCase().includes(addStudentSearch.toLowerCase()) ||
        s.phone?.includes(addStudentSearch))
    );
  }, [students, enrolledStudents, addStudentSearch]);

  // ─── Attendance ─────────────────────────────────────────────────────────────
  const handleAttendanceClick = async (studentId: string, dateStr: string, currentStatus: string | undefined) => {
    const statusCycle: Record<string, string | null> = {
      undefined: 'present', present: 'absent', absent: 'late', late: null,
    };
    const nextStatus = statusCycle[String(currentStatus)];
    const existingDoc = attendanceDocs.find((a: any) => a.groupId === group?.id && a.date === dateStr);

    if (existingDoc) {
      const records = [...(existingDoc.records || [])];
      const idx = records.findIndex((r: any) => r.studentId === studentId);
      if (idx > -1) {
        if (nextStatus) records[idx].status = nextStatus;
        else records.splice(idx, 1);
      } else if (nextStatus) {
        records.push({ studentId, status: nextStatus, time: new Date().toISOString() });
      }
      await updateAtt(existingDoc.id, { records });
    } else if (nextStatus) {
      await addAtt({
        groupId: group?.id,
        date: dateStr,
        records: [{ studentId, status: nextStatus, time: new Date().toISOString() }],
      });
    }
  };

  // ─── Assessment (daily score) ───────────────────────────────────────────────
  const handleAssessmentChange = async (studentId: string, dateStr: string, score: number) => {
    const existingDoc = assessmentDocs.find(
      (a: any) => a.studentId === studentId && a.groupId === group?.id && a.date === dateStr,
    );
    if (existingDoc) {
      if (score > 0) await updateAssess(existingDoc.id, { score });
    } else if (score > 0) {
      await addAssess({ groupId: group?.id, studentId, date: dateStr, score });
    }
  };

  // ─── Exam scores ────────────────────────────────────────────────────────────
  const handleExamChange = async (studentId: string, examName: string, score: number) => {
    const existingDoc = examDocs.find(
      (a: any) => a.studentId === studentId && a.groupId === group?.id && a.examName === examName,
    );
    if (existingDoc) {
      if (score > 0) await updateExam(existingDoc.id, { score });
    } else if (score > 0) {
      await addExam({ groupId: group?.id, studentId, examName, score });
    }
  };

  // ─── Teacher notes ──────────────────────────────────────────────────────────
  const handleNoteChange = async (studentId: string, note: string) => {
    const existingDoc = noteDocs.find((n: any) => n.studentId === studentId && n.groupId === group?.id);
    if (existingDoc) {
      await updateNote(existingDoc.id, { note });
    } else {
      await addNote({ groupId: group?.id, studentId, note });
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportToExcel(
      enrolledStudents,
      [
        { header: 'F.I.SH', key: 'name', width: 25 },
        { header: 'Telefon', key: 'phone', width: 20 },
        { header: 'Holat', key: 'status', width: 15 },
      ],
      `${group?.name || 'Guruh'} - o'quvchilar`,
    );
  };

  // ─── Guard ──────────────────────────────────────────────────────────────────
  if (!group) {
    return (
      <div className="p-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const isTeacher = user.role === 'TEACHER';

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-[calc(100vh-100px)] overflow-hidden">

      {/* Left Sidebar — admin/manager only */}
      {!isTeacher && (
        <GroupSidebar
          group={groupWithSchedule}
          groupStudents={enrolledStudents}
          enrollmentsLoading={enrollmentsLoading}
          showAddStudent={showAddStudent}
          addStudentSearch={addStudentSearch}
          availableStudents={availableStudents}
          addingStudentId={addingStudentId}
          onExport={handleExport}
          onAddStudent={handleAddStudent}
          onRemoveStudent={handleRemoveStudent}
          onShowAddToggle={setShowAddStudent}
          onSearchChange={setAddStudentSearch}
        />
      )}

      {/* Right Content — Tabs */}
      <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto hide-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-zinc-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {activeTab === 'Davomat' && (
            <AttendanceTab
              group={groupWithSchedule}
              groupStudents={enrolledStudents}
              attendanceDocs={attendanceDocs}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onCellClick={handleAttendanceClick}
            />
          )}

          {activeTab === 'Baholash' && (
            <AssessmentTab
              group={groupWithSchedule}
              groupStudents={enrolledStudents}
              assessmentDocs={assessmentDocs}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              onScoreChange={handleAssessmentChange}
            />
          )}

          {activeTab === 'Reyting' && (
            <RatingTab
              group={group}
              groupStudents={enrolledStudents}
              attendanceDocs={attendanceDocs}
              assessmentDocs={assessmentDocs}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
            />
          )}

          {activeTab === 'Imtihonlar' && (
            <ExamTab
              group={group}
              groupStudents={enrolledStudents}
              examDocs={examDocs}
              onScoreChange={handleExamChange}
            />
          )}

          {activeTab === 'Izoh' && (
            <NotesTab
              group={group}
              groupStudents={enrolledStudents}
              noteDocs={noteDocs}
              onNoteChange={handleNoteChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
