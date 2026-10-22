import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminLoginUrl } from '../../config/adminPaths';
import { isAdminHost } from '../../config/hostRouting';

export default function AdminProtectedRoute() {
  const { isAdminAuthenticated } = useAdminAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAdminAuthenticated && !isAdminHost()) {
      window.location.assign(adminLoginUrl());
    }
  }, [isAdminAuthenticated]);

  if (!isAdminAuthenticated && isAdminHost()) return <Navigate to="/" replace state={{ from: location }} />;
  if (!isAdminAuthenticated) return null;

  return <Outlet />;
}
