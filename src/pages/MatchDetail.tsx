import { useParams } from 'react-router-dom'
import { useMatchDetail } from '../hooks/useMatchDetail'
import type { Team } from '../types/database'

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, error } = useMatchDetail(id)

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers, goals, result, pagelle } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)

  return (
    <div className="p-4 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">
          {new Date(match.match_date).toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </h1>
        <div className="flex gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              match.status === 'completed'
                ? 'bg-field-green/10 text-field-green-dark'
                : 'bg-field-yellow/20 text-field-orange'
            }`}
          >
            {match.status === 'completed' ? 'Completata' : 'In preparazione'}
          </span>
          {isPublished && (
            <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">
              Pubblicata
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        {match.match_time && `${match.match_time.slice(0, 5)} · `}
        {match.field || 'Campo non specificato'}
      </p>

      {result && (
        <p className="mt-3 text-center text-3xl font-bold text-field-green-dark">
          {result.score_a} - {result.score_b}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3 shadow">
          <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
          <ul className="space-y-1 text-sm">
            {teamA.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-3 shadow">
          <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
          <ul className="space-y-1 text-sm">
            {teamB.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </div>
      </div>

      {goals.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow">
          <h3 className="mb-2 font-medium text-field-green-dark">Marcatori</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ul className="space-y-1">
              {goalsByTeam('A').map((g) => (
                <li key={g.id}>
                  ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {goalsByTeam('B').map((g) => (
                <li key={g.id}>
                  ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 font-medium text-field-green-dark">Pagelle</h3>
        {pagelle.length === 0 ? (
          <p className="text-sm text-gray-500">Pagelle non ancora pubblicate.</p>
        ) : (
          <div className="space-y-2">
            {pagelle.map((p) => (
              <div key={p.id} className="rounded-xl bg-white p-3 shadow">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {p.name} {p.is_mvp && <span className="text-field-orange">★ MVP</span>}
                  </p>
                  <span className="font-semibold text-field-green-dark">{p.voto}</span>
                </div>
                {p.titolo && <p className="text-sm font-medium text-gray-700">{p.titolo}</p>}
                {p.descrizione && <p className="mt-1 text-sm text-gray-500">{p.descrizione}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
