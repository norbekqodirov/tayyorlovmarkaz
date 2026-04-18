import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Calendar, ArrowRight, User } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';

export default function Blog() {
  const { data: news } = useFirestore<any>('news');
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (news && news.length > 0) {
      // Faqat faol yangiliklarni ko'rsatish
      setPosts(news.filter((p: any) => p.status === 'Faol'));
    } else {
      // Default posts if empty
      setPosts([
        {
          id: 1,
          title: "Yangi o'quv yili uchun qabul boshlandi",
          excerpt: "2026-2027 o'quv yili uchun barcha yo'nalishlar bo'yicha qabul jarayonlari rasman ochiq deb e'lon qilindi.",
          imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop",
          date: "2026-03-15",
          author: "Admin"
        },
        {
          id: 2,
          title: "IELTS dan 8.5 ball olgan o'quvchimiz sirlari",
          excerpt: "Markazimiz o'quvchisi qanday qilib qisqa vaqt ichida yuqori natijaga erishgani haqida batafsil ma'lumot.",
          imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop",
          date: "2026-03-10",
          author: "Admin"
        },
        {
          id: 3,
          title: "Matematika fanidan bepul master-klass",
          excerpt: "Dam olish kuni bo'lib o'tadigan ochiq darsimizga barchani taklif qilamiz. Joylar soni cheklangan.",
          imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop",
          date: "2026-03-05",
          author: "Admin"
        }
      ]);
    }
  }, [news]);

  return (
    <div className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-sm font-bold uppercase tracking-widest text-zinc-500">Blog</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white max-w-4xl">
            So'nggi <br/>
            <span className="text-zinc-400">Yangiliklar.</span>
          </h1>
        </div>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-md font-medium">
          Markazimizdagi eng so'nggi yangiliklar, foydali maqolalar va o'quvchilarimizning yutuqlari bilan tanishing.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <p className="text-xl text-zinc-500 font-medium">Hozircha yangiliklar yo'q</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group flex flex-col bg-white dark:bg-zinc-900 rounded-[2rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {post.imageUrl ? (
                  <img 
                    src={post.imageUrl} 
                    alt={post.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    Rasm yo'q
                  </div>
                )}
                <div className="absolute top-4 left-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2 shadow-sm">
                  <Calendar size={14} className="text-blue-500" />
                  {post.date}
                </div>
              </div>
              
              <div className="p-6 md:p-8 flex flex-col flex-grow">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">
                  <User size={14} />
                  {post.author || 'Admin'}
                </div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-4 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed font-medium mb-6 line-clamp-3">
                  {post.excerpt || post.content?.substring(0, 150) + '...'}
                </p>
                
                <div className="mt-auto pt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <Link 
                    to={`/blog/${post.id}`}
                    className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    Batafsil o'qish <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
