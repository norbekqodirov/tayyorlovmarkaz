import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Users, FileText, Link as LinkIcon, LogOut, Menu, X, Settings, GraduationCap, Presentation, Wallet, Calendar, ClipboardCheck, DoorOpen, Layers, Megaphone, Star, ChevronDown, ChevronRight, BookOpen, Plus, Bell, BarChart, Package, Search, Info, AlertCircle, Check, UserCircle } from 'lucide-react';
import GlobalSearch from './GlobalSearch';


const CRM_GROUPS = [
  {
    title: "Asosiy",
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
    links: [
      { name: "Dashboard", path: "/crmtayyorlovmarkaz", icon: LayoutDashboard, roles: ['ADMIN', 'TEACHER', 'STUDENT'], permission: 'dashboard' },
      { name: "Mening Portalim", path: "/crmtayyorlovmarkaz/portal", icon: UserCircle, roles: ['STUDENT', 'ADMIN', 'TEACHER'], permission: 'portal' },
    ]
  },
  {
    title: "Marketing",
    roles: ['ADMIN'],
    links: [
      { name: "Marketing", path: "/crmtayyorlovmarkaz/marketing", icon: Megaphone, roles: ['ADMIN'], permission: 'marketing' },
      { name: "Lidlar (Voronka)", path: "/crmtayyorlovmarkaz/leads", icon: FileText, roles: ['ADMIN'], permission: 'leads' },
      { name: "Target Formalar", path: "/crmtayyorlovmarkaz/forms", icon: LinkIcon, roles: ['ADMIN'], permission: 'target_forms' },
    ]
  },
  {
    title: "Ta'lim",
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
    links: [
      { name: "Kurslar", path: "/crmtayyorlovmarkaz/courses", icon: BookOpen, roles: ['ADMIN'], permission: 'courses' },
      { name: "O'quvchilar", path: "/crmtayyorlovmarkaz/students", icon: GraduationCap, roles: ['ADMIN', 'TEACHER'], permission: 'students' },
      { name: "Guruhlar", path: "/crmtayyorlovmarkaz/groups", icon: Layers, roles: ['ADMIN', 'TEACHER', 'STUDENT'], permission: 'groups' },
      { name: "Dars Jadvali", path: "/crmtayyorlovmarkaz/schedule", icon: Calendar, roles: ['ADMIN', 'TEACHER', 'STUDENT'], permission: 'schedule' },
      { name: "Elektron Jurnal", path: "/crmtayyorlovmarkaz/journal", icon: BookOpen, roles: ['ADMIN', 'TEACHER'], permission: 'journal' },
      { name: "Davomat", path: "/crmtayyorlovmarkaz/attendance", icon: ClipboardCheck, roles: ['ADMIN', 'TEACHER'], permission: 'attendance' },
      { name: "Baholash", path: "/crmtayyorlovmarkaz/assessment", icon: Star, roles: ['ADMIN', 'TEACHER'], permission: 'assessments' },
    ]
  },
  {
    title: "Resurslar",
    roles: ['ADMIN'],
    links: [
      { name: "Xonalar", path: "/crmtayyorlovmarkaz/rooms", icon: DoorOpen, roles: ['ADMIN'], permission: 'rooms' },
      { name: "Inventar", path: "/crmtayyorlovmarkaz/inventory", icon: Package, roles: ['ADMIN'], permission: 'inventory' },
      { name: "Ustozlar", path: "/crmtayyorlovmarkaz/teachers", icon: Presentation, roles: ['ADMIN'], permission: 'teachers' },
      { name: "Xodimlar (HR)", path: "/crmtayyorlovmarkaz/staff", icon: Users, roles: ['ADMIN'], permission: 'staff' },
    ]
  },
  {
    title: "Moliya",
    roles: ['ADMIN', 'STUDENT'],
    links: [
      { name: "Moliya", path: "/crmtayyorlovmarkaz/finance", icon: Wallet, roles: ['ADMIN', 'STUDENT'], permission: 'finance' },
      { name: "BI Analitika", path: "/crmtayyorlovmarkaz/bi", icon: BarChart, roles: ['ADMIN'], permission: 'bi' },
    ]
  },
  {
    title: "Tizim",
    roles: ['ADMIN'],
    links: [
      { name: "Kontent (Yangiliklar)", path: "/crmtayyorlovmarkaz/content", icon: FileText, roles: ['ADMIN'], permission: 'content' },
      { name: "Foydalanuvchilar", path: "/crmtayyorlovmarkaz/users", icon: Users, roles: ['ADMIN'], permission: 'users' },
      { name: "Sozlamalar", path: "/crmtayyorlovmarkaz/settings", icon: Settings, roles: ['ADMIN'], permission: 'settings' },
    ]
  }
];

export default function CrmLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["Asosiy", "Marketing", "Ta'lim", "Resurslar", "Moliya", "Tizim"]);
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [userName, setUserName] = useState('Admin');
  const [userRole, setUserRole] = useState('ADMIN');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  // Load user info
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('crm_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setUserName(user.name || 'Admin');
        setUserRole(user.role || 'ADMIN');
        try {
          const perms = JSON.parse(user.permissions || '[]');
          setUserPermissions(Array.isArray(perms) ? perms : []);
        } catch { setUserPermissions([]); }
      }
    } catch { }
  }, []);

  // Load notifications from API
  const loadNotifications = useCallback(async () => {
    try {
      const api = (await import('../api/client')).default;
      const res = await api.get('/notifications');
      setNotifications(Array.isArray(res.data) ? res.data.slice(0, 5) : []);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    navigate('/crmtayyorlovmarkaz/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex font-sans">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 h-screen sticky top-0">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">CRM TIZIMI</h1>
          <p className="text-xs text-zinc-500 font-medium mt-1">Tayyorlov Markazi</p>

          <button
            onClick={() => setIsSearchOpen(true)}
            className="mt-6 w-full flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Search size={16} />
              <span>Qidirish...</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-900 text-[10px] font-black shadow-sm font-sans">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-900 text-[10px] font-black shadow-sm font-sans">K</kbd>
            </div>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
          {CRM_GROUPS.filter(group => group.roles.includes(userRole)).map((group) => {
            // Filter links: ADMIN sees all, others see only their permissions
            const visibleLinks = group.links.filter(link => {
              if (!link.roles.includes(userRole)) return false;
              if (userRole === 'ADMIN') return true;
              if (!link.permission) return true;
              return userPermissions.includes(link.permission);
            });
            if (visibleLinks.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {group.title}
                  {expandedGroups.includes(group.title) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {expandedGroups.includes(group.title) && (
                  <div className="space-y-1">
                    {visibleLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <NavLink
                          key={link.name}
                          to={link.path}
                          end={link.path === "/crmtayyorlovmarkaz"}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none"
                              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white"
                            }`
                          }
                        >
                          <Icon size={18} />
                          {link.name}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <LogOut size={18} />
            Chiqish
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 z-50">
        <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">CRM</h1>
        <button onClick={() => setIsOpen(!isOpen)} className="text-zinc-600 dark:text-zinc-300">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-white dark:bg-zinc-900 z-40 flex flex-col">
          <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
            {CRM_GROUPS.filter(group => group.roles.includes(userRole)).map((group) => (
              <div key={group.title} className="space-y-2">
                <h3 className="px-4 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">{group.title}</h3>
                <div className="space-y-1">
                  {group.links.filter(link => link.roles.includes(userRole)).map((link) => {
                    const Icon = link.icon;
                    return (
                      <NavLink
                        key={link.name}
                        to={link.path}
                        end={link.path === "/crmtayyorlovmarkaz"}
                        onClick={() => setIsOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-bold transition-all ${isActive
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                          }`
                        }
                      >
                        <Icon size={20} />
                        {link.name}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-4 w-full rounded-xl text-base font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            >
              <LogOut size={20} />
              Chiqish
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden">
        {/* Header (Desktop) */}
        <header className="hidden md:flex items-center justify-between px-8 py-5 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Xush kelibsiz, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">{userName}</span> 👋</h2>
          </div>
          <div className="flex items-center gap-4">

            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition-colors"
            >
              <Search size={20} />
            </button>
            {/* Quick Actions */}
            <div className="relative">
              <button
                onClick={() => setShowQuickActions(!showQuickActions)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
              >
                <Plus size={18} />
                Tezkor
              </button>

              <AnimatePresence>
                {showQuickActions && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowQuickActions(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl z-20 overflow-hidden"
                    >
                      <div className="p-2 space-y-1">
                        <button
                          onClick={() => { navigate('/crmtayyorlovmarkaz/leads'); setShowQuickActions(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                          <Users size={16} />
                          Yangi Lid
                        </button>
                        <button
                          onClick={() => { navigate('/crmtayyorlovmarkaz/students'); setShowQuickActions(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                          <GraduationCap size={16} />
                          Yangi O'quvchi
                        </button>
                        <button
                          onClick={() => { navigate('/crmtayyorlovmarkaz/groups'); setShowQuickActions(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                          <Layers size={16} />
                          Yangi Guruh
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <div className="relative">
                  <Bell size={20} />
                  {notifications.some(n => !n.isRead) && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                  )}
                </div>
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl z-20 overflow-hidden"
                    >
                      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Bildirishnomalar</h3>
                        {notifications.length > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-[10px] font-black">{notifications.filter(n => !n.isRead).length} ta yangi</span>}
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-sm font-medium text-zinc-500">Hech qanday xabarnoma yo'q</div>
                        ) : notifications.map(n => {
                          const isAlert = n.type === 'alert' || n.type === 'error';
                          const isSuccess = n.type === 'success';
                          return (
                            <button key={n.id} className={`w-full p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 last:border-0 transition-colors ${!n.isRead ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                              <div className="flex gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAlert ? 'bg-rose-100 text-rose-600' : isSuccess ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                                  {isAlert ? <AlertCircle size={14} /> : isSuccess ? <Check size={14} strokeWidth={3} /> : <Info size={14} />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex justify-between items-start">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</p>
                                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>}
                                  </div>
                                  <p className="text-[10px] text-zinc-500 mt-0.5">{n.message}</p>
                                  <p className="text-[9px] text-zinc-400 mt-1">{n.time ? new Date(n.time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : 'Hozir'}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => { setShowNotifications(false); navigate('/crmtayyorlovmarkaz/settings'); }}
                        className="w-full p-3 text-[10px] font-black text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors uppercase tracking-widest"
                      >
                        Barchasini ko'rish
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-zinc-200 dark:border-zinc-800">
              <div className="text-right hidden lg:block">
                <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">{userName}</p>
                <p className="text-xs text-zinc-500 mt-1">{userRole === 'ADMIN' ? 'Bosh administrator' : userRole === 'TEACHER' ? "O'qituvchi" : userRole === 'MANAGER' ? 'Menejer' : userRole}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>

      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
