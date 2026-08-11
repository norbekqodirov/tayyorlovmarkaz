import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, XCircle, ChevronRight, ChevronLeft, Award, Loader2, AlertCircle } from 'lucide-react';
import api from '../api/client';
import { PhoneInput } from '../components/ui/PhoneInput';

interface QuizOption { id: string; text: string; order: number; }
interface QuizQuestion {
  id: string; text: string; type: 'single' | 'multiple' | 'text';
  points: number; options: QuizOption[];
}
interface Quiz {
  id: string; title: string; description?: string;
  duration: number; passingScore: number; maxScore: number;
  questions: QuizQuestion[];
}
interface AttemptResult {
  id: string; score: number; maxScore: number; passed: boolean;
  timeSpent: number; answers: { questionId: string; isCorrect: boolean; points: number }[];
}

type Stage = 'intro' | 'form' | 'quiz' | 'result';

export default function PublicQuiz() {
  const { slug } = useParams<{ slug: string }>();
  const [stage, setStage] = useState<Stage>('intro');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Quiz state
  const [attemptId, setAttemptId] = useState('');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!slug) return;
    api.get<{ data: Quiz }>(`/quiz/public/${slug}`)
      .then(r => setQuiz(r.data.data))
      .catch(e => setError(e.response?.data?.error || 'Test topilmadi'))
      .finally(() => setLoading(false));
  }, [slug]);

  const startQuiz = useCallback(async () => {
    if (!name.trim() || !phone.trim() || !quiz) return;
    setSubmitting(true);
    try {
      const r = await api.post<{ data: { attempt: { id: string } } }>(`/quiz/${quiz.id}/start`, {
        studentName: name, studentPhone: phone
      });
      setAttemptId(r.data.data.attempt.id);
      setTimeLeft(quiz!.duration * 60);
      setCurrentQ(0);
      setAnswers({});
      setTextAnswers({});
      setStage('quiz');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Testni boshlashda xatolik');
    } finally { setSubmitting(false); }
  }, [name, phone, quiz]);

  // Timer
  useEffect(() => {
    if (stage !== 'quiz') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          finishQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [stage]);

  const saveAnswer = async (qId: string, selected: string[], text?: string) => {
    await api.post(`/quiz/attempts/${attemptId}/answer`, {
      questionId: qId,
      selectedOptions: selected,
      textAnswer: text || null
    }).catch(() => {});
  };

  const handleSelect = (qId: string, optId: string, type: string) => {
    setAnswers(prev => {
      const current = prev[qId] || [];
      let next: string[];
      if (type === 'single') {
        next = [optId];
      } else {
        next = current.includes(optId) ? current.filter(id => id !== optId) : [...current, optId];
      }
      saveAnswer(qId, next);
      return { ...prev, [qId]: next };
    });
  };

  const finishQuiz = async () => {
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const r = await api.post<{ data: AttemptResult }>(`/quiz/attempts/${attemptId}/finish`, {});
      setResult(r.data.data);
      setStage('result');
    } catch { setError('Testni yakunlashda xatolik'); }
    finally { setSubmitting(false); }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
      <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
    </div>
  );

  if (error || !quiz) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-50">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-zinc-700">{error || 'Test topilmadi'}</h2>
        <p className="text-zinc-400 mt-1">URL ni tekshiring yoki admin bilan bog'laning</p>
      </div>
    </div>
  );

  const q = quiz.questions[currentQ];
  const progress = quiz.questions.length > 0 ? ((currentQ + 1) / quiz.questions.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <AnimatePresence mode="wait">

          {/* INTRO */}
          {stage === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-5">
                <Award className="w-8 h-8 text-violet-600" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-900 mb-2">{quiz.title}</h1>
              {quiz.description && <p className="text-zinc-500 mb-6">{quiz.description}</p>}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'Savollar', value: quiz.questions.length },
                  { label: 'Vaqt', value: `${quiz.duration} daq` },
                  { label: "O'tish bali", value: `${quiz.passingScore}%` },
                ].map(s => (
                  <div key={s.label} className="bg-violet-50 rounded-xl p-3">
                    <p className="text-lg font-bold text-violet-700">{s.value}</p>
                    <p className="text-xs text-violet-500">{s.label}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setStage('form')}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold transition-colors">
                Boshlash
              </button>
            </motion.div>
          )}

          {/* FORM */}
          {stage === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-xl font-bold text-zinc-900 mb-6 text-center">Ma'lumotlaringizni kiriting</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">Ism Familiya *</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Ismingizni kiriting..."
                    className="w-full px-4 py-3 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
                </div>
                <PhoneInput label="Telefon raqam *" value={phone} onChange={setPhone} />
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStage('intro')} className="flex-1 py-3 border border-zinc-200 text-zinc-600 rounded-xl font-medium hover:bg-zinc-50 transition-colors text-sm">
                  Orqaga
                </button>
                <button onClick={startQuiz} disabled={!name.trim() || !phone.trim() || submitting}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors text-sm flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Testni boshlash
                </button>
              </div>
            </motion.div>
          )}

          {/* QUIZ */}
          {stage === 'quiz' && q && (
            <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Progress bar */}
              <div className="h-1.5 bg-zinc-100">
                <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
                <span className="text-sm font-medium text-zinc-500">{currentQ + 1} / {quiz.questions.length}</span>
                <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${timeLeft < 60 ? 'text-red-500' : 'text-zinc-700'}`}>
                  <Clock className="w-4 h-4" />
                  {formatTime(timeLeft)}
                </div>
              </div>
              {/* Question */}
              <div className="p-6">
                <p className="text-lg font-semibold text-zinc-900 mb-1">{q.text}</p>
                <p className="text-xs text-zinc-400 mb-5">
                  {q.type === 'single' ? 'Bitta to\'g\'ri javobni tanlang' : q.type === 'multiple' ? 'Bir nechta to\'g\'ri javobni tanlang' : 'Javobingizni yozing'}
                  {' · '}{q.points} ball
                </p>

                {q.type === 'text' ? (
                  <textarea rows={4} value={textAnswers[q.id] || ''} onChange={e => {
                    setTextAnswers(p => ({ ...p, [q.id]: e.target.value }));
                    saveAnswer(q.id, [], e.target.value);
                  }} placeholder="Javobingizni yozing..."
                    className="w-full px-4 py-3 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none text-sm" />
                ) : (
                  <div className="space-y-2.5">
                    {q.options.map(opt => {
                      const selected = (answers[q.id] || []).includes(opt.id);
                      return (
                        <button key={opt.id} onClick={() => handleSelect(q.id, opt.id, q.type)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all text-sm font-medium ${
                            selected
                              ? 'border-violet-500 bg-violet-50 text-violet-700'
                              : 'border-zinc-200 hover:border-violet-300 hover:bg-violet-50/50 text-zinc-700'
                          }`}>
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selected ? 'border-violet-500 bg-violet-500' : 'border-zinc-300'
                          }`}>
                            {selected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                          </span>
                          {opt.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Navigation */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100">
                <button onClick={() => setCurrentQ(p => p - 1)} disabled={currentQ === 0}
                  className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-30 transition-colors font-medium">
                  <ChevronLeft className="w-4 h-4" /> Oldingi
                </button>
                {currentQ < quiz.questions.length - 1 ? (
                  <button onClick={() => setCurrentQ(p => p + 1)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                    Keyingi <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={finishQuiz} disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Yakunlash
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* RESULT */}
          {stage === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${result.passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {result.passed
                  ? <CheckCircle className="w-10 h-10 text-emerald-600" />
                  : <XCircle className="w-10 h-10 text-red-500" />}
              </div>
              <h2 className={`text-2xl font-bold mb-2 ${result.passed ? 'text-emerald-700' : 'text-red-600'}`}>
                {result.passed ? 'Tabriklaymiz! 🎉' : 'Afsuski...'}
              </h2>
              <p className="text-zinc-500 mb-8">
                {result.passed ? "Siz testdan muvaffaqiyatli o'tdingiz!" : "Siz testdan o'ta olmadingiz. Qaytadan urinib ko'ring!"}
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'Ball', value: `${result.score}/${result.maxScore}` },
                  { label: 'Foiz', value: `${result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0}%` },
                  { label: 'Vaqt', value: result.timeSpent ? `${Math.floor(result.timeSpent / 60)}:${String(result.timeSpent % 60).padStart(2, '0')}` : '—' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 ${result.passed ? 'bg-emerald-50' : 'bg-zinc-50'}`}>
                    <p className={`text-xl font-bold ${result.passed ? 'text-emerald-700' : 'text-zinc-700'}`}>{s.value}</p>
                    <p className="text-xs text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-zinc-500 mb-6">
                Natijangiz saqlandi. Tez orada siz bilan bog'lanamiz!
              </p>

              <button onClick={() => { setStage('intro'); setResult(null); setAttemptId(''); }}
                className="w-full py-3 border border-violet-200 text-violet-600 hover:bg-violet-50 rounded-xl font-medium transition-colors text-sm">
                Qaytadan urinish
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
