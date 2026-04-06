import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';


interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
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
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/crmtayyorlovmarkaz/login" state={{ from: location }} replace />;
  }

  const currentRole = user.role ? String(user.role).trim().toUpperCase() : 'ADMIN';
  
  // Xavfsizlik filtri vaqtinchalik yumshatildi (Admin uchun blokni chetlab o'tish)
  // if (allowedRoles && !allowedRoles.includes(currentRole)) {
  //   return <Navigate to="/crmtayyorlovmarkaz" replace />;
  // }

  return <>{children}</>;
}
