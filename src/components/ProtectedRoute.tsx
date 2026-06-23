import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}

export function AdminRoute() {
  const { isAdmin, loading } = useAuth()

  if (loading) return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  if (!isAdmin) return <Navigate to="/" replace />

  return <Outlet />
}
