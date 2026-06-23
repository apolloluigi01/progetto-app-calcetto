import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function AdminHome() {
  const { player, session, signOut } = useAuth()

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Admin</h1>

      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <p className="font-medium">{player.name}</p>
          {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
          {session?.user.email && <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>}
          <p className="mt-2 text-xs uppercase text-field-green">{roleLabels[player.role] ?? player.role}</p>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500">
        La gestione partite si trova nella sezione "Partite". Qui arriveranno le configurazioni
        future: gestione stagioni e pesi del rating.
      </p>

      <Link
        to="/admin/giocatori"
        className="mt-4 block w-full rounded-lg bg-field-green px-4 py-2 text-center text-sm font-medium text-white hover:bg-field-green-dark"
      >
        Modifica anagrafica giocatori
      </Link>

      <button
        onClick={signOut}
        className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        Esci
      </button>
    </div>
  )
}
