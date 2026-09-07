import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import {
  Sparkles, Copy, Instagram, MessageSquare,
  BookOpen, ClipboardList, Loader2, Check, RefreshCw, Zap
} from 'lucide-react';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { ErrorState } from '../../../components/States';

type Tab = 'smm' | 'blog' | 'quiz' | 'sms' | 'suggestions';

export default function CrmAIContent() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('smm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Nusxalandi!', 'success');
    } catch {
      showToast('Nusxalashda xatolik', 'error');
    }
  };

  const clearState = () => {
    setOutput('');
    setError(null);
    setQuizQuestions([]);
    setSuggestions('');
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    clearState();
  };

  const handleSMM = async () => {
    const trimmedTopic = smm.topic.trim();
    if (!trimmedTopic) {
      showToast('Mavzuni kiriting', 'error');
      return;
    }
    setLoading(true);
    setError(null);
    setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/smm-caption', {
        ...smm,
        topic: trimmedTopic,
        courseInfo: smm.courseInfo.trim(),
      });
      setOutput(r.data.text || '');
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'AI xatolik yuz berdi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBlog = async () => {
    const trimmedTitle = blog.title.trim();
    if (!trimmedTitle) {
      showToast('Sarlavhani kiriting', 'error');
      return;
    }
    setLoading(true);
    setError(null);
    setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/blog-post', {
        ...blog,
        title: trimmedTitle,
        keywords: blog.keywords.trim(),
      });
      setOutput(r.data.text || '');
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'AI xatolik yuz berdi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuiz = async () => {
    const trimmedSubject = quizGen.subject.trim();
    const trimmedTopic = quizGen.topic.trim();
    if (!trimmedSubject || !trimmedTopic) {
      showToast('Fan va mavzuni kiriting', 'error');
      return;
    }

    const count = Math.min(Math.max(1, Number(quizGen.count) || 5), 20);

    setLoading(true);
    setError(null);
    setQuizQuestions([]);
    try {
      const r = await api.post<{ questions: any[] }>('/ai/quiz-questions', {
        ...quizGen,
        subject: trimmedSubject,
        topic: trimmedTopic,
        count,
      });
      const qList = r.data.questions || [];
      setQuizQuestions(qList);
      if (qList.length) {
        showToast(`${qList.length} ta savol yaratildi!`, 'success');
      } else {
        setError("AI savollarni yaratishda xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'AI xatolik yuz berdi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSMS = async () => {
    setLoading(true);
    setError(null);
    setOutput('');
    try {
      const r = await api.post<{ text: string }>('/ai/sms-template', {
        ...sms,
        context: sms.context.trim(),
      });
      setOutput(r.data.text || '');
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'AI xatolik yuz berdi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestions = async () => {
    setLoading(true);
    setError(null);
    setSuggestions('');
    try {
      const r = await api.get<{ suggestions: string; stats: any }>('/ai/suggestions');
      setSuggestions(r.data.suggestions || '');
      setSuggStats(r.data.stats || null);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'AI xatolik yuz berdi';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const retryCurrentAction = () => {
    if (activeTab === 'smm') handleSMM();
    else if (activeTab === 'blog') handleBlog();
    else if (activeTab === 'quiz') handleQuiz();
    else if (activeTab === 'sms') handleSMS();
    else if (activeTab === 'suggestions') handleSuggestions();
  };

  const tabs = [
    { id: 'smm' as Tab, label: 'SMM Kontent', icon: Instagram },
    { id: 'blog' as Tab, label: 'Blog Post', icon: BookOpen },
    { id: 'quiz' as Tab, label: 'Test Savollari', icon: ClipboardList },
    { id: 'sms' as Tab, label: 'SMS Shablon', icon: MessageSquare },
    { id: 'suggestions' as Tab, label: 'CRM Tavsiyalar', icon: Zap },
  ];

  const inputCls = "w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60";
  const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";

  const copyableText = activeTab === 'quiz' && quizQuestions.length > 0
    ? JSON.stringify(quizQuestions, null, 2)
    : output || suggestions;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 shrink-0">
            <Sparkles className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">AI Kontent Yaratish</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Gemini AI yordamida kontent yarating</p>
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 px-3 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5" /> Gemini 2.0 Flash
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            disabled={loading}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0 disabled:opacity-50 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
        >
          {/* Left: Form */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm uppercase tracking-wide">Sozlamalar</h3>

            {/* SMM */}
            {activeTab === 'smm' && (
              <>
                <div>
                  <label className={labelCls}>Platforma</label>
                  <select
                    value={smm.platform}
                    disabled={loading}
                    onChange={e => setSmm(p => ({ ...p, platform: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="telegram">Telegram</option>
                    <option value="facebook">Facebook</option>
                    <option value="tiktok">TikTok</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Mavzu / Xabar *</label>
                  <textarea
                    rows={3}
                    value={smm.topic}
                    disabled={loading}
                    onChange={e => setSmm(p => ({ ...p, topic: e.target.value }))}
                    placeholder="Masalan: IELTS kursi ochildi, joy cheklangan..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Kurs ma'lumoti</label>
                  <input
                    type="text"
                    value={smm.courseInfo}
                    disabled={loading}
                    onChange={e => setSmm(p => ({ ...p, courseInfo: e.target.value }))}
                    placeholder="IELTS, 3 oy, 500 000 so'm..."
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Uslub</label>
                    <select
                      value={smm.tone}
                      disabled={loading}
                      onChange={e => setSmm(p => ({ ...p, tone: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="professional">Professional</option>
                      <option value="friendly">Do'stona</option>
                      <option value="motivational">Rag'batlantiruv</option>
                      <option value="humorous">Hazilkash</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Til</label>
                    <select
                      value={smm.language}
                      disabled={loading}
                      onChange={e => setSmm(p => ({ ...p, language: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="uz">O'zbek</option>
                      <option value="ru">Rus</option>
                      <option value="en">Ingliz</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smm.emoji}
                    disabled={loading}
                    onChange={e => setSmm(p => ({ ...p, emoji: e.target.checked }))}
                    className="rounded text-violet-600 focus:ring-violet-500"
                  />
                  Emoji ishlat
                </label>
                <button
                  onClick={handleSMM}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Kontent yaratish
                </button>
              </>
            )}

            {/* Blog */}
            {activeTab === 'blog' && (
              <>
                <div>
                  <label className={labelCls}>Maqola sarlavhasi *</label>
                  <input
                    type="text"
                    value={blog.title}
                    disabled={loading}
                    onChange={e => setBlog(p => ({ ...p, title: e.target.value }))}
                    placeholder="Masalan: IELTS 7+ ball olish sirlari..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Kategoriya</label>
                  <select
                    value={blog.category}
                    disabled={loading}
                    onChange={e => setBlog(p => ({ ...p, category: e.target.value }))}
                    className={inputCls}
                  >
                    {["Ta'lim", "Ingliz tili", "Matematika", "IT", "Motivatsiya", "Yangilik"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Kalit so'zlar (vergul bilan)</label>
                  <input
                    type="text"
                    value={blog.keywords}
                    disabled={loading}
                    onChange={e => setBlog(p => ({ ...p, keywords: e.target.value }))}
                    placeholder="IELTS, ingliz tili, sertifikat..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Uzunlik</label>
                  <select
                    value={blog.length}
                    disabled={loading}
                    onChange={e => setBlog(p => ({ ...p, length: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="short">Qisqa (300-500 so'z)</option>
                    <option value="medium">O'rta (600-800 so'z)</option>
                    <option value="long">Uzun (1000-1200 so'z)</option>
                  </select>
                </div>
                <button
                  onClick={handleBlog}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Maqola yaratish
                </button>
              </>
            )}

            {/* Quiz */}
            {activeTab === 'quiz' && (
              <>
                <div>
                  <label className={labelCls}>Fan *</label>
                  <input
                    type="text"
                    value={quizGen.subject}
                    disabled={loading}
                    onChange={e => setQuizGen(p => ({ ...p, subject: e.target.value }))}
                    placeholder="Ingliz tili, Matematika, Fizika..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mavzu *</label>
                  <input
                    type="text"
                    value={quizGen.topic}
                    disabled={loading}
                    onChange={e => setQuizGen(p => ({ ...p, topic: e.target.value }))}
                    placeholder="Past tense, Algebra, Mexanika..."
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Savollar soni (1-20)</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={quizGen.count}
                      disabled={loading}
                      onChange={e => setQuizGen(p => ({ ...p, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Qiyinlik</label>
                    <select
                      value={quizGen.difficulty}
                      disabled={loading}
                      onChange={e => setQuizGen(p => ({ ...p, difficulty: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="easy">Oson</option>
                      <option value="medium">O'rta</option>
                      <option value="hard">Qiyin</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleQuiz}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Savollar yaratish
                </button>
              </>
            )}

            {/* SMS */}
            {activeTab === 'sms' && (
              <>
                <div>
                  <label className={labelCls}>Xabar turi</label>
                  <select
                    value={sms.type}
                    disabled={loading}
                    onChange={e => setSms(p => ({ ...p, type: e.target.value }))}
                    className={inputCls}
                  >
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
                  <textarea
                    rows={3}
                    value={sms.context}
                    disabled={loading}
                    onChange={e => setSms(p => ({ ...p, context: e.target.value }))}
                    placeholder="O'quv markaz nomi, maxsus chegirma..."
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-xs text-zinc-500 space-y-1">
                  <p className="font-medium">O'zgaruvchilar:</p>
                  <div className="flex flex-wrap gap-1">
                    {['{{student_name}}', '{{group_name}}', '{{amount}}', '{{due_date}}', '{{lesson_time}}', '{{teacher_name}}'].map(v => (
                      <code key={v} className="text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1 rounded">{v}</code>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleSMS}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Shablon yaratish
                </button>
              </>
            )}

            {/* Suggestions */}
            {activeTab === 'suggestions' && (
              <>
                <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
                  <p className="text-sm text-violet-700 dark:text-violet-300 font-medium mb-1">CRM ma'lumotlariga asoslanib tavsiyalar</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400">AI tizim o'quvchilar, lidlar va moliyaviy holatni tahlil qilib konkret tavsiyalar beradi</p>
                </div>
                {suggStats && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Faol o'quvchilar", value: suggStats.studentCount ?? 0 },
                      { label: 'Qarzdorlar', value: suggStats.debtorCount ?? 0 },
                      { label: 'Yangi lidlar', value: suggStats.leadCount ?? 0 },
                      { label: 'Konversiya', value: `${suggStats.convRate ?? 0}%` },
                    ].map(s => (
                      <div key={s.label} className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2.5 text-center">
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
                        <p className="text-xs text-zinc-500">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleSuggestions}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Tavsiyalar olish
                </button>
              </>
            )}
          </div>

          {/* Right: Output */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm uppercase tracking-wide">Natija</h3>
                {copyableText && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearState}
                      className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                      title="Tozalash"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => copyToClipboard(copyableText)}
                      className="p-1.5 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      title="Nusxalash"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="relative">
                    <Sparkles className="w-8 h-8 text-violet-500 animate-pulse" />
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 animate-pulse">AI yozmoqda...</p>
                </div>
              ) : error ? (
                <ErrorState message={error} onRetry={retryCurrentAction} />
              ) : activeTab === 'quiz' && quizQuestions.length > 0 ? (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {quizQuestions.map((q: any, i: number) => (
                    <div key={i} className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">{i + 1}. {q.text}</p>
                      <div className="space-y-1.5">
                        {q.options?.map((opt: any, j: number) => (
                          <div key={j} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${opt.isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.isCorrect ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                            {opt.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(quizQuestions, null, 2))}
                    className="w-full py-2 border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" /> JSON nusxalash
                  </button>
                </div>
              ) : output || suggestions ? (
                <div className="relative">
                  {activeTab === 'blog' ? (
                    <div
                      className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed max-h-[500px] overflow-y-auto [&_h2]:font-black [&_h2]:text-base [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-1"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(output || suggestions) }}
                    />
                  ) : (
                    <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                      {output || suggestions}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 gap-3">
                  <Sparkles className="w-10 h-10" />
                  <p className="text-sm">Kontent yaratish uchun sozlamalarni to'ldiring</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
