import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { useToast } from '../components/Toast';

export default function LeadForm() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const { documents: forms, updateDocument: updateForm } = useFirestore<any>('forms');
  const { addDocument: addLead } = useFirestore<any>('leads');
  const { showToast } = useToast();
  const [formName, setFormName] = useState('Ro\'yxatdan o\'tish');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentForm, setCurrentForm] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    course: 'Prezident maktabi'
  });

  useEffect(() => {
    if (forms && forms.length > 0) {
      const foundForm = forms.find((f: any) => f.url && f.url.endsWith(`/l/${formId}`));
      if (foundForm) {
        setCurrentForm(foundForm);
        setFormName(foundForm.name);
        // Increment view count
        updateForm(foundForm.id, { views: (foundForm.views || 0) + 1 });
      }
    }
  }, [formId, forms]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    try {
      // Save lead
      await addLead({
        name: formData.name,
        phone: formData.phone,
        course: formData.course,
        stage: 'new',
        date: new Date().toISOString(),
        source: `Forma: ${formName}`
      });

      // Increment conversion count
      if (currentForm) {
        await updateForm(currentForm.id, { conversions: (currentForm.conversions || 0) + 1 });
      }

      setIsSubmitted(true);
    } catch (error) {
      console.error("Error submitting form:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
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
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{formName}</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Ma'lumotlaringizni qoldiring, biz siz bilan bog'lanamiz.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            <input 
              type="tel" 
              required
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
              placeholder="+998 90 123 45 67"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Qaysi kursga qiziqasiz?</label>
            <select 
              value={formData.course}
              onChange={(e) => setFormData({...formData, course: e.target.value})}
              className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
            >
              <option value="Prezident maktabi">Prezident maktabiga tayyorlov</option>
              <option value="Al-Xorazmiy maktabi">Al-Xorazmiy maktabiga tayyorlov</option>
              <option value="Ingliz tili">Ingliz tili (IELTS, CEFR)</option>
              <option value="Matematika">Matematika</option>
            </select>
          </div>

          <button 
            type="submit" 
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-colors shadow-lg shadow-blue-600/20"
          >
            Arizani yuborish
          </button>
        </form>
      </div>
    </div>
  );
}
