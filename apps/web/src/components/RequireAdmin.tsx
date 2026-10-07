import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../auth';

/**
 * Wraps the admin pages. Sends visitors who aren't logged in to /login, and back here after.
 * This only hides pages; the API checks the session itself on every admin request.
 */
export function RequireAdmin() {
  const admin = useSession();
  const location = useLocation();
  if (admin === undefined) return null;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
