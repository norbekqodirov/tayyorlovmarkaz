import { motion } from 'motion/react';
import { ArrowUpRight, Sparkles, ChevronRight, Star, BookOpen, Target, Users, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useFirestore } from '../hooks/useFirestore';

export default function Home() {
  const { data: firestoreGallery } = useFirestore<any>('gallery');
  const { data: firestoreNews } = useFirestore<any>('news');

  const [galleryItems, setGalleryItems] = useState([
    { img: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2070&auto=format&fit=crop", title: "Ochiq eshiklar kuni", date: "15 Oktabr, 2024" },
    { img: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=2070&auto=format&fit=crop", title: "Mock test jarayonlari", date: "10 Oktabr, 2024" },
    { img: "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop", title: "Ustozlar bilan seminar", date: "05 Oktabr, 2024" }
  ]);

  const [newsItems, setNewsItems] = useState<any[]>([]);

  useEffect(() => {
    if (firestoreGallery && firestoreGallery.length > 0) {
      const mapped = firestoreGallery.slice(0, 3).map((item: any) => ({
        img: item.url,
        title: item.title || 'Galereya rasmi',
        date: item.date ? new Date(item.date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
      }));
      setGalleryItems(mapped);
    }
  }, [firestoreGallery]);

  useEffect(() => {
    if (firestoreNews && firestoreNews.length > 0) {
      const activeNews = firestoreNews.filter((p: any) => p.status === 'Faol').slice(0, 2);
      setNewsItems(activeNews);
    } else {
      setNewsItems([
        {
          id: 1,
          title: "Prezident maktablariga tayyorgarlikni qachon boshlash kerak?",
          excerpt: "Farzandingizni Prezident maktabiga tayyorlashni qachon boshlash eng maqbul vaqt ekanligi haqida mutaxassislar maslahati.",
          imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=2022&auto=format&fit=crop",
          date: "2024-10-15",
          author: "Azizbek Rahimov"
        },
        {
          id: 2,
          title: "Matematikani o'rganishning 5 ta samarali usuli",
          excerpt: "Matematika fanini oson va qiziqarli o'rganish uchun eng yaxshi va sinalgan metodlar bilan tanishing.",
          imageUrl: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=2070&auto=format&fit=crop",
          date: "2024-10-12",
          author: "Malika Karimova"
        }
      ]);
    }
  }, [firestoreNews]);

  return (
    <div className="w-full bg-white dark:bg-black text-zinc-900 dark:text-zinc-50">
      {/* HERO SECTION */}
      <section className="relative pb-20 px-4 md:px-8 max-w-[1200px] mx-auto flex flex-col items-center text-center min-h-[80vh] justify-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/20 dark:bg-blue-500/10 blur-[120px] rounded-full pointer-events-none"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-bold uppercase tracking-wider mb-8"
        >
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
          Yangi qabul mavsumi {new Date().getFullYear()}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-6xl md:text-8xl font-black tracking-tighter leading-[1.1] mb-6"
        >
          Farzandingiz kelajagini <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
            biz bilan quring
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-lg md:text-2xl max-w-2xl text-zinc-600 dark:text-zinc-400 font-medium mb-10"
        >
          Prezident maktablari va nufuzli oliygohlarga kafolatlangan tayyorgarlik.
          Zamonaviy metodika va kuchli ustozlar jamoasi.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <Link to="/boglanish" className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-lg transition-all hover:scale-105 hover:shadow-xl hover:shadow-blue-600/30 flex items-center justify-center gap-2">
            Kursga yozilish <ArrowUpRight size={20} />
          </Link>
          <Link to="/talim-tizimi" className="w-full sm:w-auto px-8 py-4 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-full font-bold text-lg transition-all flex items-center justify-center gap-2">
            Dastur bilan tanishish
          </Link>
        </motion.div>
      </section>

      {/* STATS SECTION - Moved right after hero for trust building */}
      <section className="py-12 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-zinc-200 dark:divide-zinc-800">
            <div className="text-center px-4">
              <h3 className="text-4xl md:text-5xl font-black text-blue-600 dark:text-blue-500 mb-2">95%</h3>
              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 font-medium">Prezident maktablariga qabul</p>
            </div>
            <div className="text-center px-4">
              <h3 className="text-4xl md:text-5xl font-black text-zinc-900 dark:text-white mb-2">500+</h3>
              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 font-medium">Muvaffaqiyatli bitiruvchilar</p>
            </div>
            <div className="text-center px-4">
              <h3 className="text-4xl md:text-5xl font-black text-zinc-900 dark:text-white mb-2">4 <span className="text-2xl">oy</span></h3>
              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 font-medium">O'rtacha tayyorgarlik vaqti</p>
            </div>
            <div className="text-center px-4">
              <h3 className="text-4xl md:text-5xl font-black text-zinc-900 dark:text-white mb-2">100%</h3>
              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 font-medium">Sifat nazorati va kafolat</p>
            </div>
          </div>
        </div>
      </section>

      {/* PROGRAMS / FEATURES */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Bizning ta'lim dasturlari</h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">Har bir o'quvchining qobiliyati va maqsadiga moslashtirilgan maxsus o'quv kurslari.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] p-8 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 transition-colors group">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Target size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-4">Prezident Maktablari</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Matematika, ingliz tili va mantiqiy fikrlash bo'yicha chuqurlashtirilgan tayyorgarlik.</p>
            <Link to="/talim-tizimi" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:gap-3 transition-all">
              Batafsil <ChevronRight size={18} />
            </Link>
          </div>

          {/* Card 2 */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] p-8 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 transition-colors group">
            <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <BookOpen size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-4">Al-Xorazmiy Maktabi</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Aniq fanlar va dasturlash asoslariga yo'naltirilgan maxsus intensiv kurslar.</p>
            <Link to="/talim-tizimi" className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold hover:gap-3 transition-all">
              Batafsil <ChevronRight size={18} />
            </Link>
          </div>

          {/* Card 3 */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] p-8 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 transition-colors group">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Award size={28} />
            </div>
            <h3 className="text-2xl font-bold mb-4">Respublika Mock Testi</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">Haqiqiy imtihon atmosferasini his qilish va bilimni sinab ko'rish uchun oylik testlar.</p>
            <Link to="/talim-tizimi" className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold hover:gap-3 transition-all">
              Batafsil <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* BENEFITS / WHY US (Bento Grid) */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row items-end justify-between mb-12 gap-6">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] max-w-2xl">
            Nega aynan bizni <br />
            <span className="text-blue-600 dark:text-blue-500">tanlashadi?</span>
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-md">
            Biz shunchaki dars o'tmaymiz, biz o'quvchilarning fikrlash doirasini kengaytiramiz va ularni kelajakka tayyorlaymiz.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 bg-blue-600 rounded-[2rem] p-10 text-white relative overflow-hidden flex flex-col justify-between min-h-[300px]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 blur-[80px] rounded-full"></div>
            <div className="relative z-10 max-w-lg">
              <h3 className="text-3xl font-bold mb-4">Kuchli ustozlar jamoasi</h3>
              <p className="text-blue-100 text-lg">Xalqaro va respublika olimpiadalari g'oliblari, ko'p yillik tajribaga ega mutaxassislar farzandingizga ta'lim beradi.</p>
            </div>
            <Users size={80} className="absolute bottom-4 right-4 text-white/10" />
          </div>

          <div className="md:col-span-4 bg-zinc-950 dark:bg-zinc-900 rounded-[2rem] p-10 text-white flex flex-col justify-between min-h-[300px] relative overflow-hidden group">
            <img src="https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop" alt="Zamonaviy metodika" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-500" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-2xl font-bold mb-4">Zamonaviy metodika</h3>
              <p className="text-zinc-400">Faqat yodlash emas, balki mantiqiy fikrlashga asoslangan ta'lim tizimi.</p>
            </div>
            <div className="relative z-10 w-12 h-12 rounded-full bg-zinc-800/80 backdrop-blur-sm flex items-center justify-center mt-8">
              <Sparkles size={24} className="text-orange-400" />
            </div>
          </div>

          <div className="md:col-span-5 bg-orange-500 rounded-[2rem] p-10 text-white flex flex-col justify-between min-h-[300px] relative overflow-hidden group">
            <img src="https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=2070&auto=format&fit=crop" alt="Psixologik qo'llab-quvvatlash" className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-40 transition-opacity duration-500 mix-blend-overlay" referrerPolicy="no-referrer" />
            <div className="relative z-10">
              <h3 className="text-2xl font-bold mb-4">Psixologik qo'llab-quvvatlash</h3>
              <p className="text-orange-100">Imtihon stressini yengish va o'ziga bo'lgan ishonchni oshirish uchun maxsus treninglar.</p>
            </div>
          </div>

          <div className="md:col-span-7 bg-zinc-100 dark:bg-zinc-800/50 rounded-[2rem] p-10 flex flex-col justify-between min-h-[300px] border border-zinc-200 dark:border-zinc-700">
            <div>
              <h3 className="text-3xl font-bold mb-4 text-zinc-900 dark:text-white">Doimiy nazorat va hisobot</h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-lg max-w-lg">Ota-onalar farzandining o'zlashtirish ko'rsatkichlarini maxsus platforma orqali kuzatib borishlari mumkin.</p>
            </div>
            <div className="mt-8 flex gap-2">
              <span className="px-4 py-2 bg-white dark:bg-zinc-900 rounded-full text-sm font-bold shadow-sm">Haftalik testlar</span>
              <span className="px-4 py-2 bg-white dark:bg-zinc-900 rounded-full text-sm font-bold shadow-sm">Oylik hisobot</span>
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY / LATEST NEWS */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto bg-zinc-50 dark:bg-zinc-900/30 rounded-[3rem] my-12">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Hayotimiz</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-2xl">
              Markazimizdagi <br />
              <span className="text-zinc-400">qaynoq jarayonlar.</span>
            </h2>
          </div>
          <Link to="/biz-haqimizda" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:gap-3 transition-all">
            Barchasini ko'rish <ChevronRight size={18} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {galleryItems.map((item, i) => (
            <div key={i} className="group cursor-pointer">
              <div className="aspect-[4/3] rounded-[2rem] overflow-hidden mb-6 relative">
                <img src={item.img} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500"></div>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{item.date}</span>
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.title}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* LATEST BLOG POSTS */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Blog va Yangiliklar</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-2xl">
              So'nggi <br />
              <span className="text-orange-500">maqolalar.</span>
            </h2>
          </div>
          <Link to="/blog" className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold hover:gap-3 transition-all">
            Barcha maqolalar <ChevronRight size={18} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {newsItems.map((post: any) => (
            <Link to={`/blog/${post.id}`} key={post.id} className="group flex flex-col md:flex-row gap-6 bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200 dark:border-zinc-800 hover:border-orange-500 transition-colors">
              <div className="w-full md:w-2/5 aspect-[4/3] md:aspect-square rounded-2xl overflow-hidden shrink-0">
                <img src={post.imageUrl || post.url} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
              </div>
              <div className="flex flex-col justify-center flex-1">
                <div className="flex items-center gap-3 mb-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  <span>{post.date ? new Date(post.date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</span>
                  {post.author && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                      <span>{post.author}</span>
                    </>
                  )}
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white mb-3 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 line-clamp-3 mb-6">
                  {post.excerpt || post.content?.substring(0, 150) + '...'}
                </p>
                <span className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold mt-auto group-hover:gap-3 transition-all">
                  O'qishni davom ettirish <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Ota-onalar fikri</h2>
          <p className="text-zinc-600 dark:text-zinc-400">Bizning natijalarimiz o'quvchilarimiz va ularning ota-onalari tilidan.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-10 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-orange-500 mb-6">
              {[1, 2, 3, 4, 5].map(i => <Star key={i} size={18} fill="currentColor" />)}
            </div>
            <p className="text-xl font-medium leading-relaxed mb-8 text-zinc-800 dark:text-zinc-200">
              "Markazdagi nazorat tizimi va jamoa farzandimni doim oldinga undaydi. Bu ta'lim va qiziqishning mukammal uyg'unligi. Farzandim Prezident maktabiga kirdi!"
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <img src="https://i.pravatar.cc/100?img=44" alt="Parent" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-bold">Dilnoza S.</h4>
                <p className="text-sm text-zinc-500">Ota-ona</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-10 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-orange-500 mb-6">
              {[1, 2, 3, 4, 5].map(i => <Star key={i} size={18} fill="currentColor" />)}
            </div>
            <p className="text-xl font-medium leading-relaxed mb-8 text-zinc-800 dark:text-zinc-200">
              "Ustozlarning har bir bolaga individual yondashuvi meni juda quvontirdi. Qisqa vaqt ichida o'g'limning matematikasida katta o'zgarish sezildi."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <img src="https://i.pravatar.cc/100?img=11" alt="Parent" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-bold">Rustam A.</h4>
                <p className="text-sm text-zinc-500">Ota-ona</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto mb-12">
        <div className="bg-zinc-950 dark:bg-zinc-900 rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight mb-8">
              Kelajakni birga quramiz
            </h2>
            <p className="text-xl text-zinc-400 mb-12">
              Farzandingizning muvaffaqiyatli kelajagi uchun birinchi qadamni bugun tashlang. Bepul diagnostika testiga yoziling.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/boglanish" className="w-full sm:w-auto px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-lg transition-all hover:scale-105 flex items-center justify-center gap-2">
                Ro'yxatdan o'tish <ArrowUpRight size={24} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
