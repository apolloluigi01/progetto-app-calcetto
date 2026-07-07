import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { usePlayerRatings } from '../hooks/usePlayerRatings'
import {
  FANTA_BUDGET,
  FANTA_TEAM_SIZE,
  computeLineupScore,
  creditCost,
  formatFantaPoints,
} from '../lib/fantacalcetto'
import FantaPitch from '../components/FantaPitch'
import type { MatchPlayerWithName } from '../hooks/useMatchDetail'
import type { Player } from '../types/database'

interface SavedLineup {
  playerIds: string[]
  captainId: string
}

export default function FantaFormazione() {
  const { leagueId, matchId } = useParams<{ leagueId: string; matchId: string }>()
  const { player } = useAuth()
  const { data, loading, error } = useMatchDetail(matchId)
  const { ratings, loading: ratingsLoading } = usePlayerRatings(data?.matchPlayers.map((mp) => mp.player_id))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [captainId, setCaptainId] = useState('')
  const [lineupLoaded, setLineupLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Ultima formazione salvata sul server: alimenta il campetto.
  const [savedLineup, setSavedLineup] = useState<SavedLineup | null>(null)
  // Si può schierare solo per la prossima partita da giocare (null = verifica in corso).
  const [isNextMatch, setIsNextMatch] = useState<boolean | null>(null)

  // Carica l'eventuale formazione già schierata.
  useEffect(() => {
    if (!leagueId || !matchId || !player) return
    let cancelled = false
    supabase
      .from('fanta_lineups')
      .select('captain_id, fanta_lineup_players(player_id)')
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .eq('member_id', player.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return
        type Row = { captain_id: string; fanta_lineup_players: { player_id: string }[] }
        if (row) {
          const r = row as unknown as Row
          const ids = r.fanta_lineup_players.map((p) => p.player_id)
          setSelected(new Set(ids))
          setCaptainId(r.captain_id)
          setSavedLineup({ playerIds: ids, captainId: r.captain_id })
        }
        setLineupLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, matchId, player])

  // Verifica che questa sia davvero la prossima partita da giocare della
  // stagione: le formazioni si possono schierare solo per quella.
  useEffect(() => {
    if (!data) return
    let cancelled = false
    supabase
      .from('matches')
      .select('id, result:match_results(id)')
      .eq('season_id', data.match.season_id)
      .order('match_date', { ascending: true })
      .then(({ data: rows }) => {
        if (cancelled) return
        type Row = { id: string; result: { id: string }[] | { id: string } | null }
        const next = ((rows ?? []) as unknown as Row[]).find(
          (r) => !(Array.isArray(r.result) ? r.result[0] ?? null : r.result),
        )
        setIsNextMatch(next?.id === data.match.id)
      })
    return () => {
      cancelled = true
    }
  }, [data])

  if (loading || ratingsLoading || !lineupLoaded || isNextMatch === null)
    return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers, pagelle, goals, result } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  // Bloccata se la partita è conclusa oppure se non è la prossima in programma.
  const locked = !!result || !isNextMatch

  const costOf = (playerId: string) => creditCost(ratings.get(playerId) ?? null)
  const budgetUsed = [...selected].reduce((s, id) => s + costOf(id), 0)
  const countA = teamA.filter((p) => selected.has(p.player_id)).length
  const countB = teamB.filter((p) => selected.has(p.player_id)).length

  const isValid =
    selected.size === FANTA_TEAM_SIZE &&
    budgetUsed <= FANTA_BUDGET &&
    countA >= 1 &&
    countB >= 1 &&
    !!captainId &&
    selected.has(captainId)

  function togglePlayer(playerId: string) {
    setSaved(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
        if (captainId === playerId) setCaptainId('')
      } else {
        if (next.size >= FANTA_TEAM_SIZE) return prev
        next.add(playerId)
      }
      return next
    })
  }

  async function handleSave() {
    if (!leagueId || !matchId || !player || !isValid) return
    setSaving(true)
    setSaveError(null)

    const { data: lineupRow, error: upsertError } = await supabase
      .from('fanta_lineups')
      .upsert(
        {
          league_id: leagueId,
          match_id: matchId,
          member_id: player.id,
          captain_id: captainId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'league_id,match_id,member_id' },
      )
      .select('id')
      .single()

    if (upsertError || !lineupRow) {
      setSaving(false)
      setSaveError(upsertError?.message ?? 'Errore nel salvataggio')
      return
    }

    await supabase.from('fanta_lineup_players').delete().eq('lineup_id', lineupRow.id)
    const { error: playersError } = await supabase
      .from('fanta_lineup_players')
      .insert([...selected].map((pid) => ({ lineup_id: lineupRow.id, player_id: pid })))
    setSaving(false)

    if (playersError) {
      setSaveError(playersError.message)
      return
    }
    setSaved(true)
    setSavedLineup({ playerIds: [...selected], captainId })
  }

  // Punteggio (solo a pagelle pubblicate)
  const score =
    locked && isPublished && selected.size > 0
      ? computeLineupScore([...selected], captainId, {
          pagelle: pagelle.map((p) => ({ player_id: p.player_id, voto: p.voto, is_mvp: p.is_mvp })),
          goals: goals.map((g) => ({
            player_id: g.player_id,
            is_own_goal: g.is_own_goal,
            assist_player_id: g.assist_player_id,
          })),
        })
      : null

  const nameOf = (playerId: string) => {
    const mp = matchPlayers.find((p) => p.player_id === playerId)
    return mp ? (mp.nickname ?? mp.name) : '?'
  }

  function renderTeam(team: MatchPlayerWithName[], label: string, count: number) {
    return (
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium text-field-green-dark">{label}</h3>
          <span className={`text-xs font-semibold ${count === 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {count} scelti
          </span>
        </div>
        <ul className="space-y-1.5">
          {team.map((p) => {
            const isSelected = selected.has(p.player_id)
            const cost = costOf(p.player_id)
            const disabled =
              locked || (!isSelected && (selected.size >= FANTA_TEAM_SIZE || budgetUsed + cost > FANTA_BUDGET))
            return (
              <li key={p.player_id}>
                <button
                  type="button"
                  onClick={() => togglePlayer(p.player_id)}
                  disabled={disabled}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                    isSelected
                      ? 'border-field-green bg-field-green/10 font-medium text-field-green-dark'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40'
                  }`}
                >
                  <span className="truncate">{p.nickname ?? p.name}</span>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      isSelected ? 'bg-field-green text-white' : 'bg-field-yellow/20 text-field-orange'
                    }`}
                  >
                    {cost} cr
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="p-4 pb-12">
      <Link to={`/fantacalcetto/${leagueId}`} className="text-sm text-field-green underline">
        ← Torna alla lega
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">
          {locked ? 'La tua formazione' : 'Schiera la formazione'}
        </h1>
        <p className="text-sm text-gray-500">
          {new Date(match.match_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
        </p>
      </div>

      {locked ? (
        <div className="mt-3 rounded-xl border border-field-orange/30 bg-field-orange/5 p-3">
          <p className="text-sm text-field-orange">
            {!result
              ? '🔒 Puoi schierare la formazione solo per la prossima partita in programma: questa si sbloccherà dopo quella precedente.'
              : isPublished
                ? 'Partita conclusa: ecco il punteggio della tua squadra.'
                : 'Partita conclusa: il punteggio arriverà con la pubblicazione delle pagelle.'}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-500">
          Scegli {FANTA_TEAM_SIZE} giocatori con {FANTA_BUDGET} crediti, pescando da entrambe le squadre
          (almeno 1 per squadra), poi nomina il capitano (bonus ×1.2).
        </p>
      )}

      {/* Budget bar */}
      {!locked && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              Budget: {budgetUsed}/{FANTA_BUDGET} crediti
            </span>
            <span className={`font-semibold ${selected.size === FANTA_TEAM_SIZE ? 'text-field-green-dark' : 'text-gray-400'}`}>
              {selected.size}/{FANTA_TEAM_SIZE} giocatori
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${budgetUsed > FANTA_BUDGET ? 'bg-red-500' : 'bg-field-green'}`}
              style={{ width: `${Math.min((budgetUsed / FANTA_BUDGET) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Selezione giocatori */}
      {selected.size === 0 && locked ? (
        <p className="mt-4 text-sm text-gray-500">
          {result
            ? 'Non avevi schierato nessuna formazione per questa partita.'
            : 'Le squadre di questa partita saranno schierabili quando sarà il suo turno.'}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {renderTeam(teamA, 'Squadra A', countA)}
          {renderTeam(teamB, 'Squadra B', countB)}
        </div>
      )}

      {/* Capitano */}
      {selected.size > 0 && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow">
          <h3 className="font-medium text-field-green-dark">Capitano (bonus ×1.2)</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...selected].map((pid) => (
              <button
                key={pid}
                type="button"
                disabled={locked}
                onClick={() => {
                  setSaved(false)
                  setCaptainId(pid)
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  captainId === pid
                    ? 'bg-field-orange text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {captainId === pid && 'Ⓒ '}
                {nameOf(pid)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Validazioni + salvataggio */}
      {!locked && (
        <>
          <div className="mt-3 space-y-1 text-xs">
            {selected.size !== FANTA_TEAM_SIZE && (
              <p className="text-gray-500">• Seleziona {FANTA_TEAM_SIZE} giocatori ({selected.size} scelti)</p>
            )}
            {selected.size > 0 && (countA === 0 || countB === 0) && (
              <p className="text-red-500">• Serve almeno un giocatore per squadra</p>
            )}
            {budgetUsed > FANTA_BUDGET && <p className="text-red-500">• Hai superato il budget di {FANTA_BUDGET} crediti</p>}
            {selected.size === FANTA_TEAM_SIZE && !captainId && (
              <p className="text-gray-500">• Scegli il capitano</p>
            )}
          </div>

          {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
          {saved && <p className="mt-2 text-sm text-green-700">✓ Formazione salvata.</p>}

          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="mt-3 w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
          >
            {saving ? 'Salvataggio...' : 'Salva formazione'}
          </button>
        </>
      )}

      {/* Campetto con la squadra schierata */}
      {savedLineup && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            La tua squadra schierata
          </h3>
          <FantaPitch
            entries={savedLineup.playerIds
              .map((pid) => matchPlayers.find((mp) => mp.player_id === pid))
              .filter((mp): mp is MatchPlayerWithName & { player: Player } => !!mp && mp.player !== null)
              .map((mp) => ({
                player: mp.player,
                overall: ratings.get(mp.player_id) ?? null,
                stats: null,
              }))}
            captainId={savedLineup.captainId}
          />
        </div>
      )}

      {/* Punteggio dettagliato */}
      {score && (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
            <h3 className="font-medium text-field-green-dark">Punteggio squadra</h3>
            <span className="rounded-full bg-field-yellow/20 px-3 py-1 text-base font-bold text-field-orange">
              {formatFantaPoints(score.total)} pt
            </span>
          </div>
          <ul>
            {score.players.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 first:border-t-0">
                <span className="text-sm font-medium text-gray-700">
                  {p.isCaptain && <span className="mr-1 text-field-orange">Ⓒ</span>}
                  {nameOf(p.playerId)}
                </span>
                <span className="text-xs text-gray-500">
                  voto {p.voto ?? '-'}
                  {p.bonus > 0 && <span className="text-field-green-dark"> +{p.bonus}</span>}
                  {p.malus < 0 && <span className="text-red-500"> {p.malus}</span>}
                  {p.isCaptain && ' ×1.2'}
                  <span className="ml-2 font-bold text-gray-800">{formatFantaPoints(p.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
