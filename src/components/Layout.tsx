import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Moon, Sun, Menu, X, ArrowUpRight, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_LINKS = [
  { name: "Bosh sahifa", path: "/" },
  { name: "Biz haqimizda", path: "/biz-haqimizda" },
  { name: "Ta'lim tizimi", path: "/talim-tizimi" },
  { name: "Natijalar", path: "/natijalar" },
  { name: "Ustozlar", path: "/ustozlar" },
  { name: "Blog", path: "/blog" },
  { name: "Aloqa", path: "/boglanish" },
];

export default function Layout() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    setIsOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-zinc-50 dark:bg-zinc-950">
      {/* Liquid Glass Floating Navbar */}
      <header className="fixed top-4 left-4 right-4 md:left-8 md:right-8 z-50 mx-auto max-w-[1400px]">
        <div className="w-full bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/50 dark:border-zinc-800/50 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] rounded-2xl px-4 md:px-5 py-3 flex justify-between items-center transition-all duration-300">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 text-blue-600 dark:text-blue-400 z-50 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 group-hover:scale-105 transition-transform">
              <GraduationCap size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl leading-none tracking-tight text-slate-900 dark:text-white">TAYYORLOV</span>
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 leading-none mt-1">Markazi</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center p-1.5 rounded-xl">
            {NAV_LINKS.map(link => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-300 ${isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="navbar-active"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-lg shadow-sm border border-slate-200/50 dark:border-zinc-600/50 -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{link.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 md:gap-3 z-50">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="w-10 h-10 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-zinc-700 border border-transparent hover:border-slate-200 dark:hover:border-zinc-600 transition-all shadow-sm"
              aria-label="Toggle Dark Mode"
            >
              {darkMode ? <Sun size={18} strokeWidth={2.5} /> : <Moon size={18} strokeWidth={2.5} />}
            </button>

            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm cursor-pointer hover:bg-white dark:hover:bg-zinc-700 border border-transparent hover:border-slate-200 dark:hover:border-zinc-600 transition-all shadow-sm">
              UZ
            </div>

            <Link
              to="/boglanish"
              className="hidden md:flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 border border-blue-500/50"
            >
              Kursga yozilish
            </Link>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden w-10 h-10 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 flex items-center justify-center text-slate-900 dark:text-white hover:bg-white dark:hover:bg-zinc-700 border border-transparent hover:border-slate-200 dark:hover:border-zinc-600 transition-all shadow-sm"
            >
              {isOpen ? <X size={20} strokeWidth={2.5} /> : <Menu size={20} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl transition-all duration-300 lg:hidden flex flex-col ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex flex-col gap-2 pt-32 px-6 overflow-y-auto pb-24">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `text-2xl font-black p-4 rounded-2xl transition-colors ${isActive ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-white"
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}
          <Link
            to="/boglanish"
            className="mt-8 w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-bold text-center text-xl shadow-lg shadow-blue-600/20 border border-blue-500/50 transition-colors"
          >
            Kursga yozilish
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow flex flex-col pt-32 md:pt-40">
        <Outlet />
      </main>

      {/* Massive Footer */}
      <footer className="bg-white dark:bg-[#0A0A0A] pt-20 pb-10 px-4 md:px-8 border-t border-zinc-200 dark:border-zinc-800 overflow-hidden mt-auto">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-20">
            <div className="lg:col-span-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase mb-6">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Yangi Tajriba
              </div>
              <h3 className="text-3xl md:text-4xl font-bold mb-6">
                Biz kelajak yetakchilari <br /> uchun barchasini qilamiz.
              </h3>
              <div className="flex gap-4 text-sm font-medium text-zinc-500">
                <span className="flex items-center gap-1"><ArrowUpRight size={16} /> Ekspert Ustozlar</span>
                <span className="flex items-center gap-1"><ArrowUpRight size={16} /> Maxsus Tadbirlar</span>
              </div>
            </div>
            <div>
              <ul className="space-y-3 text-sm font-bold uppercase">
                <li><Link to="/biz-haqimizda" className="hover:text-orange-500">Biz haqimizda</Link></li>
                <li><Link to="/talim-tizimi" className="hover:text-orange-500">Ta'lim tizimi</Link></li>
                <li><Link to="/natijalar" className="hover:text-orange-500">Natijalar</Link></li>
                <li><Link to="/ustozlar" className="hover:text-orange-500">Ustozlar</Link></li>
              </ul>
            </div>
            <div>
              <ul className="space-y-3 text-sm font-bold uppercase">
                <li><a href="https://t.me/tayyorlovmarkazi" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between hover:text-orange-500">Telegram <ArrowUpRight size={16} /></a></li>
                <li><a href="https://instagram.com/tayyorlovmarkazi" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between hover:text-orange-500">Instagram <ArrowUpRight size={16} /></a></li>
                <li><a href="https://facebook.com/tayyorlovmarkazi" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between hover:text-orange-500">Facebook <ArrowUpRight size={16} /></a></li>
              </ul>
              <div className="mt-8 w-12 h-12 rounded-full bg-orange-500 flex flex-wrap p-2 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <div key={i} className="w-2 h-2 bg-white rounded-full"></div>)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center border-t border-zinc-200 dark:border-zinc-800 pt-10">
            <h1 className="text-[16vw] font-black tracking-tighter leading-none uppercase text-zinc-900 dark:text-white w-full text-center">
              TAYYORLOV
            </h1>
            <div className="flex flex-col md:flex-row justify-between w-full mt-10 text-xs font-bold text-zinc-500 uppercase tracking-widest gap-4">
              <span>Maxfiylik Siyosati</span>
              <span>EST — {new Date().getFullYear()}</span>
              <span>Foydalanish Shartlari</span>
            </div>
          </div>
        </div>
      </footer >
    </div >
  );
}
