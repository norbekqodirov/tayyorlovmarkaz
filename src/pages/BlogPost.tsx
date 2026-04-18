import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Calendar, User, Share2 } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useFirestore } from '../hooks/useFirestore';
import { useToast } from '../components/Toast';

export default function BlogPost() {
  const { id } = useParams();
  const { data: news } = useFirestore<any>('news');
  const { showToast } = useToast();
  const [post, setPost] = useState<any>(null);

  useEffect(() => {
    if (news && news.length > 0) {
      const found = news.find((p: any) => p.id === Number(id) || p.id === id);
      if (found) {
        setPost(found);
      }
    } else {
      // Fallback data
      const defaultPosts = [
        {
          id: 1,
          title: "Yangi o'quv yili uchun qabul boshlandi",
          content: "2026-2027 o'quv yili uchun barcha yo'nalishlar bo'yicha qabul jarayonlari rasman ochiq deb e'lon qilindi. Markazimizda endilikda yangi fanlar va ilg'or metodikalar asosida darslar o'tiladi. O'quvchilarimiz uchun maxsus chegirmalar va grantlar ajratilgan. Shoshiling, joylar soni cheklangan!",
          imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop",
          date: "2026-03-15",
          author: "Admin"
        },
        {
          id: 2,
          title: "IELTS dan 8.5 ball olgan o'quvchimiz sirlari",
          content: "Markazimiz o'quvchisi qanday qilib qisqa vaqt ichida yuqori natijaga erishgani haqida batafsil ma'lumot. Uning kun tartibi, tayyorgarlik jarayoni va foydalangan resurslari haqida ushbu maqolada o'qishingiz mumkin.",
          imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop",
          date: "2026-03-10",
          author: "Admin"
        },
        {
          id: 3,
          title: "Matematika fanidan bepul master-klass",
          content: "Dam olish kuni bo'lib o'tadigan ochiq darsimizga barchani taklif qilamiz. Joylar soni cheklangan. Master-klass davomida eng qiyin misollarni oson yechish usullari ko'rsatib beriladi.",
          imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=2132&auto=format&fit=crop",
          date: "2026-03-05",
          author: "Admin"
        }
      ];
      setPost(defaultPosts.find(p => p.id === Number(id) || p.id.toString() === id));
    }
  }, [id, news]);

  if (!post) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">Maqola topilmadi</h2>
        <Link to="/blog" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2">
          <ArrowLeft size={16} /> Blogga qaytish
        </Link>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full pt-8 pb-20 px-4 md:px-8 max-w-[1000px] mx-auto"
    >
      <Link 
        to="/blog" 
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-8"
      >
        <ArrowLeft size={16} /> Barcha yangiliklar
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-6">
          <span className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full">
            <Calendar size={14} className="text-blue-500" />
            {post.date}
          </span>
          <span className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full">
            <User size={14} className="text-blue-500" />
            {post.author || 'Admin'}
          </span>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] text-zinc-900 dark:text-white mb-8">
          {post.title}
        </h1>
      </div>

      {post.imageUrl && (
        <div className="w-full aspect-video rounded-[2rem] overflow-hidden mb-12 shadow-2xl shadow-black/5 dark:shadow-black/20">
          <img 
            src={post.imageUrl} 
            alt={post.title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-black prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-img:rounded-2xl">
        {post.content ? (
          <div className="markdown-body">
            <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
          </div>
        ) : (
          <p>{post.excerpt}</p>
        )}
      </div>

      <div className="mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-xl">
            {(post.author || 'A')[0]}
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">{post.author || 'Admin'}</p>
            <p className="text-xs text-zinc-500">Muallif</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: post.title,
                url: window.location.href
              });
            } else {
              navigator.clipboard.writeText(window.location.href);
              showToast('Link nusxalandi!', 'success');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl text-sm font-bold transition-colors"
        >
          <Share2 size={16} /> Ulashish
        </button>
      </div>
    </motion.div>
  );
}
