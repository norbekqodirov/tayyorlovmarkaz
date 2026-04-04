import { motion } from 'motion/react';
import { MapPin, Phone, Mail, Clock, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', phone: '', message: '' });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { addDocument } = useFirestore('leads');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newLead = {
      name: formData.name,
      phone: formData.phone,
      course: 'Boshqa',
      stage: 'new',
      date: new Date().toISOString(),
      source: 'Aloqa sahifasi',
      message: formData.message
    };
    
    try {
      await addDocument(newLead);
      setIsSubmitted(true);
      setFormData({ name: '', phone: '', message: '' });
      
      setTimeout(() => {
        setIsSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error adding lead:", error);
      // Optionally handle error state here
    }
  };

  return (
    <div className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Aloqa</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-4xl">
            Biz bilan <br/>
            <span className="text-zinc-400">bog'lanish.</span>
          </h1>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
          Savollaringiz bormi yoki kursga yozilmoqchimisiz? Biz sizga yordam berishdan xursandmiz.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Contact Info */}
        <div className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="bg-blue-600 p-10 rounded-[2rem] text-white flex items-start gap-6 shadow-xl shadow-blue-600/20"
          >
            <div className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0">
              <Phone size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">Telefon</h3>
              <p className="text-lg font-medium opacity-80 mb-1">+998 90 123 45 67</p>
              <p className="text-lg font-medium opacity-80">+998 99 765 43 21</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-950 p-10 rounded-[2rem] text-white flex items-start gap-6"
          >
            <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0">
              <MapPin size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">Manzil</h3>
              <p className="text-lg font-medium text-zinc-400">Xorazm viloyati, Urganch shahri, Al-Xorazmiy ko'chasi, 110-uy.</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-zinc-900 p-8 rounded-[2rem] border border-zinc-200 dark:border-zinc-800"
            >
              <Mail className="w-8 h-8 text-orange-500 mb-4" />
              <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2">Email</h3>
              <p className="text-zinc-600 dark:text-zinc-400 font-medium">info@educenter.uz</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-white dark:bg-zinc-900 p-8 rounded-[2rem] border border-zinc-200 dark:border-zinc-800"
            >
              <Clock className="w-8 h-8 text-blue-500 mb-4" />
              <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2">Ish vaqti</h3>
              <p className="text-zinc-600 dark:text-zinc-400 font-medium">Du - Shan: 08:00 - 20:00</p>
            </motion.div>
          </div>
        </div>

        {/* Contact Form */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="bg-white dark:bg-zinc-900 p-10 md:p-12 rounded-[3rem] border border-zinc-200 dark:border-zinc-800"
        >
          <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-8">Xabar qoldirish</h2>
          {isSubmitted ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-6 rounded-2xl text-center font-bold">
              Xabaringiz muvaffaqiyatli yuborildi! Tez orada siz bilan bog'lanamiz.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wider">Ismingiz</label>
                <input 
                  type="text" 
                  id="name" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-6 py-4 bg-zinc-100 dark:bg-zinc-950 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 text-zinc-900 dark:text-white font-medium transition-shadow"
                  placeholder="Abdulla Oripov"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wider">Telefon raqamingiz</label>
                <input 
                  type="tel" 
                  id="phone" 
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-6 py-4 bg-zinc-100 dark:bg-zinc-950 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 text-zinc-900 dark:text-white font-medium transition-shadow"
                  placeholder="+998 90 123 45 67"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wider">Xabaringiz</label>
                <textarea 
                  id="message" 
                  rows={4}
                  required
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  className="w-full px-6 py-4 bg-zinc-100 dark:bg-zinc-950 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 text-zinc-900 dark:text-white font-medium transition-shadow resize-none"
                  placeholder="Farzandimni ro'yxatdan o'tkazmoqchi edim..."
                ></textarea>
              </div>
              <button 
                type="submit" 
                className="w-full py-5 px-8 bg-zinc-900 dark:bg-white text-white dark:text-black font-black rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 text-lg group"
              >
                Yuborish <ArrowUpRight className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
