// Dashboard widget catalog: what widgets exist, their default layout per role,
// and small shared formatting helpers used by more than one widget.

export const WIDGET_REGISTRY = [
  { id: 'stat_students', title: "Jami O'quvchilar", category: 'Statistika', permission: 'students', size: 'sm' as const },
  { id: 'stat_groups', title: 'Faol Guruhlar', category: 'Statistika', permission: 'groups', size: 'sm' as const },
  { id: 'stat_revenue', title: 'Oylik Daromad', category: 'Moliya', permission: 'finance', size: 'sm' as const },
  { id: 'stat_leads', title: 'Yangi Lidlar', category: 'Marketing', permission: 'leads', size: 'sm' as const },
  { id: 'stat_debtors', title: 'Qarzdorlar', category: 'Moliya', permission: 'finance', size: 'sm' as const },
  { id: 'stat_teachers', title: "O'qituvchilar", category: 'HR', permission: 'teachers', size: 'sm' as const },
  { id: 'stat_attendance', title: 'Bugun Davomat', category: 'Statistika', permission: 'students', size: 'sm' as const },
  { id: 'stat_conversion', title: 'Konversiya', category: 'Marketing', permission: 'leads', size: 'sm' as const },
  { id: 'chart_revenue', title: 'Daromad Grafigi', category: 'Moliya', permission: 'finance', size: 'lg' as const },
  { id: 'chart_students', title: "O'quvchi O'sishi", category: 'Tahlil', permission: 'students', size: 'md' as const },
  { id: 'chart_leads', title: 'Lid Manbasi', category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'chart_lead_funnel', title: 'Lid Voronkasi', category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'table_upcoming', title: "Bugungi Darslar", category: "Ta'lim", permission: 'schedule', size: 'md' as const },
  { id: 'table_debtors', title: 'Qarzdorlar Ro\'yxati', category: 'Moliya', permission: 'finance', size: 'md' as const },
  { id: 'table_top_students', title: "Top O'quvchilar", category: "Ta'lim", permission: 'students', size: 'md' as const },
  { id: 'list_payments', title: "So'nggi To'lovlar", category: 'Moliya', permission: 'finance', size: 'md' as const },
  { id: 'list_recent_leads', title: "So'nggi Lidlar", category: 'Marketing', permission: 'leads', size: 'md' as const },
  { id: 'tasks', title: 'Vazifalar', category: 'Umumiy', permission: null, size: 'md' as const },
  { id: 'quick_links', title: 'Tezkor Havolalar', category: 'Umumiy', permission: null, size: 'sm' as const },
];

const DEFAULT_WIDGETS_ADMIN = [
  'stat_students', 'stat_revenue', 'stat_leads', 'stat_debtors',
  'chart_revenue', 'chart_students',
  'table_upcoming', 'table_debtors', 'list_payments', 'list_recent_leads',
];
const DEFAULT_WIDGETS_TEACHER = ['stat_students', 'stat_groups', 'stat_attendance', 'table_upcoming', 'chart_students'];
const DEFAULT_WIDGETS_MARKETING = ['stat_leads', 'stat_conversion', 'chart_lead_funnel', 'chart_leads', 'list_recent_leads'];

export function getDefaultWidgets(role: string) {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return DEFAULT_WIDGETS_ADMIN;
  if (role === 'TEACHER') return DEFAULT_WIDGETS_TEACHER;
  return DEFAULT_WIDGETS_MARKETING;
}

export const CHART_TOOLTIP_STYLE = {
  borderRadius: '14px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
  fontSize: 11,
  fontWeight: 700,
  padding: '10px 14px',
  background: 'white',
};

export function formatCompact(v: number): string {
  if (v >= 1000000000) return (v / 1000000000).toFixed(1) + 'B';
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
  return new Intl.NumberFormat('uz-UZ').format(v);
}

export const MONTHS = ['Yan', 'Feb', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
