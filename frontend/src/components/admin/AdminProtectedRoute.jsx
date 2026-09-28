import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminLoginUrl } from '../../config/adminPaths';

export default function AdminProtectedRoute() {
  const { isAdminAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAdminAuthenticated) {
    return <Navigate to={adminLoginUrl()} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
