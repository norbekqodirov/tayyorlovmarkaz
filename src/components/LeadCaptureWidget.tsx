import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ArrowUpRight } from 'lucide-react';
import api from '../api/client';
import { useToast } from './Toast';
import { getAttribution } from '../utils/utm';

interface Course {
  id: string;
  name: string;
}

// Bosh sahifadagi tezkor lid yig'ish formasi — avval bosh sahifada umuman
// lid yig'ish yo'q edi, faqat "Aloqa" sahifasiga havola bor edi (bir bosqich
// qo'shimcha ishqalanish = kamroq konversiya). `source` ataylab yuborilmaydi —
// server UTM/kampaniyadan aniqlaydi, bo'lmasa "Vebsayt"ga tushadi.
export default function LeadCaptureWidget() {
  const { showToast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [courseId, setCourseId] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — ko'rinmaydi, botlar to'ldiradi
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get('/public/courses').then(res => setCourses(res.data || [])).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const course = courses.find(c => c.id === courseId);
      const attribution = getAttribution();
      await api.post('/public/lead', {
        name, phone,
        courseId: courseId || undefined,
        course: course?.name,
        website, // honeypot
        ...attribution,
      });
      setSubmitted(true);
      setName(''); setPhone(''); setCourseId('');
    } catch {
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
          <CheckCircle2 size={28} />
        </div>
        <p className="text-white font-bold text-lg">Arizangiz qabul qilindi!</p>
        <p className="text-zinc-400 text-sm max-w-xs">Tez orada menejerlarimiz siz bilan bog'lanishadi.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto flex flex-col sm:flex-row gap-3">
      {/* Honeypot — haqiqiy foydalanuvchiga ko'rinmaydi */}
      <input
        type="text" value={website} onChange={e => setWebsite(e.target.value)}
        tabIndex={-1} autoComplete="off"
        className="absolute -left-[9999px] w-px h-px opacity-0"
        aria-hidden="true"
      />
      <input
        type="text" required placeholder="Ismingiz" value={name}
        onChange={e => setName(e.target.value)}
        className="flex-1 px-5 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
      />
      <input
        type="tel" required placeholder="90 123 45 67" maxLength={9}
        value={phone.replace(/\D/g, '').replace(/^998/, '')}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
          setPhone(digits ? `+998${digits}` : '');
        }}
        className="sm:w-48 px-5 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
      />
      {courses.length > 0 && (
        <select
          value={courseId} onChange={e => setCourseId(e.target.value)}
          className="sm:w-56 px-5 py-4 rounded-full bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium appearance-none"
        >
          <option value="" className="text-zinc-900">Qaysi kursga qiziqasiz?</option>
          {courses.map(c => <option key={c.id} value={c.id} className="text-zinc-900">{c.name}</option>)}
        </select>
      )}
      <button
        type="submit" disabled={submitting}
        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:scale-100 whitespace-nowrap"
      >
        {submitting ? 'Yuborilmoqda...' : 'Ariza qoldirish'} <ArrowUpRight size={20} />
      </button>
    </form>
  );
}
