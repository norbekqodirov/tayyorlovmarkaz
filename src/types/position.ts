export interface Position {
  id: string;
  name: string;
  description: string | null;
  responsibilities: string | null;
  suggestedRole: 'TEACHER' | 'MANAGER' | 'ADMIN';
  defaultPermissions: string | string[] | null;
  isActive: boolean;
}
