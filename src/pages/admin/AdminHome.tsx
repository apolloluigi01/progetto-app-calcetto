import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function AdminHome() {
  const { player, session } = useAuth()

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">CDA Pavone</h1>

      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <p className="font-medium">{player.name}</p>
          {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
          {session?.user.email && <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>}
          <p className="mt-2 text-xs uppercase text-field-green">{roleLabels[player.role] ?? player.role}</p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <Link
          to="/admin/giocatori"
          className="flex items-center gap-3 rounded-xl bg-field-green px-4 py-3 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          <span className="text-lg">👥</span>
          <div>
            <p className="font-semibold">Anagrafica giocatori</p>
            <p className="text-xs opacity-80">Modifica dati, ruoli e overall iniziale</p>
          </div>
        </Link>

        <Link
          to="/admin/partite"
          className="flex items-center gap-3 rounded-xl bg-field-green px-4 py-3 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          <span className="text-lg">⚽</span>
          <div>
            <p className="font-semibold">Gestione partite</p>
            <p className="text-xs opacity-80">Crea, modifica e gestisci le partite</p>
          </div>
        </Link>

        <Link
          to="/admin/stagioni"
          className="flex items-center gap-3 rounded-xl bg-field-green px-4 py-3 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          <span className="text-lg">🏆</span>
          <div>
            <p className="font-semibold">Gestione stagioni</p>
            <p className="text-xs opacity-80">Crea e gestisci le stagioni del campionato</p>
          </div>
        </Link>

        <Link
          to="/admin/fantacalcetto"
          className="flex items-center gap-3 rounded-xl bg-field-green px-4 py-3 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          <span className="text-lg">🎮</span>
          <div>
            <p className="font-semibold">Gestione Fantacalcetto</p>
            <p className="text-xs opacity-80">Parametri bonus e malus del fantacalcetto</p>
          </div>
        </Link>

        <Link
          to="/admin/overall"
          className="flex items-center gap-3 rounded-xl bg-field-green px-4 py-3 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          <span className="text-lg">📊</span>
          <div>
            <p className="font-semibold">Gestione overall</p>
            <p className="text-xs opacity-80">Modifica manuale dell'overall dei giocatori</p>
          </div>
        </Link>

        <Link
          to="/registro-attivita"
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span className="text-lg">📋</span>
          <div>
            <p className="font-semibold">Registro attività</p>
            <p className="text-xs text-gray-500">Storico di tutte le azioni admin</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
