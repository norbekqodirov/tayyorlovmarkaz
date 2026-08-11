import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../components/Toast';
import { getAttribution } from '../utils/utm';

interface Course {
  id: string;
  name: string;
}

const GRADE_OPTIONS = [2, 3, 4, 5, 6];

export default function LeadForm() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extraField, setExtraField] = useState<{ type: 'none' | 'age' | 'grade'; label: string | null }>({ type: 'none', label: null });
  const [showCourseField, setShowCourseField] = useState(true);
  // formId bor sahifalarda haqiqiy sozlama (kurs/yosh/sinf) server javobidan
  // kelguncha standart holat (hammasi ko'rinadi) bir lahza chizilib, keyin
  // to'g'ri holatga "miltillab" o'zgarardi. Shu bayroq javob kelguncha
  // maydonlarni umuman chizmaslikka majbur qiladi — miltillash yo'qoladi.
  const [configLoaded, setConfigLoaded] = useState(!formId);
  const [courses, setCourses] = useState<Course[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    courseId: '',
    extra: '',
    website: '', // honeypot — ko'rinmaydi, botlar to'ldiradi
    consent: false,
  });

  // Bu ommaviy (login talab qilmaydigan) endpointlar — chunki bu sahifani ochadigan
  // odam hali CRM'ga kirmagan haqiqiy tashrif buyuruvchi (avval /api/leads generic
  // CRUD orqali yuborilardi, u esa har doim requireAuth talab qiladi va login
  // qilmagan foydalanuvchi uchun 401 bilan jimgina barbod bo'lardi).
  useEffect(() => {
    if (formId) {
      // Formaning haqiqiy mavjud/faolligini tekshiradi — sarlavha sifatida
      // ko'rsatilmaydi (forma nomi faqat CRM ichida statistika uchun).
      // extraField — shu FORMAGA xos (CrmForms.tsx'da tanlangan), forma buni
      // belgilamagan bo'lsa backend global sozlamaga qaytadi.
      api.get(`/public/forms/${formId}`)
        .then(res => {
          if (res.data?.extraField) setExtraField(res.data.extraField);
          if (typeof res.data?.showCourseField === 'boolean') setShowCourseField(res.data.showCourseField);
        })
        .catch(() => {})
        .finally(() => setConfigLoaded(true));
      // Ko'rish hisobi — konversiya % ini haqiqiy qiladi (avval doim NaN% edi,
      // chunki hech narsa ko'rishlarni sanamas edi).
      api.post(`/public/forms/${formId}/view`).catch(() => {});
    } else {
      api.get('/public/lead-form-config')
        .then(res => setExtraField(res.data))
        .catch(() => {});
    }
    api.get('/public/courses')
      .then(res => setCourses(res.data || []))
      .catch(() => {});
  }, [formId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const course = courses.find(c => c.id === formData.courseId);
      const attribution = getAttribution();
      await api.post('/public/lead', {
        name: formData.name,
        phone: formData.phone,
        courseId: formData.courseId || undefined,
        course: course?.name,
        // "source" ataylab yuborilmaydi — server buni UTM/kampaniyadan aniqlaydi
        // (avval bu yerda qo'lda `Forma: ${formName}` yasalardi, natijada har
        // bir forma manba diagrammasida o'z axlat ustunini yaratardi).
        extraField: extraField.type !== 'none' ? formData.extra : undefined,
        website: formData.website, // honeypot
        formId,
        ...attribution,
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error("Error submitting form:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 md:p-12 max-w-md w-full text-center border border-zinc-200 dark:border-zinc-800 shadow-xl">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Arizangiz qabul qilindi!</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-8">
            Tez orada menejerlarimiz siz bilan bog'lanishadi.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-colors"
          >
            Bosh sahifaga qaytish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-500 hover:text-slate-900 dark:hover:text-white transition-colors font-bold text-sm"
        >
          <ArrowLeft size={16} /> Bosh sahifa
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 md:p-10 max-w-md w-full border border-zinc-200 dark:border-zinc-800 shadow-xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Ro'yxatdan o'tish</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Ma'lumotlaringizni qoldiring, biz siz bilan bog'lanamiz.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot — haqiqiy foydalanuvchiga ko'rinmaydi */}
          <input
            type="text" value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            tabIndex={-1} autoComplete="off"
            className="absolute -left-[9999px] w-px h-px opacity-0"
            aria-hidden="true"
          />
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">F.I.Sh</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="To'liq ismingizni kiriting"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Telefon raqam</label>
            <div className="flex items-stretch rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-blue-500">
              <span className="flex items-center px-4 text-zinc-500 dark:text-zinc-400 font-bold select-none">+998</span>
              <input
                type="tel"
                required
                maxLength={9}
                value={formData.phone.replace(/\D/g, '').replace(/^998/, '')}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setFormData({ ...formData, phone: digits ? `+998${digits}` : '' });
                }}
                className="w-full pr-5 py-4 bg-transparent border-none outline-none text-slate-900 dark:text-white"
                placeholder="90 123 45 67"
              />
            </div>
          </div>

          {configLoaded && showCourseField && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Qaysi kursga qiziqasiz?</label>
              <div className="relative">
                <select
                  required
                  value={formData.courseId}
                  onChange={(e) => setFormData({...formData, courseId: e.target.value})}
                  className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                >
                  <option value="" disabled>Kursni tanlang</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={20} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>
          )}

          {configLoaded && extraField.type === 'age' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{extraField.label}</label>
              <input
                type="number"
                required
                value={formData.extra}
                onChange={(e) => setFormData({ ...formData, extra: e.target.value })}
                className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="10"
              />
            </div>
          )}

          {configLoaded && extraField.type === 'grade' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{extraField.label}</label>
              <div className="relative">
                <select
                  required
                  value={formData.extra}
                  onChange={(e) => setFormData({ ...formData, extra: e.target.value })}
                  className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                >
                  <option value="" disabled>Sinfni tanlang</option>
                  {GRADE_OPTIONS.map(g => <option key={g} value={`${g}-sinf`}>{g}-sinf</option>)}
                </select>
                <ChevronDown size={20} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={formData.consent}
              onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
              className="mt-1"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Shaxsiy ma'lumotlarimning markaz vakillari tomonidan men bilan bog'lanish uchun ishlatilishiga roziman.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-60"
          >
            {submitting ? 'Yuborilmoqda...' : 'Arizani yuborish'}
          </button>
        </form>
      </div>
    </div>
  );
}
