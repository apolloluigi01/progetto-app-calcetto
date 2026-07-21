import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { usePlayerRatings } from '../hooks/usePlayerRatings'
import { useFantaSettings } from '../hooks/useFantaSettings'
import { useFasce } from '../hooks/useFasce'
import {
  FANTA_TEAM_SIZE,
  computeFantaBudget,
  computeLineupScore,
  creditCost,
  formatFantaPoints,
  lineupDeadline,
} from '../lib/fantacalcetto'
import { getFunctionErrorMessage } from '../lib/functionErrors'
import { logActivity } from '../lib/activityLog'
import FantaPitch from '../components/FantaPitch'
import PlayerName, { fullName } from '../components/PlayerName'
import type { MatchPlayerWithName } from '../hooks/useMatchDetail'
import type { Player } from '../types/database'

/** Massimo di reminder mail inviabili per giornata (stesso limite lato server). */
const MAX_REMINDERS = 3

interface SavedLineup {
  playerIds: string[]
  captainId: string
}

interface OtherLineup {
  memberId: string
  memberName: string
  captainId: string
  playerIds: string[]
  score: number | null
  hidden: boolean
}

export default function FantaFormazione() {
  const { leagueId, matchId } = useParams<{ leagueId: string; matchId: string }>()
  const { player, isAdmin } = useAuth()
  const { data, loading, error } = useMatchDetail(matchId)
  const { ratings, loading: ratingsLoading } = usePlayerRatings(data?.matchPlayers.map((mp) => mp.player_id))
  const { settings } = useFantaSettings()
  const { fasce } = useFasce()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [captainId, setCaptainId] = useState('')
  // Flag "formazione invisibile agli altri" (resta visibile che è schierata).
  const [hiddenFlag, setHiddenFlag] = useState(false)
  const [lineupLoaded, setLineupLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Ultima formazione salvata sul server: alimenta il campetto.
  const [savedLineup, setSavedLineup] = useState<SavedLineup | null>(null)
  // Si può schierare solo per la prossima partita da giocare (null = verifica in corso).
  const [isNextMatch, setIsNextMatch] = useState<boolean | null>(null)
  // True se l'admin ha eseguito il "Calcola giornata" per questa partita.
  const [isCalculated, setIsCalculated] = useState(false)
  // Formazioni schierate dagli altri partecipanti alla lega.
  const [others, setOthers] = useState<OtherLineup[]>([])
  // Reminder mail "schiera la formazione" (solo admin): quanti già inviati.
  const [reminderCount, setReminderCount] = useState<number | null>(null)
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [reminderSent, setReminderSent] = useState(false)
  // Orologio per il blocco formazioni (15' prima del calcio d'inizio):
  // si aggiorna ogni 30 secondi così la pagina si blocca da sola allo scadere.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Carica l'eventuale formazione già schierata.
  useEffect(() => {
    if (!leagueId || !matchId || !player) return
    let cancelled = false
    supabase
      .from('fanta_lineups')
      .select('captain_id, hidden, fanta_lineup_players(player_id)')
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .eq('member_id', player.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return
        type Row = { captain_id: string; hidden: boolean; fanta_lineup_players: { player_id: string }[] }
        if (row) {
          const r = row as unknown as Row
          const ids = r.fanta_lineup_players.map((p) => p.player_id)
          setSelected(new Set(ids))
          setCaptainId(r.captain_id)
          setHiddenFlag(r.hidden)
          setSavedLineup({ playerIds: ids, captainId: r.captain_id })
        }
        setLineupLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, matchId, player])

  // Formazioni degli altri partecipanti alla lega per questa partita.
  useEffect(() => {
    if (!leagueId || !matchId || !player) return
    let cancelled = false
    supabase
      .from('fanta_lineups')
      // Due foreign key verso players (member e capitano): serve il
      // riferimento esplicito per disambiguare l'embed.
      .select('member_id, captain_id, score, hidden, fanta_lineup_players(player_id), member:players!fanta_lineups_member_id_fkey(name, surname, nickname)')
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .neq('member_id', player.id)
      .then(({ data: rows }) => {
        if (cancelled) return
        type Row = {
          member_id: string
          captain_id: string
          score: number | null
          hidden: boolean
          fanta_lineup_players: { player_id: string }[]
          member: { name: string; surname: string | null; nickname: string | null } | null
        }
        setOthers(
          ((rows ?? []) as unknown as Row[]).map((r) => ({
            memberId: r.member_id,
            memberName: r.member ? fullName(r.member) : '?',
            captainId: r.captain_id,
            playerIds: r.fanta_lineup_players.map((p) => p.player_id),
            score: r.score !== null ? Number(r.score) : null,
            hidden: r.hidden,
          })),
        )
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, matchId, player])

  // Stato del calcolo giornata (admin): determina se mostrare il punteggio.
  useEffect(() => {
    if (!leagueId || !matchId) return
    let cancelled = false
    supabase
      .from('fanta_calculations')
      .select('id')
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!cancelled) setIsCalculated(!!row)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, matchId])

  // Numero di reminder già inviati per questa giornata (solo admin).
  useEffect(() => {
    if (!leagueId || !matchId || !isAdmin) return
    let cancelled = false
    supabase
      .from('fanta_lineup_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .then(({ count }) => {
        if (!cancelled) setReminderCount(count ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, matchId, isAdmin])

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

  const { match, matchPlayers, pagelle, goals, assists, result } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  // Termine ultimo: 15 minuti prima del calcio d'inizio (se la partita ha un orario).
  const deadline = lineupDeadline(match.match_date, match.match_time)
  const pastDeadline = deadline !== null && now >= deadline.getTime()
  // Senza squadre formate non c'è nulla da schierare.
  const teamsFormed = teamA.length > 0 && teamB.length > 0
  // Lo schieramento si apre solo dopo l'ufficializzazione delle squadre.
  const teamsOfficial = !!match.teams_official_at
  // Bloccata se le squadre non sono formate o non ufficializzate, se la
  // partita è conclusa, se non è la prossima in programma o se manca meno
  // di un quarto d'ora al calcio d'inizio.
  const locked = !teamsFormed || !teamsOfficial || !!result || !isNextMatch || pastDeadline

  const costOf = (playerId: string) => creditCost(ratings.get(playerId) ?? null, fasce)
  // Budget crediti dinamico: media del costo dei 10 in campo × giocatori da
  // schierare − 1. Si ricalcola da sé quando cambiano squadre o fasce/costi.
  // Vale per le formazioni da schierare: quelle già salvate non vengono
  // ricontrollate.
  const fieldPlayers = [...teamA, ...teamB]
  const budget = computeFantaBudget(fieldPlayers.map((p) => costOf(p.player_id)))
  const budgetUsed = [...selected].reduce((s, id) => s + costOf(id), 0)
  const countA = teamA.filter((p) => selected.has(p.player_id)).length
  const countB = teamB.filter((p) => selected.has(p.player_id)).length

  const isValid =
    selected.size === FANTA_TEAM_SIZE &&
    budgetUsed <= budget &&
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
    if (!leagueId || !matchId || !player || !isValid || locked) return
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
          hidden: hiddenFlag,
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
    // Formazione rischierata: l'avviso "squadre ricalcolate" in Home sparisce.
    await supabase
      .from('fanta_lineup_resets')
      .delete()
      .eq('league_id', leagueId)
      .eq('match_id', matchId)
      .eq('member_id', player.id)
    setSaved(true)
    setSavedLineup({ playerIds: [...selected], captainId })
  }

  // Invia a tutti i partecipanti della lega la mail che ricorda di schierare
  // la formazione. Solo admin, max 3 reminder, solo finché non è tutto bloccato.
  async function handleSendReminder() {
    if (!leagueId || !matchId || !isAdmin || locked || reminderSending) return
    if ((reminderCount ?? 0) >= MAX_REMINDERS) return
    setReminderSending(true)
    setReminderError(null)
    setReminderSent(false)
    const { error: fnError } = await supabase.functions.invoke('fanta-lineup-reminder', {
      body: { leagueId, matchId },
    })
    setReminderSending(false)
    if (fnError) {
      setReminderError(await getFunctionErrorMessage(fnError, "Errore nell'invio del reminder"))
      return
    }
    setReminderCount((c) => (c ?? 0) + 1)
    setReminderSent(true)
    logActivity('fanta_reminder_inviato', { leagueId, matchId })
  }

  // Punteggio (solo dopo che l'admin ha calcolato la giornata)
  const score =
    locked && isPublished && isCalculated && selected.size > 0
      ? computeLineupScore(
          [...selected],
          captainId,
          {
            pagelle: pagelle.map((p) => ({ player_id: p.player_id, voto: p.voto, is_mvp: p.is_mvp })),
            goals: goals.map((g) => ({ player_id: g.player_id, is_own_goal: g.is_own_goal })),
            assists: assists.map((a) => ({ player_id: a.player_id })),
          },
          settings,
        )
      : null

  const nameOf = (playerId: string) => {
    const mp = matchPlayers.find((p) => p.player_id === playerId)
    return mp ? fullName(mp) : '?'
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
              locked || (!isSelected && (selected.size >= FANTA_TEAM_SIZE || budgetUsed + cost > budget))
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
                  <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
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
            {!teamsFormed && !result
              ? '🔒 Le squadre di questa partita non sono ancora state formate: la formazione si potrà schierare dopo la generazione delle squadre.'
              : !teamsOfficial && !result
              ? "🔒 Le squadre non sono ancora state ufficializzate dagli admin: la formazione si potrà schierare dopo l'ufficializzazione."
              : !result
              ? pastDeadline && isNextMatch
                ? '🔒 Formazioni bloccate: mancano meno di 15 minuti al calcio d’inizio (o la partita è già iniziata). Non è più possibile inserire o modificare la formazione.'
                : '🔒 Puoi schierare la formazione solo per la prossima partita in programma: questa si sbloccherà dopo quella precedente.'
              : isCalculated
                ? 'Giornata calcolata: ecco il punteggio della tua squadra.'
                : isPublished
                  ? "Partita conclusa: il punteggio arriverà quando l'admin calcolerà la giornata."
                  : 'Partita conclusa: il punteggio arriverà con la pubblicazione delle pagelle e il calcolo della giornata.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">
            Scegli {FANTA_TEAM_SIZE} giocatori con {budget} crediti, pescando da entrambe le squadre
            (almeno 1 per squadra), poi nomina il capitano (i suoi bonus valgono ×{settings.captainMultiplier}).
            Il budget è calcolato in automatico sulle squadre di questa giornata.
          </p>
          {deadline && (
            <p className="mt-2 rounded-lg bg-field-yellow/15 px-3 py-2 text-xs font-medium text-field-orange">
              ⏳ Puoi inserire o modificare la formazione fino alle{' '}
              {deadline.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} del{' '}
              {deadline.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} (15 minuti
              prima del calcio d'inizio): dopo sarà bloccata.
            </p>
          )}
        </>
      )}

      {/* Reminder mail ai partecipanti (solo admin): va di pari passo con il
          blocco formazioni — quando non si può più schierare, non si invia più. */}
      {isAdmin && isNextMatch && !result && teamsFormed && teamsOfficial && (
        <div className="mt-3 rounded-xl border border-field-yellow/40 bg-field-yellow/10 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600">
              📣 Reminder formazione (admin) — inviati {reminderCount ?? '...'}/{MAX_REMINDERS}
            </p>
          </div>
          <button
            onClick={handleSendReminder}
            disabled={
              locked || reminderSending || reminderCount === null || reminderCount >= MAX_REMINDERS
            }
            className="mt-2 w-full rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-50"
          >
            {reminderSending
              ? 'Invio in corso...'
              : locked
                ? '🔒 Formazioni bloccate: reminder non più inviabile'
                : reminderCount !== null && reminderCount >= MAX_REMINDERS
                  ? 'Limite di reminder raggiunto'
                  : '✉️ Invia reminder ai partecipanti'}
          </button>
          {reminderSent && (
            <p className="mt-2 text-xs text-green-700">✓ Reminder inviato a tutti i partecipanti della lega.</p>
          )}
          {reminderError && <p className="mt-2 text-xs text-red-600">{reminderError}</p>}
        </div>
      )}

      {/* Budget bar */}
      {!locked && (
        <div className="mt-4 rounded-xl bg-white p-3 shadow">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">
              Budget: {budgetUsed}/{budget} crediti
            </span>
            <span className={`font-semibold ${selected.size === FANTA_TEAM_SIZE ? 'text-field-green-dark' : 'text-gray-400'}`}>
              {selected.size}/{FANTA_TEAM_SIZE} giocatori
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${budgetUsed > budget ? 'bg-red-500' : 'bg-field-green'}`}
              style={{ width: `${budget > 0 ? Math.min((budgetUsed / budget) * 100, 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Selezione giocatori */}
      {selected.size === 0 && locked ? (
        <p className="mt-4 text-sm text-gray-500">
          {result || pastDeadline
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
          <h3 className="font-medium text-field-green-dark">Capitano (bonus ×{settings.captainMultiplier})</h3>
          <p className="mt-0.5 text-xs text-gray-400">Il moltiplicatore si applica solo ai bonus, non al voto base.</p>
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
            {budgetUsed > budget && <p className="text-red-500">• Hai superato il budget di {budget} crediti</p>}
            {selected.size === FANTA_TEAM_SIZE && !captainId && (
              <p className="text-gray-500">• Scegli il capitano</p>
            )}
          </div>

          <label className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 shadow">
            <input
              type="checkbox"
              checked={hiddenFlag}
              onChange={(e) => {
                setSaved(false)
                setHiddenFlag(e.target.checked)
              }}
              className="mt-0.5 h-4 w-4 accent-field-green"
            />
            <span className="text-sm text-gray-700">
              🙈 <span className="font-medium">Formazione invisibile</span>
              <span className="block text-xs text-gray-400">
                Gli altri partecipanti vedranno solo che hai schierato, non chi: la formazione
                tornerà visibile al blocco delle formazioni.
              </span>
            </span>
          </label>

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
                  {p.bonus > 0 && (
                    <span className="text-field-green-dark">
                      {' '}+{p.bonus}
                      {p.isCaptain && `×${settings.captainMultiplier}`}
                    </span>
                  )}
                  {p.malus < 0 && <span className="text-red-500"> {p.malus}</span>}
                  <span className="ml-2 font-bold text-gray-800">{formatFantaPoints(p.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Formazioni degli altri partecipanti */}
      {others.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Formazioni degli altri partecipanti
          </h3>
          <div className="space-y-2">
            {others.map((o) => (
              <div key={o.memberId} className="rounded-xl bg-white p-3 shadow">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-field-green-dark">{o.memberName}</p>
                  {isCalculated && o.score !== null && (
                    <span className="rounded-full bg-field-yellow/20 px-2.5 py-0.5 text-sm font-bold text-field-orange">
                      {formatFantaPoints(o.score)} pt
                    </span>
                  )}
                </div>
                {/* Formazione nascosta: si vede che è schierata, non chi c'è dentro.
                    Torna visibile quando le formazioni si bloccano (deadline o partita giocata). */}
                {o.hidden && !result && !pastDeadline ? (
                  <p className="mt-2 text-xs italic text-gray-500">🙈 Formazione schierata, invisibile</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.playerIds.map((pid) => (
                      <span
                        key={pid}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          pid === o.captainId
                            ? 'bg-field-orange/10 text-field-orange'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {pid === o.captainId && 'Ⓒ '}
                        {nameOf(pid)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
