import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
// [APPROVAZIONE SQUADRE — regressa/disattivata, codice conservato per riuso futuro]
// import { useAuth } from '../../contexts/AuthContext'
import { useMatchDetail } from '../../hooks/useMatchDetail'
import { useMatchBookings } from '../../hooks/useMatchBookings'
import { getKnownFields } from '../../lib/fields'
import { findSeasonForDate } from '../../lib/seasons'
import { logActivity } from '../../lib/activityLog'
import { computeOverallsForPlayers, generateBalancedTeams } from '../../lib/teamGeneration'
import PlayerName, { fullName } from '../../components/PlayerName'
import ScorerBadges from '../../components/ScorerBadges'
import { aggregateScorers } from '../../lib/scorers'
import GuestPlayerForm from '../../components/GuestPlayerForm'
import type { Player, Team } from '../../types/database'
import type { PlayerOverall, GeneratedTeams } from '../../lib/teamGeneration'

const MAX_PLAYERS = 10

// Riga della bozza squadre (match_players_draft): è l'area di lavoro degli
// admin. match_players (official) viene scritto solo all'ufficializzazione.
interface DraftPlayer {
  id: string
  player_id: string
  team: Team
  name: string
  surname: string | null
  nickname: string | null
}

export default function MatchEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // [APPROVAZIONE SQUADRE — disattivata] const { player: currentAdmin } = useAuth()
  const { data, loading, error, refetch } = useMatchDetail(id)
  const {
    bookings,
    loading: bookingsLoading,
    refetch: refetchBookings,
  } = useMatchBookings(id, undefined)

  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [savingResult, setSavingResult] = useState(false)
  const [savingStats, setSavingStats] = useState(false)
  // Il box risultato, come data/ora/luogo, dopo il salvataggio diventa in sola
  // lettura: si rientra in modifica con l'apposito tasto matita.
  const [editingResult, setEditingResult] = useState(false)

  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [field, setField] = useState('')
  const [knownFields, setKnownFields] = useState<string[]>([])
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  // Il box data/ora/luogo parte in sola lettura: si entra in modifica con
  // l'apposito tasto. Una volta censito il risultato non è più modificabile.
  const [editingInfo, setEditingInfo] = useState(false)

  const [newGoalPlayer, setNewGoalPlayer] = useState<Record<Team, string>>({ A: '', B: '' })
  const [ownGoal, setOwnGoal] = useState<Record<Team, boolean>>({ A: false, B: false })
  // Assist censiti in modo indipendente dai gol.
  const [newAssistPlayer, setNewAssistPlayer] = useState<Record<Team, string>>({ A: '', B: '' })

  const [deleting, setDeleting] = useState(false)

  // Sondaggio: aggiunta manuale giocatore
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [addBookingPlayer, setAddBookingPlayer] = useState('')
  const [addingBooking, setAddingBooking] = useState(false)
  const [addBookingError, setAddBookingError] = useState<string | null>(null)
  const [closingSurvey, setClosingSurvey] = useState(false)

  // Bozza squadre (workflow snapshot): tutto il lavoro sulle squadre avviene qui.
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([])
  const [draftLoaded, setDraftLoaded] = useState(false)
  const seededRef = useRef(false)
  // Overall dei giocatori in bozza (per mostrarlo accanto a ogni nome e la media squadra).
  const [draftOveralls, setDraftOveralls] = useState<Map<string, number>>(new Map())

  // Generazione squadre (prima assegnazione)
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeams | null>(null)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Stato locale delle squadre per lo scambio manuale in fase di generazione
  const [genTeamA, setGenTeamA] = useState<PlayerOverall[]>([])
  const [genTeamB, setGenTeamB] = useState<PlayerOverall[]>([])

  // Modifica manuale delle squadre in bozza
  const [editingTeams, setEditingTeams] = useState(false)
  const [localTeamA, setLocalTeamA] = useState<DraftPlayer[]>([])
  const [localTeamB, setLocalTeamB] = useState<DraftPlayer[]>([])
  const [savingTeams, setSavingTeams] = useState(false)

  const [recalculating, setRecalculating] = useState(false)
  const [officializing, setOfficializing] = useState(false)

  // [APPROVAZIONE SQUADRE — regressa/disattivata, conservata per riuso futuro]
  // Prima dell'ufficializzazione tutti gli admin dovevano approvare la versione
  // corrente (ogni modifica azzerava i flag). Per riattivare: decommentare qui,
  // l'effetto di caricamento, gli handler handleApproveTeams/clearTeamApprovals,
  // i derivati adminIds/allApproved/iApproved, il blocco UI di approvazione e
  // ripristinare il gate `!allApproved` in handleOfficializeTeams.
  // const [approvals, setApprovals] = useState<string[]>([])
  // const [approvalsVersion, setApprovalsVersion] = useState(0)
  // const [approving, setApproving] = useState(false)

  // Nuove squadre (da ricalcolo o sostituzione) in attesa del salvataggio.
  interface PendingTeams {
    teamA: PlayerOverall[]
    teamB: PlayerOverall[]
    action: 'squadre_ricalcolate' | 'giocatore_sostituito'
    logDetails: Record<string, unknown>
    description: string
  }
  const [pendingTeams, setPendingTeams] = useState<PendingTeams | null>(null)
  const [savingPendingTeams, setSavingPendingTeams] = useState(false)

  // Sostituzione giocatore
  const [substitutingOpen, setSubstitutingOpen] = useState(false)
  const [subOutId, setSubOutId] = useState('')
  const [subInId, setSubInId] = useState('')
  const [substituting, setSubstituting] = useState(false)
  const [addingGuestSub, setAddingGuestSub] = useState(false)

  // --- Caricamento bozza squadre ---
  async function loadDraft() {
    if (!id) return
    const { data: dd } = await supabase
      .from('match_players_draft')
      .select('id, player_id, team, players(name, surname, nickname)')
      .eq('match_id', id)
    type Row = {
      id: string
      player_id: string
      team: Team
      players: { name: string; surname: string | null; nickname: string | null } | null
    }
    setDraftPlayers(
      ((dd ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        player_id: r.player_id,
        team: r.team,
        name: r.players?.name ?? '',
        surname: r.players?.surname ?? null,
        nickname: r.players?.nickname ?? null,
      }))
    )
    setDraftLoaded(true)
  }

  useEffect(() => {
    seededRef.current = false
    setDraftLoaded(false)
    loadDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-riparazione: partite con squadre ufficiali ma senza bozza (create prima
  // del workflow snapshot, es. vecchia modalità manuale). Ricostruiamo la bozza
  // dalle squadre esistenti così tornano gestibili (modifica/approva/ufficializza).
  useEffect(() => {
    if (!id || !data || !draftLoaded || seededRef.current) return
    if (draftPlayers.length === 0 && data.matchPlayers.length > 0) {
      seededRef.current = true
      const rows = data.matchPlayers.map((mp) => ({ match_id: id, player_id: mp.player_id, team: mp.team }))
      supabase
        .from('match_players_draft')
        .upsert(rows, { onConflict: 'match_id,player_id' })
        .then(() => loadDraft())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data, draftLoaded, draftPlayers.length])

  // [APPROVAZIONE SQUADRE — disattivata] Caricamento dei flag di approvazione.
  // useEffect(() => {
  //   if (!id) return
  //   let cancelled = false
  //   supabase
  //     .from('team_approvals')
  //     .select('admin_id')
  //     .eq('match_id', id)
  //     .then(({ data: ap }) => {
  //       if (!cancelled) setApprovals(((ap ?? []) as { admin_id: string }[]).map((a) => a.admin_id))
  //     })
  //   return () => {
  //     cancelled = true
  //   }
  // }, [id, approvalsVersion])

  useEffect(() => {
    let cancelled = false
    computeOverallsForPlayers(
      draftPlayers.map((mp) => ({ id: mp.player_id, name: mp.name, surname: mp.surname, nickname: mp.nickname }))
    ).then((res) => {
      if (!cancelled) setDraftOveralls(new Map(res.map((p) => [p.playerId, p.overall])))
    })
    return () => {
      cancelled = true
    }
  }, [draftPlayers])

  useEffect(() => {
    getKnownFields().then(setKnownFields)
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data: pd }) => setAllPlayers((pd ?? []) as Player[]))
  }, [])

  useEffect(() => {
    if (!data) return
    setScoreA(data.result ? String(data.result.score_a) : '')
    setScoreB(data.result ? String(data.result.score_b) : '')
    setMatchDate(data.match.match_date)
    setMatchTime(data.match.match_time ?? '')
    setField(data.match.field ?? '')
  }, [data])

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers, goals, assists, pagelle, result } = data
  // Squadre UFFICIALI (visibili a tutti): guidano marcatori, voti e pagelle.
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  // Squadre in BOZZA (area di lavoro admin).
  const dTeamA = draftPlayers.filter((p) => p.team === 'A')
  const dTeamB = draftPlayers.filter((p) => p.team === 'B')

  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)

  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  // Partita "chiusa": pagelle pubblicate. Non più modificabile da nessuno,
  // resta possibile solo eliminarla.
  const locked = isPublished
  // Squadre ufficializzate almeno una volta.
  const teamsOfficial = !!match.teams_official_at
  // Le squadre si possono ancora toccare finché non è stato salvato il risultato.
  const canEditTeams = !locked && !result

  // La bozza differisce dalle squadre ufficiali (serve una nuova ufficializzazione)?
  const officialMap = new Map(matchPlayers.map((mp) => [mp.player_id, mp.team]))
  const teamsDirty =
    draftPlayers.length > 0 &&
    (officialMap.size !== draftPlayers.length ||
      draftPlayers.some((dp) => officialMap.get(dp.player_id) !== dp.team))
  const needsOfficialization = canEditTeams && draftPlayers.length > 0 && (!teamsOfficial || teamsDirty)

  // Coerenza gol/risultato: i voti e le pagelle si sbloccano solo quando il
  // numero di gol per squadra coincide con il risultato inserito.
  const goalsCoherent =
    !!result && goalsByTeam('A').length === result.score_a && goalsByTeam('B').length === result.score_b
  // Statistiche (gol/assist) fissate dall'admin: sblocca il box votazioni.
  const statsConfirmed = !!match.stats_confirmed_at

  // [APPROVAZIONE SQUADRE — disattivata] Derivati del quorum di approvazione.
  // const adminIds = allPlayers.filter((p) => p.role === 'admin' || p.role === 'superadmin').map((p) => p.id)
  // const allApproved = adminIds.length > 0 && adminIds.every((aid) => approvals.includes(aid))
  // const iApproved = !!currentAdmin && approvals.includes(currentAdmin.id)
  const infoComplete = !!matchDate && !!matchTime && !!field

  // Le statistiche (gol/assist) confermate non sono più valide se cambia il
  // risultato o i marcatori: si azzera il flag e vanno risalvate (rilocka i voti).
  async function resetStatsConfirmation() {
    if (!id || !match.stats_confirmed_at) return
    await supabase.from('matches').update({ stats_confirmed_at: null }).eq('id', id)
  }

  // --- Info partita ---
  async function handleSaveResult() {
    if (!id || !infoComplete || locked) return
    setSavingResult(true)
    await supabase
      .from('match_results')
      .upsert({ match_id: id, score_a: Number(scoreA) || 0, score_b: Number(scoreB) || 0 }, { onConflict: 'match_id' })
    await supabase.from('matches').update({ status: 'completed' }).eq('id', id)
    // Cambiare il risultato invalida le statistiche eventualmente già confermate.
    await resetStatsConfirmation()
    setSavingResult(false)
    setEditingResult(false)
    logActivity('risultato_salvato', { matchId: id, data: match.match_date, scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0 })
    refetch()
  }

  // --- Salva statistiche (gol/assist): le fissa e sblocca le votazioni ---
  async function handleSaveStats() {
    if (!id || locked) return
    if (!goalsCoherent) {
      alert(
        'I gol registrati non coincidono con il risultato: correggi i marcatori o il risultato prima di salvare le statistiche.'
      )
      return
    }
    setSavingStats(true)
    await supabase.from('matches').update({ stats_confirmed_at: new Date().toISOString() }).eq('id', id)
    setSavingStats(false)
    logActivity('statistiche_salvate', { matchId: id, data: match.match_date })
    refetch()
  }

  async function handleSaveInfo() {
    // Una volta salvato il risultato la partita non cambia più data/ora/luogo.
    if (!id || locked || data?.result) return
    setInfoError(null)
    setSavingInfo(true)

    const season = await findSeasonForDate(matchDate)
    if (!season) {
      setSavingInfo(false)
      setInfoError(
        'Nessuna stagione copre questa data. Crea o estendi una stagione che includa questa data prima di salvare.'
      )
      return
    }
    if (season.status === 'conclusa') {
      setSavingInfo(false)
      setInfoError(
        'La stagione che copre questa data è già conclusa: non è possibile spostare partite al suo interno.'
      )
      return
    }
    const seasonId = season.id

    await supabase
      .from('matches')
      .update({ match_date: matchDate, match_time: matchTime || null, field: field || null, season_id: seasonId })
      .eq('id', id)
    setSavingInfo(false)
    setEditingInfo(false)
    logActivity('partita_modificata', { matchId: id, data: matchDate, ora: matchTime || null, campo: field || null })
    refetch()
  }

  async function handleAddGoal(team: Team) {
    if (!id || !newGoalPlayer[team] || locked) return
    await supabase
      .from('goals')
      .insert({
        match_id: id,
        player_id: newGoalPlayer[team],
        team,
        is_own_goal: ownGoal[team],
      })
    const playerName = matchPlayers.find((p) => p.player_id === newGoalPlayer[team])?.name
    logActivity('gol_aggiunto', { matchId: id, data: match.match_date, squadra: team, giocatore: playerName, autogol: ownGoal[team] })
    await resetStatsConfirmation()
    setNewGoalPlayer((prev) => ({ ...prev, [team]: '' }))
    setOwnGoal((prev) => ({ ...prev, [team]: false }))
    refetch()
  }

  async function handleRemoveGoal(goalId: string) {
    if (locked) return
    const goal = goals.find((g) => g.id === goalId)
    await supabase.from('goals').delete().eq('id', goalId)
    logActivity('gol_rimosso', { matchId: id, data: match.match_date, giocatore: goal?.name })
    await resetStatsConfirmation()
    refetch()
  }

  async function handleAddAssist(team: Team) {
    if (!id || !newAssistPlayer[team] || locked) return
    await supabase
      .from('assists')
      .insert({ match_id: id, player_id: newAssistPlayer[team], team })
    const playerName = matchPlayers.find((p) => p.player_id === newAssistPlayer[team])?.name
    logActivity('assist_aggiunto', { matchId: id, data: match.match_date, squadra: team, giocatore: playerName })
    await resetStatsConfirmation()
    setNewAssistPlayer((prev) => ({ ...prev, [team]: '' }))
    refetch()
  }

  async function handleRemoveAssist(assistId: string) {
    if (locked) return
    const assist = assists.find((a) => a.id === assistId)
    await supabase.from('assists').delete().eq('id', assistId)
    logActivity('assist_rimosso', { matchId: id, data: match.match_date, giocatore: assist?.name })
    await resetStatsConfirmation()
    refetch()
  }

  // Nel tabellino compatto si rimuove "un gol"/"un assist" del giocatore: si
  // cancella una delle righe corrispondenti (per un dato giocatore/squadra i gol
  // regolari e gli autogol non coesistono nella stessa colonna).
  async function handleRemoveOneGoal(playerId: string, team: Team) {
    const g = goals.find((x) => x.player_id === playerId && x.team === team)
    if (g) await handleRemoveGoal(g.id)
  }

  async function handleRemoveOneAssist(playerId: string, team: Team) {
    const a = assists.find((x) => x.player_id === playerId && x.team === team)
    if (a) await handleRemoveAssist(a.id)
  }

  async function handleDeleteMatch() {
    if (!id || !confirm('Eliminare definitivamente questa partita? Risultato, marcatori e pagelle verranno rimossi.'))
      return
    setDeleting(true)
    const { error: delErr } = await supabase.from('matches').delete().eq('id', id)
    setDeleting(false)
    if (delErr) {
      alert(delErr.message)
      return
    }
    await logActivity('partita_eliminata', { matchId: id, data: match.match_date })
    navigate('/admin/partite')
  }

  // --- Sondaggio ---
  async function handleAddBooking() {
    if (!id || !addBookingPlayer || bookings.length >= MAX_PLAYERS) return
    setAddingBooking(true)
    setAddBookingError(null)
    const { error: addError } = await supabase
      .from('match_bookings')
      .insert({ match_id: id, player_id: addBookingPlayer })
    if (addError) {
      setAddingBooking(false)
      setAddBookingError(
        addError.message.includes('Sondaggio al completo')
          ? 'Sondaggio al completo: il numero di giocatori per partita è fisso a 10.'
          : addError.message
      )
      refetchBookings()
      return
    }
    logActivity('prenotazione_aggiunta', {
      matchId: id,
      giocatore: allPlayers.find((p) => p.id === addBookingPlayer)?.name,
    })
    setAddBookingPlayer('')
    setAddingBooking(false)
    refetchBookings()
  }

  async function handleRemoveBooking(playerId: string, playerName: string) {
    if (!id) return
    await supabase.from('match_bookings').delete().eq('match_id', id).eq('player_id', playerId)
    logActivity('prenotazione_rimossa', { matchId: id, giocatore: playerName })
    refetchBookings()
  }

  async function handleCloseSurvey() {
    if (!id || !confirm('Chiudere il sondaggio? I giocatori non potranno più prenotarsi.')) return
    setClosingSurvey(true)
    await supabase.from('matches').update({ booking_open: false }).eq('id', id)
    logActivity('sondaggio_chiuso', { matchId: id, prenotazioni: bookings.length })
    setClosingSurvey(false)
    refetch()
  }

  // --- Generazione squadre (scrive nella BOZZA) ---
  async function handleGenerateTeams() {
    if (!id) return
    setGenerating(true)
    setGeneratedTeams(null)

    const players = await computeOverallsForPlayers(
      bookings.map((b) => ({ id: b.player_id, name: b.name, surname: b.surname, nickname: b.nickname }))
    )

    const gen = generateBalancedTeams(players)
    setGeneratedTeams(gen)
    setGenTeamA(gen.teamA)
    setGenTeamB(gen.teamB)
    setGenerating(false)

    logActivity('squadre_generate', { matchId: id, avgA: gen.avgA, avgB: gen.avgB, diff: gen.diff })
  }

  function swapGenPlayer(from: 'A' | 'B', playerId: string) {
    if (from === 'A') {
      const player = genTeamA.find((p) => p.playerId === playerId)
      if (!player) return
      setGenTeamA((prev) => prev.filter((p) => p.playerId !== playerId))
      setGenTeamB((prev) => [...prev, player])
    } else {
      const player = genTeamB.find((p) => p.playerId === playerId)
      if (!player) return
      setGenTeamB((prev) => prev.filter((p) => p.playerId !== playerId))
      setGenTeamA((prev) => [...prev, player])
    }
  }

  function avgOverall(arr: PlayerOverall[]) {
    return arr.length === 0 ? 0 : Math.round(arr.reduce((s, p) => s + p.overall, 0) / arr.length)
  }

  // Media overall di una squadra in bozza (null finché gli overall non sono caricati).
  function avgDraftOverall(arr: DraftPlayer[]) {
    const vals = arr
      .map((p) => draftOveralls.get(p.player_id))
      .filter((v): v is number => v !== undefined)
    return vals.length === 0 ? null : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
  }

  async function handleConfirmTeams() {
    if (!id) return
    setConfirming(true)
    await supabase.from('match_players_draft').delete().eq('match_id', id)
    const rows = [
      ...genTeamA.map((p) => ({ match_id: id, player_id: p.playerId, team: 'A' as Team })),
      ...genTeamB.map((p) => ({ match_id: id, player_id: p.playerId, team: 'B' as Team })),
    ]
    await supabase.from('match_players_draft').insert(rows)
    // [APPROVAZIONE SQUADRE — disattivata] await clearTeamApprovals()
    setConfirming(false)
    setGeneratedTeams(null)
    loadDraft()
  }

  // Le squadre ufficiali sono cambiate: le formazioni fantacalcetto schierate su
  // quelle squadre non sono più valide e vengono azzerate per tutte le leghe.
  async function resetFantaLineups() {
    if (!id) return
    const { data: existing } = await supabase
      .from('fanta_lineups')
      .select('league_id, member_id')
      .eq('match_id', id)
    const resetRows = ((existing ?? []) as { league_id: string; member_id: string }[]).map((l) => ({
      league_id: l.league_id,
      match_id: id,
      member_id: l.member_id,
    }))
    if (resetRows.length > 0) {
      await supabase
        .from('fanta_lineup_resets')
        .upsert(resetRows, { onConflict: 'league_id,match_id,member_id' })
    }
    await supabase.from('fanta_lineups').delete().eq('match_id', id)
  }

  // [APPROVAZIONE SQUADRE — regressa/disattivata, conservata per riuso futuro]
  // --- Approvazione squadre ---
  // async function handleApproveTeams() {
  //   if (!id || !currentAdmin) return
  //   setApproving(true)
  //   const { error: apError } = await supabase
  //     .from('team_approvals')
  //     .insert({ match_id: id, admin_id: currentAdmin.id })
  //   setApproving(false)
  //   if (!apError || apError.code === '23505') {
  //     if (!apError) logActivity('squadre_approvate', { matchId: id, data: match.match_date })
  //     setApprovalsVersion((v) => v + 1)
  //   }
  // }
  //
  // // Le squadre in bozza sono cambiate: la versione approvata non esiste più.
  // async function clearTeamApprovals() {
  //   if (!id) return
  //   await supabase.from('team_approvals').delete().eq('match_id', id)
  //   setApprovalsVersion((v) => v + 1)
  // }

  // --- Ufficializzazione: copia la BOZZA in match_players (visibile a tutti) ---
  async function handleOfficializeTeams() {
    if (
      !id ||
      // [APPROVAZIONE SQUADRE — disattivata] !allApproved ||
      !confirm(
        teamsOfficial
          ? 'Ufficializzare la nuova versione delle squadre? Diventerà quella visibile a tutti al posto della precedente, e le formazioni del fantacalcetto verranno azzerate perché le squadre sono cambiate.'
          : 'Ufficializzare le squadre? Diventeranno visibili a tutti i giocatori e si aprirà lo schieramento delle formazioni del fantacalcetto.'
      )
    )
      return
    setOfficializing(true)
    // Copia bozza -> squadre ufficiali.
    await supabase.from('match_players').delete().eq('match_id', id)
    const rows = draftPlayers.map((p) => ({ match_id: id, player_id: p.player_id, team: p.team }))
    if (rows.length > 0) await supabase.from('match_players').insert(rows)
    await supabase
      .from('matches')
      .update({ teams_official_at: new Date().toISOString() })
      .eq('id', id)
    // Le squadre (ri)ufficializzate invalidano le formazioni fantacalcetto già schierate.
    await resetFantaLineups()
    logActivity('squadre_ufficializzate', { matchId: id, data: match.match_date })
    setOfficializing(false)
    refetch()
  }

  // --- Modifica manuale squadre in bozza ---
  function startEditingTeams() {
    setLocalTeamA(dTeamA)
    setLocalTeamB(dTeamB)
    setEditingTeams(true)
  }

  function cancelEditingTeams() {
    setEditingTeams(false)
  }

  function swapDraftPlayer(from: 'A' | 'B', playerId: string) {
    if (from === 'A') {
      const player = localTeamA.find((p) => p.player_id === playerId)
      if (!player) return
      setLocalTeamA((prev) => prev.filter((p) => p.player_id !== playerId))
      setLocalTeamB((prev) => [...prev, player])
    } else {
      const player = localTeamB.find((p) => p.player_id === playerId)
      if (!player) return
      setLocalTeamB((prev) => prev.filter((p) => p.player_id !== playerId))
      setLocalTeamA((prev) => [...prev, player])
    }
  }

  async function handleSaveTeams() {
    if (!id || localTeamA.length !== 5 || localTeamB.length !== 5) return
    setSavingTeams(true)
    const changed = [
      ...localTeamA.filter((p) => p.team !== 'A').map((p) => ({ ...p, team: 'A' as Team })),
      ...localTeamB.filter((p) => p.team !== 'B').map((p) => ({ ...p, team: 'B' as Team })),
    ]
    await Promise.all(
      changed.map((p) => supabase.from('match_players_draft').update({ team: p.team }).eq('id', p.id))
    )
    // [APPROVAZIONE SQUADRE — disattivata] await clearTeamApprovals()
    setSavingTeams(false)
    setEditingTeams(false)
    logActivity('squadre_modificate', { matchId: id, data: match.match_date })
    loadDraft()
  }

  // --- Ricalcolo squadre (anteprima; salvataggio esplicito) ---
  async function handleRecalculateTeams() {
    if (!id || draftPlayers.length === 0) return
    setRecalculating(true)
    const overalls = await computeOverallsForPlayers(
      draftPlayers.map((mp) => ({ id: mp.player_id, name: mp.name, surname: mp.surname, nickname: mp.nickname }))
    )
    const gen = generateBalancedTeams(overalls)
    setPendingTeams({
      teamA: gen.teamA,
      teamB: gen.teamB,
      action: 'squadre_ricalcolate',
      logDetails: { avgA: gen.avgA, avgB: gen.avgB, diff: gen.diff },
      description: 'Squadre ricalcolate con gli overall e le fasce attuali.',
    })
    setRecalculating(false)
  }

  async function handleSavePendingTeams() {
    if (!id || !pendingTeams) return
    setSavingPendingTeams(true)
    await supabase.from('match_players_draft').delete().eq('match_id', id)
    const rows = [
      ...pendingTeams.teamA.map((p) => ({ match_id: id, player_id: p.playerId, team: 'A' as Team })),
      ...pendingTeams.teamB.map((p) => ({ match_id: id, player_id: p.playerId, team: 'B' as Team })),
    ]
    await supabase.from('match_players_draft').insert(rows)
    // [APPROVAZIONE SQUADRE — disattivata] await clearTeamApprovals()
    logActivity(pendingTeams.action, { matchId: id, data: match.match_date, ...pendingTeams.logDetails })
    setSavingPendingTeams(false)
    setPendingTeams(null)
    loadDraft()
  }

  // --- Sostituzione giocatore in bozza ---
  function startSubstitute() {
    setSubOutId('')
    setSubInId('')
    setSubstitutingOpen(true)
  }

  function cancelSubstitute() {
    setSubstitutingOpen(false)
    setAddingGuestSub(false)
  }

  function handleGuestSubCreated(guest: Player) {
    setAllPlayers((prev) => [...prev, guest])
    setSubInId(guest.id)
    setAddingGuestSub(false)
  }

  async function handleConfirmSubstitute() {
    if (!id || !subOutId || !subInId) return
    setSubstituting(true)
    const inPlayer = allPlayers.find((p) => p.id === subInId)
    const outPlayer = draftPlayers.find((mp) => mp.player_id === subOutId)
    const roster = [
      ...draftPlayers
        .filter((mp) => mp.player_id !== subOutId)
        .map((mp) => ({ id: mp.player_id, name: mp.name, surname: mp.surname, nickname: mp.nickname })),
      { id: subInId, name: inPlayer?.name ?? '', surname: inPlayer?.surname ?? null, nickname: inPlayer?.nickname ?? null },
    ]
    const overalls = await computeOverallsForPlayers(roster)
    const gen = generateBalancedTeams(overalls)
    setPendingTeams({
      teamA: gen.teamA,
      teamB: gen.teamB,
      action: 'giocatore_sostituito',
      logDetails: { uscito: outPlayer ? fullName(outPlayer) : undefined, entrato: inPlayer ? fullName(inPlayer) : undefined },
      description: `Sostituzione: ${outPlayer ? fullName(outPlayer) : '?'} esce, ${inPlayer ? fullName(inPlayer) : '?'} entra. Squadre rigenerate in base agli overall.`,
    })
    setSubstituting(false)
    setSubstitutingOpen(false)
  }

  const bookedNotInDraft = bookings.filter((b) => !draftPlayers.some((dp) => dp.player_id === b.player_id))
  const alreadyBookedIds = new Set(bookings.map((b) => b.player_id))
  const availableToAdd = allPlayers.filter((p) => !alreadyBookedIds.has(p.id))
  const inDraftIds = new Set(draftPlayers.map((dp) => dp.player_id))
  const playersNotInDraft = allPlayers.filter((p) => !inDraftIds.has(p.id))

  const canGenerate = bookings.length === MAX_PLAYERS && draftPlayers.length === 0

  return (
    <div className="p-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">
          {new Date(match.match_date).toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </h1>
        <div className="flex gap-2">
          {match.booking_open && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Sondaggio aperto</span>
          )}
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
            <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">Pubblicata</span>
          )}
        </div>
      </div>

      {locked && (
        <p className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-sm font-medium text-gray-600">
          🔒 Partita completata e pagelle pubblicate: non è più modificabile. È possibile solo eliminarla.
        </p>
      )}

      {/* ===== STEP 1 — Info partita =====
          Il box è in sola lettura di default. Si entra in modifica con il tasto
          dedicato; una volta salvato il risultato (o pubblicate le pagelle) i
          dati diventano definitivi e il tasto Modifica sparisce. */}
      {(() => {
        // "bloccato" = non più modificabile in alcun modo: partita chiusa
        // oppure risultato già censito.
        const infoLocked = locked || !!result
        const inputsDisabled = infoLocked || !editingInfo
        return (
          <div className="mt-2 space-y-2 rounded-xl bg-white p-3 shadow">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-field-green-dark">Data / ora / luogo</h2>
              {!infoLocked && !editingInfo && (
                <button
                  onClick={() => {
                    setInfoError(null)
                    setEditingInfo(true)
                  }}
                  className="rounded-lg border border-field-green px-3 py-1 text-xs font-medium text-field-green-dark hover:bg-field-green/10"
                >
                  ✏️ Modifica data/ora/luogo
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-gray-700">Data</label>
                <input
                  type="date"
                  value={matchDate}
                  disabled={inputsDisabled}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-gray-700">Ora</label>
                <input
                  type="time"
                  value={matchTime}
                  disabled={inputsDisabled}
                  onChange={(e) => setMatchTime(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Campo</label>
              <input
                value={field}
                disabled={inputsDisabled}
                onChange={(e) => setField(e.target.value)}
                list="campi-noti"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
              />
              <datalist id="campi-noti">
                {knownFields.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            {result && !locked && (
              <p className="text-xs text-gray-400">
                🔒 Risultato censito: data, ora e luogo non sono più modificabili.
              </p>
            )}
            {infoError && <p className="text-sm text-red-600">{infoError}</p>}
            {editingInfo && !infoLocked && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Annulla: ripristina i valori attuali della partita.
                    setInfoError(null)
                    setMatchDate(match.match_date)
                    setMatchTime(match.match_time ?? '')
                    setField(match.field ?? '')
                    setEditingInfo(false)
                  }}
                  disabled={savingInfo}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveInfo}
                  disabled={savingInfo || !matchDate}
                  className="flex-1 rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
                >
                  {savingInfo ? 'Salvataggio...' : 'Salva data/ora/campo'}
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ===== SONDAGGIO ===== */}
      {!locked &&
        (match.booking_open || (bookedNotInDraft.length > 0 && draftPlayers.length === 0)) &&
        !bookingsLoading && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-blue-800">Sondaggio prenotazioni</h2>
              <span className="text-sm font-bold text-blue-700">
                {bookings.length}/{MAX_PLAYERS}
              </span>
            </div>

            <div className="mt-3 space-y-1">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5">
                  <PlayerName name={b.name} surname={b.surname} nickname={b.nickname} nameClassName="text-sm font-medium" />
                  <button
                    onClick={() => handleRemoveBooking(b.player_id, b.name)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
              {bookings.length === 0 && <p className="text-sm text-blue-600">Nessuna prenotazione ancora.</p>}
            </div>

            {match.booking_open && bookings.length < MAX_PLAYERS && (
              <div className="mt-3 flex gap-2">
                <select
                  value={addBookingPlayer}
                  onChange={(e) => setAddBookingPlayer(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">+ Aggiungi giocatore</option>
                  {availableToAdd.map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)}{p.nickname ? ` (${p.nickname})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddBooking}
                  disabled={!addBookingPlayer || addingBooking}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Aggiungi
                </button>
              </div>
            )}

            {addBookingError && <p className="mt-2 text-sm text-red-600">{addBookingError}</p>}

            {match.booking_open && (
              <button
                onClick={handleCloseSurvey}
                disabled={closingSurvey}
                className="mt-3 w-full rounded-lg border border-blue-400 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {closingSurvey ? 'Chiusura...' : 'Chiudi sondaggio'}
              </button>
            )}
          </div>
        )}

      {/* ===== GENERAZIONE SQUADRE (prima assegnazione, in bozza) ===== */}
      {!match.booking_open && draftPlayers.length === 0 && bookings.length > 0 && canEditTeams && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <h2 className="font-semibold text-field-green-dark">Genera squadre bilanciate</h2>
          <p className="mt-1 text-sm text-gray-600">
            {bookings.length} giocatori prenotati.
            {bookings.length < MAX_PLAYERS && (
              <span className="text-field-orange">
                {' '}Servono {MAX_PLAYERS - bookings.length} prenotazioni in più per generare le squadre.
              </span>
            )}
            {bookings.length > MAX_PLAYERS && (
              <span className="text-red-600">
                {' '}Ci sono {bookings.length - MAX_PLAYERS} prenotazioni di troppo: il numero di giocatori è fisso a{' '}
                {MAX_PLAYERS}, rimuovile per generare le squadre.
              </span>
            )}
          </p>

          {!generatedTeams ? (
            <button
              onClick={handleGenerateTeams}
              disabled={!canGenerate || generating}
              className="mt-3 w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {generating ? 'Generazione in corso...' : 'Genera squadre bilanciate'}
            </button>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl bg-white p-3 shadow">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-field-green-dark">Squadra A</h3>
                    <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-xs font-bold text-field-green-dark">
                      Overall {avgOverall(genTeamA)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {genTeamA.map((p) => (
                      <li key={p.playerId} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                        <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded bg-field-green/10 px-1.5 text-xs font-bold text-field-green-dark">
                            {p.overall}
                          </span>
                          <button
                            onClick={() => swapGenPlayer('A', p.playerId)}
                            className="text-xs text-gray-400 hover:text-field-orange"
                            title="Sposta in B"
                          >
                            →B
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="min-w-0 rounded-xl bg-white p-3 shadow">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-field-green-dark">Squadra B</h3>
                    <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs font-bold text-field-orange">
                      Overall {avgOverall(genTeamB)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {genTeamB.map((p) => (
                      <li key={p.playerId} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                        <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => swapGenPlayer('B', p.playerId)}
                            className="text-xs text-gray-400 hover:text-field-green"
                            title="Sposta in A"
                          >
                            A←
                          </button>
                          <span className="rounded bg-field-orange/10 px-1.5 text-xs font-bold text-field-orange">
                            {p.overall}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-2 text-center text-xs text-gray-500">
                Differenza overall: {Math.abs(avgOverall(genTeamA) - avgOverall(genTeamB))} punto/i
                {genTeamA.length !== 5 || genTeamB.length !== 5 ? (
                  <span className="ml-1 text-red-500">(le squadre devono avere 5 giocatori ciascuna)</span>
                ) : null}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setGeneratedTeams(null)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Rigenera
                </button>
                <button
                  onClick={handleConfirmTeams}
                  disabled={confirming || genTeamA.length !== 5 || genTeamB.length !== 5}
                  className="flex-1 rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
                >
                  {confirming ? 'Salvataggio...' : 'Conferma squadre'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== NUOVE SQUADRE IN ATTESA DI SALVATAGGIO (ricalcolo/sostituzione) ===== */}
      {draftPlayers.length > 0 && pendingTeams && canEditTeams && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <h2 className="font-semibold text-field-green-dark">Nuove squadre da salvare</h2>
          <p className="mt-1 text-xs text-gray-600">{pendingTeams.description}</p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-field-green-dark">Squadra A</h3>
                <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-xs font-bold text-field-green-dark">
                  Overall {avgOverall(pendingTeams.teamA)}
                </span>
              </div>
              <ul className="space-y-1">
                {pendingTeams.teamA.map((p) => (
                  <li key={p.playerId} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    <span className="shrink-0 rounded bg-field-green/10 px-1.5 text-xs font-bold text-field-green-dark">
                      {p.overall}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-field-orange">Squadra B</h3>
                <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs font-bold text-field-orange">
                  Overall {avgOverall(pendingTeams.teamB)}
                </span>
              </div>
              <ul className="space-y-1">
                {pendingTeams.teamB.map((p) => (
                  <li key={p.playerId} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    <span className="shrink-0 rounded bg-field-orange/10 px-1.5 text-xs font-bold text-field-orange">
                      {p.overall}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-2 text-center text-xs text-gray-500">
            Differenza overall: {Math.abs(avgOverall(pendingTeams.teamA) - avgOverall(pendingTeams.teamB))} punto/i — le
            squadre in bozza attuali restano valide finché non salvi.
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setPendingTeams(null)}
              disabled={savingPendingTeams}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={handleSavePendingTeams}
              disabled={savingPendingTeams}
              className="flex-1 rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {savingPendingTeams ? 'Salvataggio...' : '💾 Salva squadre'}
            </button>
          </div>
        </div>
      )}

      {/* ===== SQUADRE IN BOZZA (già assegnate) ===== */}
      {draftPlayers.length > 0 && !editingTeams && !substitutingOpen && !pendingTeams && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
              <ul className="space-y-1 text-sm">
                {dTeamA.map((p) => (
                  <li key={p.id} className="flex min-w-0 items-center justify-between gap-1">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    {draftOveralls.has(p.player_id) && (
                      <span className="shrink-0 rounded bg-field-green/10 px-1.5 text-xs font-bold text-field-green-dark">
                        {draftOveralls.get(p.player_id)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {avgDraftOverall(dTeamA) !== null && (
                <p className="mt-2 border-t border-gray-100 pt-2 text-center text-xs font-semibold text-field-green-dark">
                  Overall medio: {avgDraftOverall(dTeamA)}
                </p>
              )}
            </div>
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
              <ul className="space-y-1 text-sm">
                {dTeamB.map((p) => (
                  <li key={p.id} className="flex min-w-0 items-center justify-between gap-1">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    {draftOveralls.has(p.player_id) && (
                      <span className="shrink-0 rounded bg-field-orange/10 px-1.5 text-xs font-bold text-field-orange">
                        {draftOveralls.get(p.player_id)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {avgDraftOverall(dTeamB) !== null && (
                <p className="mt-2 border-t border-gray-100 pt-2 text-center text-xs font-semibold text-field-orange">
                  Overall medio: {avgDraftOverall(dTeamB)}
                </p>
              )}
            </div>
          </div>

          {teamsOfficial && !teamsDirty && (
            <p className="mt-2 rounded-lg bg-field-green/10 px-3 py-2 text-center text-xs font-medium text-field-green-dark">
              ✅ Squadre ufficializzate: sono visibili a tutti e lo schieramento del fantacalcetto è aperto.
            </p>
          )}

          {teamsOfficial && teamsDirty && (
            <p className="mt-2 rounded-lg bg-field-yellow/20 px-3 py-2 text-center text-xs font-medium text-field-orange">
              ✏️ Hai modifiche non ancora ufficializzate: i player continuano a vedere la versione precedente finché non
              ufficializzi di nuovo.
            </p>
          )}

          {needsOfficialization && (
            <div className="mt-2 rounded-xl border border-field-green/30 bg-field-green/5 p-3">
              <p className="text-xs text-gray-500">
                {teamsOfficial
                  ? 'Hai cambiato le squadre dopo l’ufficializzazione: i player vedono ancora la versione precedente. Ufficializza di nuovo per rendere visibili le modifiche.'
                  : 'I player non vedono le squadre finché non vengono ufficializzate.'}
              </p>
              <button
                onClick={handleOfficializeTeams}
                disabled={officializing}
                className="mt-2 w-full rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
              >
                {officializing ? 'Ufficializzazione...' : teamsOfficial ? '✅ Ri-ufficializza squadre' : '✅ Ufficializza squadre'}
              </button>

              {/* [APPROVAZIONE SQUADRE — regressa/disattivata, conservata per riuso futuro]
                  Vecchio box con quorum di approvazione admin prima dell'ufficializzazione:
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-field-green-dark">👍 Approvazione squadre</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-field-green-dark shadow-sm">
                  {approvals.length}/{adminIds.length} admin
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {teamsOfficial
                  ? 'Hai cambiato le squadre dopo l’ufficializzazione: i player vedono ancora la versione precedente. Quando tutti gli admin approvano questa nuova versione potrai ri-ufficializzarla.'
                  : 'I player non vedono le squadre finché non vengono ufficializzate. Quando tutti gli admin approvano questa versione si può ufficializzare; ogni modifica, ricalcolo o sostituzione azzera le approvazioni.'}
              </p>
              {iApproved ? (
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-center text-xs font-medium text-field-green-dark shadow-sm">
                  ✓ Hai approvato questa versione delle squadre.
                </p>
              ) : (
                <button
                  onClick={handleApproveTeams}
                  disabled={approving}
                  className="mt-2 w-full rounded-lg border border-field-green bg-white px-3 py-2 text-sm font-medium text-field-green-dark hover:bg-field-green/10 disabled:opacity-50"
                >
                  {approving ? 'Approvazione...' : '👍 Approva squadre'}
                </button>
              )}
              (bottone ufficializza con: disabled={officializing || !allApproved})
              {!allApproved && (
                <p className="mt-1 text-center text-[11px] text-gray-400">
                  L'ufficializzazione si sblocca quando tutti gli admin hanno approvato.
                </p>
              )}
              */}
            </div>
          )}

          {canEditTeams && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={startEditingTeams}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                ✏️ Modifica squadre
              </button>
              <button
                onClick={handleRecalculateTeams}
                disabled={recalculating}
                className="flex-1 rounded-lg border border-field-green/50 px-3 py-1.5 text-sm text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
                title="Rigenera le squadre con gli overall e le fasce attuali"
              >
                {recalculating ? 'Ricalcolo...' : '♻️ Ricalcola squadre'}
              </button>
              <button
                onClick={startSubstitute}
                disabled={playersNotInDraft.length === 0}
                className="flex-1 rounded-lg border border-field-orange/50 px-3 py-1.5 text-sm text-field-orange hover:bg-field-orange/5 disabled:opacity-50"
                title={playersNotInDraft.length === 0 ? 'Nessun giocatore disponibile per la sostituzione' : undefined}
              >
                🔄 Sostituisci giocatore
              </button>
            </div>
          )}

          {matchPlayers.length > 0 && (
            <Link
              to={`/partite/${id}/campetto`}
              className="mt-3 block w-full rounded-lg border border-field-green/40 bg-field-green/5 px-3 py-1.5 text-center text-sm font-medium text-field-green-dark hover:bg-field-green/10"
            >
              ⚽ Visualizzazione campetto
            </Link>
          )}
        </div>
      )}

      {/* ===== SOSTITUZIONE GIOCATORE ===== */}
      {draftPlayers.length > 0 && substitutingOpen && (
        <div className="mt-4 rounded-xl border border-field-orange/30 bg-field-orange/5 p-4">
          <h2 className="font-semibold text-field-orange">Sostituisci giocatore</h2>
          <p className="mt-1 text-xs text-gray-600">
            Sostituisci un giocatore in campo con uno non selezionato per questa partita. Le squadre verranno rigenerate
            automaticamente in base all'overall di tutti i giocatori, incluso il nuovo entrato.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Giocatore da sostituire</label>
              <select
                value={subOutId}
                onChange={(e) => setSubOutId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleziona...</option>
                {draftPlayers.map((mp) => (
                  <option key={mp.player_id} value={mp.player_id}>
                    {fullName(mp)}{mp.nickname ? ` (${mp.nickname})` : ''} - Squadra {mp.team}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Nuovo giocatore</label>
              <select
                value={subInId}
                onChange={(e) => setSubInId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleziona...</option>
                {playersNotInDraft.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}{p.nickname ? ` (${p.nickname})` : ''}
                  </option>
                ))}
              </select>
              {!addingGuestSub ? (
                <button
                  type="button"
                  onClick={() => setAddingGuestSub(true)}
                  className="mt-1 text-xs font-medium text-field-orange hover:underline"
                >
                  + Aggiungi ospite
                </button>
              ) : (
                <GuestPlayerForm matchId={id ?? null} onCreated={handleGuestSubCreated} onCancel={() => setAddingGuestSub(false)} />
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={cancelSubstitute}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirmSubstitute}
              disabled={substituting || !subOutId || !subInId}
              className="flex-1 rounded-lg bg-field-orange px-3 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-50"
            >
              {substituting ? 'Sostituzione...' : 'Conferma sostituzione'}
            </button>
          </div>
        </div>
      )}

      {/* ===== SQUADRE (modifica manuale) ===== */}
      {draftPlayers.length > 0 && editingTeams && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <h2 className="font-semibold text-field-green-dark">Modifica squadre</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
              <ul className="space-y-1">
                {localTeamA.map((p) => (
                  <li key={p.player_id} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                    <button
                      onClick={() => swapDraftPlayer('A', p.player_id)}
                      className="shrink-0 text-xs text-gray-400 hover:text-field-orange"
                      title="Sposta in B"
                    >
                      →B
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
              <ul className="space-y-1">
                {localTeamB.map((p) => (
                  <li key={p.player_id} className="flex min-w-0 items-center justify-between gap-1 text-sm">
                    <button
                      onClick={() => swapDraftPlayer('B', p.player_id)}
                      className="shrink-0 text-xs text-gray-400 hover:text-field-green"
                      title="Sposta in A"
                    >
                      A←
                    </button>
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            {localTeamA.length !== 5 || localTeamB.length !== 5 ? (
              <span className="text-red-500">Le squadre devono avere 5 giocatori ciascuna.</span>
            ) : (
              '5 giocatori per squadra'
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={cancelEditingTeams}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              onClick={handleSaveTeams}
              disabled={savingTeams || localTeamA.length !== 5 || localTeamB.length !== 5}
              className="flex-1 rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {savingTeams ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
        </div>
      )}

      {/* ===== STEP 2 — RISULTATO (solo dopo ufficializzazione squadre) =====
          Dopo il salvataggio il box va in sola lettura: si rientra in modifica
          col tasto "✏️ Modifica risultato". */}
      {teamsOfficial ? (
        (() => {
          const resultReadOnly = locked || (!!result && !editingResult)
          return (
            <div className="mt-4 rounded-xl bg-white p-4 shadow">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Risultato</h2>
                {result && !locked && !editingResult && (
                  <button
                    onClick={() => setEditingResult(true)}
                    className="rounded-lg border border-field-green px-3 py-1 text-xs font-medium text-field-green-dark hover:bg-field-green/10"
                  >
                    ✏️ Modifica risultato
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={0}
                  value={scoreA}
                  disabled={resultReadOnly}
                  onChange={(e) => setScoreA(e.target.value)}
                  className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center disabled:bg-gray-100 disabled:text-gray-500"
                />
                <span className="font-semibold">-</span>
                <input
                  type="number"
                  min={0}
                  value={scoreB}
                  disabled={resultReadOnly}
                  onChange={(e) => setScoreB(e.target.value)}
                  className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center disabled:bg-gray-100 disabled:text-gray-500"
                />
                {!locked && (!result || editingResult) && (
                  <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                    {editingResult && (
                      <button
                        onClick={() => {
                          setScoreA(result ? String(result.score_a) : '')
                          setScoreB(result ? String(result.score_b) : '')
                          setEditingResult(false)
                        }}
                        disabled={savingResult}
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 sm:flex-none"
                      >
                        Annulla
                      </button>
                    )}
                    <button
                      onClick={handleSaveResult}
                      disabled={savingResult || !infoComplete}
                      title={!infoComplete ? 'Completa data, ora e campo prima di salvare il risultato' : undefined}
                      className="flex-1 rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    >
                      {savingResult ? 'Salvataggio...' : 'Salva risultato'}
                    </button>
                  </div>
                )}
              </div>
              {result && editingResult && (
                <p className="mt-2 text-xs text-field-orange">
                  ⚠️ Modificare il risultato azzera la conferma delle statistiche: dovrai risalvarle.
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Gol registrati: {goalsByTeam('A').length} - {goalsByTeam('B').length}
                {result && !goalsCoherent ? ' (non coincide con il risultato inserito)' : ''}
              </p>
              {!infoComplete && !locked && (
                <p className="mt-1 text-xs text-red-500">
                  ⚠️ Completa data, ora e campo prima di poter salvare il risultato.
                </p>
              )}
            </div>
          )
        })()
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
          📋 Il risultato si potrà inserire dopo aver ufficializzato le squadre.
        </p>
      )}

      {/* ===== STEP 3 — MARCATORI E ASSIST (solo dopo aver salvato il risultato) =====
          Tabellino compatto: gol e assist raggruppati per giocatore con i simboli
          affianco al nome (Nome ⚽⚽🅰️, autogol marcati "(ag)"). */}
      {result && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(['A', 'B'] as Team[]).map((team) => {
            const entries = aggregateScorers(goals, assists, team)
            return (
              <div key={team} className="min-w-0 rounded-xl bg-white p-3 shadow">
                <h3 className="mb-2 font-medium text-field-green-dark">Marcatori e assist Squadra {team}</h3>
                {entries.length === 0 ? (
                  <p className="text-sm text-gray-400">Nessun gol o assist.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {entries.map((e) => (
                      <li key={e.player_id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-1.5">
                          <PlayerName name={e.name} surname={e.surname} nickname={e.nickname} />
                          <ScorerBadges entry={e} />
                        </span>
                        {!locked && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            {e.goals + e.ownGoals > 0 && (
                              <button
                                onClick={() => handleRemoveOneGoal(e.player_id, team)}
                                title="Rimuovi un gol"
                                className="rounded border border-red-200 px-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                −⚽
                              </button>
                            )}
                            {e.assists > 0 && (
                              <button
                                onClick={() => handleRemoveOneAssist(e.player_id, team)}
                                title="Rimuovi un assist"
                                className="rounded border border-red-200 px-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                −🅰️
                              </button>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!locked && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-500">Aggiungi gol</p>
                    <select
                      value={newGoalPlayer[team]}
                      onChange={(e) => setNewGoalPlayer((prev) => ({ ...prev, [team]: e.target.value }))}
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Giocatore...</option>
                      {(ownGoal[team] ? (team === 'A' ? teamB : teamA) : team === 'A' ? teamA : teamB).map((p) => (
                        <option key={p.player_id} value={p.player_id}>
                          {fullName(p)}{p.nickname ? ` (${p.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-red-600">
                      <input
                        type="checkbox"
                        checked={ownGoal[team]}
                        onChange={(e) => {
                          setOwnGoal((prev) => ({ ...prev, [team]: e.target.checked }))
                          setNewGoalPlayer((prev) => ({ ...prev, [team]: '' }))
                        }}
                      />
                      Autogol (giocatore della squadra avversaria)
                    </label>
                    <button
                      onClick={() => handleAddGoal(team)}
                      disabled={!newGoalPlayer[team]}
                      className="w-full rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      + Aggiungi gol
                    </button>

                    <p className="mt-2 text-xs font-medium text-gray-500">Aggiungi assist</p>
                    <select
                      value={newAssistPlayer[team]}
                      onChange={(e) => setNewAssistPlayer((prev) => ({ ...prev, [team]: e.target.value }))}
                      className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Giocatore...</option>
                      {(team === 'A' ? teamA : teamB).map((p) => (
                        <option key={p.player_id} value={p.player_id}>
                          {fullName(p)}{p.nickname ? ` (${p.nickname})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAddAssist(team)}
                      disabled={!newAssistPlayer[team]}
                      className="w-full rounded-lg border border-field-green px-3 py-1.5 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
                    >
                      + Aggiungi assist
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ===== SALVA STATISTICHE: fissa gol/assist e sblocca le votazioni ===== */}
      {result && (
        <div className="mt-4">
          {!goalsCoherent ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              ⚠️ I gol registrati ({goalsByTeam('A').length}-{goalsByTeam('B').length}) non coincidono con il risultato (
              {result.score_a}-{result.score_b}). Correggi i marcatori o il risultato: potrai salvare le statistiche e
              sbloccare le votazioni solo quando coincidono.
            </p>
          ) : !statsConfirmed ? (
            <div className="rounded-xl border border-field-green/30 bg-field-green/5 p-4">
              <p className="text-sm text-gray-600">
                Gol e assist coincidono con il risultato. Salva le statistiche per fissarle e sbloccare le votazioni.
              </p>
              {!locked && (
                <button
                  onClick={handleSaveStats}
                  disabled={savingStats}
                  className="mt-3 w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
                >
                  {savingStats ? 'Salvataggio...' : '💾 Salva statistiche'}
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-field-green/10 px-3 py-2 text-center text-sm font-medium text-field-green-dark">
              ✓ Statistiche salvate.{!locked && ' Modificare gol o assist richiederà di risalvarle.'}
            </p>
          )}
        </div>
      )}

      {/* ===== VOTAZIONI E PAGELLE (pagina dedicata) ===== */}
      {result && goalsCoherent && statsConfirmed && (
        <Link
          to={`/partite/${id}/votazioni`}
          className="mt-4 block w-full rounded-lg border border-purple-300 bg-purple-50 px-3 py-2.5 text-center text-sm font-medium text-purple-700 hover:bg-purple-100"
        >
          🗳️ Gestisci votazioni e pagelle →
        </Link>
      )}

      <button
        onClick={handleDeleteMatch}
        disabled={deleting}
        className="mt-6 w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {deleting ? 'Eliminazione...' : 'Elimina partita'}
      </button>
    </div>
  )
}
