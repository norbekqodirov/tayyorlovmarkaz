import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useFirestore } from '../hooks/useFirestore';

export default function Teachers() {
  const { data: firestoreTeachers } = useFirestore<any>('teachers');
  const [teachers, setTeachers] = useState([
    { name: "Azizbek Rahimov", role: "Matematika", exp: "8 yillik tajriba", desc: "O'quvchilari xalqaro olimpiadalarda sovrinli o'rinlarni egallagan. Matematikani oson va qiziqarli tushuntirish bo'yicha mutaxassis.", img: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=2070&auto=format&fit=crop", bg: "bg-zinc-100 dark:bg-zinc-900" },
    { name: "Malika Karimova", role: "Ingliz tili", exp: "IELTS 8.5", desc: "Kembrij dasturi bo'yicha sertifikatlangan o'qituvchi. 5 yildan beri bolalarni xalqaro imtihonlarga tayyorlaydi.", img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=2076&auto=format&fit=crop", bg: "bg-white dark:bg-zinc-800" },
    { name: "Sardor Ibragimov", role: "Tanqidiy fikrlash", exp: "5 yillik tajriba", desc: "Mantiqiy masalalar va tanqidiy fikrlash bo'yicha maxsus qo'llanmalar muallifi.", img: "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?q=80&w=2070&auto=format&fit=crop", bg: "bg-zinc-100 dark:bg-zinc-900" },
    { name: "Nodira Aliyeva", role: "Psixolog", exp: "10 yillik tajriba", desc: "Bolalar psixologiyasi bo'yicha ekspert. Imtihon oldi stressini yengishda o'quvchilarga yordam beradi.", img: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop", bg: "bg-white dark:bg-zinc-800" }
  ]);

  useEffect(() => {
    if (firestoreTeachers && firestoreTeachers.length > 0) {
      const mapped = firestoreTeachers.map((t: any, i: number) => ({
        ...t,
        bg: i % 2 === 0 ? "bg-zinc-100 dark:bg-zinc-900" : "bg-white dark:bg-zinc-800"
      }));
      setTeachers(mapped);
    }
  }, [firestoreTeachers]);

  return (
    <div className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Jamoa</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-4xl">
            Bizning <br/>
            <span className="text-zinc-400">Ustozlar.</span>
          </h1>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
          Farzandingiz kelajagini o'z ishining ustalariga ishonib topshiring. Bizning jamoa faqat eng yaxshilardan iborat.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {teachers.map((teacher, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`${teacher.bg} rounded-[2rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 group relative flex flex-col`}
          >
            <div className="aspect-[3/4] overflow-hidden relative">
              <img src={teacher.img} alt={teacher.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
              
              <div className="absolute bottom-0 left-0 w-full p-6 text-white">
                <div className="inline-block px-3 py-1 bg-blue-600 text-white text-xs font-bold uppercase tracking-wider rounded-full mb-3">
                  {teacher.role}
                </div>
                <h3 className="text-2xl font-black mb-1">{teacher.name}</h3>
                <p className="text-zinc-300 font-medium text-sm">{teacher.exp}</p>
              </div>
            </div>
            
            <div className="p-6 flex-grow flex flex-col justify-between">
              <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed font-medium mb-4">
                {teacher.desc}
              </p>
              <button className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white hover:text-orange-500 transition-colors">
                Batafsil <ArrowUpRight size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
