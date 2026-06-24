import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { session, player, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  if (!session) return <Navigate to="/login" replace />
  if (player?.must_change_password && location.pathname !== '/imposta-password') {
    return <Navigate to="/imposta-password" replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { isAdmin, loading } = useAuth()

  if (loading) return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  if (!isAdmin) return <Navigate to="/" replace />

  return <Outlet />
}
