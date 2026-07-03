import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOveralls } from '../hooks/useOveralls'
import type { Player, PlayerRole } from '../types/database'

const roleLabels: Record<PlayerRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function Giocatori() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const { overalls } = useOveralls()

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
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-field-green/10 text-xs font-bold text-field-green-dark">
                  {overalls.get(p.id) ?? '-'}
                </span>
                <div>
                  <p className="font-medium">
                    {p.name}
                    {p.surname && ` ${p.surname}`}
                  </p>
                  {p.nickname && <p className="text-xs text-gray-500">{p.nickname}</p>}
                </div>
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
