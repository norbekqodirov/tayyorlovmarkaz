import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, FileText, Link as LinkIcon, LogOut, Menu, X,
  Settings, GraduationCap, Presentation, Wallet, Calendar, DoorOpen,
  Layers, Megaphone, Star, BookOpen, Plus, Bell, BarChart2, Package,
  Search, UserCircle, ChevronDown, ChevronRight,
  ClipboardCheck, TrendingUp, CreditCard, UserCog,
  PanelLeftClose, PanelLeftOpen, Sun, Moon,
  CheckSquare, Activity,
  ArrowUpRight, Target, Users2
} from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import { useTheme } from '../contexts/ThemeContext';

// ─── Module definitions ────────────────────────────────────────────────────
type NavItem = {
  name: string;
  path: string;
  icon: any;
  permission: string | undefined;
  end?: boolean;
};
type NavSection = { title?: string; links: NavItem[] };
type NavModule = {
  id: string; label: string; icon: any;
  accent: string; gradient: string; color: string;
  activeBg: string; activeNavBg: string;
  sections: NavSection[];
};

// permission: undefined = admin-only; string = requires that permission ID
const MODULES: NavModule[] = [
  {
    id: 'education',
    label: "Ta'lim",
    icon: GraduationCap,
    accent: '#3b82f6',
    gradient: 'from-blue-500 to-indigo-600',
    color: 'text-blue-500',
    activeBg: 'bg-blue-600',
    activeNavBg: 'bg-blue-600',
    sections: [
      {
        links: [
          { name: 'Dashboard',       path: '/crmtayyorlovmarkaz',            icon: LayoutDashboard, end: true, permission: 'dashboard' },
          { name: "Mening Portalim", path: '/crmtayyorlovmarkaz/portal',     icon: UserCircle,                permission: 'dashboard' },
        ],
      },
      {
        title: "O'quv Jarayon",
        links: [
          { name: "O'quvchilar",     path: '/crmtayyorlovmarkaz/students',   icon: GraduationCap,  permission: 'students'   },
          { name: 'Guruhlar',        path: '/crmtayyorlovmarkaz/groups',     icon: Layers,         permission: 'groups'     },
          { name: 'Kurslar',         path: '/crmtayyorlovmarkaz/courses',    icon: BookOpen,       permission: 'courses'    },
          { name: 'Dars Jadvali',    path: '/crmtayyorlovmarkaz/schedule',   icon: Calendar,       permission: 'schedule'   },
          { name: 'Davomat',         path: '/crmtayyorlovmarkaz/attendance', icon: CheckSquare,    permission: 'attendance' },
          { name: 'Elektron Jurnal', path: '/crmtayyorlovmarkaz/journal',    icon: ClipboardCheck, permission: 'journal'    },
          { name: 'Baholash',        path: '/crmtayyorlovmarkaz/assessment', icon: Star,           permission: 'assessments'},
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    accent: '#8b5cf6',
    gradient: 'from-violet-500 to-purple-600',
    color: 'text-violet-500',
    activeBg: 'bg-violet-600',
    activeNavBg: 'bg-violet-600',
    sections: [
      {
        links: [
          { name: 'Lidlar (Voronka)', path: '/crmtayyorlovmarkaz/leads',     icon: TrendingUp, permission: 'leads'        },
          { name: 'Target Formalar',  path: '/crmtayyorlovmarkaz/forms',     icon: LinkIcon,   permission: 'target_forms' },
          { name: 'Aksiyalar / SMM',  path: '/crmtayyorlovmarkaz/marketing', icon: Megaphone,  permission: 'marketing'    },
        ],
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: UserCog,
    accent: '#10b981',
    gradient: 'from-emerald-500 to-teal-600',
    color: 'text-emerald-500',
    activeBg: 'bg-emerald-600',
    activeNavBg: 'bg-emerald-600',
    sections: [
      {
        links: [
          { name: 'Ustozlar', path: '/crmtayyorlovmarkaz/teachers', icon: Presentation, permission: undefined },
          { name: 'Xodimlar', path: '/crmtayyorlovmarkaz/staff',    icon: Users,        permission: undefined },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Moliya',
    icon: CreditCard,
    accent: '#22c55e',
    gradient: 'from-green-500 to-emerald-600',
    color: 'text-green-500',
    activeBg: 'bg-green-600',
    activeNavBg: 'bg-green-600',
    sections: [
      {
        links: [
          { name: 'Moliya', path: '/crmtayyorlovmarkaz/finance', icon: Wallet, permission: 'finance' },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analitika',
    icon: BarChart2,
    accent: '#6366f1',
    gradient: 'from-indigo-500 to-blue-600',
    color: 'text-indigo-500',
    activeBg: 'bg-indigo-600',
    activeNavBg: 'bg-indigo-600',
    sections: [
      {
        links: [
          { name: 'BI Analitika', path: '/crmtayyorlovmarkaz/bi', icon: BarChart2, permission: 'bi' },
        ],
      },
    ],
  },
  {
    id: 'management',
    label: 'Boshqaruv',
    icon: Settings,
    accent: '#94a3b8',
    gradient: 'from-slate-500 to-zinc-600',
    color: 'text-slate-400',
    activeBg: 'bg-zinc-600',
    activeNavBg: 'bg-zinc-600',
    sections: [
      {
        title: 'Resurslar',
        links: [
          { name: 'Xonalar',     path: '/crmtayyorlovmarkaz/rooms',     icon: DoorOpen, permission: 'rooms'     },
          { name: 'Inventar',    path: '/crmtayyorlovmarkaz/inventory', icon: Package,  permission: 'inventory' },
          { name: 'Materiallar', path: '/crmtayyorlovmarkaz/content',   icon: FileText, permission: 'content'   },
        ],
      },
      {
        title: 'Tizim',
        links: [
          { name: 'Foydalanuvchilar', path: '/crmtayyorlovmarkaz/users',    icon: Users,    permission: 'users'    },
          { name: 'Sozlamalar',       path: '/crmtayyorlovmarkaz/settings', icon: Settings, permission: 'settings' },
        ],
      },
    ],
  },
];

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

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/crmtayyorlovmarkaz': 'Dashboard',
    '/crmtayyorlovmarkaz/students': "O'quvchilar",
    '/crmtayyorlovmarkaz/groups': 'Guruhlar',
    '/crmtayyorlovmarkaz/courses': 'Kurslar',
    '/crmtayyorlovmarkaz/schedule': 'Dars Jadvali',
    '/crmtayyorlovmarkaz/attendance': 'Davomat',
    '/crmtayyorlovmarkaz/journal': 'Elektron Jurnal',
    '/crmtayyorlovmarkaz/assessment': 'Baholash',
    '/crmtayyorlovmarkaz/leads': 'Lidlar',
    '/crmtayyorlovmarkaz/forms': 'Target Formalar',
    '/crmtayyorlovmarkaz/marketing': 'Marketing',
    '/crmtayyorlovmarkaz/teachers': 'Ustozlar',
    '/crmtayyorlovmarkaz/staff': 'Xodimlar',
    '/crmtayyorlovmarkaz/finance': 'Moliya',
    '/crmtayyorlovmarkaz/bi': 'BI Analitika',
    '/crmtayyorlovmarkaz/rooms': 'Xonalar',
    '/crmtayyorlovmarkaz/inventory': 'Inventar',
    '/crmtayyorlovmarkaz/content': 'Materiallar',
    '/crmtayyorlovmarkaz/users': 'Foydalanuvchilar',
    '/crmtayyorlovmarkaz/settings': 'Sozlamalar',
    '/crmtayyorlovmarkaz/portal': 'Mening Portalim',
  };
  return map[pathname] || 'Dashboard';
}

export default function CrmLayout() {
  const [activeModuleId, setActiveModuleId] = useState('education');
  const [isRightPanelHidden, setIsRightPanelHidden] = useState(false);
  const [isMobileOpen, setIsMobileOpen]     = useState(false);
  const [isSearchOpen, setIsSearchOpen]     = useState(false);
  const [showQuickActions, setShowQuickActions]   = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu]           = useState(false);
  const [currentTime, setCurrentTime]             = useState(new Date());

  const navigate  = useNavigate();
  const location  = useLocation();

  const [notifications,   setNotifications]   = useState<any[]>([]);
  const [userName,        setUserName]        = useState('Admin');
  const [userRole,        setUserRole]        = useState('ADMIN');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
        // Parse permissions (stored as JSON string in DB)
        if (u.permissions) {
          const perms = Array.isArray(u.permissions)
            ? u.permissions
            : JSON.parse(u.permissions);
          setUserPermissions(Array.isArray(perms) ? perms : []);
        }
      }
    } catch { }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const api = (await import('../api/client')).default;
      const res = await api.get('/notifications');
      setNotifications(Array.isArray(res.data) ? res.data.slice(0, 8) : []);
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
      if (e.key === 'Escape') {
        setShowQuickActions(false);
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/crmtayyorlovmarkaz/login');
  };

  // ── Permission filtering ─────────────────────────────────────────────────
  const isAdmin = userRole === 'ADMIN';

  const canSeeLink = (permission: string | undefined): boolean => {
    if (isAdmin) return true;
    if (permission === undefined) return false; // admin-only links
    if (userPermissions.length === 0) return false; // no permissions assigned
    return userPermissions.includes(permission);
  };

  const visibleModules = MODULES.map(mod => ({
    ...mod,
    sections: mod.sections
      .map(sec => ({ ...sec, links: sec.links.filter(l => canSeeLink(l.permission)) }))
      .filter(sec => sec.links.length > 0),
  })).filter(mod => mod.sections.length > 0);

  const activeModule = visibleModules.find(m => m.id === activeModuleId)
    || visibleModules[0]
    || MODULES[0];
  const unreadCount  = notifications.filter(n => !n.isRead).length;
  const { resolvedTheme, toggle: toggleTheme } = useTheme();
  const pageTitle = getPageTitle(location.pathname);

  const timeStr = currentTime.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('uz-UZ', { weekday: 'short', day: 'numeric', month: 'short' });

  const allQuickActions = [
    { label: 'Yangi Lid',       icon: Target,        path: '/crmtayyorlovmarkaz/leads',    color: 'text-violet-500', permission: 'leads'    },
    { label: "Yangi O'quvchi",  icon: GraduationCap, path: '/crmtayyorlovmarkaz/students', color: 'text-blue-500',   permission: 'students' },
    { label: 'Yangi To\'lov',   icon: Wallet,        path: '/crmtayyorlovmarkaz/finance',  color: 'text-green-500',  permission: 'finance'  },
    { label: 'Yangi Guruh',     icon: Users2,        path: '/crmtayyorlovmarkaz/groups',   color: 'text-indigo-500', permission: 'groups'   },
    { label: 'Dars Jadvali',    icon: Calendar,      path: '/crmtayyorlovmarkaz/schedule', color: 'text-amber-500',  permission: 'schedule' },
  ];
  const quickActions = allQuickActions.filter(a => canSeeLink(a.permission));

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#09090f] flex font-sans">

      {/* ════════════════ DESKTOP SIDEBAR ════════════════ */}
      <aside className="hidden md:flex h-screen sticky top-0 z-40 shrink-0">

        {/* ── Left rail ── */}
        <div className="flex flex-col w-[56px] bg-[#13131f] h-full shrink-0 shadow-xl">
          {/* Logo */}
          <div className="flex items-center justify-center h-[56px] shrink-0 border-b border-white/[0.05]">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[12px] font-black shadow-lg shadow-blue-500/30">
              T
            </div>
          </div>

          {/* Module icons */}
          <div className="flex flex-col items-center gap-1 py-3 flex-1 overflow-y-auto scrollbar-hide">
            {visibleModules.map(mod => {
              const Icon = mod.icon;
              const isActive = mod.id === activeModuleId;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setActiveModuleId(mod.id);
                    const firstLink = mod.sections[0]?.links[0];
                    if (firstLink) navigate(firstLink.path);
                    setIsRightPanelHidden(false);
                  }}
                  title={mod.label}
                  className={`relative group w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'bg-white/10 shadow-inner'
                      : 'text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300'
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.5 : 1.8}
                    className={isActive ? mod.color : 'text-zinc-500'}
                  />
                  {/* Active bar */}
                  {isActive && (
                    <motion.span
                      layoutId="rail-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ backgroundColor: mod.accent }}
                    />
                  )}
                  {/* Tooltip */}
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1e1e30] border border-white/10 text-white text-[10px] font-bold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {mod.label}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 rotate-45 bg-[#1e1e30] border-l border-b border-white/10" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1.5 py-3 border-t border-white/[0.05] shrink-0">
            <button
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-all"
            >
              {resolvedTheme === 'dark' ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
            </button>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-[11px] hover:ring-2 hover:ring-blue-400/30 transition-all shadow-sm"
            >
              {userName.charAt(0).toUpperCase()}
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <AnimatePresence initial={false}>
          {!isRightPanelHidden && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 196, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex flex-col bg-white dark:bg-[#0f0f1a] border-r border-zinc-200/60 dark:border-white/[0.04] h-full overflow-hidden shrink-0 shadow-sm"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between h-[56px] px-3.5 border-b border-zinc-200/60 dark:border-white/[0.04] shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-4 rounded-full bg-gradient-to-b ${activeModule.gradient}`} />
                  <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-900 dark:text-white">
                    {activeModule.label}
                  </span>
                </div>
                <button
                  onClick={() => setIsRightPanelHidden(true)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
                >
                  <PanelLeftClose size={12} strokeWidth={2} />
                </button>
              </div>

              {/* Search */}
              <div className="px-2.5 py-2.5 shrink-0">
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200/60 dark:hover:bg-white/[0.07] rounded-xl text-zinc-400 transition-all border border-zinc-200/60 dark:border-white/[0.04]"
                >
                  <Search size={11} />
                  <span className="text-[10px] flex-1 text-left">Qidirish...</span>
                  <kbd className="text-[8px] font-black bg-white dark:bg-white/10 px-1.5 py-0.5 rounded-md text-zinc-400 border border-zinc-200 dark:border-white/10">⌘K</kbd>
                </button>
              </div>

              {/* Nav */}
              <nav className="flex-1 overflow-y-auto scrollbar-hide px-2.5 pb-3 space-y-4">
                {activeModule.sections.map((section, si) => (
                  <div key={si}>
                    {section.title && (
                      <div className="flex items-center gap-1.5 px-1 mb-1.5">
                        <div className={`h-px flex-1 bg-gradient-to-r ${activeModule.gradient} opacity-20`} />
                        <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.16em] shrink-0">
                          {section.title}
                        </p>
                        <div className={`h-px flex-1 bg-gradient-to-l ${activeModule.gradient} opacity-20`} />
                      </div>
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
                              `group flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] transition-all duration-100 ${
                                isActive
                                  ? `${activeModule.activeNavBg} text-white font-semibold shadow-sm`
                                  : 'text-zinc-500 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                              }`
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <Icon size={13} strokeWidth={2} className="shrink-0" />
                                <span className="truncate flex-1">{link.name}</span>
                                {isActive && <ChevronRight size={10} className="opacity-60 shrink-0" />}
                              </>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Bottom info */}
              <div className="px-3 py-2.5 border-t border-zinc-200/60 dark:border-white/[0.04] shrink-0">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-white/[0.03]">
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${activeModule.gradient} flex items-center justify-center shrink-0`}>
                    <span className="text-white text-[9px] font-black">{userName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{userName}</p>
                    <p className="text-[9px] text-zinc-400">{userRole}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show panel button (when hidden) */}
        {isRightPanelHidden && (
          <div className="flex items-start pt-[56px] bg-white dark:bg-[#0f0f1a] border-r border-zinc-200/60 dark:border-white/[0.04]">
            <button
              onClick={() => setIsRightPanelHidden(false)}
              className="m-1.5 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-all"
              title="Panelni ochish"
            >
              <PanelLeftOpen size={13} strokeWidth={2} />
            </button>
          </div>
        )}
      </aside>

      {/* ════════════════ MOBILE HEADER ════════════════ */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white/90 dark:bg-[#0f0f1a]/95 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.04] flex items-center justify-between px-4 z-50 h-14 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-black shadow-sm">T</div>
          <span className="text-sm font-black text-slate-900 dark:text-white">Tayyorlov CRM</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSearchOpen(true)} className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-500">
            <Search size={15} />
          </button>
          <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            {isMobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.15 }}
            className="md:hidden fixed inset-0 top-14 bg-white dark:bg-[#0f0f1a] z-40 flex flex-col overflow-hidden"
          >
            <div className="flex overflow-x-auto gap-1.5 p-3 border-b border-zinc-100 dark:border-white/[0.04] scrollbar-hide">
              {visibleModules.map(mod => {
                const Icon = mod.icon;
                return (
                  <button
                    key={mod.id}
                    onClick={() => setActiveModuleId(mod.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap transition-all ${
                      mod.id === activeModuleId
                        ? `bg-gradient-to-r ${mod.gradient} text-white shadow-sm`
                        : 'bg-zinc-100 dark:bg-white/5 text-zinc-500'
                    }`}
                  >
                    <Icon size={13} strokeWidth={2} />
                    {mod.label}
                  </button>
                );
              })}
            </div>
            <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
              {activeModule.sections.map((section, si) => (
                <div key={si}>
                  {section.title && (
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-1 mb-2">{section.title}</p>
                  )}
                  {section.links.map(link => {
                    const Icon = link.icon;
                    return (
                      <NavLink
                        key={link.path}
                        to={link.path}
                        end={link.end}
                        onClick={() => setIsMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all mb-1 ${
                            isActive
                              ? `bg-gradient-to-r ${activeModule.gradient} text-white shadow-md`
                              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5'
                          }`
                        }
                      >
                        <Icon size={16} strokeWidth={2} />{link.name}
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-zinc-100 dark:border-white/[0.04] flex gap-2">
              <button
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/5"
              >
                {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {resolvedTheme === 'dark' ? 'Kunduz' : 'Tun'}
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10"
              >
                <LogOut size={16} /> Chiqish
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════ MAIN ════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* ── Top header ── */}
        <header className="hidden md:flex items-center justify-between px-5 bg-white/80 dark:bg-[#0f0f1a]/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.04] h-[56px] shrink-0 z-30">
          {/* Left: breadcrumb + page title */}
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${activeModule.gradient} flex items-center justify-center shadow-sm`}>
              <activeModule.icon size={12} strokeWidth={2.5} className="text-white" />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span className="font-medium">{activeModule.label}</span>
              <ChevronRight size={10} />
              <span className="font-bold text-slate-900 dark:text-white">{pageTitle}</span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5">

            {/* Clock */}
            <div className="hidden lg:flex flex-col items-end mr-2">
              <span className="text-[13px] font-black text-slate-900 dark:text-white tabular-nums">{timeStr}</span>
              <span className="text-[9px] text-zinc-400 font-medium capitalize">{dateStr}</span>
            </div>

            {/* Search */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200/60 dark:hover:bg-white/[0.07] rounded-xl text-zinc-400 transition-all border border-zinc-200/60 dark:border-white/[0.04]"
            >
              <Search size={12} />
              <span className="text-[11px]">Qidirish</span>
              <kbd className="text-[8px] font-black bg-white dark:bg-white/10 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/10 ml-0.5">⌘K</kbd>
            </button>

            {/* Quick add */}
            <div className="relative">
              <button
                onClick={() => { setShowQuickActions(!showQuickActions); setShowNotifications(false); setShowUserMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[11px] font-bold transition-all active:scale-95 shadow-md shadow-blue-500/20"
              >
                <Plus size={12} strokeWidth={3} /> Yangi
              </button>
              <AnimatePresence>
                {showQuickActions && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowQuickActions(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1a1a28] rounded-2xl p-2 border border-zinc-200/60 dark:border-white/10 shadow-xl z-20"
                    >
                      <p className="px-3 py-1.5 text-[9px] font-black text-zinc-400 uppercase tracking-widest">Tez harakatlar</p>
                      {quickActions.map(item => (
                        <button
                          key={item.label}
                          onClick={() => { navigate(item.path); setShowQuickActions(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05] rounded-xl transition-all"
                        >
                          <item.icon size={13} className={`${item.color} shrink-0`} />
                          {item.label}
                          <ArrowUpRight size={10} className="ml-auto text-zinc-400" />
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-0.5" />

            {/* Activity / notifications */}
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowQuickActions(false); setShowUserMenu(false); }}
                className="relative w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] flex items-center justify-center text-zinc-500 transition-all border border-zinc-200/60 dark:border-white/[0.04]"
              >
                <Bell size={14} strokeWidth={2} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#0f0f1a] animate-pulse" />
                )}
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1a1a28] rounded-2xl border border-zinc-200/60 dark:border-white/10 shadow-xl z-20 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.05] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity size={13} className="text-blue-500" />
                          <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Bildirishnomalar</span>
                        </div>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full text-[9px] font-black">{unreadCount} yangi</span>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="py-10 text-center">
                            <Bell size={28} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                            <p className="text-[11px] text-zinc-400">Hozircha bildirishnomalar yo'q</p>
                          </div>
                        ) : (
                          notifications.map(n => (
                            <div
                              key={n.id}
                              className={`px-4 py-3 border-b border-zinc-50 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors ${!n.isRead ? 'bg-blue-50/40 dark:bg-blue-500/[0.04]' : ''}`}
                            >
                              <div className="flex items-start gap-2">
                                {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                                <div>
                                  <p className="text-[11px] font-bold text-slate-900 dark:text-white line-clamp-1">{n.title}</p>
                                  <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{n.message}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => { setShowUserMenu(!showUserMenu); setShowQuickActions(false); setShowNotifications(false); }}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-[10px] shadow-sm">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-none">{userName}</p>
                  <p className="text-[9px] text-zinc-400 leading-none mt-0.5">{userRole}</p>
                </div>
                <ChevronDown size={10} className="text-zinc-400 hidden lg:block" />
              </button>
              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.1 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1a1a28] rounded-2xl p-2 border border-zinc-200/60 dark:border-white/10 shadow-xl z-20"
                    >
                      <div className="px-3 py-2.5 mb-1.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm mb-2">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-[12px] font-bold text-slate-900 dark:text-white">{userName}</p>
                        <p className="text-[10px] text-zinc-400">{userRole}</p>
                      </div>
                      <div className="border-t border-zinc-100 dark:border-white/[0.05] pt-1.5 space-y-0.5">
                        <button
                          onClick={() => { navigate('/crmtayyorlovmarkaz/portal'); setShowUserMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 rounded-xl transition-all"
                        >
                          <UserCircle size={13} className="text-blue-500" /> Profilim
                        </button>
                        <button
                          onClick={() => { navigate('/crmtayyorlovmarkaz/settings'); setShowUserMenu(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 rounded-xl transition-all"
                        >
                          <Settings size={13} className="text-zinc-500" /> Sozlamalar
                        </button>
                        <div className="border-t border-zinc-100 dark:border-white/[0.05] mt-1 pt-1">
                          <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                          >
                            <LogOut size={13} /> Chiqish
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 bg-[#f0f2f5] dark:bg-[#09090f] mt-14 md:mt-0 scroll-smooth">
          <Outlet />
        </div>
      </main>

      {/* Global search */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
