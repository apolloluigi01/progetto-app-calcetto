import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useFantaLeague } from '../hooks/useFantaLeague'
import { computeLineupScore, formatFantaPoints, getFantaSettings } from '../lib/fantacalcetto'
import { logActivity } from '../lib/activityLog'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import PlayerName from '../components/PlayerName'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function FantaLega() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { player, isAdmin } = useAuth()
  const { data, loading, error, refetch } = useFantaLeague(leagueId, player?.id)
  const [joining, setJoining] = useState(false)
  const [calcBusy, setCalcBusy] = useState<string | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)

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

  // Calcola (o ricalcola) i punteggi di tutte le formazioni della giornata
  // e li persiste, marcando la giornata come calcolata. Solo admin.
  async function calcolaGiornata(matchId: string) {
    if (!leagueId) return
    setCalcBusy(matchId)
    setCalcError(null)

    // Parametri bonus/malus configurati dagli admin (CDA → Gestione Fantacalcetto).
    const settings = await getFantaSettings()

    const [lineupsRes, pagelleRes, goalsRes, assistsRes] = await Promise.all([
      supabase
        .from('fanta_lineups')
        .select('id, captain_id, fanta_lineup_players(player_id)')
        .eq('league_id', leagueId)
        .eq('match_id', matchId),
      supabase
        .from('pagelle')
        .select('player_id, voto, is_mvp')
        .eq('match_id', matchId)
        .not('published_at', 'is', null),
      supabase.from('goals').select('player_id, is_own_goal').eq('match_id', matchId),
      supabase.from('assists').select('player_id').eq('match_id', matchId),
    ])

    type LineupRow = { id: string; captain_id: string; fanta_lineup_players: { player_id: string }[] }
    const lineups = (lineupsRes.data ?? []) as unknown as LineupRow[]
    const matchInput = {
      pagelle: pagelleRes.data ?? [],
      goals: goalsRes.data ?? [],
      assists: assistsRes.data ?? [],
    }

    for (const lineup of lineups) {
      const score = computeLineupScore(
        lineup.fanta_lineup_players.map((p) => p.player_id),
        lineup.captain_id,
        matchInput,
        settings,
      )
      const { error: updError } = await supabase
        .from('fanta_lineups')
        .update({ score: score.total })
        .eq('id', lineup.id)
      if (updError) {
        setCalcBusy(null)
        setCalcError(updError.message)
        return
      }
    }

    const { error: calcInsError } = await supabase
      .from('fanta_calculations')
      .upsert(
        { league_id: leagueId, match_id: matchId, calculated_by: player?.id ?? null, calculated_at: new Date().toISOString() },
        { onConflict: 'league_id,match_id' },
      )
    setCalcBusy(null)
    if (calcInsError) {
      setCalcError(calcInsError.message)
      return
    }
    logActivity('fanta_giornata_calcolata', { matchId, formazioni: lineups.length })
    refetch()
  }

  // Annulla il calcolo: la giornata torna "non calcolata" e i punteggi
  // vengono azzerati (si può poi ricalcolare in qualsiasi momento).
  async function annullaCalcolo(matchId: string) {
    if (!leagueId || !confirm('Annullare il calcolo di questa giornata? I punti verranno rimossi dalla classifica finché non la ricalcoli.')) return
    setCalcBusy(matchId)
    setCalcError(null)
    await supabase.from('fanta_calculations').delete().eq('league_id', leagueId).eq('match_id', matchId)
    const { error: updError } = await supabase
      .from('fanta_lineups')
      .update({ score: null })
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
    setCalcBusy(null)
    if (updError) {
      setCalcError(updError.message)
      return
    }
    logActivity('fanta_calcolo_annullato', { matchId })
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
                    <span className="flex min-w-0 items-start gap-1">
                      <PlayerName name={s.name} surname={s.surname} nickname={s.nickname} />
                      {s.playerId === player?.id && <span className="shrink-0 text-xs text-field-green">(tu)</span>}
                    </span>
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
              m.isNext && m.teamsOfficial ? (
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
                        {m.isNext
                          ? "Squadre non ancora ufficializzate: lo schieramento si aprirà dopo l'ufficializzazione degli admin."
                          : 'Si potrà schierare solo dopo la partita precedente.'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {m.isNext ? '⏳ In attesa' : '🔒 Bloccata'}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </>
      )}

      {/* ===== PARTITE GIOCATE ===== */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Giornate concluse</h2>
      {calcError && <p className="mt-2 text-sm text-red-600">{calcError}</p>}
      <div className="mt-2 space-y-2">
        {played.length === 0 && <p className="text-sm text-gray-500">Nessuna giornata conclusa.</p>}
        {played.map((m) => (
          <div key={m.match.id} className="overflow-hidden rounded-xl bg-white shadow">
            <Link
              to={`/fantacalcetto/${league.id}/partite/${m.match.id}`}
              className="block p-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{formatDate(m.match.match_date)}</p>
                  <p className="text-xs text-gray-500">
                    {!m.isPublished
                      ? 'In attesa delle pagelle'
                      : !m.isCalculated
                        ? 'In attesa del calcolo della giornata'
                        : m.myLineup
                          ? 'Giornata calcolata'
                          : 'Giornata calcolata — nessuna tua formazione'}
                  </p>
                </div>
                {m.myScore !== null && (
                  <span className="rounded-full bg-field-yellow/20 px-2.5 py-1 text-sm font-bold text-field-orange">
                    {formatFantaPoints(m.myScore)} pt
                  </span>
                )}
              </div>
            </Link>

            {/* Azioni admin: calcolo/annullo della giornata */}
            {isAdmin && m.isPublished && (
              <div className="flex gap-2 border-t border-gray-100 px-4 py-2.5">
                {!m.isCalculated ? (
                  <button
                    onClick={() => calcolaGiornata(m.match.id)}
                    disabled={calcBusy === m.match.id}
                    className="flex-1 rounded-lg bg-field-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-field-orange/90 disabled:opacity-60"
                  >
                    {calcBusy === m.match.id ? 'Calcolo in corso...' : '🧮 Calcola giornata'}
                  </button>
                ) : (
                  <button
                    onClick={() => annullaCalcolo(m.match.id)}
                    disabled={calcBusy === m.match.id}
                    className="flex-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    ✕ Annulla calcolo
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
