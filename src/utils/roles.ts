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
