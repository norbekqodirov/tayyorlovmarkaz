import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Save, Search, Filter, ChevronRight, User, BookOpen, Layers } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

interface Student {
  id: string;
  name: string;
  group: string;
}

interface Group {
  id: string;
  name: string;
  teacher: string;
}

interface Assessment {
  id: string;
  studentId: string;
  groupId: string;
  score: number;
  comment: string;
  date: string;
}

export default function CrmAssessment() {
  const { data: students = [] } = useFirestore<Student>('students');
  const { data: groups = [] } = useFirestore<Group>('groups');
  const { data: assessments = [], addDocument, updateDocument } = useFirestore<Assessment>('assessments');
  
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [localAssessments, setLocalAssessments] = useState<Assessment[]>([]);

  useEffect(() => {
    setLocalAssessments(assessments || []);
  }, [assessments]);

  const filteredStudents = (students || []).filter(student => {
    const matchesGroup = selectedGroup ? student.group === selectedGroup : true;
    const matchesSearch = (student.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const handleGradeChange = (studentId: string, score: number) => {
    const today = new Date().toISOString().split('T')[0];
    const safeLocalAssessments = localAssessments || [];
    const existingIndex = safeLocalAssessments.findIndex(a => a.studentId === studentId && a.date === today && a.groupId === selectedGroup);

    if (existingIndex >= 0) {
      const newAssessments = [...safeLocalAssessments];
      newAssessments[existingIndex] = { ...newAssessments[existingIndex], score };
      setLocalAssessments(newAssessments);
    } else {
      const newAssessment: Assessment = {
        id: Math.random().toString(36).substr(2, 9),
        studentId,
        groupId: selectedGroup,
        score,
        comment: '',
        date: today
      };
      setLocalAssessments([...safeLocalAssessments, newAssessment]);
    }
  };

  const getScore = (studentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const assessment = (localAssessments || []).find(a => a.studentId === studentId && a.date === today && a.groupId === selectedGroup);
    return assessment?.score || 0;
  };

  const saveAssessments = async () => {
    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentGroupAssessments = (localAssessments || []).filter(a => a.date === today && a.groupId === selectedGroup);
      
      for (const assessment of currentGroupAssessments) {
        const existingInDb = (assessments || []).find(a => a.studentId === assessment.studentId && a.date === today && a.groupId === selectedGroup);
        if (existingInDb) {
          if (existingInDb.score !== assessment.score) {
            await updateDocument(existingInDb.id, { score: assessment.score });
          }
        } else {
          const { id, ...assessmentData } = assessment;
          await addDocument(assessmentData);
        }
      }
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving assessments:", error);
      alert("Baholarni saqlashda xatolik yuz berdi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">BAHOLASH TIZIMI</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">O'quvchilar bilimini nazorat qilish va baholash</p>
        </div>
        <button
          onClick={saveAssessments}
          disabled={isSaving || !selectedGroup}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-none"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={20} />
          )}
          Saqlash
        </button>
      </div>

      {showSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold text-center border border-emerald-100 dark:border-emerald-800"
        >
          Baholar muvaffaqiyatli saqlandi!
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Filter size={18} />
              Filtrlar
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Guruhni tanlang</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                >
                  <option value="">Barcha guruhlar</option>
                  {(groups || []).map(group => (
                    <option key={group.id} value={group.name}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Qidiruv</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="text"
                    placeholder="O'quvchi ismi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-200 dark:shadow-none">
            <BookOpen className="mb-4" size={32} />
            <h3 className="font-bold text-lg mb-2">Baholash tartibi</h3>
            <p className="text-blue-100 text-sm leading-relaxed">
              O'quvchilarni 1 dan 5 gacha bo'lgan shkala bo'yicha baholang. Baholar har kuni yangilanib boriladi.
            </p>
          </div>
        </div>

        {/* Students List */}
        <div className="lg:col-span-3">
          {!selectedGroup ? (
            <div className="bg-white dark:bg-zinc-900 p-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layers className="text-zinc-400" size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Guruh tanlanmagan</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Baholashni boshlash uchun chap tomondan guruhni tanlang</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User size={18} />
                  O'quvchilar ro'yxati ({filteredStudents.length})
                </h3>
                <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold">
                  {selectedGroup}
                </span>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredStudents.length === 0 ? (
                  <div className="p-12 text-center text-zinc-500">
                    Ushbu guruhda o'quvchilar topilmadi
                  </div>
                ) : (
                  filteredStudents.map((student) => (
                    <div key={student.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-bold">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white">{student.name}</h4>
                          <p className="text-xs text-zinc-500">{student.group}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleGradeChange(student.id, star)}
                            className={`p-2 rounded-lg transition-all ${
                              getScore(student.id) >= star
                                ? "text-amber-400 bg-amber-50 dark:bg-amber-900/20"
                                : "text-zinc-300 hover:text-amber-200"
                            }`}
                          >
                            <Star size={24} fill={getScore(student.id) >= star ? "currentColor" : "none"} />
                          </button>
                        ))}
                        <span className="ml-4 w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-sm">
                          {getScore(student.id)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
