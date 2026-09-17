// server/middleware/auth.ts dagi rol darajalari bilan mos bo'lishi kerak.
export const ROLE_LEVEL: Readonly<Record<string, number>> = {
  TEACHER: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export function getCurrentRoleLevel(): number {
  try {
    const user = JSON.parse(localStorage.getItem('crm_user') || 'null');
    return typeof user?.role === 'string' ? (ROLE_LEVEL[user.role] ?? 0) : 0;
  } catch {
    return 0;
  }
}

// Payroll-avans (2026-09-17): ba'zi sahifa ichidagi amallar (masalan
// oylikni TASDIQLASH/TO'LASH) 'payroll_review' bilan ochilgan butun
// sahifaning ICHIDA ham qo'shimcha, tor tekshiruv talab qiladi — bu
// ProtectedRoute.tsx'ning route darajasidagi tekshiruvi bilan bir xil
// mantiq, lekin komponent ichida shartli render qilish uchun.
export function hasAnyPermission(...keys: string[]): boolean {
  try {
    const user = JSON.parse(localStorage.getItem('crm_user') || 'null');
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    const perms: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : JSON.parse(user.permissions || '[]');
    if (!Array.isArray(perms) || perms.length === 0) return false;
    return keys.some(key => perms.includes(key));
  } catch {
    return false;
  }
}
