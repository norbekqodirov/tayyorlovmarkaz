import { motion } from 'motion/react';
import { Star, ArrowUpRight } from 'lucide-react';

export default function Results() {
  const stats = [
    { value: "500+", label: "Muvaffaqiyatli bitiruvchilar", bg: "bg-white dark:bg-zinc-900", text: "text-zinc-900 dark:text-white" },
    { value: "95%", label: "Prezident maktablariga qabul", bg: "bg-blue-600", text: "text-white" },
    { value: "100%", label: "Ota-onalar qoniqishi", bg: "bg-zinc-950", text: "text-white" },
    { value: "Top 3", label: "Respublikadagi reytingimiz", bg: "bg-orange-500", text: "text-white" }
  ];

  const testimonials = [
    { name: "Nargiza T.", role: "Ota-ona", text: "Farzandim 3 oy ichida matematikadan juda katta o'sish qildi. O'qituvchilarga raxmat! Hozirda Al-Xorazmiy maktabi o'quvchisi." },
    { name: "Rustam B.", role: "Ota-ona", text: "Prezident maktabiga tayyorgarlik uchun eng yaxshi markaz. Intizom va ta'lim sifati a'lo darajada. Barchaga tavsiya qilaman." },
    { name: "Dilnoza S.", role: "Ota-ona", text: "Ingliz tilidan qisqa vaqt ichida ravon gapirishni boshladi. Mock testlar orqali imtihon qo'rquvini yengdi." },
    { name: "Alisher K.", role: "Ota-ona", text: "Farzandimning mantiqiy fikrlashi va masalalarga yondashuvi butunlay o'zgardi. Natijalar kutganimizdan ham a'lo." }
  ];

  return (
    <div className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Natijalar</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-3xl">
            Raqamlar <br/>
            <span className="text-zinc-400">biz uchun gapiradi.</span>
          </h1>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
          Biz har bir o'quvchining muvaffaqiyati uchun mas'uliyatni o'z zimmamizga olamiz. Natijalarimiz — mehnatimiz mahsuli.
        </p>
      </div>

      {/* Big Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-32">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`${stat.bg} ${stat.text} p-10 rounded-[2rem] flex flex-col justify-between min-h-[300px] relative overflow-hidden group border border-zinc-200 dark:border-zinc-800`}
          >
            <div className="flex justify-end mb-8">
               <ArrowUpRight size={24} className="opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <div className="text-5xl md:text-6xl font-black tracking-tighter mb-4">{stat.value}</div>
              <div className="text-lg font-bold opacity-80 leading-tight">{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Successful Students Gallery */}
      <div className="flex items-center gap-3 mb-12 mt-32">
        <div className="w-2 h-2 rounded-full bg-orange-500"></div>
        <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Faxrimiz</span>
      </div>
      
      <div className="mb-16">
        <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Muvaffaqiyatli bitiruvchilar</h2>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Bizning o'quvchilarimiz respublikaning eng nufuzli maktablarida o'qishni davom ettirishmoqda.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-32">
        {[
          { name: "Azizbek R.", school: "Prezident Maktabi", img: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?q=80&w=1949&auto=format&fit=crop" },
          { name: "Malika K.", school: "Al-Xorazmiy Maktabi", img: "https://images.unsplash.com/photo-1544717302-de2939b7ef71?q=80&w=2069&auto=format&fit=crop" },
          { name: "Sardor I.", school: "Prezident Maktabi", img: "https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc?q=80&w=2070&auto=format&fit=crop" },
          { name: "Nodira A.", school: "Ixtisoslashtirilgan Maktab", img: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=2069&auto=format&fit=crop" }
        ].map((student, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="group relative aspect-[3/4] rounded-[2rem] overflow-hidden bg-zinc-100 dark:bg-zinc-900"
          >
            <img src={student.img} alt={student.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 w-full p-6 text-white">
              <h3 className="text-2xl font-black mb-1">{student.name}</h3>
              <p className="text-blue-400 font-bold text-sm uppercase tracking-wider">{student.school}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Testimonials */}
      <div className="flex items-center gap-3 mb-12">
        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
        <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Ota-onalar Fikri</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {testimonials.map((test, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-zinc-900 p-10 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between"
          >
            <div>
              <div className="flex gap-1 text-orange-500 mb-8">
                {[...Array(5)].map((_, j) => <Star key={j} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="text-xl md:text-2xl font-medium text-zinc-800 dark:text-zinc-200 mb-12 leading-relaxed">
                "{test.text}"
              </p>
            </div>
            <div className="flex items-center gap-4 border-t border-zinc-100 dark:border-zinc-800 pt-6">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black text-zinc-900 dark:text-white text-lg">
                {test.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white">{test.name}</h4>
                <p className="text-sm text-zinc-500 font-medium uppercase tracking-wider">{test.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
