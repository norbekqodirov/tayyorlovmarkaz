/**
 * leads/types.ts
 * Shared TypeScript interfaces for the Leads feature.
 */

export interface LeadActivity {
  id: string;
  type: 'call' | 'message' | 'meeting' | 'note';
  content: string;
  date: string;
  user: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  stage: 'new' | 'contacted' | 'meeting' | 'won' | 'lost';
  source: string;
  course: string;
  score: number;
  status: 'hot' | 'warm' | 'cold';
  date: string;
  activities: LeadActivity[];
  notes: string;
  extraField?: string | null;
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

export const SOURCES = ['Instagram', 'Facebook', 'Telegram', 'Vebsayt', 'Tavsiya', 'Banner', 'Boshqa'];

export function getStatusColor(status: Lead['status']) {
  switch (status) {
    case 'hot':  return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30';
    case 'warm': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    case 'cold': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
  }
}
