// Single source of truth for CRM navigation. Adding a page = add a link here
// + a route in App.tsx. Do not hand-edit detectModule/getPageTitle — they are
// derived from MODULES via findActiveLink (longest-prefix match), so nothing
// else needs to change when a link is added or moved.
import {
  LayoutDashboard, GraduationCap, Layers, BookOpen, Calendar,
  ClipboardCheck, ClipboardList, FileText, TrendingUp, Link as LinkIcon,
  Megaphone, Sparkles, MessageSquare, Bell, Bot, UserCog, Users, Presentation,
  Fingerprint, MapPin, CreditCard, Wallet, TrendingDown, BarChart2, Brain,
  Target, FileBarChart2, Settings, Building2, DoorOpen, Package, Zap, Award, Shield,
} from 'lucide-react';

export type NavItem = {
  name: string;
  path: string;
  icon: any;
  permission: string | undefined;
  end?: boolean;
};
export type NavSection = { title?: string; links: NavItem[] };
export type NavModule = {
  id: string; label: string; icon: any;
  accent: string; gradient: string; color: string;
  activeBg: string; activeNavBg: string;
  sections: NavSection[];
};

// permission: undefined = admin-only; string = requires that permission ID
export const MODULES: NavModule[] = [
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
        ],
      },
      {
        title: "O'quv Jarayon",
        links: [
          { name: "O'quvchilar",     path: '/crmtayyorlovmarkaz/students',   icon: GraduationCap,  permission: 'students'   },
          { name: 'Guruhlar',        path: '/crmtayyorlovmarkaz/groups',     icon: Layers,         permission: 'groups'     },
          { name: 'Kurslar',         path: '/crmtayyorlovmarkaz/courses',    icon: BookOpen,       permission: 'courses'    },
          { name: 'Dars Jadvali',    path: '/crmtayyorlovmarkaz/schedule',   icon: Calendar,       permission: 'schedule'   },
          { name: 'Elektron Jurnal', path: '/crmtayyorlovmarkaz/journal',    icon: ClipboardCheck, permission: 'journal'    },
          { name: 'Test Tizimi',     path: '/crmtayyorlovmarkaz/quiz',      icon: ClipboardList,  permission: 'content'    },
          { name: 'Imtihonlar',      path: '/crmtayyorlovmarkaz/tests',     icon: FileText,       permission: 'journal'    },
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
          { name: 'Aksiyalar / SMM',  path: '/crmtayyorlovmarkaz/marketing',     icon: Megaphone,      permission: 'marketing'    },
          { name: 'AI Kontent',       path: '/crmtayyorlovmarkaz/ai-content',    icon: Sparkles,       permission: 'marketing'    },
          { name: 'Aloqa Markazi',    path: '/crmtayyorlovmarkaz/communication', icon: MessageSquare,  permission: 'marketing'    },
        ],
      },
    ],
  },
  {
    id: 'kommunikatsiya',
    label: 'Kommunikatsiya',
    icon: MessageSquare,
    accent: '#06b6d4',
    gradient: 'from-cyan-500 to-sky-600',
    color: 'text-cyan-500',
    activeBg: 'bg-cyan-600',
    activeNavBg: 'bg-cyan-600',
    sections: [
      {
        links: [
          { name: "Xabarlar",    path: '/crmtayyorlovmarkaz/messages',      icon: MessageSquare, permission: 'marketing' },
          { name: "Ota-ona xabarlari", path: '/crmtayyorlovmarkaz/parent-chat', icon: MessageSquare, permission: 'parent_chat' },
          { name: "E'lonlar",    path: '/crmtayyorlovmarkaz/announcements', icon: Bell,          permission: 'marketing' },
          { name: 'Telegram Bot', path: '/crmtayyorlovmarkaz/telegram',     icon: Bot,           permission: undefined   },
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
          { name: 'Ustozlar',           path: '/crmtayyorlovmarkaz/teachers',          icon: Presentation, permission: undefined },
          { name: 'Xodimlar',           path: '/crmtayyorlovmarkaz/staff',             icon: Users,        permission: undefined },
          { name: 'Mehnat Ta\'tillari', path: '/crmtayyorlovmarkaz/leave-requests',    icon: Calendar,     permission: undefined },
          { name: 'Xodim Davomati',     path: '/crmtayyorlovmarkaz/staff-attendance',  icon: Fingerprint,  permission: undefined },
          { name: 'Ish Joylari',        path: '/crmtayyorlovmarkaz/work-locations',    icon: MapPin,       permission: undefined },
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
          { name: 'Moliya',    path: '/crmtayyorlovmarkaz/finance',    icon: Wallet,      permission: 'finance' },
          { name: 'Chegirmalar', path: '/crmtayyorlovmarkaz/discounts', icon: TrendingDown, permission: 'finance' },
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
          { name: 'BI Analitika',     path: '/crmtayyorlovmarkaz/bi',               icon: BarChart2,     permission: 'bi'      },
          { name: 'AI Bashoratlar',  path: '/crmtayyorlovmarkaz/predictions',      icon: Brain,         permission: 'bi'      },
          { name: 'KPI & Maqsadlar', path: '/crmtayyorlovmarkaz/goals',            icon: Target,        permission: 'bi'      },
          { name: 'Ijroiya Hisobot', path: '/crmtayyorlovmarkaz/executive-report', icon: FileBarChart2, permission: undefined  },
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
          { name: 'Filiallar',   path: '/crmtayyorlovmarkaz/branches',  icon: Building2, permission: undefined   },
          { name: 'Xonalar',     path: '/crmtayyorlovmarkaz/rooms',     icon: DoorOpen, permission: 'rooms'     },
          { name: 'Inventar',    path: '/crmtayyorlovmarkaz/inventory', icon: Package,  permission: 'inventory' },
          { name: 'Materiallar', path: '/crmtayyorlovmarkaz/content',   icon: FileText, permission: 'content'   },
        ],
      },
      {
        title: 'Avtomatlashtirish',
        links: [
          { name: 'Avtomatlar',    path: '/crmtayyorlovmarkaz/automations',  icon: Zap,          permission: undefined },
          { name: 'Sertifikatlar', path: '/crmtayyorlovmarkaz/certificates', icon: Award,        permission: 'settings' },
          { name: 'Hisobotlar',    path: '/crmtayyorlovmarkaz/reports',      icon: FileBarChart2, permission: 'bi'      },
          { name: 'Audit Jurnali', path: '/crmtayyorlovmarkaz/audit',        icon: Shield,       permission: undefined },
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

// Find the nav link (and its module) that best matches the current path.
// Uses longest-prefix matching so nested routes (e.g. /students/:id) resolve
// to their parent link, and the source of truth stays the MODULES list above
// — no separate hardcoded path lists to keep in sync.
export function findActiveLink(pathname: string): { module: NavModule; link: NavItem } | null {
  let best: { module: NavModule; link: NavItem; len: number } | null = null;
  for (const mod of MODULES) {
    for (const sec of mod.sections) {
      for (const link of sec.links) {
        if (pathname === link.path || pathname.startsWith(link.path + '/')) {
          if (!best || link.path.length > best.len) {
            best = { module: mod, link, len: link.path.length };
          }
        }
      }
    }
  }
  return best ? { module: best.module, link: best.link } : null;
}

export function detectModule(pathname: string): string {
  return findActiveLink(pathname)?.module.id ?? 'education';
}

// Titles for dynamic / non-nav routes that have no entry in MODULES.
export function getPageTitle(pathname: string): string {
  if (/\/students\/[^/]+\/progress$/.test(pathname)) return "O'quvchi Progressi";
  if (/\/students\/[^/]+$/.test(pathname))          return "O'quvchi Profili";
  if (/\/groups\/[^/]+$/.test(pathname))            return 'Guruh';
  if (/\/courses\/[^/]+$/.test(pathname))           return 'Kurs';
  if (pathname.endsWith('/portal'))                 return 'Mening Portalim';
  return findActiveLink(pathname)?.link.name ?? 'Dashboard';
}
