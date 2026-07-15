import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
// [APPROVAZIONE SQUADRE — regressa/disattivata, codice conservato per riuso futuro]
// import { useAuth } from '../../contexts/AuthContext'
import { useMatchDetail } from '../../hooks/useMatchDetail'
import { useMatchBookings } from '../../hooks/useMatchBookings'
import { useMatchVoting } from '../../hooks/useMatchVoting'
import { getKnownFields } from '../../lib/fields'
import { findSeasonForDate } from '../../lib/seasons'
import { logActivity } from '../../lib/activityLog'
import { computeOverallsForPlayers, generateBalancedTeams } from '../../lib/teamGeneration'
import { formatVote, formatExact } from '../../lib/voting'
import PlayerName, { fullName } from '../../components/PlayerName'
import type { Player, Team } from '../../types/database'
import type { PlayerOverall, GeneratedTeams } from '../../lib/teamGeneration'

const MAX_PLAYERS = 10

interface PagellaDraft {
  voto: string
  titolo: string
  descrizione: string
  is_mvp: boolean
}

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

  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [field, setField] = useState('')
  const [knownFields, setKnownFields] = useState<string[]>([])
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)

  const [newGoalPlayer, setNewGoalPlayer] = useState<Record<Team, string>>({ A: '', B: '' })
  const [ownGoal, setOwnGoal] = useState<Record<Team, boolean>>({ A: false, B: false })
  // Assist censiti in modo indipendente dai gol.
  const [newAssistPlayer, setNewAssistPlayer] = useState<Record<Team, string>>({ A: '', B: '' })

  const [drafts, setDrafts] = useState<Record<string, PagellaDraft>>({})
  const [savingPagelle, setSavingPagelle] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [openingVoting, setOpeningVoting] = useState(false)
  const [closingVoting, setClosingVoting] = useState(false)

  const {
    votes,
    voterInfo,
    averages,
    provisionalMvpId,
    voterIds,
    adminVoterIds,
    allAdminVotersVoted,
    participants,
    refetch: refetchVoting,
  } = useMatchVoting(id)
  const [showVoteDetail, setShowVoteDetail] = useState(false)

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

    const initial: Record<string, PagellaDraft> = {}
    for (const mp of data.matchPlayers) {
      const existing = data.pagelle.find((p) => p.player_id === mp.player_id)
      initial[mp.player_id] = {
        voto: existing?.voto ?? '',
        titolo: existing?.titolo ?? '',
        descrizione: existing?.descrizione ?? '',
        is_mvp: existing?.is_mvp ?? false,
      }
    }
    setDrafts(initial)
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
  const assistsByTeam = (team: Team) => assists.filter((a) => a.team === team)

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

  // [APPROVAZIONE SQUADRE — disattivata] Derivati del quorum di approvazione.
  // const adminIds = allPlayers.filter((p) => p.role === 'admin' || p.role === 'superadmin').map((p) => p.id)
  // const allApproved = adminIds.length > 0 && adminIds.every((aid) => approvals.includes(aid))
  // const iApproved = !!currentAdmin && approvals.includes(currentAdmin.id)
  const infoComplete = !!matchDate && !!matchTime && !!field

  // --- Info partita ---
  async function handleSaveResult() {
    if (!id || !infoComplete || locked) return
    setSavingResult(true)
    await supabase
      .from('match_results')
      .upsert({ match_id: id, score_a: Number(scoreA) || 0, score_b: Number(scoreB) || 0 }, { onConflict: 'match_id' })
    await supabase.from('matches').update({ status: 'completed' }).eq('id', id)
    setSavingResult(false)
    logActivity('risultato_salvato', { matchId: id, data: match.match_date, scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0 })
    refetch()
  }

  async function handleSaveInfo() {
    if (!id || locked) return
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
    setNewGoalPlayer((prev) => ({ ...prev, [team]: '' }))
    setOwnGoal((prev) => ({ ...prev, [team]: false }))
    refetch()
  }

  async function handleRemoveGoal(goalId: string) {
    if (locked) return
    const goal = goals.find((g) => g.id === goalId)
    await supabase.from('goals').delete().eq('id', goalId)
    logActivity('gol_rimosso', { matchId: id, data: match.match_date, giocatore: goal?.name })
    refetch()
  }

  async function handleAddAssist(team: Team) {
    if (!id || !newAssistPlayer[team] || locked) return
    await supabase
      .from('assists')
      .insert({ match_id: id, player_id: newAssistPlayer[team], team })
    const playerName = matchPlayers.find((p) => p.player_id === newAssistPlayer[team])?.name
    logActivity('assist_aggiunto', { matchId: id, data: match.match_date, squadra: team, giocatore: playerName })
    setNewAssistPlayer((prev) => ({ ...prev, [team]: '' }))
    refetch()
  }

  async function handleRemoveAssist(assistId: string) {
    if (locked) return
    const assist = assists.find((a) => a.id === assistId)
    await supabase.from('assists').delete().eq('id', assistId)
    logActivity('assist_rimosso', { matchId: id, data: match.match_date, giocatore: assist?.name })
    refetch()
  }

  function updateDraft(playerId: string, patch: Partial<PagellaDraft>) {
    setDrafts((prev) => ({ ...prev, [playerId]: { ...prev[playerId], ...patch } }))
  }

  function setMvp(playerId: string) {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const pid of Object.keys(next)) {
        next[pid] = { ...next[pid], is_mvp: pid === playerId }
      }
      return next
    })
  }

  function buildPagelleRows(publish: boolean) {
    return matchPlayers.map((mp) => ({
      match_id: id,
      player_id: mp.player_id,
      voto: drafts[mp.player_id]?.voto || '',
      titolo: drafts[mp.player_id]?.titolo || null,
      descrizione: drafts[mp.player_id]?.descrizione || null,
      is_mvp: drafts[mp.player_id]?.is_mvp ?? false,
      ...(publish ? { published_at: new Date().toISOString() } : {}),
    }))
  }

  async function handleSaveDraft() {
    if (locked) return
    setSavingPagelle(true)
    await supabase.from('pagelle').upsert(buildPagelleRows(false), { onConflict: 'match_id,player_id' })
    setSavingPagelle(false)
    logActivity('pagelle_bozza', { matchId: id, data: match.match_date })
    refetch()
  }

  async function handlePublish() {
    if (locked) return
    if (!result) {
      alert('Salva prima il risultato della partita: le pagelle non possono essere pubblicate senza un risultato.')
      return
    }
    if (!goalsCoherent) {
      alert('I gol registrati non coincidono con il risultato: correggi i marcatori o il risultato prima di pubblicare.')
      return
    }
    const incomplete = matchPlayers.filter((mp) => {
      const d = drafts[mp.player_id]
      return !d || !d.voto.trim() || !d.titolo.trim() || !d.descrizione.trim()
    })
    if (incomplete.length > 0) {
      alert(
        `Completa voto, titolo e descrizione per tutti i giocatori prima di pubblicare. Mancano per: ${incomplete
          .map((mp) => fullName(mp))
          .join(', ')}.`
      )
      return
    }
    const mvpCount = matchPlayers.filter((mp) => drafts[mp.player_id]?.is_mvp).length
    if (mvpCount !== 1) {
      alert('Seleziona un MVP prima di pubblicare le pagelle.')
      return
    }
    if (
      !confirm(
        'Pubblicare le pagelle? Diventeranno visibili a tutti i giocatori e verrà inviata una mail a tutti i partecipanti con risultato, marcatori e pagelle. Dopo la pubblicazione la partita non sarà più modificabile.'
      )
    )
      return
    setPublishing(true)
    await supabase.from('pagelle').upsert(buildPagelleRows(true), { onConflict: 'match_id,player_id' })
    await supabase.functions.invoke('notify-match-published', { body: { matchId: id } })
    logActivity('pagelle_pubblicate', { matchId: id, data: match.match_date })
    setPublishing(false)
    refetch()
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

  // --- Votazioni ---
  async function handleOpenVoting() {
    if (!id || locked) return
    setOpeningVoting(true)
    await supabase.from('matches').update({ voting_open: true }).eq('id', id)
    logActivity('votazioni_aperte', { matchId: id, data: match.match_date })
    supabase.functions
      .invoke('notify-voting-opened', { body: { matchId: id } })
      .catch((e) => console.error('notify-voting-opened:', e))
    setOpeningVoting(false)
    refetch()
    refetchVoting()
  }

  async function handleCloseVoting() {
    if (!id || !confirm('Chiudere le votazioni? I giocatori non potranno più modificare i voti.')) return
    setClosingVoting(true)
    await supabase.from('matches').update({ voting_open: false }).eq('id', id)
    logActivity('votazioni_chiuse', { matchId: id, data: match.match_date })
    setClosingVoting(false)
    refetch()
    refetchVoting()
  }

  function prefillFromVoting() {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const avg of averages) {
        if (avg.average !== null && next[avg.player_id]) {
          next[avg.player_id] = { ...next[avg.player_id], voto: formatVote(avg.average) }
        }
      }
      if (provisionalMvpId) {
        for (const pid of Object.keys(next)) {
          next[pid] = { ...next[pid], is_mvp: pid === provisionalMvpId }
        }
      }
      return next
    })
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

      {/* ===== STEP 1 — Info partita ===== */}
      <div className="mt-2 space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Data</label>
            <input
              type="date"
              value={matchDate}
              disabled={locked}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Ora</label>
            <input
              type="time"
              value={matchTime}
              disabled={locked}
              onChange={(e) => setMatchTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Campo</label>
          <input
            value={field}
            disabled={locked}
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
        {infoError && <p className="text-sm text-red-600">{infoError}</p>}
        {!locked && (
          <button
            onClick={handleSaveInfo}
            disabled={savingInfo || !matchDate}
            className="w-full rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
          >
            {savingInfo ? 'Salvataggio...' : 'Salva data/ora/campo'}
          </button>
        )}
      </div>

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
                  <li key={p.id} className="min-w-0">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
              <ul className="space-y-1 text-sm">
                {dTeamB.map((p) => (
                  <li key={p.id} className="min-w-0">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                  </li>
                ))}
              </ul>
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

      {/* ===== STEP 2 — RISULTATO (solo dopo ufficializzazione squadre) ===== */}
      {teamsOfficial ? (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">Risultato</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={0}
              value={scoreA}
              disabled={locked}
              onChange={(e) => setScoreA(e.target.value)}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center disabled:bg-gray-100"
            />
            <span className="font-semibold">-</span>
            <input
              type="number"
              min={0}
              value={scoreB}
              disabled={locked}
              onChange={(e) => setScoreB(e.target.value)}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center disabled:bg-gray-100"
            />
            {!locked && (
              <button
                onClick={handleSaveResult}
                disabled={savingResult || !infoComplete}
                title={!infoComplete ? 'Completa data, ora e campo prima di salvare il risultato' : undefined}
                className="w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
              >
                {savingResult ? 'Salvataggio...' : 'Salva risultato'}
              </button>
            )}
          </div>
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
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
          📋 Il risultato si potrà inserire dopo aver ufficializzato le squadre.
        </p>
      )}

      {/* ===== STEP 3 — MARCATORI E ASSIST (solo dopo aver salvato il risultato) ===== */}
      {result && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(['A', 'B'] as Team[]).map((team) => (
            <div key={team} className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Marcatori Squadra {team}</h3>
              <ul className="space-y-1 text-sm">
                {goalsByTeam(team).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-start gap-1">
                      <span>⚽</span>
                      <PlayerName name={g.name} surname={g.surname} nickname={g.nickname} />
                      {g.is_own_goal && <span className="shrink-0 text-red-600">(autogol)</span>}
                    </span>
                    {!locked && (
                      <button onClick={() => handleRemoveGoal(g.id)} className="shrink-0 text-xs text-red-600">
                        Rimuovi
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!locked && (
                <div className="mt-2 space-y-2">
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
                </div>
              )}

              {/* Assist */}
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h4 className="mb-2 text-sm font-medium text-field-green-dark">Assist Squadra {team}</h4>
                <ul className="space-y-1 text-sm">
                  {assistsByTeam(team).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-start gap-1">
                        <span>🅰️</span>
                        <PlayerName name={a.name} surname={a.surname} nickname={a.nickname} />
                      </span>
                      {!locked && (
                        <button onClick={() => handleRemoveAssist(a.id)} className="shrink-0 text-xs text-red-600">
                          Rimuovi
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!locked && (
                  <div className="mt-2 space-y-2">
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
            </div>
          ))}
        </div>
      )}

      {/* Avviso coerenza gol/risultato: blocca lo sblocco di voti e pagelle. */}
      {result && !goalsCoherent && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          ⚠️ I gol registrati ({goalsByTeam('A').length}-{goalsByTeam('B').length}) non coincidono con il risultato (
          {result.score_a}-{result.score_b}). Correggi i marcatori o il risultato: voti e pagelle si sbloccano solo
          quando coincidono.
        </p>
      )}

      {/* ===== STEP 4 — VOTAZIONI (admin) ===== */}
      {result && goalsCoherent && (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-purple-800">🗳️ Votazioni</h2>
            <span className="text-sm font-medium text-purple-600">
              {[...voterIds].filter((v) => adminVoterIds.includes(v)).length}/{adminVoterIds.length} hanno votato
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!locked &&
              (!match.voting_open ? (
                <button
                  onClick={handleOpenVoting}
                  disabled={openingVoting}
                  className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {openingVoting ? 'Apertura...' : '🔓 Apri votazioni'}
                </button>
              ) : (
                <button
                  onClick={handleCloseVoting}
                  disabled={closingVoting}
                  className="flex-1 rounded-lg border border-purple-400 bg-white px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {closingVoting ? 'Chiusura...' : '🔒 Chiudi votazioni'}
                </button>
              ))}
            {!locked && allAdminVotersVoted && averages.some((a) => a.exact !== null) && (
              <button
                onClick={prefillFromVoting}
                className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                title="Copia le medie nelle pagelle"
              >
                ↓ Pre-compila pagelle
              </button>
            )}
            <button
              onClick={() => setShowVoteDetail((v) => !v)}
              className="rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
            >
              {showVoteDetail ? '✕ Nascondi dettaglio voti' : '📋 Dettaglio voti'}
            </button>
          </div>

          {showVoteDetail && (
            <div className="mt-3 space-y-3 rounded-lg border border-purple-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-purple-800">Dettaglio voti per giocatore</h3>
              {matchPlayers.map((mp) => {
                const playerVotes = votes.filter((v) => v.voted_id === mp.player_id)
                return (
                  <div key={mp.id}>
                    <PlayerName name={mp.name} surname={mp.surname} nickname={mp.nickname} nameClassName="text-sm font-medium text-gray-800" />
                    {playerVotes.length === 0 ? (
                      <p className="text-xs text-gray-400">Nessun voto ancora.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {playerVotes.map((v) => (
                          <li key={v.voter_id} className="flex items-center justify-between">
                            <span>
                              {(() => {
                                const info = voterInfo.get(v.voter_id)
                                return info ? fullName(info) : 'Sconosciuto'
                              })()}
                            </span>
                            <span className="font-semibold text-purple-700">{formatVote(v.vote)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Media (NON arrotondata) + MVP: visibili solo quando tutti gli admin
              che hanno partecipato alla partita hanno votato. */}
          {allAdminVotersVoted && averages.some((a) => a.exact !== null) ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-purple-500">
                Media voto (non arrotondata) — l'MVP è il giocatore con la media più alta; a parità, con più bonus.
              </p>
              {[...averages]
                .sort((a, b) => (b.exact ?? 0) - (a.exact ?? 0))
                .map((avg) => {
                  const p = participants.find((x) => x.player_id === avg.player_id)
                  if (!p) return null
                  const isMvp = avg.player_id === provisionalMvpId
                  return (
                    <div
                      key={avg.player_id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isMvp ? 'border border-yellow-200 bg-yellow-50' : 'bg-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-start gap-1 text-sm font-medium text-gray-800">
                        {isMvp && <span>🏆</span>}
                        <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {avg.raw_count} {avg.raw_count === 1 ? 'voto' : 'voti'}
                        </span>
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-sm font-bold text-purple-700">
                          {avg.exact !== null ? formatExact(avg.exact) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              {provisionalMvpId === null && averages.filter((a) => a.exact !== null).length > 1 && (
                <p className="mt-1 text-xs text-yellow-600">
                  ⚠️ MVP in parimerito su media e bonus: scegli tu l'MVP nelle pagelle prima di pubblicare.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-purple-500">
              La media voto e l'MVP saranno visibili quando tutti gli admin che hanno partecipato avranno votato.
            </p>
          )}

          {match.voting_open && (
            <p className="mt-2 animate-pulse text-center text-xs text-purple-500">Votazioni in corso...</p>
          )}
        </div>
      )}

      {/* ===== PAGELLE ===== */}
      {result && goalsCoherent && (
        <div className="mt-4">
          <h2 className="font-medium text-field-green-dark">Pagelle</h2>
          <div className="mt-2 space-y-3">
            {matchPlayers.map((mp) => {
              const draft = drafts[mp.player_id]
              if (!draft) return null
              return (
                <div key={mp.id} className="rounded-xl bg-white p-3 shadow">
                  <div className="flex items-center justify-between">
                    <PlayerName name={mp.name} surname={mp.surname} nickname={mp.nickname} nameClassName="font-medium" />
                    <label className="flex items-center gap-1 text-xs text-field-orange">
                      <input
                        type="radio"
                        name="mvp"
                        checked={draft.is_mvp}
                        disabled={locked}
                        onChange={() => setMvp(mp.player_id)}
                      />
                      MVP
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <div className="flex flex-col gap-0.5">
                      <input
                        placeholder="Voto"
                        value={draft.voto}
                        disabled={locked}
                        onChange={(e) => updateDraft(mp.player_id, { voto: e.target.value })}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                      />
                      {!locked &&
                        (() => {
                          const avg = averages.find((a) => a.player_id === mp.player_id)
                          return avg?.average !== null && avg?.average !== undefined ? (
                            <button
                              type="button"
                              onClick={() => updateDraft(mp.player_id, { voto: formatVote(avg.average!) })}
                              className="text-left text-[10px] text-purple-600 hover:underline"
                            >
                              Media: {formatVote(avg.average!)} →
                            </button>
                          ) : null
                        })()}
                    </div>
                    <input
                      placeholder="Titolo"
                      value={draft.titolo}
                      disabled={locked}
                      onChange={(e) => updateDraft(mp.player_id, { titolo: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                    />
                  </div>
                  <textarea
                    placeholder="Descrizione"
                    value={draft.descrizione}
                    disabled={locked}
                    onChange={(e) => updateDraft(mp.player_id, { descrizione: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                    rows={2}
                  />
                </div>
              )
            })}
          </div>

          {!locked ? (
            <>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={savingPagelle}
                  className="flex-1 rounded-lg border border-field-green px-4 py-2 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
                >
                  {savingPagelle ? 'Salvataggio...' : 'Salva bozza'}
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing || match.voting_open}
                  title={match.voting_open ? 'Chiudi prima le votazioni prima di pubblicare' : undefined}
                  className="flex-1 rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishing ? 'Pubblicazione...' : 'Pubblica pagelle'}
                </button>
              </div>
              {match.voting_open && (
                <p className="mt-2 text-xs text-red-500">⚠️ Chiudi le votazioni prima di pubblicare le pagelle.</p>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-lg bg-field-green/10 px-3 py-2 text-center text-xs font-medium text-field-green-dark">
              ✅ Pagelle pubblicate e visibili a tutti.
            </p>
          )}
        </div>
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
