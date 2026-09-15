export interface Position {
  id: string;
  name: string;
  description: string | null;
  responsibilities: string | null;
  // ESKI andoza — roleId o'rnatilmagan lavozimlar uchun zaxira. YANGI
  // lavozimlarda roleId ustuvor (server/services/roleAssignment.ts'ga q.).
  suggestedRole: 'TEACHER' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
  defaultPermissions: string | string[] | null;
  // Sozlamalar > Rollar va Ruxsatlar sahifasida yaratilgan haqiqiy Role'ga FK.
  roleId: string | null;
  roleRef?: { id: string; label: string; baseRoleLevel: string; _count: { permissions: number } } | null;
  isActive: boolean;
}
