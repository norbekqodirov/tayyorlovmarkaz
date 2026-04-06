import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Link as LinkIcon, LogOut, Menu, X,
  Settings, GraduationCap, Presentation, Wallet, Calendar, DoorOpen,
  Layers, Megaphone, Star, BookOpen, Plus, Bell, BarChart2, Package,
  Search, UserCircle, ChevronDown,
  ClipboardCheck, TrendingUp, CreditCard, UserCog,
  PanelLeftClose, PanelLeftOpen, Sun, Moon
} from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import { useTheme } from '../contexts/ThemeContext';

// ─── Module definitions ────────────────────────────────────────────────────
const MODULES = [
  {
    id: 'education',
    label: "Ta'lim",
    icon: GraduationCap,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    activeBg: 'bg-blue-600',
    sections: [
      {
        links: [
          { name: 'Dashboard',       path: '/crmtayyorlovmarkaz',             icon: LayoutDashboard, end: true },
          { name: "Mening Portalim", path: '/crmtayyorlovmarkaz/portal',      icon: UserCircle      },
        ],
      },
      {
        title: "O'quv jarayon",
        links: [
          { name: "O'quvchilar",     path: '/crmtayyorlovmarkaz/students',    icon: GraduationCap   },
          { name: 'Guruhlar',        path: '/crmtayyorlovmarkaz/groups',      icon: Layers          },
          { name: 'Kurslar',         path: '/crmtayyorlovmarkaz/courses',     icon: BookOpen        },
          { name: 'Dars Jadvali',    path: '/crmtayyorlovmarkaz/schedule',    icon: Calendar        },
          { name: 'Elektron Jurnal', path: '/crmtayyorlovmarkaz/journal',     icon: ClipboardCheck  },
          { name: 'Baholash',        path: '/crmtayyorlovmarkaz/assessment',  icon: Star            },
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    color: 'text-violet-600',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    activeBg: 'bg-violet-600',
    sections: [
      {
        links: [
          { name: 'Lidlar (Voronka)', path: '/crmtayyorlovmarkaz/leads',     icon: TrendingUp },
          { name: 'Target Formalar',  path: '/crmtayyorlovmarkaz/forms',     icon: LinkIcon   },
          { name: 'Aksiyalar / SMM',  path: '/crmtayyorlovmarkaz/marketing', icon: Megaphone  },
        ],
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: UserCog,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    activeBg: 'bg-emerald-600',
    sections: [
      {
        links: [
          { name: 'Ustozlar', path: '/crmtayyorlovmarkaz/teachers', icon: Presentation },
          { name: 'Xodimlar', path: '/crmtayyorlovmarkaz/staff',    icon: Users         },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Moliya',
    icon: CreditCard,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-500/10',
    activeBg: 'bg-green-600',
    sections: [
      {
        links: [
          { name: 'Moliya', path: '/crmtayyorlovmarkaz/finance', icon: Wallet },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    label: 'BI',
    icon: BarChart2,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    activeBg: 'bg-indigo-600',
    sections: [
      {
        links: [
          { name: 'BI Analitika', path: '/crmtayyorlovmarkaz/bi', icon: BarChart2 },
        ],
      },
    ],
  },
  {
    id: 'management',
    label: 'Boshqaruv',
    icon: Settings,
    color: 'text-zinc-600',
    bg: 'bg-zinc-100 dark:bg-white/5',
    activeBg: 'bg-zinc-700',
    sections: [
      {
        title: 'Resurslar',
        links: [
          { name: 'Xonalar',    path: '/crmtayyorlovmarkaz/rooms',     icon: DoorOpen },
          { name: 'Inventar',   path: '/crmtayyorlovmarkaz/inventory', icon: Package  },
          { name: 'Materiallar',path: '/crmtayyorlovmarkaz/content',   icon: FileText },
        ],
      },
      {
        title: 'Tizim',
        links: [
          { name: 'Foydalanuvchilar', path: '/crmtayyorlovmarkaz/users',     icon: Users   },
          { name: 'Sozlamalar',       path: '/crmtayyorlovmarkaz/settings',  icon: Settings},
        ],
      },
    ],
  },
];

// Detect active module based on URL
function detectModule(pathname: string): string {
  if (pathname.includes('/leads') || pathname.includes('/forms') || pathname.includes('/marketing'))
    return 'marketing';
  if (pathname.includes('/teachers') || pathname.includes('/staff'))
    return 'hr';
  if (pathname.includes('/finance'))
    return 'finance';
  if (pathname.includes('/bi'))
    return 'analytics';
  if (pathname.includes('/rooms') || pathname.includes('/inventory') || pathname.includes('/content') || pathname.includes('/users') || pathname.includes('/settings'))
    return 'management';
  return 'education';
}

export default function CrmLayout() {
  const [activeModuleId, setActiveModuleId] = useState('education');
  const [isRightPanelHidden, setIsRightPanelHidden] = useState(false); // hide right panel → icon-only rail
  const [isMobileOpen, setIsMobileOpen]     = useState(false);
  const [isSearchOpen, setIsSearchOpen]     = useState(false);
  const [showQuickActions, setShowQuickActions]   = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu]           = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();

  const [notifications,   setNotifications]  = useState<any[]>([]);
  const [userName,        setUserName]        = useState('Admin');
  const [userRole,        setUserRole]        = useState('ADMIN');

  // Auto-switch module on route change
  useEffect(() => {
    setActiveModuleId(detectModule(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('crm_user');
      if (raw) {
        const u = JSON.parse(raw);
        setUserName(u.name || 'Admin');
        setUserRole(u.role || 'ADMIN');
      }
    } catch { }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const api = (await import('../api/client')).default;
      const res = await api.get('/notifications');
      setNotifications(Array.isArray(res.data) ? res.data.slice(0, 5) : []);
    } catch { setNotifications([]); }
  }, []);

  useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 30000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setIsSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/crmtayyorlovmarkaz/login');
  };

  const activeModule = MODULES.find(m => m.id === activeModuleId) || MODULES[0];
  const unreadCount  = notifications.filter(n => !n.isRead).length;
  const { resolvedTheme, toggle: toggleTheme } = useTheme();

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f1f2f4] dark:bg-[#0a0a0f] flex font-sans">

      {/* ════════════════ SIDEBAR ════════════════ */}
      <aside className="hidden md:flex h-screen sticky top-0 z-40 shrink-0">

        {/* ── Left rail: module icons ── */}
        <div className="flex flex-col w-[48px] bg-[#1e1e2e] border-r border-white/[0.06] h-full shrink-0">
          {/* Logo */}
          <div className="flex items-center justify-center h-[52px] border-b border-white/[0.06] shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-black shadow-sm">T</div>
          </div>

          {/* Module icons */}
          <div className="flex flex-col items-center gap-0.5 py-2 flex-1">
            {MODULES.map(mod => {
              const Icon = mod.icon;
              const isActive = mod.id === activeModuleId;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setActiveModuleId(mod.id);
                    // Navigate to first link of module
                    const firstLink = mod.sections[0]?.links[0];
                    if (firstLink) navigate(firstLink.path);
                    setIsRightPanelHidden(false);
                  }}
                  title={mod.label}
                  className={`relative group w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                  }`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                  {/* Active indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
                  )}
                  {/* Tooltip */}
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#2a2a3e] text-white text-[10px] font-bold rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {mod.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* User avatar + logout */}
          <div className="flex flex-col items-center gap-1 py-2 border-t border-white/[0.06] shrink-0">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              title={userName}
              className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-black text-[10px] hover:ring-2 hover:ring-white/20 transition-all"
            >
              {userName.charAt(0).toUpperCase()}
            </button>
          </div>
        </div>

        {/* ── Right panel: contextual links ── */}
        <AnimatePresence initial={false}>
          {!isRightPanelHidden && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 162, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex flex-col bg-white dark:bg-[#111118] border-r border-zinc-200/70 dark:border-white/[0.05] h-full overflow-hidden shrink-0"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between h-[52px] px-3 border-b border-zinc-200/70 dark:border-white/[0.05] shrink-0">
                <span className={`text-[11px] font-black uppercase tracking-widest ${activeModule.color}`}>
                  {activeModule.label}
                </span>
                <button
                  onClick={() => setIsRightPanelHidden(true)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
                  title="Panelni yopish"
                >
                  <PanelLeftClose size={13} strokeWidth={2} />
                </button>
              </div>

              {/* Search */}
              <div className="px-2 py-2 shrink-0">
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200/60 dark:hover:bg-white/10 rounded-lg text-zinc-400 transition-all"
                >
                  <Search size={11} />
                  <span className="text-[10px] flex-1 text-left">Qidirish...</span>
                  <kbd className="text-[8px] font-black bg-white dark:bg-white/10 px-1 py-0.5 rounded text-zinc-400">⌘K</kbd>
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-2 space-y-3">
                {activeModule.sections.map((section, si) => (
                  <div key={si}>
                    {section.title && (
                      <p className="px-1.5 mb-1 text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.14em]">
                        {section.title}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {section.links.map(link => {
                        const Icon = link.icon;
                        return (
                          <NavLink
                            key={link.path}
                            to={link.path}
                            end={link.end}
                            className={({ isActive }) =>
                              `flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] transition-all duration-100 ${
                                isActive
                                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                                  : 'text-zinc-500 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                              }`
                            }
                          >
                            <Icon size={13} strokeWidth={2} className="shrink-0" />
                            <span className="truncate">{link.name}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show panel button (when hidden) */}
        {isRightPanelHidden && (
          <div className="flex items-start pt-[52px] bg-white dark:bg-[#111118] border-r border-zinc-200/70 dark:border-white/[0.05]">
            <button
              onClick={() => setIsRightPanelHidden(false)}
              className="m-1 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              title="Panelni ochish"
            >
              <PanelLeftOpen size={13} strokeWidth={2} />
            </button>
          </div>
        )}
      </aside>

      {/* ════════════════ MOBILE HEADER ════════════════ */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-[#111118] border-b border-zinc-200/70 dark:border-white/[0.05] flex items-center justify-between px-4 z-50 h-14">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-black">T</div>
          <span className="text-sm font-black text-slate-900 dark:text-white">Tayyorlov CRM</span>
        </div>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
          {isMobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.15 }}
            className="md:hidden fixed inset-0 top-14 bg-white dark:bg-[#111118] z-40 flex flex-col overflow-hidden">
            {/* Module tabs */}
            <div className="flex overflow-x-auto gap-1 p-3 border-b border-zinc-100 dark:border-white/5 scrollbar-hide">
              {MODULES.map(mod => {
                const Icon = mod.icon;
                return (
                  <button key={mod.id} onClick={() => setActiveModuleId(mod.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold shrink-0 whitespace-nowrap transition-all ${mod.id === activeModuleId ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500'}`}>
                    <Icon size={13} strokeWidth={2} />
                    {mod.label}
                  </button>
                );
              })}
            </div>
            <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-3">
              {activeModule.sections.map((section, si) => (
                <div key={si}>
                  {section.title && <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-1 mb-1">{section.title}</p>}
                  {section.links.map(link => {
                    const Icon = link.icon;
                    return (
                      <NavLink key={link.path} to={link.path} end={link.end} onClick={() => setIsMobileOpen(false)}
                        className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? 'bg-blue-600 text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'}`}>
                        <Icon size={15} strokeWidth={2} />{link.name}
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-zinc-100 dark:border-white/5">
              <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10">
                <LogOut size={15} /> Chiqish
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════ MAIN ════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* Top header */}
        <header className="hidden md:flex items-center justify-between px-5 bg-white dark:bg-[#111118] border-b border-zinc-200/70 dark:border-white/[0.05] h-[52px] shrink-0 z-30">
          <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Search */}
            <button onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200/60 dark:hover:bg-white/10 rounded-lg text-zinc-400 transition-all">
              <Search size={12} />
              <span className="text-[11px] text-zinc-400">Qidirish</span>
              <kbd className="text-[8px] font-black bg-white dark:bg-white/10 text-zinc-400 px-1 py-0.5 rounded shadow-sm ml-0.5">⌘K</kbd>
            </button>

            {/* Quick add */}
            <div className="relative">
              <button onClick={() => setShowQuickActions(!showQuickActions)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition-all active:scale-95 shadow-sm shadow-blue-500/20">
                <Plus size={12} strokeWidth={3} /> Yangi
              </button>
              <AnimatePresence>
                {showQuickActions && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowQuickActions(false)} />
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-1.5 w-44 bg-white dark:bg-[#1a1a24] rounded-xl p-1.5 border border-zinc-200/80 dark:border-white/10 shadow-lg z-20">
                      {[
                        { label: 'Yangi Lid',       icon: TrendingUp,    path: '/crmtayyorlovmarkaz/leads'    },
                        { label: "Yangi O'quvchi",  icon: GraduationCap, path: '/crmtayyorlovmarkaz/students' },
                        { label: 'Yangi Guruh',     icon: Layers,        path: '/crmtayyorlovmarkaz/groups'   },
                      ].map(item => (
                        <button key={item.label} onClick={() => { navigate(item.path); setShowQuickActions(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 rounded-lg transition-all">
                          <item.icon size={12} className="text-blue-600 shrink-0" /> {item.label}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? "Kunduzgi rejim" : "Tungi rejim"}
              className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-all"
            >
              {resolvedTheme === 'dark'
                ? <Sun size={14} strokeWidth={2} />
                : <Moon size={14} strokeWidth={2} />}
            </button>

            <div className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" />

            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 flex items-center justify-center text-zinc-500 transition-all">
                <Bell size={14} strokeWidth={2} />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white dark:border-[#111118]" />}
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-1.5 w-68 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-lg z-20 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-white/[0.06] flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Bildirishnomalar</span>
                        {unreadCount > 0 && <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 rounded-full text-[9px] font-black">{unreadCount}</span>}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {notifications.length === 0
                          ? <div className="py-8 text-center text-[11px] text-zinc-400">Bildirishnomalar yo'q</div>
                          : notifications.map(n => (
                            <div key={n.id} className={`px-4 py-3 border-b border-zinc-50 dark:border-white/[0.03] ${!n.isRead ? 'bg-blue-50/30 dark:bg-blue-500/5' : ''}`}>
                              <p className="text-[11px] font-bold text-slate-900 dark:text-white line-clamp-1">{n.title}</p>
                              <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{n.message}</p>
                            </div>
                          ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar */}
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-all">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 dark:from-blue-500 dark:to-indigo-600 flex items-center justify-center text-white font-black text-[9px] shadow-sm">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-bold text-slate-900 dark:text-white hidden lg:block">{userName}</span>
                <ChevronDown size={10} className="text-zinc-400 hidden lg:block" />
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-[#1a1a24] rounded-xl p-1.5 border border-zinc-200/80 dark:border-white/10 shadow-lg z-20">
                      <div className="px-3 py-2 border-b border-zinc-100 dark:border-white/[0.06] mb-1">
                        <p className="text-[11px] font-bold text-slate-900 dark:text-white">{userName}</p>
                        <p className="text-[9px] text-zinc-400">{userRole}</p>
                      </div>
                      <button onClick={() => { navigate('/crmtayyorlovmarkaz/settings'); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 rounded-lg transition-all">
                        <Settings size={11} /> Sozlamalar
                      </button>
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all">
                        <LogOut size={11} /> Chiqish
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#f1f2f4] dark:bg-[#0a0a0f] mt-14 md:mt-0">
          <Outlet />
        </div>
      </main>

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
