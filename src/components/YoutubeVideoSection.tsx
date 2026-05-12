import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Youtube, Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';

function extractVideoId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

interface VideoCard {
  id: string;
  url: string;
  title: string;
  description?: string;
  isActive: boolean;
}

function VideoItem({ video }: { video: VideoCard }) {
  const videoId = extractVideoId(video.url);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (!videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&loop=1&playlist=${videoId}&mute=0&controls=1`;
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div
      className="relative shrink-0 w-[200px] sm:w-[220px] rounded-2xl overflow-hidden shadow-xl group cursor-pointer"
      style={{ aspectRatio: '9/16' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      onClick={() => setPlaying(true)}
    >
      {playing ? (
        <iframe
          src={embedUrl}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-2xl"
          style={{ border: 0 }}
        />
      ) : (
        <>
          {/* Thumbnail */}
          <img
            src={thumbUrl}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* YouTube icon + play */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-2xl transition-transform duration-300 ${hovered ? 'scale-110' : 'scale-100'}`}>
              <Play size={24} className="text-white ml-1" fill="white" />
            </div>
          </div>

          {/* YouTube badge */}
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full">
              <Youtube size={12} className="text-red-500" />
              <span className="text-white text-[10px] font-bold">Shorts</span>
            </div>
          </div>

          {/* Title */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-white text-sm font-bold line-clamp-2 leading-snug">{video.title}</p>
            {video.description && (
              <p className="text-white/60 text-xs mt-1 line-clamp-2">{video.description}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function YoutubeVideoSection() {
  const { data: allVideos = [] } = useFirestore<VideoCard>('videos');
  const videos = allVideos.filter(v => v.isActive !== false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const isPaused = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    if (videos.length < 3) return;
    const el = scrollRef.current;
    if (!el) return;
    let lastTime = 0;
    const speed = 0.5; // px per ms

    const animate = (time: number) => {
      if (!isPaused.current) {
        const delta = time - lastTime;
        el.scrollLeft += speed * Math.min(delta, 50);
        // Loop: if reached end, jump to beginning
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
          el.scrollLeft = 0;
        }
        updateScrollButtons();
      }
      lastTime = time;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [videos.length, updateScrollButtons]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'right' ? 280 : -280, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 400);
  };

  if (videos.length === 0) return null;

  return (
    <section className="py-20 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row items-end justify-between mb-10 gap-6"
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <Youtube size={14} className="text-red-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">YouTube</span>
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
              Bizning <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                muvaffaqiyatlar
              </span>
            </h2>
            <p className="mt-4 text-zinc-500 dark:text-zinc-400 max-w-md">
              O'quvchilarimizning yutuqlari va taassurotlarini bevosita ko'ring.
            </p>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:border-red-500 hover:text-red-500 disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:border-red-500 hover:text-red-500 disabled:opacity-30 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Scrollable video strip — full width */}
      <div className="relative">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white dark:from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-black to-transparent z-10 pointer-events-none" />

        <div
          ref={scrollRef}
          onMouseEnter={() => { isPaused.current = true; }}
          onMouseLeave={() => { isPaused.current = false; }}
          onScroll={updateScrollButtons}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-4 px-8"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Duplicate for seamless loop */}
          {[...videos, ...videos].map((video, idx) => (
            <motion.div
              key={`${video.id}-${idx}`}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: Math.min(idx * 0.06, 0.5) }}
            >
              <VideoItem video={video} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
