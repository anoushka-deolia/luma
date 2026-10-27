import { Navigate, useLocation } from 'react-router-dom';
import { useAppState } from '../lib/AppState.jsx';

export default function RequireAuth({ children, reason }) {
  const { isLoggedIn } = useAppState();
  const location = useLocation();
  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname, reason }} />;
  }
  return children;
}
