import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Copy, Send, Instagram, Globe, MessageSquare,
  BookOpen, ClipboardList, Bell, Loader2, Check, RefreshCw, Zap
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

type Tab = 'smm' | 'blog' | 'quiz' | 'sms' | 'suggestions';

export default function CrmAIContent() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('smm');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [output, setOutput] = useState('');

  // SMM form
  const [smm, setSmm] = useState({ platform: 'instagram', topic: '', tone: 'professional', language: 'uz', courseInfo: '', emoji: true });
  // Blog form
  const [blog, setBlog] = useState({ title: '', category: "Ta'lim", keywords: '', length: 'medium' });
  // Quiz form
  const [quizGen, setQuizGen] = useState({ subject: '', topic: '', count: 5, difficulty: 'medium' });
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  // SMS form
  const [sms, setSms] = useState({ type: 'payment_reminder', context: '' });
  // Suggestions
  const [suggestions, setSuggestions] = useState('');
  const [suggStats, setSuggStats] = useState<any>(null);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Nusxalandi!', 'success');
  };

  const handleSMM = async () => {
    if (!smm.topic.trim()) { showToast('Mavzuni kiriting', 'error'); return; }
    setLoading(true); setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/smm-caption', smm);
      setOutput(r.data.text);
    } catch (e: any) { showToast(e.response?.data?.error || 'AI xatolik', 'error'); }
    finally { setLoading(false); }
  };

  const handleBlog = async () => {
    if (!blog.title.trim()) { showToast('Sarlavhani kiriting', 'error'); return; }
    setLoading(true); setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/blog-post', blog);
      setOutput(r.data.text);
    } catch (e: any) { showToast(e.response?.data?.error || 'AI xatolik', 'error'); }
    finally { setLoading(false); }
  };

  const handleQuiz = async () => {
    if (!quizGen.subject.trim() || !quizGen.topic.trim()) { showToast('Fan va mavzuni kiriting', 'error'); return; }
    setLoading(true); setQuizQuestions([]);
    try {
      const r = await api.post<{ questions: any[] }>('/ai/quiz-questions', quizGen);
      setQuizQuestions(r.data.questions || []);
      if (r.data.questions?.length) showToast(`${r.data.questions.length} ta savol yaratildi!`, 'success');
    } catch (e: any) { showToast(e.response?.data?.error || 'AI xatolik', 'error'); }
    finally { setLoading(false); }
  };

  const handleSMS = async () => {
    setLoading(true); setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/sms-template', sms);
      setOutput(r.data.text);
    } catch (e: any) { showToast(e.response?.data?.error || 'AI xatolik', 'error'); }
    finally { setLoading(false); }
  };

  const handleSuggestions = async () => {
    setLoading(true); setSuggestions('');
    try {
      const r = await api.get<{ suggestions: string; stats: any }>('/ai/suggestions');
      setSuggestions(r.data.suggestions);
      setSuggStats(r.data.stats);
    } catch (e: any) { showToast(e.response?.data?.error || 'AI xatolik', 'error'); }
    finally { setLoading(false); }
  };

  const tabs = [
    { id: 'smm' as Tab, label: 'SMM Kontent', icon: Instagram },
    { id: 'blog' as Tab, label: 'Blog Post', icon: BookOpen },
    { id: 'quiz' as Tab, label: 'Test Savollari', icon: ClipboardList },
    { id: 'sms' as Tab, label: 'SMS Shablon', icon: MessageSquare },
    { id: 'suggestions' as Tab, label: 'CRM Tavsiyalar', icon: Zap },
  ];

  const inputCls = "w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-500/10">
          <Sparkles className="w-6 h-6 text-violet-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">AI Kontent Yaratish</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Gemini AI yordamida kontent yarating</p>
        </div>
        <div className="ml-auto">
          <span className="flex items-center gap-1.5 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 px-3 py-1.5 rounded-full">
            <Sparkles className="w-3 h-3" /> Gemini 2.0 Flash
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setOutput(''); setQuizQuestions([]); setSuggestions(''); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="grid md:grid-cols-2 gap-5">

          {/* Left: Form */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm uppercase tracking-wide">Sozlamalar</h3>

            {/* SMM */}
            {activeTab === 'smm' && <>
              <div>
                <label className={labelCls}>Platforma</label>
                <select value={smm.platform} onChange={e => setSmm(p => ({ ...p, platform: e.target.value }))} className={inputCls}>
                  <option value="instagram">Instagram</option>
                  <option value="telegram">Telegram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Mavzu / Xabar *</label>
                <textarea rows={3} value={smm.topic} onChange={e => setSmm(p => ({ ...p, topic: e.target.value }))}
                  placeholder="Masalan: IELTS kursi ochildi, joy cheklangan..." className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className={labelCls}>Kurs ma'lumoti</label>
                <input type="text" value={smm.courseInfo} onChange={e => setSmm(p => ({ ...p, courseInfo: e.target.value }))}
                  placeholder="IELTS, 3 oy, 500 000 so'm..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Uslub</label>
                  <select value={smm.tone} onChange={e => setSmm(p => ({ ...p, tone: e.target.value }))} className={inputCls}>
                    <option value="professional">Professional</option>
                    <option value="friendly">Do'stona</option>
                    <option value="motivational">Rag'batlantiruv</option>
                    <option value="humorous">Hazilkash</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Til</label>
                  <select value={smm.language} onChange={e => setSmm(p => ({ ...p, language: e.target.value }))} className={inputCls}>
                    <option value="uz">O'zbek</option>
                    <option value="ru">Rus</option>
                    <option value="en">Ingliz</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={smm.emoji} onChange={e => setSmm(p => ({ ...p, emoji: e.target.checked }))} className="rounded" />
                Emoji ishlat
              </label>
              <button onClick={handleSMM} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Kontent yaratish
              </button>
            </>}

            {/* Blog */}
            {activeTab === 'blog' && <>
              <div>
                <label className={labelCls}>Maqola sarlavhasi *</label>
                <input type="text" value={blog.title} onChange={e => setBlog(p => ({ ...p, title: e.target.value }))}
                  placeholder="Masalan: IELTS 7+ ball olish sirlari..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Kategoriya</label>
                <select value={blog.category} onChange={e => setBlog(p => ({ ...p, category: e.target.value }))} className={inputCls}>
                  {["Ta'lim", "Ingliz tili", "Matematika", "IT", "Motivatsiya", "Yangilik"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Kalit so'zlar (vergul bilan)</label>
                <input type="text" value={blog.keywords} onChange={e => setBlog(p => ({ ...p, keywords: e.target.value }))}
                  placeholder="IELTS, ingliz tili, sertifikat..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Uzunlik</label>
                <select value={blog.length} onChange={e => setBlog(p => ({ ...p, length: e.target.value }))} className={inputCls}>
                  <option value="short">Qisqa (300-500 so'z)</option>
                  <option value="medium">O'rta (600-800 so'z)</option>
                  <option value="long">Uzun (1000-1200 so'z)</option>
                </select>
              </div>
              <button onClick={handleBlog} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Maqola yaratish
              </button>
            </>}

            {/* Quiz */}
            {activeTab === 'quiz' && <>
              <div>
                <label className={labelCls}>Fan *</label>
                <input type="text" value={quizGen.subject} onChange={e => setQuizGen(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Ingliz tili, Matematika, Fizika..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Mavzu *</label>
                <input type="text" value={quizGen.topic} onChange={e => setQuizGen(p => ({ ...p, topic: e.target.value }))}
                  placeholder="Past tense, Algebra, Mexanika..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Savollar soni</label>
                  <input type="number" min={3} max={20} value={quizGen.count} onChange={e => setQuizGen(p => ({ ...p, count: +e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Qiyinlik</label>
                  <select value={quizGen.difficulty} onChange={e => setQuizGen(p => ({ ...p, difficulty: e.target.value }))} className={inputCls}>
                    <option value="easy">Oson</option>
                    <option value="medium">O'rta</option>
                    <option value="hard">Qiyin</option>
                  </select>
                </div>
              </div>
              <button onClick={handleQuiz} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Savollar yaratish
              </button>
            </>}

            {/* SMS */}
            {activeTab === 'sms' && <>
              <div>
                <label className={labelCls}>Xabar turi</label>
                <select value={sms.type} onChange={e => setSms(p => ({ ...p, type: e.target.value }))} className={inputCls}>
                  <option value="payment_reminder">To'lov eslatmasi</option>
                  <option value="welcome">Yangi o'quvchini qutlash</option>
                  <option value="lesson_reminder">Dars eslatmasi</option>
                  <option value="birthday">Tug'ilgan kun tabrigi</option>
                  <option value="result">Test natijasi</option>
                  <option value="promo">Aksiya e'loni</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Qo'shimcha ma'lumot</label>
                <textarea rows={3} value={sms.context} onChange={e => setSms(p => ({ ...p, context: e.target.value }))}
                  placeholder="O'quv markaz nomi, maxsus chegirma..." className={`${inputCls} resize-none`} />
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-xs text-zinc-500 space-y-1">
                <p className="font-medium">O'zgaruvchilar:</p>
                {['{{student_name}}', '{{group_name}}', '{{amount}}', '{{due_date}}', '{{lesson_time}}', '{{teacher_name}}'].map(v => (
                  <code key={v} className="inline-block mr-2 text-violet-600 dark:text-violet-400">{v}</code>
                ))}
              </div>
              <button onClick={handleSMS} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Shablon yaratish
              </button>
            </>}

            {/* Suggestions */}
            {activeTab === 'suggestions' && <>
              <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
                <p className="text-sm text-violet-700 dark:text-violet-300 font-medium mb-1">CRM ma'lumotlariga asoslanib tavsiyalar</p>
                <p className="text-xs text-violet-600 dark:text-violet-400">AI tizim o'quvchilar, lidlar va moliyaviy holatni tahlil qilib konkret tavsiyalar beradi</p>
              </div>
              {suggStats && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Faol o'quvchilar", value: suggStats.studentCount },
                    { label: 'Qarzdorlar', value: suggStats.debtorCount },
                    { label: 'Yangi lidlar', value: suggStats.leadCount },
                    { label: 'Konversiya', value: `${suggStats.convRate}%` },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
                      <p className="text-xs text-zinc-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleSuggestions} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Tavsiyalar olish
              </button>
            </>}
          </div>

          {/* Right: Output */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm uppercase tracking-wide">Natija</h3>
              {(output || suggestions) && (
                <div className="flex gap-2">
                  <button onClick={() => { setOutput(''); setSuggestions(''); setQuizQuestions([]); }}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 transition-colors" title="Tozalash">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => copyToClipboard(output || suggestions)}
                    className="p-1.5 text-zinc-400 hover:text-violet-600 transition-colors" title="Nusxalash">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="relative">
                  <Sparkles className="w-8 h-8 text-violet-300 animate-pulse" />
                </div>
                <p className="text-sm text-zinc-400 animate-pulse">AI yozmoqda...</p>
              </div>
            ) : activeTab === 'quiz' && quizQuestions.length > 0 ? (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {quizQuestions.map((q: any, i: number) => (
                  <div key={i} className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">{i + 1}. {q.text}</p>
                    <div className="space-y-1.5">
                      {q.options?.map((opt: any, j: number) => (
                        <div key={j} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${opt.isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.isCorrect ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                          {opt.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => copyToClipboard(JSON.stringify(quizQuestions, null, 2))}
                  className="w-full py-2 border border-violet-200 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2">
                  <Copy className="w-3.5 h-3.5" /> JSON nusxalash
                </button>
              </div>
            ) : output || suggestions ? (
              <div className="relative">
                <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: (output || suggestions).replace(/\n/g, '<br/>') }} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-300 dark:text-zinc-600 gap-3">
                <Sparkles className="w-10 h-10" />
                <p className="text-sm">Kontent yaratish uchun sozlamalarni to'ldiring</p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
