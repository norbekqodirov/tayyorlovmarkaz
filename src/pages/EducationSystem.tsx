import { motion } from 'motion/react';
import { Target, Brain, LineChart, ShieldCheck, ArrowUpRight, BookOpen, Award, CheckCircle2, Clock, Users, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EducationSystem() {
  const steps = [
    {
      icon: <Target className="w-10 h-10 text-orange-500" />,
      title: "Diagnostika",
      desc: "Har bir o'quvchi markazga kelganda maxsus diagnostika testidan o'tadi. Bu orqali uning kuchli va zaif tomonlari aniqlanib, mos darajadagi guruhga taqsimlanadi.",
      num: "01",
      bg: "bg-white dark:bg-zinc-900",
      img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop"
    },
    {
      icon: <Brain className="w-10 h-10 text-white" />,
      title: "Intensiv O'qitish",
      desc: "Matematika, Ingliz tili va Mantiq fanlaridan chuqurlashtirilgan darslar. Darslar interaktiv usulda, bolani zeriktirmaydigan tarzda o'tiladi.",
      num: "02",
      bg: "bg-blue-600",
      img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2071&auto=format&fit=crop"
    },
    {
      icon: <LineChart className="w-10 h-10 text-white" />,
      title: "Oylik Monitoring",
      desc: "Har oy oxirida haqiqiy imtihon atmosferasida DTM va Kembrij formatidagi testlar olinadi. Natijalar ota-onalarga tahliliy hisobot shaklida yuboriladi.",
      num: "03",
      bg: "bg-zinc-950",
      img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2070&auto=format&fit=crop"
    },
    {
      icon: <ShieldCheck className="w-10 h-10 text-zinc-900 dark:text-white" />,
      title: "Psixologik Tayyorgarlik",
      desc: "Imtihon stressini yengish, vaqtni to'g'ri taqsimlash va o'ziga ishonchni oshirish bo'yicha professional psixologlar bilan doimiy treninglar.",
      num: "04",
      bg: "bg-zinc-100 dark:bg-zinc-800",
      img: "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop"
    }
  ];

  const subjects = [
    {
      name: "Matematika",
      desc: "Mantiqiy va tezkor hisoblash, masalalar yechishning nostandart usullari.",
      details: ["Arifmetika va algebra asoslari", "Mantiqiy masalalar", "Tezkor hisoblash sirlari", "Olimpiada darajasidagi misollar"],
      img: "https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=2070&auto=format&fit=crop"
    },
    {
      name: "Ingliz tili",
      desc: "Cambridge dasturi asosida chuqurlashtirilgan grammatika va so'zlashuv.",
      details: ["Reading va Listening ko'nikmalari", "Grammatika qoidalari", "Vocabulary (Lug'at boyligi)", "Speaking amaliyoti"],
      img: "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?q=80&w=2071&auto=format&fit=crop"
    },
    {
      name: "Tanqidiy fikrlash",
      desc: "Prezident maktablari imtihonining eng muhim qismi bo'lgan mantiqiy fikrlash.",
      details: ["Fazoviy tasavvur", "Qonuniyatlarni topish", "Matnli mantiqiy masalalar", "Analitik fikrlash"],
      img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop"
    }
  ];

  const courses = [
    {
      title: "Prezident Maktablariga Tayyorgarlik",
      description: "Matematika, ingliz tili va mantiqiy fikrlash bo'yicha chuqurlashtirilgan tayyorgarlik kursi.",
      duration: "9 oy",
      students: "12-15 nafar",
      icon: <Target size={24} />,
      color: "blue",
      features: ["Kembrij dasturi asosida ingliz tili", "Mantiqiy va tanqidiy fikrlash", "Har oy mock testlar"]
    },
    {
      title: "Al-Xorazmiy Maktabiga Tayyorgarlik",
      description: "Aniq fanlar va dasturlash asoslariga yo'naltirilgan maxsus intensiv kurslar.",
      duration: "6 oy",
      students: "10-12 nafar",
      icon: <BookOpen size={24} />,
      color: "orange",
      features: ["Chuqurlashtirilgan matematika", "Dasturlash asoslari", "Olimpiada masalalari"]
    },
    {
      title: "IELTS va CEFR Tayyorgarlik",
      description: "Xalqaro sertifikatlar olish uchun intensiv ingliz tili kurslari.",
      duration: "6-9 oy",
      students: "8-10 nafar",
      icon: <Award size={24} />,
      color: "emerald",
      features: ["Speaking Club darslari", "Mock IELTS testlari", "Writing tahlili"]
    }
  ];

  return (
    <div className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-20 gap-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Ta'lim tizimi</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-4xl">
            Noyob <br/>
            <span className="text-zinc-400">Ta'lim Tizimi.</span>
          </h1>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
          Bizning ta'lim tizimimiz yillar davomida sinalgan va yuqori natijalar ko'rsatgan metodikaga asoslangan. Biz shunchaki yodlatmaymiz, biz fikrlashni o'rgatamiz.
        </p>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-32">
        {steps.map((step, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`${step.bg} p-10 md:p-12 rounded-[2rem] md:rounded-[3rem] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between min-h-[400px] relative overflow-hidden group`}
          >
            <div className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-20 transition-opacity duration-500">
              <img src={step.img} alt={step.title} className="w-full h-full object-cover mix-blend-overlay" referrerPolicy="no-referrer" />
            </div>
            <div className="relative z-10 flex justify-between items-start mb-12">
              <div className="w-20 h-20 rounded-2xl bg-white/20 dark:bg-black/10 backdrop-blur-md flex items-center justify-center">
                {step.icon}
              </div>
              <span className={`text-6xl font-black opacity-20 ${step.bg.includes('zinc-950') ? 'text-white' : 'text-black'}`}>
                {step.num}
              </span>
            </div>
            <div className="relative z-10">
              <h3 className={`text-3xl font-black mb-4 ${step.bg.includes('zinc-950') || step.bg.includes('blue-600') ? 'text-white' : 'text-zinc-900 dark:text-white'}`}>
                {step.title}
              </h3>
              <p className={`text-lg font-medium leading-relaxed ${step.bg.includes('zinc-950') || step.bg.includes('blue-600') ? 'text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'}`}>
                {step.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Subjects Section */}
      <div className="mb-32">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Fanlar</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white">
              Asosiy <br/>
              <span className="text-zinc-400">yo'nalishlar.</span>
            </h2>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
            Biz faqat imtihon uchun eng zarur bo'lgan va kelajakda poydevor bo'ladigan fanlarni chuqurlashtirilgan holda o'qitamiz.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {subjects.map((sub, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white dark:bg-zinc-900 rounded-[2.5rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 group"
            >
              <div className="aspect-[16/10] overflow-hidden relative">
                <img src={sub.img} alt={sub.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
              </div>
              <div className="p-8">
                <h3 className="text-2xl font-black mb-4 text-zinc-900 dark:text-white">{sub.name}</h3>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 font-medium leading-relaxed">{sub.desc}</p>
                <div className="space-y-2">
                  {sub.details.map((detail, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 font-medium">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Courses Section */}
      <div className="mb-32">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-bold uppercase tracking-wider mb-6">
            <Star size={16} />
            Bizning Kurslar
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
            Kelajagingiz uchun <br/>
            <span className="text-zinc-400 text-3xl md:text-5xl">to'g'ri tanlov.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {courses.map((course, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-zinc-50 dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-all group"
            >
              <div className={`w-14 h-14 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform`}>
                <div className={`text-${course.color}-500`}>
                  {course.icon}
                </div>
              </div>
              <h3 className="text-xl font-black mb-3 text-zinc-900 dark:text-white">{course.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-sm font-medium leading-relaxed">{course.description}</p>
              
              <div className="flex gap-4 mb-6">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase">
                  <Clock size={14} /> {course.duration}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase">
                  <Users size={14} /> {course.students}
                </div>
              </div>

              <div className="space-y-2 mb-8">
                {course.features.map((f, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    {f}
                  </div>
                ))}
              </div>

              <Link to="/boglanish" className="flex items-center justify-center gap-2 w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white dark:hover:text-white transition-colors">
                Yozilish <ArrowUpRight size={18} />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-zinc-950 rounded-[3rem] p-10 md:p-20 text-white relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=2022&auto=format&fit=crop')] opacity-10 mix-blend-overlay object-cover"></div>
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-500/30 blur-[100px] rounded-full"></div>
        
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-[1.1]">
            Farzandingizni <br/> tizimimizda sinab ko'rmoqchimisiz?
          </h2>
          <p className="text-zinc-400 text-xl font-medium">
            Hoziroq ro'yxatdan o'ting va bepul diagnostika testida qatnashish imkoniyatini qo'lga kiriting.
          </p>
        </div>
        
        <div className="relative z-10 flex-shrink-0">
          <Link to="/boglanish" className="w-40 h-40 rounded-full bg-blue-600 text-white flex flex-col items-center justify-center hover:scale-105 transition-transform group shadow-xl shadow-blue-600/30">
            <span className="font-bold text-lg mb-1">Yozilish</span>
            <ArrowUpRight size={32} strokeWidth={3} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
