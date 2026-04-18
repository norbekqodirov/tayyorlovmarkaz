import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}

function parsePermissions(user: any): string[] {
  if (!user?.permissions) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  try { return JSON.parse(user.permissions); } catch { return []; }
}

function canAccess(user: any, allowedRoles?: string[], requiredPermission?: string): boolean {
  if (!user) return false;
  // ADMIN always has full access
  if (String(user.role).toUpperCase() === 'ADMIN') return true;

  const perms = parsePermissions(user);

  // If user has a custom permissions array, use it
  if (perms.length > 0) {
    if (requiredPermission) return perms.includes(requiredPermission);
    // No required permission = admin-only route
    return false;
  }

  // No custom permissions → fall back to role-based check
  if (allowedRoles) {
    return allowedRoles.includes(String(user.role).trim().toUpperCase());
  }

  return false;
}

export default function ProtectedRoute({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    const userData = localStorage.getItem('crm_user');
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
      } catch {
        localStorage.removeItem('crm_token');
        localStorage.removeItem('crm_user');
      }
    }
    setLoading(false);

    const handleAuthFail = () => {
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      setUser(null);
    };
    window.addEventListener('auth-unauthorized', handleAuthFail);
    return () => window.removeEventListener('auth-unauthorized', handleAuthFail);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/crmtayyorlovmarkaz/login" state={{ from: location }} replace />;
  }

  // Route protection: only check when allowedRoles or requiredPermission is given
  if ((allowedRoles || requiredPermission) && !canAccess(user, allowedRoles, requiredPermission)) {
    return <Navigate to="/crmtayyorlovmarkaz" replace />;
  }

  return <>{children}</>;
}
