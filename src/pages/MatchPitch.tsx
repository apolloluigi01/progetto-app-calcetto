import { Link, useParams } from 'react-router-dom'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { usePlayerRatings } from '../hooks/usePlayerRatings'
import TeamPitch from '../components/TeamPitch'
import type { Player } from '../types/database'
import type { MatchPlayerWithName } from '../hooks/useMatchDetail'

export default function MatchPitch() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, error } = useMatchDetail(id)
  const { ratings, loading: ratingsLoading } = usePlayerRatings(data?.matchPlayers.map((mp) => mp.player_id))

  if (loading || ratingsLoading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')

  const pitchEntries = (list: MatchPlayerWithName[]) =>
    list
      .filter((mp): mp is MatchPlayerWithName & { player: Player } => mp.player !== null)
      .map((mp) => ({
        player: mp.player,
        overall: ratings.get(mp.player_id) ?? null,
        stats: null,
      }))

  return (
    <div className="p-4 pb-12">
      <div className="flex items-center justify-between">
        <Link to={`/partite/${id}`} className="text-sm text-field-green underline">
          ← Torna alla partita
        </Link>
        <p className="text-sm font-medium text-gray-500">
          {new Date(match.match_date).toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {matchPlayers.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Le squadre non sono ancora state assegnate.</p>
      ) : (
        <div className="mt-4">
          <TeamPitch teamA={pitchEntries(teamA)} teamB={pitchEntries(teamB)} large />
        </div>
      )}
    </div>
  )
}
