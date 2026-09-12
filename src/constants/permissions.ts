export const ALL_PERMISSIONS = [
    { id: 'dashboard', label: 'Dashboard', group: "Asosiy" },
    { id: 'leads', label: 'Lidlar (Voronka)', group: "Marketing" },
    { id: 'marketing', label: 'Aksiyalar / SMM', group: "Marketing" },
    { id: 'ai_content', label: 'AI Kontent', group: "Marketing" },
    { id: 'communication', label: 'Aloqa Markazi / Xabarlar / E\'lonlar', group: "Marketing" },
    { id: 'target_forms', label: 'Target Formalar', group: "Marketing" },
    { id: 'students', label: "O'quvchilar", group: "Ta'lim" },
    { id: 'groups', label: 'Guruhlar', group: "Ta'lim" },
    { id: 'courses', label: 'Kurslar', group: "Ta'lim" },
    { id: 'schedule', label: 'Dars Jadvali', group: "Ta'lim" },
    { id: 'journal', label: 'Elektron Jurnal', group: "Ta'lim" },
    { id: 'quiz', label: 'Test Tizimi', group: "Ta'lim" },
    { id: 'tests', label: 'Imtihonlar', group: "Ta'lim" },
    { id: 'finance', label: 'Moliya', group: "Moliya" },
    { id: 'transaction_categories', label: 'Kirim/Chiqim kategoriyalari', group: "Moliya" },
    { id: 'discounts', label: 'Chegirmalar', group: "Moliya" },
    { id: 'bi', label: 'BI Analitika', group: "Moliya" },
    { id: 'predictions', label: 'AI Bashoratlar', group: "Moliya" },
    { id: 'goals', label: 'KPI & Maqsadlar', group: "Moliya" },
    { id: 'reports', label: 'Hisobotlar', group: "Moliya" },
    { id: 'rooms', label: 'Xonalar', group: "Resurslar" },
    { id: 'inventory', label: 'Inventar', group: "Resurslar" },
    { id: 'content', label: 'Kontent/Yangiliklar', group: "Tizim" },
    { id: 'settings', label: 'Sozlamalar', group: "Tizim" },
    { id: 'certificates', label: 'Sertifikatlar', group: "Tizim" },
    { id: 'leave_requests', label: "Mehnat Ta'tillari", group: 'HR' },
    { id: 'staff_attendance', label: 'Xodim Davomati', group: 'HR' },
    { id: 'users', label: 'Foydalanuvchilar', group: "Tizim" },
    { id: 'parent_chat', label: 'Ota-ona xabarlari', group: "Kommunikatsiya" },
];

export const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map(p => p.group))];

// CrmUsers.tsx'dagi TEACHER shablon bilan bir xil bo'lishi shart — o'qituvchi
// CrmTeachers.tsx orqali yaratilganda (Foydalanuvchilar sahifasidan emas)
// standart ruxsatlarsiz qolib ketmasligi uchun.
export const DEFAULT_TEACHER_PERMISSIONS = [
    'dashboard', 'schedule', 'journal', 'students', 'groups', 'parent_chat',
];
