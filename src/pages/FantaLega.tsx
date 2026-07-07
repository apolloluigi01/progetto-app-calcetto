import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFantaLeague } from '../hooks/useFantaLeague'
import { formatFantaPoints } from '../lib/fantacalcetto'
import { supabase } from '../lib/supabase'
import { useState } from 'react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function FantaLega() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { player } = useAuth()
  const { data, loading, error, refetch } = useFantaLeague(leagueId, player?.id)
  const [joining, setJoining] = useState(false)

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Lega non trovata'}</div>

  const { league, isMember, standings, matches } = data

  async function handleJoin() {
    if (!player || !leagueId) return
    setJoining(true)
    await supabase.from('fanta_league_members').insert({ league_id: leagueId, player_id: player.id })
    setJoining(false)
    refetch()
  }

  // Partite giocabili: squadre assegnate. Quelle senza risultato sono schierabili.
  const playableMatches = matches.filter((m) => m.hasTeams)
  const upcoming = playableMatches.filter((m) => !m.hasResult)
  const played = [...playableMatches.filter((m) => m.hasResult)].reverse()

  return (
    <div className="p-4 pb-12">
      <Link to="/fantacalcetto" className="text-sm text-field-green underline">
        ← Tutte le leghe
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-field-green-dark">{league.name}</h1>
          <p className="text-sm text-gray-500">Stagione {league.season_name}</p>
        </div>
      </div>

      {!isMember && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <p className="text-sm text-gray-700">Non sei ancora iscritto a questa lega.</p>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="mt-2 w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
          >
            {joining ? 'Iscrizione...' : 'Partecipa alla lega'}
          </button>
        </div>
      )}

      {/* ===== CLASSIFICA ===== */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Classifica</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {standings.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Nessun partecipante ancora.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-10 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">#</th>
                <th className="px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Partecipante
                </th>
                <th className="px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Giornate
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Punti
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.playerId}
                  className={`border-t border-gray-100 ${s.playerId === player?.id ? 'bg-field-green/5' : ''}`}
                >
                  <td className="px-4 py-2.5 text-gray-400">
                    {i === 0 ? '🏆' : i + 1}
                  </td>
                  <td className="px-2 py-2.5 font-medium text-gray-700">
                    {s.nickname ?? s.name}
                    {s.playerId === player?.id && <span className="ml-1 text-xs text-field-green">(tu)</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-500">{s.matchesScored}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center rounded-full bg-field-yellow/20 px-2.5 py-1 text-sm font-bold text-field-orange">
                      {formatFantaPoints(s.total)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ===== PROSSIME PARTITE (formazioni da schierare) ===== */}
      {isMember && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Da schierare</h2>
          <div className="mt-2 space-y-2">
            {upcoming.length === 0 && (
              <p className="text-sm text-gray-500">
                Nessuna partita in programma con le squadre già assegnate: torna dopo la generazione delle
                squadre.
              </p>
            )}
            {upcoming.map((m) =>
              m.isNext ? (
                <Link
                  key={m.match.id}
                  to={`/fantacalcetto/${league.id}/partite/${m.match.id}`}
                  className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{formatDate(m.match.match_date)}</p>
                      <p className="text-xs text-gray-500">
                        {m.myLineup ? '✓ Formazione schierata — tocca per modificarla' : 'Formazione da schierare'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.myLineup
                          ? 'bg-field-green/10 text-field-green-dark'
                          : 'bg-field-yellow/20 text-field-orange'
                      }`}
                    >
                      {m.myLineup ? 'Schierata' : 'Da fare'}
                    </span>
                  </div>
                </Link>
              ) : (
                <div key={m.match.id} className="rounded-xl bg-white p-4 opacity-60 shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{formatDate(m.match.match_date)}</p>
                      <p className="text-xs text-gray-500">
                        Si potrà schierare solo dopo la partita precedente.
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">🔒 Bloccata</span>
                  </div>
                </div>
              ),
            )}
          </div>
        </>
      )}

      {/* ===== PARTITE GIOCATE ===== */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Giornate concluse</h2>
      <div className="mt-2 space-y-2">
        {played.length === 0 && <p className="text-sm text-gray-500">Nessuna giornata conclusa.</p>}
        {played.map((m) => (
          <Link
            key={m.match.id}
            to={`/fantacalcetto/${league.id}/partite/${m.match.id}`}
            className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{formatDate(m.match.match_date)}</p>
                <p className="text-xs text-gray-500">
                  {!m.myLineup
                    ? 'Nessuna formazione schierata'
                    : m.isPublished
                      ? 'Punteggio calcolato'
                      : 'In attesa delle pagelle'}
                </p>
              </div>
              {m.myLineup && m.isPublished && m.myScore !== null && (
                <span className="rounded-full bg-field-yellow/20 px-2.5 py-1 text-sm font-bold text-field-orange">
                  {formatFantaPoints(m.myScore)} pt
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
