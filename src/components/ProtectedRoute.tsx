import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { session, player, loading, playerError, retryPlayer, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <div className="flex min-h-svh items-center justify-center">Caricamento...</div>
  if (!session) return <Navigate to="/login" replace />

  // Sessione valida ma profilo non caricato (tipicamente rete assente): senza
  // questo blocco l'app proseguiva come se fossimo un utente senza permessi,
  // in silenzio.
  if (playerError || !player) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base font-medium text-gray-800">Non riesco a caricare il tuo profilo</p>
        <p className="max-w-sm text-sm text-gray-500">
          Controlla la connessione e riprova. Se il problema continua, esci e rientra.
        </p>
        <div className="mt-1 flex gap-2">
          <button
            onClick={retryPlayer}
            className="rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Riprova
          </button>
          <button
            onClick={signOut}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Esci
          </button>
        </div>
      </div>
    )
  }

  if (player.must_change_password && location.pathname !== '/imposta-password') {
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
