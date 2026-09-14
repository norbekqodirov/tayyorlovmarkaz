import type { BadgeColor } from '../components/ui/Badge';

export type StatusBadgeInfo = { label: string; color: BadgeColor };

// Ta'lim moduli bo'ylab har bir "status" domeni uchun bitta markazlashgan
// label+rang xaritasi — avval CrmStudents/CrmGroups/CrmCourses/CrmQuiz/
// CrmTests'ning har biri o'zining mustaqil nusxasini saqlagan (audit'da
// topilgan eng katta takrorlanish). Rang tanlovi izchil: faol/muvaffaqiyatli
// = emerald, kutilayotgan/qoralama = amber, qarz/rad etilgan = rose,
// arxivlangan/tugallangan/noma'lum = slate.

export function studentStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'Faol': return { label: 'Faol', color: 'blue' };
    case 'Muzlatilgan': return { label: 'Muzlatilgan', color: 'amber' };
    case 'Bitiruvchi': return { label: 'Bitiruvchi', color: 'violet' };
    case 'Tark etgan': return { label: 'Tark etgan', color: 'slate' };
    default: return { label: status || "Noma'lum", color: 'slate' };
  }
}

export function paymentStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'Tolov qilingan': return { label: "To'lov qilingan", color: 'emerald' };
    case 'Qarzdorlik': return { label: 'Qarzdorlik', color: 'rose' };
    default: return { label: status || 'Kutilmoqda', color: 'amber' };
  }
}

export function groupStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'active': return { label: 'Faol', color: 'emerald' };
    case 'paused': return { label: 'Muzlatilgan', color: 'amber' };
    case 'completed': return { label: 'Tugallangan', color: 'slate' };
    default: return { label: "Noma'lum", color: 'slate' };
  }
}

// Backend'da kurs holati ba'zan ingliz, ba'zan o'zbek matni sifatida
// saqlangan (Active/Faol, Draft/Qoralama, Archived/Arxiv) — ikkalasi ham
// bir xil ko'rinishga keladi.
export function courseStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'Faol': case 'Active': return { label: 'Faol', color: 'emerald' };
    case 'Qoralama': case 'Draft': return { label: 'Qoralama', color: 'amber' };
    case 'Arxiv': case 'Archived': return { label: 'Arxiv', color: 'slate' };
    default: return { label: status || "Noma'lum", color: 'slate' };
  }
}

const COURSE_CATEGORY_COLOR: Record<string, BadgeColor> = {
  'Tillar': 'blue',
  'IT': 'violet',
  'Matematika': 'amber',
  "San'at": 'rose',
  'Fan': 'emerald',
  'Boshqa': 'slate',
};
export const COURSE_CATEGORIES = Object.keys(COURSE_CATEGORY_COLOR);
export function courseCategoryBadge(category: string | undefined): StatusBadgeInfo {
  return { label: category || 'Boshqa', color: COURSE_CATEGORY_COLOR[category || ''] || 'slate' };
}

export function quizStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'active': return { label: 'Faol', color: 'emerald' };
    case 'archived': return { label: 'Arxiv', color: 'slate' };
    default: return { label: 'Qoralama', color: 'amber' };
  }
}

export function testStatusBadge(status: string | undefined): StatusBadgeInfo {
  switch (status) {
    case 'published': return { label: 'Faol', color: 'emerald' };
    case 'closed': return { label: 'Yopilgan', color: 'slate' };
    default: return { label: 'Qoralama', color: 'amber' };
  }
}
