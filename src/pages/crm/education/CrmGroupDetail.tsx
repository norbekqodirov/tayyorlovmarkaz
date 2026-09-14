/**
 * CrmGroupDetail.tsx (Faza 0.3 — refactored)
 *
 * Orchestrator page: holds shared state, data fetching, and event handlers.
 * Rendering is delegated to sub-components in src/components/group-detail/.
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { Button } from '../../../components/ui/Button';
import { Tabs, TabsList, Tab } from '../../../components/ui/Tabs';
import ConfirmDialog from '../../../components/ConfirmDialog';

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
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ─── Data sources ───────────────────────────────────────────────────────────
  const [groupResult, setGroupResult] = useState<{ id?: string; data: any; state: 'loading' | 'ready' | 'forbidden' | 'missing' | 'error' }>({ data: null, state: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let active = true;
    setGroupResult({ id, data: null, state: 'loading' });
    if (!id) {
      setGroupResult({ id, data: null, state: 'missing' });
      return;
    }
    api.get(`/groups/${encodeURIComponent(id)}`).then(res => {
      if (active) setGroupResult({ id, data: res.data, state: res.data ? 'ready' : 'missing' });
    }).catch(error => {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (active) setGroupResult({ id, data: null, state: status === 401 || status === 403 ? 'forbidden' : status === 404 ? 'missing' : 'error' });
    });
    return () => { active = false; };
  }, [id, retryCount]);
  const { data: students = [], loading: studentsLoading, error: studentsError, refetch: refetchStudents } = useFirestore<any>('students');
  const { data: schedules = [], loading: schedulesLoading, error: schedulesError, refetch: refetchSchedules } = useFirestore<any>('schedule');
  const { data: assessmentDocs = [], addDocument: addAssess, updateDocument: updateAssess } = useFirestore<any>('assessment');
  const { data: examDocs = [], addDocument: addExam, updateDocument: updateExam } = useFirestore<any>('exams');
  const { data: groupExamDocs = [], addDocument: addGroupExam, deleteDocument: deleteGroupExam } = useFirestore<any>('groupExams');
  const { data: noteDocs = [], addDocument: addNote, updateDocument: updateNote } = useFirestore<any>('notes');

  // ─── UI State ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('Davomat');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);
  const [enrollmentsError, setEnrollmentsError] = useState(false);
  const enrollmentRequest = useRef(0);
  const additionBusy = useRef(false);
  const [addStudentSearch, setAddStudentSearch] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addingStudentId, setAddingStudentId] = useState<string | null>(null);
  const [studentToRemove, setStudentToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const removalBusy = useRef(false);

  const group = groupResult.id === id ? groupResult.data : null;
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
    const request = ++enrollmentRequest.current;
    setEnrollmentsLoading(true);
    try {
      const res = await api.get(`/enrollments/group/${id}`);
      if (request !== enrollmentRequest.current) return;
      setEnrolledStudents((res.data || []).map((e: any) => e.student || { id: e.studentId }));
      setEnrollmentsError(false);
    } catch {
      if (request === enrollmentRequest.current) setEnrollmentsError(true);
    } finally {
      if (request === enrollmentRequest.current) setEnrollmentsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setEnrolledStudents([]);
    setEnrollmentsError(false);
    setShowAddStudent(false);
    setStudentToRemove(null);
    void fetchEnrollments();
    return () => { enrollmentRequest.current++; };
  }, [fetchEnrollments]);

  // ─── Enrollment actions ─────────────────────────────────────────────────────
  const handleAddStudent = async (studentId: string) => {
    if (!canManage || additionBusy.current || removalBusy.current || enrollmentsLoading || enrollmentsError || studentsLoading || studentsError || !group) return;
    if (enrolledStudents.some(s => s.id === studentId)) {
      showToast("Bu o'quvchi allaqachon guruhga qo'shilgan", 'error');
      return;
    }
    if (enrolledStudents.length >= group.maxSize) {
      showToast("Guruhda bo'sh o'rin qolmagan", 'error');
      return;
    }
    additionBusy.current = true;
    const request = enrollmentRequest.current;
    setAddingStudentId(studentId);
    try {
      const res = await api.post('/enrollments', { studentId, groupId: id });
      if (request !== enrollmentRequest.current) return;
      const student = students.find(s => s.id === studentId);
      if (student) setEnrolledStudents(prev => prev.some(s => s.id === studentId) ? prev : [...prev, student]);
      showToast(res.data?.alreadyEnrolled ? "Bu o'quvchi allaqachon guruhga qo'shilgan" : "O'quvchi guruhga qo'shildi!", res.data?.alreadyEnrolled ? 'info' : 'success');
      await fetchEnrollments();
    } catch (err: any) {
      if (request !== enrollmentRequest.current) return;
      showToast(err?.response?.data?.message || 'Xatolik yuz berdi', 'error');
    } finally {
      additionBusy.current = false;
      setAddingStudentId(null);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!canManage || removalBusy.current || additionBusy.current || enrollmentsLoading || enrollmentsError) return;
    removalBusy.current = true;
    const request = enrollmentRequest.current;
    setRemovingStudentId(studentId);
    try {
      await api.delete('/enrollments/remove', { data: { studentId, groupId: id } });
      if (request !== enrollmentRequest.current) return;
      setStudentToRemove(null);
      setEnrolledStudents(prev => prev.filter(s => s.id !== studentId));
      await fetchEnrollments();
      showToast("O'quvchi guruhdan o'chirildi", 'success');
    } catch {
      if (request !== enrollmentRequest.current) return;
      showToast('Xatolik yuz berdi', 'error');
    } finally {
      removalBusy.current = false;
      setRemovingStudentId(null);
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

  // ─── Attendance (Reyting tabi uchun oylik xulosa) ──────────────────────────
  // Davomatning o'zi endi AttendanceTab ichida mustaqil boshqariladi
  // (/api/attendance-records — haqiqiy AttendanceRecord jadvali). Reyting
  // hisob-kitobi uchun shu yerda alohida, faqat o'qish uchun oylik olib
  // kelinadi.
  const [ratingAttendance, setRatingAttendance] = useState<any[]>([]);
  useEffect(() => {
    if (!group?.id) return;
    let active = true;
    api.get('/attendance-records/month', { params: { groupId: group.id, month: format(currentDate, 'yyyy-MM') } })
      .then(res => { if (active) setRatingAttendance(res.data || []); })
      .catch(() => { if (active) setRatingAttendance([]); });
    return () => { active = false; };
  }, [group?.id, currentDate]);

  // ─── Assessment (daily 1-5 grade) ───────────────────────────────────────────
  const handleAssessmentChange = async (studentId: string, dateStr: string, score: number) => {
    // AssessmentTab endi faqat 1-5 tugmalar orqali chaqiradi, lekin shu yerda
    // ham tekshiramiz — maxScore:5 har doim aniq yoziladi, aks holda eski
    // (0-100 shkalali) yozuvni yangilaganda maxScore eskicha (100) qolib,
    // keyinchalik GPA/o'rtacha hisob-kitoblarni buzishi mumkin edi.
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      showToast("Baho 1 dan 5 gacha bo'lishi kerak", 'error');
      return;
    }
    const existingDoc = assessmentDocs.find(
      (a: any) => a.studentId === studentId && a.groupId === group?.id && a.date === dateStr,
    );
    if (existingDoc) {
      await updateAssess(existingDoc.id, { score, maxScore: 5 });
    } else {
      await addAssess({ groupId: group?.id, studentId, date: dateStr, score, maxScore: 5 });
    }
  };

  // ─── Exam scores ────────────────────────────────────────────────────────────
  const handleExamChange = async (studentId: string, examName: string, score: number, maxScore = 100) => {
    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      showToast(`Ball 0 dan ${maxScore} gacha bo'lishi kerak`, 'error');
      return;
    }
    const existingDoc = examDocs.find(
      (a: any) => a.studentId === studentId && a.groupId === group?.id && a.examName === examName,
    );
    if (existingDoc) {
      await updateExam(existingDoc.id, { score });
    } else {
      await addExam({ groupId: group?.id, studentId, examName, score });
    }
  };

  // ─── Exam definitions (GroupExam) ───────────────────────────────────────────
  // Imtihon ustuni faqat shu yerda, aniq nom+sana bilan yaratilgandan keyingina
  // ExamTab'da paydo bo'ladi — avval "1-Imtihon (Oraliq)"/"Yakuniy Imtihon" kabi
  // qattiq kodlangan 3 ta ustun har doim ko'rsatilardi, guruhda haqiqatan
  // imtihon rejalashtirilgan-rejalashtirilmaganidan qat'i nazar.
  const handleCreateExam = async (data: { name: string; date: string; maxScore: number }) => {
    if (!group?.id) return;
    await addGroupExam({ groupId: group.id, name: data.name, date: data.date, maxScore: data.maxScore });
  };

  const handleDeleteExam = async (groupExamId: string) => {
    await deleteGroupExam(groupExamId);
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
    const state = groupResult.id === id ? groupResult.state : 'loading';
    const message = state === 'loading' ? 'Guruh yuklanmoqda…' : state === 'forbidden' ? 'Bu guruhni ko‘rish uchun ruxsat yo‘q' : state === 'missing' ? 'Guruh topilmadi' : 'Guruhni yuklashda server yoki tarmoq xatosi yuz berdi';
    return (
      <div className="p-6 sm:p-10 flex flex-col items-center gap-4 text-center">
        {state === 'loading' && <div aria-hidden="true" className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        <p role={state === 'loading' ? 'status' : 'alert'}>{message}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {state !== 'loading' && <Button onClick={() => setRetryCount(count => count + 1)}>Qayta urinish</Button>}
          <Button variant="secondary" onClick={() => navigate('/crmtayyorlovmarkaz/groups')}>Ro‘yxatga qaytish</Button>
        </div>
      </div>
    );
  }

  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const canManage = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 min-w-0 xl:h-[calc(100vh-100px)] xl:overflow-hidden">

      {/* Group information is available to all authorized roles. */}
        <GroupSidebar
          canManage={canManage}
          removingStudentId={removingStudentId}
          group={groupWithSchedule}
          groupStudents={enrolledStudents}
          enrollmentsLoading={enrollmentsLoading}
          enrollmentsError={enrollmentsError}
          onRetryEnrollments={fetchEnrollments}
          studentsLoading={studentsLoading}
          studentsError={!!studentsError}
          onRetryStudents={refetchStudents}
          schedulesLoading={schedulesLoading}
          schedulesError={!!schedulesError}
          onRetrySchedules={refetchSchedules}
          showAddStudent={showAddStudent}
          addStudentSearch={addStudentSearch}
          availableStudents={availableStudents}
          addingStudentId={addingStudentId}
          onExport={handleExport}
          onAddStudent={handleAddStudent}
          onRemoveStudent={studentId => {
            const student = enrolledStudents.find(s => s.id === studentId);
            if (canManage && student) setStudentToRemove({ id: studentId, name: student.name });
          }}
          onShowAddToggle={setShowAddStudent}
          onSearchChange={setAddStudentSearch}
        />
      <ConfirmDialog
        isOpen={!!studentToRemove}
        title="Guruhdan chiqarish"
        message={`${studentToRemove?.name || 'O‘quvchi'} ushbu guruhdan chiqarilsinmi?`}
        confirmText={removingStudentId ? 'Chiqarilmoqda…' : 'Ha, chiqarish'}
        onConfirm={() => { if (canManage && studentToRemove) void handleRemoveStudent(studentToRemove.id); }}
        onCancel={() => { if (!removalBusy.current) setStudentToRemove(null); }}
      />

      {/* Right Content — Tabs */}
      <div className="flex-1 min-w-0 h-[75dvh] xl:h-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex flex-col shadow-sm overflow-hidden">
        {/* Tab bar */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <TabsList>
            {TABS.map(tab => <Tab key={tab} value={tab}>{tab}</Tab>)}
          </TabsList>
        </Tabs>

        {/* Tab content */}
        <div className="flex-1 min-h-0 p-3 sm:p-6 overflow-hidden flex flex-col">
          {enrollmentsLoading ? <p role="status" className="p-6">Guruh o‘quvchilari yuklanmoqda...</p> : enrollmentsError ? <div role="alert" className="space-y-3 p-6"><p>Guruh o‘quvchilari yuklanmadi.</p><Button onClick={fetchEnrollments}>Qayta urinish</Button></div> : <>
          {activeTab === 'Davomat' && (
            <AttendanceTab
              group={groupWithSchedule}
              groupStudents={enrolledStudents}
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
              attendanceRecords={ratingAttendance}
              assessmentDocs={assessmentDocs}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
            />
          )}

          {activeTab === 'Imtihonlar' && (
            <ExamTab
              group={group}
              groupStudents={enrolledStudents}
              groupExams={groupExamDocs.filter((e: any) => e.groupId === group?.id)}
              examDocs={examDocs}
              onScoreChange={handleExamChange}
              onCreateExam={handleCreateExam}
              onDeleteExam={handleDeleteExam}
              canManage={canManage}
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
          </>}
        </div>
      </div>
    </div>
  );
}
