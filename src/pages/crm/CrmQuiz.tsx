import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Edit2, Eye, Copy, CheckCircle, X, Loader2,
  ClipboardList, Users, Clock, Award, ChevronDown, ChevronUp,
  BarChart2, Globe, Lock, Play, Save, AlertCircle
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

interface QuizOption { id?: string; text: string; isCorrect: boolean; order?: number; }
interface QuizQuestion {
  id?: string; text: string; type: 'single' | 'multiple' | 'text';
  order?: number; points: number; imageUrl?: string; options: QuizOption[];
}
interface Quiz {
  id: string; title: string; description?: string;
  courseId?: string; groupId?: string;
  duration: number; maxScore: number; passingScore: number;
  isPublic: boolean; publicSlug?: string; status: string;
  createdAt: string;
  _count?: { questions: number; attempts: number };
  questions?: QuizQuestion[];
}

const emptyQuestion = (): QuizQuestion => ({
  text: '', type: 'single', points: 1, options: [
    { text: '', isCorrect: true }, { text: '', isCorrect: false },
    { text: '', isCorrect: false }, { text: '', isCorrect: false },
  ]
});

export default function CrmQuiz() {
  const { showToast } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'builder' | 'results'>('list');
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  // Builder state
  const [quizForm, setQuizForm] = useState({
    title: '', description: '', duration: 30, passingScore: 60,
    isPublic: false, publicSlug: '', status: 'draft'
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number>(0);

  // Results state
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Quiz[] }>('/quiz');
      setQuizzes(r.data.data ?? []);
    } catch { showToast('Testlarni yuklab bo\'lmadi', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);

  const openBuilder = (quiz?: Quiz) => {
    if (quiz) {
      setEditingQuiz(quiz);
      setQuizForm({
        title: quiz.title, description: quiz.description || '',
        duration: quiz.duration, passingScore: quiz.passingScore,
        isPublic: quiz.isPublic, publicSlug: quiz.publicSlug || '', status: quiz.status
      });
      setQuestions(quiz.questions?.length ? quiz.questions.map(q => ({ ...q, options: q.options || [] })) : [emptyQuestion()]);
    } else {
      setEditingQuiz(null);
      setQuizForm({ title: '', description: '', duration: 30, passingScore: 60, isPublic: false, publicSlug: '', status: 'draft' });
      setQuestions([emptyQuestion()]);
    }
    setExpandedQ(0);
    setActiveTab('builder');
  };

  const handleSaveQuiz = async () => {
    if (!quizForm.title.trim()) { showToast('Sarlavha kiritilishi shart', 'error'); return; }
    if (questions.some(q => !q.text.trim())) { showToast('Barcha savol matnlarini to\'ldiring', 'error'); return; }

    setSaving(true);
    try {
      let quizId: string;

      if (editingQuiz) {
        await api.put(`/quiz/${editingQuiz.id}`, quizForm);
        quizId = editingQuiz.id;
      } else {
        const r = await api.post<{ data: Quiz }>('/quiz', quizForm);
        quizId = r.data.data.id;
      }

      // Save questions
      for (const [i, q] of questions.entries()) {
        const payload = { ...q, order: i };
        if (q.id) {
          await api.put(`/quiz/${quizId}/questions/${q.id}`, payload);
        } else {
          await api.post(`/quiz/${quizId}/questions`, payload);
        }
      }

      showToast('Test saqlandi!', 'success');
      fetchQuizzes();
      setActiveTab('list');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Saqlashda xatolik', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/quiz/${deleteConfirm.id}`);
      showToast("Test o'chirildi", 'success');
      setDeleteConfirm({ open: false, id: '' });
      fetchQuizzes();
    } catch { showToast("O'chirishda xatolik", 'error'); }
  };

  const fetchAttempts = async (quizId: string) => {
    setSelectedQuizId(quizId);
    setAttemptsLoading(true);
    try {
      const r = await api.get<{ data: any[] }>(`/quiz/${quizId}/attempts`);
      setAttempts(r.data.data ?? []);
    } catch { showToast('Natijalarni yuklab bo\'lmadi', 'error'); }
    finally { setAttemptsLoading(false); }
    setActiveTab('results');
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, emptyQuestion()]);
    setExpandedQ(questions.length);
  };

  const removeQuestion = (i: number) => {
    setQuestions(prev => prev.filter((_, idx) => idx !== i));
    setExpandedQ(Math.max(0, i - 1));
  };

  const updateQuestion = (i: number, patch: Partial<QuizQuestion>) => {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  };

  const updateOption = (qi: number, oi: number, patch: Partial<QuizOption>) => {
    setQuestions(prev => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const opts = q.options.map((o, oidx) => {
        if (oidx !== oi) return o;
        return { ...o, ...patch };
      });
      // Single choice: uncheck others when one is checked
      if (patch.isCorrect && q.type === 'single') {
        return { ...q, options: opts.map((o, oidx) => ({ ...o, isCorrect: oidx === oi })) };
      }
      return { ...q, options: opts };
    }));
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
      active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
    const labels: Record<string, string> = { draft: 'Qoralama', active: 'Faol', archived: 'Arxiv' };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[s] || map.draft}`}>{labels[s] || s}</span>;
  };

  const tabs = [
    { id: 'list', label: 'Testlar', icon: ClipboardList },
    { id: 'builder', label: editingQuiz ? 'Tahrirlash' : 'Yangi test', icon: Plus },
    { id: 'results', label: 'Natijalar', icon: BarChart2 },
  ] as const;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10">
            <ClipboardList className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Test Tizimi</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Online testlar yaratish va boshqarish</p>
          </div>
        </div>
        <button onClick={() => openBuilder()}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Yangi test
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* LIST TAB */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
              ) : quizzes.length === 0 ? (
                <div className="text-center py-16 text-zinc-400">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Hali testlar yo'q</p>
                  <p className="text-sm mt-1">Yangi test yarating</p>
                </div>
              ) : quizzes.map(quiz => (
                <div key={quiz.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{quiz.title}</h3>
                      {statusBadge(quiz.status)}
                      {quiz.isPublic && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <Globe className="w-3 h-3" />Ommaviy
                        </span>
                      )}
                    </div>
                    {quiz.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{quiz.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" />{quiz._count?.questions ?? 0} savol</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{quiz._count?.attempts ?? 0} urinish</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.duration} daq</span>
                      <span className="flex items-center gap-1"><Award className="w-3 h-3" />O'tish: {quiz.passingScore}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => fetchAttempts(quiz.id)}
                      className="p-2 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors" title="Natijalar">
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    {quiz.isPublic && quiz.publicSlug && (
                      <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/test/${quiz.publicSlug}`); showToast('Link nusxalandi!', 'success'); }}
                        className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Linkni nusxalash">
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => openBuilder(quiz)}
                      className="p-2 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm({ open: true, id: quiz.id })}
                      className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BUILDER TAB */}
          {activeTab === 'builder' && (
            <div className="space-y-5">
              {/* Quiz meta */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Test ma'lumotlari</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Sarlavha *</label>
                    <input type="text" value={quizForm.title} onChange={e => setQuizForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="Test sarlavhasi..."
                      className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Tavsif</label>
                    <textarea rows={2} value={quizForm.description} onChange={e => setQuizForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Test haqida qisqacha..."
                      className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Vaqt (daqiqa)</label>
                    <input type="number" min={5} max={180} value={quizForm.duration} onChange={e => setQuizForm(p => ({ ...p, duration: +e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">O'tish bali (%)</label>
                    <input type="number" min={0} max={100} value={quizForm.passingScore} onChange={e => setQuizForm(p => ({ ...p, passingScore: +e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Holat</label>
                    <select value={quizForm.status} onChange={e => setQuizForm(p => ({ ...p, status: e.target.value }))}
                      className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="draft">Qoralama</option>
                      <option value="active">Faol</option>
                      <option value="archived">Arxiv</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer mt-5">
                      <input type="checkbox" className="sr-only peer" checked={quizForm.isPublic} onChange={e => setQuizForm(p => ({ ...p, isPublic: e.target.checked }))} />
                      <div className="w-10 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                      <span className="ml-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Ommaviy (lid uchun)</span>
                    </label>
                  </div>
                  {quizForm.isPublic && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Ommaviy slug</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-400">/test/</span>
                        <input type="text" value={quizForm.publicSlug} onChange={e => setQuizForm(p => ({ ...p, publicSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                          placeholder="matematika-test-1"
                          className="flex-1 px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Questions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{questions.length} ta savol</h3>
                  <button onClick={addQuestion}
                    className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 font-medium">
                    <Plus className="w-4 h-4" /> Savol qo'shish
                  </button>
                </div>

                {questions.map((q, qi) => (
                  <div key={qi} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    {/* Question header */}
                    <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpandedQ(expandedQ === qi ? -1 : qi)}>
                      <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-400">{qi + 1}</span>
                      </div>
                      <span className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {q.text || <span className="text-zinc-400 italic">Savol matni...</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">{q.points} ball</span>
                        {questions.length > 1 && (
                          <button onClick={e => { e.stopPropagation(); removeQuestion(qi); }}
                            className="p-1 text-zinc-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {expandedQ === qi ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                      </div>
                    </div>

                    {/* Question body */}
                    {expandedQ === qi && (
                      <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                        <textarea rows={2} value={q.text} onChange={e => updateQuestion(qi, { text: e.target.value })}
                          placeholder="Savol matni..."
                          className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />

                        <div className="flex items-center gap-3">
                          <select value={q.type} onChange={e => updateQuestion(qi, { type: e.target.value as any })}
                            className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500">
                            <option value="single">Bitta to'g'ri</option>
                            <option value="multiple">Bir nechta to'g'ri</option>
                            <option value="text">Matnli javob</option>
                          </select>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Ball:</span>
                            <input type="number" min={1} max={10} value={q.points} onChange={e => updateQuestion(qi, { points: +e.target.value })}
                              className="w-16 px-2 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 text-center" />
                          </div>
                        </div>

                        {q.type !== 'text' && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Variantlar (✓ to'g'ri javobni belgilang)</p>
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <button onClick={() => updateOption(qi, oi, { isCorrect: !opt.isCorrect })}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                    opt.isCorrect ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                                  }`}>
                                  {opt.isCorrect && <CheckCircle className="w-3 h-3 text-white" />}
                                </button>
                                <input type="text" value={opt.text} onChange={e => updateOption(qi, oi, { text: e.target.value })}
                                  placeholder={`Variant ${oi + 1}...`}
                                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                                {q.options.length > 2 && (
                                  <button onClick={() => updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })}
                                    className="text-zinc-300 hover:text-red-500 transition-colors">
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {q.options.length < 6 && (
                              <button onClick={() => updateQuestion(qi, { options: [...q.options, { text: '', isCorrect: false }] })}
                                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 mt-1">
                                <Plus className="w-3 h-3" /> Variant qo'shish
                              </button>
                            )}
                          </div>
                        )}
                        {q.type === 'text' && (
                          <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-sm text-zinc-500">
                            <AlertCircle className="w-4 h-4 inline mr-1.5" />
                            Matnli javoblar qo'lda tekshiriladi
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Save buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleSaveQuiz} disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Saqlash
                </button>
                <button onClick={() => setActiveTab('list')}
                  className="px-5 py-2.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Bekor qilish
                </button>
              </div>
            </div>
          )}

          {/* RESULTS TAB */}
          {activeTab === 'results' && (
            <div className="space-y-4">
              {/* Quiz selector */}
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                <select value={selectedQuizId} onChange={e => { if (e.target.value) fetchAttempts(e.target.value); }}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">Test tanlang...</option>
                  {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                </select>
              </div>

              {attemptsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
              ) : attempts.length === 0 ? (
                <div className="text-center py-16 text-zinc-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>Hali urinishlar yo'q</p>
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Jami urinish', value: attempts.length },
                      { label: "O'tdi", value: attempts.filter(a => a.passed).length },
                      { label: "O'tmadi", value: attempts.filter(a => !a.passed && a.finishedAt).length },
                      { label: "O'rtacha ball", value: attempts.filter(a => a.finishedAt).length > 0
                        ? (attempts.filter(a => a.finishedAt).reduce((s, a) => s + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0), 0) / attempts.filter(a => a.finishedAt).length).toFixed(0) + '%'
                        : '—'
                      },
                    ].map(s => (
                      <div key={s.label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                        <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Table */}
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-zinc-100 dark:border-zinc-800">
                        <tr className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                          <th className="px-5 py-3">O'quvchi</th>
                          <th className="px-5 py-3">Ball</th>
                          <th className="px-5 py-3">Natija</th>
                          <th className="px-5 py-3">Vaqt</th>
                          <th className="px-5 py-3">Sana</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                        {attempts.map(a => {
                          const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
                          return (
                            <tr key={a.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                              <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                {a.studentName || a.studentId || 'Anonim'}
                                {a.studentPhone && <span className="text-xs text-zinc-400 block">{a.studentPhone}</span>}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                                  {a.score}/{a.maxScore} ({pct}%)
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                {!a.finishedAt ? (
                                  <span className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 px-2 py-0.5 rounded-full">Davom etmoqda</span>
                                ) : a.passed ? (
                                  <span className="text-xs bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">✓ O'tdi</span>
                                ) : (
                                  <span className="text-xs bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 rounded-full">✗ O'tmadi</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-zinc-500">
                                {a.timeSpent ? `${Math.floor(a.timeSpent / 60)}:${String(a.timeSpent % 60).padStart(2, '0')}` : '—'}
                              </td>
                              <td className="px-5 py-3 text-zinc-500">
                                {new Date(a.startedAt).toLocaleDateString('uz-UZ')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Testni o'chirish"
        message="Bu testni o'chirishni tasdiqlaysizmi? Barcha natijalar ham o'chadi."
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
    </div>
  );
}
