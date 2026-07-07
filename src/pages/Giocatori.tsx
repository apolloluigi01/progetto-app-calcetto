import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOveralls } from '../hooks/useOveralls'
import { useStatistiche } from '../hooks/useStatistiche'
import ErrorNotice from '../components/ErrorNotice'
import PlayerCard from '../components/PlayerCard'
import type { Player } from '../types/database'

export default function Giocatori() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { overalls } = useOveralls()
  const { stats } = useStatistiche()

  useEffect(() => {
    setLoading(true)
    setError(null)
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setPlayers((data ?? []) as Player[])
        setLoading(false)
      })
  }, [reloadToken])

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Giocatori</h1>

      <div className="mt-4">
        {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
        {!loading && error && <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />}
        {!loading && !error && players.length === 0 && (
          <p className="text-sm text-gray-500">Nessun giocatore registrato.</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {players.map((p) => (
            <Link key={p.id} to={`/giocatori/${p.id}`} className="block">
              <PlayerCard
                player={p}
                overall={overalls.get(p.id) ?? null}
                stats={stats.find((s) => s.player.id === p.id) ?? null}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
