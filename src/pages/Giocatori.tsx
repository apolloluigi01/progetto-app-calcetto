import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Player, PlayerRole } from '../types/database'

const roleLabels: Record<PlayerRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function Giocatori() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setPlayers((data ?? []) as Player[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Giocatori</h1>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
        {players.map((p) => (
          <Link
            key={p.id}
            to={`/giocatori/${p.id}`}
            className="block rounded-xl bg-white p-3 shadow hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.name}</p>
                {p.nickname && <p className="text-xs text-gray-500">{p.nickname}</p>}
              </div>
              {p.role !== 'player' && (
                <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-xs text-field-green-dark">
                  {roleLabels[p.role]}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
