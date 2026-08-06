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

export const STAGES = [
  { id: 'new',       name: 'Yangi',             color: 'bg-blue-500',    border: 'border-blue-200' },
  { id: 'contacted', name: 'Aloqaga chiqildi',  color: 'bg-amber-500',   border: 'border-amber-200' },
  { id: 'meeting',   name: 'Uchrashuv',          color: 'bg-purple-500',  border: 'border-purple-200' },
  { id: 'won',       name: "O'qishni boshladi",  color: 'bg-emerald-500', border: 'border-emerald-200' },
  { id: 'lost',      name: 'Rad etildi',         color: 'bg-rose-500',    border: 'border-rose-200' },
] as const;

export const SOURCES = ['Instagram', 'Facebook', 'Telegram', 'Vebsayt', 'Tavsiya', 'Banner', 'Boshqa'];

export function getStatusColor(status: Lead['status']) {
  switch (status) {
    case 'hot':  return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30';
    case 'warm': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    case 'cold': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
  }
}
