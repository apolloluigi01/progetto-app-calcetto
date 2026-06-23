import { useAuth } from '../contexts/AuthContext'

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function Impostazioni() {
  const { player, session, signOut } = useAuth()

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Impostazioni</h1>

      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <p className="font-medium">{player.name}</p>
          {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
          {session?.user.email && <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>}
          <p className="mt-2 text-xs uppercase text-field-green">{roleLabels[player.role] ?? player.role}</p>
        </div>
      )}

      <button
        onClick={signOut}
        className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        Esci
      </button>
    </div>
  )
}
