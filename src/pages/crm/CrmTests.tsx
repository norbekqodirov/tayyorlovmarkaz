import { useState, useEffect } from 'react';
import { FileText, Plus, Edit3, Trash2, BarChart3, Eye, CheckCircle2, Clock, Users, Send, X, Play } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import DataTable, { DataTableColumn } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useFirestore } from '../../hooks/useFirestore';

interface Test {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  groupId: string | null;
  duration: number;
  totalScore: number;
  passingScore: number;
  status: 'draft' | 'published' | 'closed';
  createdAt: string;
  _count?: { questions: number; submissions: number };
  course?: { name: string } | null;
  group?: { name: string } | null;
}

interface Question {
  id: string;
  testId: string;
  order: number;
  type: 'single_choice' | 'multi_choice' | 'true_false' | 'short_answer' | 'long_answer' | 'fill_blank';
  text: string;
  options: string;
  correctAnswer: string | null;
  score: number;
  imageUrl?: string;
  explanation?: string;
}

const QUESTION_TYPE_LABEL = {
  single_choice: 'Bitta to\'g\'ri javob',
  multi_choice: 'Bir nechta javob',
  true_false: 'To\'g\'ri/Noto\'g\'ri',
  short_answer: 'Qisqa javob',
  long_answer: 'Yozma javob',
  fill_blank: 'Bo\'sh joyni to\'ldirish',
};

export default function CrmTests() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { showToast } = useToast();

  const { data: courses = [] } = useFirestore<any>('courses');
  const { data: groups = [] } = useFirestore<any>('groups');

  const [form, setForm] = useState<Partial<Test>>({
    title: '', description: '', courseId: '', groupId: '',
    duration: 60, totalScore: 100, passingScore: 60, status: 'draft',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/tests');
      setTests(res.data?.data || []);
    } catch {
      showToast('Testlarni yuklab bo\'lmadi', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = {
    total: tests.length,
    published: tests.filter(t => t.status === 'published').length,
    draft: tests.filter(t => t.status === 'draft').length,
    submissions: tests.reduce((a, t) => a + (t._count?.submissions || 0), 0),
  };

  const columns: DataTableColumn<Test>[] = [
    {
      id: 'title',
      header: 'Test',
      cell: (t) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-600 flex items-center justify-center">
            <FileText size={14} />
          </div>
          <div>
            <p className="font-black text-slate-900 dark:text-white">{t.title}</p>
            <p className="text-xs font-bold text-zinc-400">{t.course?.name || t.group?.name || '—'}</p>
          </div>
        </div>
      ),
      sortable: true,
      accessor: (t) => t.title,
    },
    {
      id: 'questions',
      header: 'Savollar',
      cell: (t) => <span className="font-black">{t._count?.questions || 0}</span>,
    },
    {
      id: 'duration',
      header: 'Vaqt',
      cell: (t) => <span className="font-bold">{t.duration} daq</span>,
    },
    {
      id: 'submissions',
      header: 'Topshirilgan',
      cell: (t) => <span className="font-black">{t._count?.submissions || 0}</span>,
    },
    {
      id: 'status',
      header: 'Holat',
      cell: (t) => {
        const color = t.status === 'published' ? 'emerald' : t.status === 'draft' ? 'amber' : 'zinc';
        const label = t.status === 'published' ? 'Faol' : t.status === 'draft' ? 'Qoralama' : 'Yopilgan';
        return (
          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase bg-${color}-100 dark:bg-${color}-500/15 text-${color}-700 dark:text-${color}-400`}>
            {label}
          </span>
        );
      },
    },
    {
      id: 'created',
      header: 'Yaratilgan',
      accessor: (t) => t.createdAt,
      cell: (t) => new Date(t.createdAt).toLocaleDateString('uz-UZ'),
      sortable: true,
    },
  ];

  const handleSave = async () => {
    if (!form.title?.trim()) { showToast('Sarlavha kerak', 'error'); return; }
    try {
      if (editingTest) {
        await api.put(`/tests/${editingTest.id}`, form);
        showToast('Test yangilandi');
      } else {
        await api.post('/tests', form);
        showToast('Test yaratildi');
      }
      setCreateOpen(false);
      setEditingTest(null);
      setForm({ title: '', description: '', courseId: '', groupId: '', duration: 60, totalScore: 100, passingScore: 60, status: 'draft' });
      load();
    } catch {
      showToast('Xatolik', 'error');
    }
  };

  const publishTest = async (id: string) => {
    try {
      await api.post(`/tests/${id}/publish`);
      showToast('Test e\'lon qilindi');
      load();
    } catch {
      showToast('Xatolik', 'error');
    }
  };

  const loadQuestions = async (testId: string) => {
    try {
      const res = await api.get(`/tests/${testId}/questions`);
      setQuestions(res.data || []);
    } catch {
      setQuestions([]);
    }
  };

  const saveQuestions = async (testId: string) => {
    try {
      await api.post(`/tests/${testId}/questions/bulk`, { questions });
      showToast('Savollar saqlandi');
      setQuestionEditorOpen(false);
      load();
    } catch {
      showToast('Xatolik', 'error');
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      id: `tmp-${Date.now()}`,
      testId: editingTest?.id || '',
      order: questions.length,
      type: 'single_choice',
      text: '',
      options: JSON.stringify([
        { id: 'a', text: '', isCorrect: false },
        { id: 'b', text: '', isCorrect: false },
      ]),
      correctAnswer: null,
      score: 1,
    }]);
  };

  const loadResults = async (testId: string) => {
    try {
      const res = await api.get(`/tests/${testId}/results`);
      setResults(res.data);
      setResultsOpen(true);
    } catch {
      showToast('Natijalarni yuklab bo\'lmadi', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Testni o'chirish"
        message="Test va u bilan bog'liq savollar/javoblar o'chiriladi. Davom etasizmi?"
        confirmText="O'chirish"
        onConfirm={async () => {
          await api.delete(`/tests/${deleteConfirm.id}`);
          setDeleteConfirm({ open: false, id: '' });
          load();
          showToast('O\'chirildi');
        }}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />

      <PageHeader
        title="Testlar"
        subtitle="O'quvchilar uchun onlayn testlar va imtihonlar"
        badge={{ label: 'Yangi', color: 'violet' }}
        actions={
          <Button leftIcon={<Plus size={16} />} onClick={() => {
            setEditingTest(null);
            setForm({ title: '', description: '', courseId: '', groupId: '', duration: 60, totalScore: 100, passingScore: 60, status: 'draft' });
            setCreateOpen(true);
          }}>
            Yangi test
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Jami testlar" value={stats.total} icon={<FileText size={20} />} color="violet" variant="minimal" />
        <StatCard label="Faol" value={stats.published} icon={<CheckCircle2 size={20} />} color="emerald" variant="minimal" />
        <StatCard label="Qoralama" value={stats.draft} icon={<Clock size={20} />} color="amber" variant="minimal" />
        <StatCard label="Topshirilgan" value={stats.submissions} icon={<Users size={20} />} color="blue" variant="minimal" />
      </div>

      <DataTable
        data={tests}
        columns={columns}
        loading={loading}
        emptyMessage="Hali test yaratilmagan"
        rowActions={(t) => (
          <div className="flex items-center gap-1 justify-end">
            {t.status === 'draft' && (
              <button
                onClick={() => publishTest(t.id)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
                title="E'lon qilish"
              >
                <Send size={14} />
              </button>
            )}
            <button
              onClick={() => { setEditingTest(t); loadQuestions(t.id); setQuestionEditorOpen(true); }}
              className="p-1.5 rounded-md text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/15"
              title="Savollar"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => loadResults(t.id)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/15"
              title="Natijalar"
            >
              <BarChart3 size={14} />
            </button>
            <button
              onClick={() => {
                setEditingTest(t);
                setForm(t);
                setCreateOpen(true);
              }}
              className="p-1.5 rounded-md text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/15"
              title="Tahrirlash"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => setDeleteConfirm({ open: true, id: t.id })}
              className="p-1.5 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      />

      {/* Create/Edit Test Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={editingTest ? 'Testni tahrirlash' : 'Yangi test'}>
        <div className="space-y-4">
          <Input label="Sarlavha *" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Tavsif</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Kurs</label>
              <select value={form.courseId || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold">
                <option value="">Tanlanmagan</option>
                {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Guruh</label>
              <select value={form.groupId || ''} onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold">
                <option value="">Tanlanmagan</option>
                {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input type="number" label="Vaqt (daq)" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
            <Input type="number" label="Jami ball" value={form.totalScore} onChange={(e) => setForm({ ...form, totalScore: Number(e.target.value) })} />
            <Input type="number" label="O'tish ball" value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: Number(e.target.value) })} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)} className="flex-1">Bekor qilish</Button>
            <Button onClick={handleSave} className="flex-1">Saqlash</Button>
          </div>
        </div>
      </Modal>

      {/* Questions Editor */}
      <Modal isOpen={questionEditorOpen} onClose={() => setQuestionEditorOpen(false)} title={`Savollar: ${editingTest?.title || ''}`} width="2xl">
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Savol {idx + 1}
                </span>
                <button
                  onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-md"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select value={q.type} onChange={(e) => {
                  const newQs = [...questions];
                  newQs[idx] = { ...q, type: e.target.value as any };
                  setQuestions(newQs);
                }} className="col-span-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold">
                  {Object.entries(QUESTION_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <Input type="number" placeholder="Ball" value={q.score} onChange={(e) => {
                  const newQs = [...questions];
                  newQs[idx] = { ...q, score: Number(e.target.value) };
                  setQuestions(newQs);
                }} />
              </div>
              <textarea
                value={q.text}
                onChange={(e) => {
                  const newQs = [...questions];
                  newQs[idx] = { ...q, text: e.target.value };
                  setQuestions(newQs);
                }}
                placeholder="Savol matni..."
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium"
              />

              {(q.type === 'single_choice' || q.type === 'multi_choice' || q.type === 'true_false') && (
                <div className="space-y-2">
                  {(() => {
                    let opts: any[] = [];
                    try { opts = JSON.parse(q.options); } catch {}
                    return opts.map((opt: any, optIdx: number) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          type={q.type === 'multi_choice' ? 'checkbox' : 'radio'}
                          name={`q-${idx}-correct`}
                          checked={opt.isCorrect}
                          onChange={(e) => {
                            const newOpts = q.type === 'single_choice' || q.type === 'true_false'
                              ? opts.map((o: any, i: number) => ({ ...o, isCorrect: i === optIdx }))
                              : opts.map((o: any, i: number) => i === optIdx ? { ...o, isCorrect: e.target.checked } : o);
                            const newQs = [...questions];
                            newQs[idx] = { ...q, options: JSON.stringify(newOpts) };
                            setQuestions(newQs);
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <input
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = opts.map((o: any, i: number) => i === optIdx ? { ...o, text: e.target.value } : o);
                            const newQs = [...questions];
                            newQs[idx] = { ...q, options: JSON.stringify(newOpts) };
                            setQuestions(newQs);
                          }}
                          placeholder={`Variant ${optIdx + 1}`}
                          className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm"
                        />
                        <button onClick={() => {
                          const newOpts = opts.filter((_: any, i: number) => i !== optIdx);
                          const newQs = [...questions];
                          newQs[idx] = { ...q, options: JSON.stringify(newOpts) };
                          setQuestions(newQs);
                        }} className="p-1 text-rose-500"><X size={12} /></button>
                      </div>
                    ));
                  })()}
                  <button onClick={() => {
                    let opts: any[] = [];
                    try { opts = JSON.parse(q.options); } catch {}
                    opts.push({ id: String.fromCharCode(97 + opts.length), text: '', isCorrect: false });
                    const newQs = [...questions];
                    newQs[idx] = { ...q, options: JSON.stringify(opts) };
                    setQuestions(newQs);
                  }} className="text-xs font-bold text-blue-600 hover:text-blue-700">+ Variant qo'shish</button>
                </div>
              )}

              {(q.type === 'short_answer' || q.type === 'fill_blank') && (
                <Input
                  label="To'g'ri javob (|alternativlar bilan)"
                  value={q.correctAnswer || ''}
                  onChange={(e) => {
                    const newQs = [...questions];
                    newQs[idx] = { ...q, correctAnswer: e.target.value };
                    setQuestions(newQs);
                  }}
                />
              )}
            </div>
          ))}

          <Button variant="secondary" onClick={addQuestion} leftIcon={<Plus size={14} />} className="w-full">
            Savol qo'shish
          </Button>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setQuestionEditorOpen(false)} className="flex-1">Bekor qilish</Button>
            <Button onClick={() => editingTest && saveQuestions(editingTest.id)} className="flex-1">Saqlash ({questions.length})</Button>
          </div>
        </div>
      </Modal>

      {/* Results */}
      <Modal isOpen={resultsOpen} onClose={() => setResultsOpen(false)} title="Natijalar" width="2xl">
        {results && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Topshirgan" value={results.stats?.total || 0} variant="minimal" color="blue" size="sm" />
              <StatCard label="O'tgan" value={results.stats?.passed || 0} variant="minimal" color="emerald" size="sm" />
              <StatCard label="Yiqilgan" value={results.stats?.failed || 0} variant="minimal" color="rose" size="sm" />
              <StatCard label="O'rtacha" value={`${Math.round(results.stats?.avg || 0)}%`} variant="minimal" color="amber" size="sm" />
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-black text-zinc-400 uppercase">O'quvchi</th>
                    <th className="px-3 py-2 text-left text-xs font-black text-zinc-400 uppercase">Ball</th>
                    <th className="px-3 py-2 text-left text-xs font-black text-zinc-400 uppercase">Holat</th>
                    <th className="px-3 py-2 text-left text-xs font-black text-zinc-400 uppercase">Vaqt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {(results.submissions || []).map((s: any) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-bold">{s.student?.name}</td>
                      <td className="px-3 py-2 font-black">{Math.round(s.score || 0)}%</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          s.status === 'graded' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700' :
                          s.status === 'submitted' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700' :
                          'bg-zinc-100 dark:bg-zinc-800 text-zinc-600'
                        }`}>
                          {s.status === 'graded' ? 'Baholangan' : s.status === 'submitted' ? 'Tekshirilmoqda' : 'Davom etmoqda'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString('uz-UZ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
