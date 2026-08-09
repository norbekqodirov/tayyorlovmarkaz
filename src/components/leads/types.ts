/**
 * leads/types.ts
 * Shared TypeScript interfaces for the Leads feature.
 */

export interface LeadActivity {
  id: string;
  type: 'call' | 'message' | 'meeting' | 'note' | 'form';
  content: string;
  date: string;
  user: string;
  createdAt?: string;
  userId?: string | null;
  outcome?: string | null;
  direction?: 'in' | 'out' | null;
  durationSec?: number | null;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  stage: 'new' | 'contacted' | 'meeting' | 'won' | 'lost';
  source: string;
  course: string;
  courseId?: string | null;
  score: number;
  status: 'hot' | 'warm' | 'cold';
  date: string;
  activities: LeadActivity[];
  notes: string;
  extraField?: string | null;
  createdAt?: string;
  updatedAt?: string;

  // Egalik / SLA
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  assignedAt?: string | null;
  firstResponseAt?: string | null;
  firstResponseMinutes?: number | null;
  slaBreachedAt?: string | null;
  lastContactAt?: string | null;
  nextFollowUpAt?: string | null;
  nextAction?: string | null;
  stageChangedAt?: string | null;

  // Atributsiya
  campaignId?: string | null;
  campaign?: { id: string; name: string; platform: string } | null;
  formId?: string | null;
  form?: { id: string; title: string } | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;

  // Konversiya
  studentId?: string | null;
  convertedAt?: string | null;

  // Yo'qotish
  lostReason?: string | null;
  lostAt?: string | null;

  // Dublikat
  duplicateOfId?: string | null;
  duplicateOf?: { id: string; name: string; stage: string } | null;
  submitCount?: number;

  _count?: { activities: number };
}

// Yagona manba — bosqichlar avval 5 ta faylda mustaqil nusxalangan edi
// (turli qisqartirilgan nomlar bilan: "Aloqa" / "Aloqada" / "Aloqaga chiqildi"),
// bu esa har bir joyda boshqacha yozuv chiqishiga olib kelardi.
export const STAGES = [
  { id: 'new',       name: 'Yangi',             short: 'Yangi',     hex: '#3b82f6', color: 'bg-blue-500',    border: 'border-blue-200',   badge: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' },
  { id: 'contacted', name: 'Aloqaga chiqildi',  short: 'Aloqa',     hex: '#f59e0b', color: 'bg-amber-500',   border: 'border-amber-200',  badge: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
  { id: 'meeting',   name: 'Uchrashuv',          short: 'Uchrashuv', hex: '#8b5cf6', color: 'bg-purple-500',  border: 'border-purple-200', badge: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10' },
  { id: 'won',       name: "O'qishni boshladi",  short: "O'quvchi",  hex: '#10b981', color: 'bg-emerald-500', border: 'border-emerald-200', badge: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'lost',      name: 'Rad etildi',         short: 'Rad',       hex: '#ef4444', color: 'bg-rose-500',    border: 'border-rose-200',   badge: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
] as const;

export function stageById(id: string) {
  return STAGES.find(s => s.id === id);
}

export const OPEN_STAGE_IDS = ['new', 'contacted', 'meeting'];

export const SOURCES = ['Instagram', 'Facebook', 'Telegram', 'Vebsayt', 'Tavsiya', 'Banner', 'Boshqa'];

export const LOST_REASONS = [
  'Narx mos kelmadi',
  'Boshqa markazni tanladi',
  'Vaqt/jadval mos kelmadi',
  'Aloqaga chiqmadi',
  'Fikridan qaytdi',
  'Boshqa',
];

export const ACTIVITY_TYPES: { id: LeadActivity['type']; label: string }[] = [
  { id: 'call', label: "Qo'ng'iroq" },
  { id: 'message', label: 'Xabar' },
  { id: 'meeting', label: 'Uchrashuv' },
  { id: 'note', label: 'Eslatma' },
];

export const ACTIVITY_OUTCOMES: { id: string; label: string }[] = [
  { id: 'answered', label: 'Javob berdi' },
  { id: 'no_answer', label: 'Javob bermadi' },
  { id: 'busy', label: 'Band edi' },
  { id: 'wrong_number', label: "Noto'g'ri raqam" },
  { id: 'interested', label: 'Qiziqdi' },
  { id: 'not_interested', label: 'Qiziqmadi' },
];

export function getStatusColor(status: Lead['status']) {
  switch (status) {
    case 'hot':  return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30';
    case 'warm': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    case 'cold': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
  }
}
