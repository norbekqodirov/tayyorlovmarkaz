import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Users, Award, BookOpen, CheckCircle2, Calendar, ImageIcon } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';

export default function About() {
  const { data: firestoreGallery } = useFirestore<any>('gallery');
  const [gallery, setGallery] = useState<any[]>([]);

  useEffect(() => {
    if (firestoreGallery && firestoreGallery.length > 0) {
      setGallery(firestoreGallery);
    } else {
      setGallery([
        { id: 1, url: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2070&auto=format&fit=crop", title: "Ochiq eshiklar kuni", date: "2024-10-15" },
        { id: 2, url: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=2070&auto=format&fit=crop", title: "Mock test jarayonlari", date: "2024-10-10" },
        { id: 3, url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop", title: "Ustozlar bilan seminar", date: "2024-10-05" },
        { id: 4, url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop", title: "Matematika darsi", date: "2024-09-20" },
        { id: 5, url: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop", title: "Ingliz tili to'garagi", date: "2024-09-15" },
        { id: 6, url: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop", title: "Bitiruvchilar bilan uchrashuv", date: "2024-09-10" },
      ]);
    }
  }, [firestoreGallery]);

  const stats = [
    { label: "O'quvchilar", value: "2000+", icon: Users },
    { label: "Malakali ustozlar", value: "50+", icon: Award },
    { label: "O'quv dasturlari", value: "20+", icon: BookOpen },
    { label: "Natijadorlik", value: "98%", icon: Target },
  ];

  const values = [
    {
      title: "Sifatli ta'lim",
      description: "Biz har bir o'quvchiga individual yondashgan holda, eng zamonaviy metodikalar asosida ta'lim beramiz."
    },
    {
      title: "Malakali ustozlar",
      description: "Markazimizda o'z ishining ustalari, ko'p yillik tajribaga ega bo'lgan professional o'qituvchilar dars beradi."
    },
    {
      title: "Zamonaviy sharoitlar",
      description: "O'quvchilar uchun barcha qulayliklarga ega, zamonaviy texnologiyalar bilan jihozlangan shinam xonalar."
    },
    {
      title: "Kafolatlangan natija",
      description: "Biz o'quvchilarimizning oliygohlarga kirishiga va maqsadlariga erishishiga ishonamiz va kafolat beramiz."
    }
  ];

  return (
    <div className="pb-24 min-h-screen bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-6"
          >
            Biz haqimizda
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-zinc-600 dark:text-zinc-400 font-medium"
          >
            Bizning maqsadimiz - yoshlarga sifatli ta'lim berish orqali ularning yorqin kelajagini qurishga yordam berishdir.
          </motion.p>
        </div>

        {/* Story Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative rounded-[2.5rem] overflow-hidden aspect-[4/3] shadow-2xl"
          >
            <img 
              src="https://images.unsplash.com/photo-1524178232363-1fb2b075b655?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80" 
              alt="Students learning" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div className="absolute bottom-8 left-8 right-8">
              <p className="text-white font-bold text-2xl">Ta'limda innovatsion yondashuv</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-widest">
              Bizning Tariximiz
            </div>
            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Qanday boshlangan?</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
              Markazimiz 2018-yilda tashkil etilgan bo'lib, o'z faoliyatini kichik bir xonada, sanoqli o'quvchilar bilan boshlagan. Bugungi kunga kelib esa, biz minglab o'quvchilarga ta'lim beruvchi, zamonaviy sharoitlarga ega yirik o'quv markaziga aylandik.
            </p>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
              Yillar davomida biz o'z metodikamizni takomillashtirib, eng yaxshi o'qituvchilarni jalb qildik. Bizning asosiy yutug'imiz - bu bizning o'quvchilarimizning erishgan natijalaridir.
            </p>
          </motion.div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-24">
          {stats.map((stat, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-zinc-50 dark:bg-zinc-900 p-8 rounded-[2rem] text-center border border-zinc-100 dark:border-zinc-800 shadow-sm"
            >
              <div className="w-14 h-14 mx-auto bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6">
                <stat.icon size={28} />
              </div>
              <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-2">{stat.value}</h3>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Values Section */}
        <div className="mb-24">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">Bizning qadriyatlarimiz</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto font-medium">
              Biz ta'lim jarayonida quyidagi qadriyatlarga amal qilamiz va ularni eng muhim deb hisoblaymiz.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((value, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-zinc-900 p-10 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm flex gap-6 group hover:border-blue-500 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="text-emerald-500" size={20} />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3">{value.title}</h3>
                  <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">{value.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Gallery Section - Merged */}
        <div className="pt-12 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Galereya</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white">
                Markazimiz <br/>
                <span className="text-zinc-400">hayoti.</span>
              </h2>
            </div>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
              O'quv jarayonlari, tadbirlar va yutuqlarimiz aks etgan fotogalereya.
            </p>
          </div>

          {gallery.length === 0 ? (
            <div className="text-center py-20 bg-zinc-50 dark:bg-zinc-900 rounded-[3rem] border border-zinc-200 dark:border-zinc-800">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                <ImageIcon size={32} />
              </div>
              <p className="text-xl text-zinc-500 font-medium">Hozircha rasmlar yo'q</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {gallery.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group relative aspect-[4/3] rounded-[2.5rem] overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-lg"
                >
                  <img 
                    src={item.url} 
                    alt={item.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8">
                    <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                      <h3 className="text-2xl font-black text-white mb-2">{item.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-zinc-300 font-bold uppercase tracking-widest">
                        <Calendar size={14} />
                        {item.date}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
