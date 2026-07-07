import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStatistiche } from '../hooks/useStatistiche'
import { useOveralls } from '../hooks/useOveralls'
import { STAT_CONFIG, type StatKey } from '../lib/statistiche'
import PlayerCard from '../components/PlayerCard'
import type { Player } from '../types/database'

const STAT_KEYS: StatKey[] = ['overall', 'marcatori', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol']

export default function GiocatoreDetail() {
  const { id } = useParams<{ id: string }>()
  const { stats: seasonStats, loading: statsLoading } = useStatistiche()
  const { overalls } = useOveralls()

  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setPlayer((data as Player) ?? null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !player) return <div className="p-4 text-sm text-red-600">{error ?? 'Giocatore non trovato'}</div>

  const playerStats = seasonStats.find((s) => s.player.id === id) ?? null
  const winPercentage =
    playerStats && playerStats.partiteGiocate > 0 ? (playerStats.vittorie / playerStats.partiteGiocate) * 100 : null

  return (
    <div className="p-4">
      <div className="mx-auto max-w-[220px]">
        <PlayerCard player={player} overall={overalls.get(player.id) ?? null} stats={playerStats} />
      </div>

      <h2 className="mt-6 text-lg font-semibold text-field-green-dark">Statistiche stagione</h2>

      {statsLoading && <p className="mt-2 text-sm text-gray-500">Caricamento statistiche...</p>}

      {!statsLoading && !playerStats && (
        <p className="mt-2 text-sm text-gray-500">
          Nessuna partita giocata in questa stagione.
        </p>
      )}

      {!statsLoading && playerStats && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-3 text-center shadow">
              <p className="text-2xl font-bold text-field-green-dark">{playerStats.partiteGiocate}</p>
              <p className="text-xs text-gray-500">Partite giocate</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow">
              <p className="text-2xl font-bold text-field-green-dark">
                {winPercentage !== null ? `${winPercentage.toFixed(0)}%` : '-'}
              </p>
              <p className="text-xs text-gray-500">% vittorie</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow">
              <p className="text-2xl font-bold text-field-green-dark">
                {playerStats.voteCount > 0 && playerStats.voteAvg !== null ? playerStats.voteAvg.toFixed(2) : '-'}
              </p>
              <p className="text-xs text-gray-500">Media voto</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {STAT_KEYS.map((key, i) => {
                  const config = STAT_CONFIG[key]
                  const value = config.getValue(playerStats)
                  const isGreen = config.color === 'green'
                  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
                  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

                  return (
                    <tr key={key} className={`border-t border-gray-100 ${i === 0 ? 'border-t-0' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-700">{config.title}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${valueColor} ${valueBg}`}>
                          {value !== null ? config.formatValue(value) : '-'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
