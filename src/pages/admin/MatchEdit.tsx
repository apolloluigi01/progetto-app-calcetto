import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMatchDetail } from '../../hooks/useMatchDetail'
import { useMatchBookings } from '../../hooks/useMatchBookings'
import { useMatchVoting } from '../../hooks/useMatchVoting'
import { getKnownFields } from '../../lib/fields'
import { getSeasonIdForDate } from '../../lib/seasons'
import { logActivity } from '../../lib/activityLog'
import { computeOverallsForPlayers, generateBalancedTeams } from '../../lib/teamGeneration'
import { formatVote } from '../../lib/voting'
import type { Player, Team } from '../../types/database'
import type { PlayerOverall, GeneratedTeams } from '../../lib/teamGeneration'
import type { MatchPlayerWithName } from '../../hooks/useMatchDetail'

const MAX_PLAYERS = 10

interface PagellaDraft {
  voto: string
  titolo: string
  descrizione: string
  is_mvp: boolean
}

export default function MatchEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  const { votes, voterInfo, averages, mvpTally, provisionalMvpId, voterIds, participants, refetch: refetchVoting } =
    useMatchVoting(id)
  const [showVoteDetail, setShowVoteDetail] = useState(false)

  // Sondaggio: aggiunta manuale giocatore
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [addBookingPlayer, setAddBookingPlayer] = useState('')
  const [addingBooking, setAddingBooking] = useState(false)
  const [closingSurvey, setClosingSurvey] = useState(false)

  // Generazione squadre
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeams | null>(null)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Stato locale delle squadre per lo scambio manuale
  const [draftTeamA, setDraftTeamA] = useState<PlayerOverall[]>([])
  const [draftTeamB, setDraftTeamB] = useState<PlayerOverall[]>([])

  // Modifica manuale delle squadre già confermate (solo finché la partita è in bozza)
  const [editingTeams, setEditingTeams] = useState(false)
  const [localTeamA, setLocalTeamA] = useState<MatchPlayerWithName[]>([])
  const [localTeamB, setLocalTeamB] = useState<MatchPlayerWithName[]>([])
  const [savingTeams, setSavingTeams] = useState(false)

  // Sostituzione giocatore (solo finché la partita è in bozza)
  const [substitutingOpen, setSubstitutingOpen] = useState(false)
  const [subOutId, setSubOutId] = useState('')
  const [subInId, setSubInId] = useState('')
  const [substituting, setSubstituting] = useState(false)

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
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)
  const assistsByTeam = (team: Team) => assists.filter((a) => a.team === team)
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  // "In bozza" finché non è stato salvato un risultato e non sono state pubblicate le pagelle:
  // solo in questa fase ha senso poter ancora spostare i giocatori tra le squadre.
  const isDraft = !result && !isPublished
  const infoComplete = !!matchDate && !!matchTime && !!field

  // --- Azioni info partita ---
  async function handleSaveResult() {
    if (!id || !infoComplete) return
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
    if (!id) return
    setInfoError(null)
    setSavingInfo(true)

    const seasonId = await getSeasonIdForDate(matchDate)
    if (!seasonId) {
      setSavingInfo(false)
      setInfoError(
        'Nessuna stagione copre questa data. Crea o estendi una stagione che includa questa data prima di salvare.'
      )
      return
    }

    await supabase
      .from('matches')
      .update({ match_date: matchDate, match_time: matchTime || null, field: field || null, season_id: seasonId })
      .eq('id', id)
    setSavingInfo(false)
    logActivity('partita_modificata', { matchId: id, data: matchDate, ora: matchTime || null, campo: field || null })
    refetch()
  }

  async function handleAddGoal(team: Team) {
    if (!id || !newGoalPlayer[team]) return
    await supabase
      .from('goals')
      .insert({
        match_id: id,
        player_id: newGoalPlayer[team],
        team,
        is_own_goal: ownGoal[team],
      })
    const playerName = matchPlayers.find(p => p.player_id === newGoalPlayer[team])?.name
    logActivity('gol_aggiunto', { matchId: id, data: match.match_date, squadra: team, giocatore: playerName, autogol: ownGoal[team] })
    setNewGoalPlayer((prev) => ({ ...prev, [team]: '' }))
    setOwnGoal((prev) => ({ ...prev, [team]: false }))
    refetch()
  }

  async function handleRemoveGoal(goalId: string) {
    const goal = goals.find(g => g.id === goalId)
    await supabase.from('goals').delete().eq('id', goalId)
    logActivity('gol_rimosso', { matchId: id, data: match.match_date, giocatore: goal?.name })
    refetch()
  }

  async function handleAddAssist(team: Team) {
    if (!id || !newAssistPlayer[team]) return
    await supabase
      .from('assists')
      .insert({ match_id: id, player_id: newAssistPlayer[team], team })
    const playerName = matchPlayers.find((p) => p.player_id === newAssistPlayer[team])?.name
    logActivity('assist_aggiunto', { matchId: id, data: match.match_date, squadra: team, giocatore: playerName })
    setNewAssistPlayer((prev) => ({ ...prev, [team]: '' }))
    refetch()
  }

  async function handleRemoveAssist(assistId: string) {
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
    setSavingPagelle(true)
    await supabase.from('pagelle').upsert(buildPagelleRows(false), { onConflict: 'match_id,player_id' })
    setSavingPagelle(false)
    logActivity('pagelle_bozza', { matchId: id, data: match.match_date })
    refetch()
  }

  async function handlePublish() {
    if (!result) {
      alert('Salva prima il risultato della partita: le pagelle non possono essere pubblicate senza un risultato.')
      return
    }
    const incomplete = matchPlayers.filter((mp) => {
      const d = drafts[mp.player_id]
      return !d || !d.voto.trim() || !d.titolo.trim() || !d.descrizione.trim()
    })
    if (incomplete.length > 0) {
      alert(
        `Completa voto, titolo e descrizione per tutti i giocatori prima di pubblicare. Mancano per: ${incomplete
          .map((mp) => mp.nickname ?? mp.name)
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
        'Pubblicare le pagelle? Diventeranno visibili a tutti i giocatori e verrà inviata una mail a tutti i partecipanti con risultato, marcatori e pagelle.'
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

  // --- Azioni votazioni ---
  async function handleOpenVoting() {
    if (!id) return
    setOpeningVoting(true)
    await supabase.from('matches').update({ voting_open: true }).eq('id', id)
    logActivity('votazioni_aperte', { matchId: id, data: match.match_date })
    // Avvisa via mail gli altri admin della partita chiamati a votare
    // (o i superadmin, se nessun admin ha partecipato). Non bloccante.
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

  // --- Azioni sondaggio ---
  async function handleAddBooking() {
    if (!id || !addBookingPlayer) return
    setAddingBooking(true)
    await supabase.from('match_bookings').insert({ match_id: id, player_id: addBookingPlayer })
    logActivity('prenotazione_aggiunta', {
      matchId: id,
      giocatore: allPlayers.find(p => p.id === addBookingPlayer)?.name,
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

  // --- Generazione squadre ---
  async function handleGenerateTeams() {
    if (!id) return
    setGenerating(true)
    setGeneratedTeams(null)

    const players = await computeOverallsForPlayers(
      bookings.map((b) => ({ id: b.player_id, name: b.name, nickname: b.nickname }))
    )

    const result = generateBalancedTeams(players)
    setGeneratedTeams(result)
    setDraftTeamA(result.teamA)
    setDraftTeamB(result.teamB)
    setGenerating(false)

    logActivity('squadre_generate', {
      matchId: id,
      avgA: result.avgA,
      avgB: result.avgB,
      diff: result.diff,
    })
  }

  function swapPlayer(from: 'A' | 'B', playerId: string) {
    if (from === 'A') {
      const player = draftTeamA.find(p => p.playerId === playerId)
      if (!player) return
      setDraftTeamA(prev => prev.filter(p => p.playerId !== playerId))
      setDraftTeamB(prev => [...prev, player])
    } else {
      const player = draftTeamB.find(p => p.playerId === playerId)
      if (!player) return
      setDraftTeamB(prev => prev.filter(p => p.playerId !== playerId))
      setDraftTeamA(prev => [...prev, player])
    }
  }

  function avgOverall(arr: PlayerOverall[]) {
    return arr.length === 0 ? 0 : Math.round(arr.reduce((s, p) => s + p.overall, 0) / arr.length)
  }

  async function handleConfirmTeams() {
    if (!id) return
    setConfirming(true)

    const rows = [
      ...draftTeamA.map(p => ({ match_id: id, player_id: p.playerId, team: 'A' as Team })),
      ...draftTeamB.map(p => ({ match_id: id, player_id: p.playerId, team: 'B' as Team })),
    ]
    await supabase.from('match_players').insert(rows)

    // L'overall è gestito manualmente dagli admin: la generazione squadre
    // lo legge soltanto, senza più riscriverlo in ratings.
    setConfirming(false)
    setGeneratedTeams(null)
    refetch()
  }

  // --- Modifica manuale squadre già confermate (solo in bozza) ---
  function startEditingTeams() {
    setLocalTeamA(teamA)
    setLocalTeamB(teamB)
    setEditingTeams(true)
  }

  function cancelEditingTeams() {
    setEditingTeams(false)
  }

  function swapConfirmedPlayer(from: 'A' | 'B', playerId: string) {
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
    if (localTeamA.length !== 5 || localTeamB.length !== 5) return
    setSavingTeams(true)

    const changed = [
      ...localTeamA.filter((p) => p.team !== 'A').map((p) => ({ ...p, team: 'A' as Team })),
      ...localTeamB.filter((p) => p.team !== 'B').map((p) => ({ ...p, team: 'B' as Team })),
    ]
    await Promise.all(
      changed.map((p) => supabase.from('match_players').update({ team: p.team }).eq('id', p.id))
    )

    setSavingTeams(false)
    setEditingTeams(false)
    logActivity('squadre_modificate', { matchId: id, data: match.match_date })
    refetch()
  }

  // --- Sostituzione giocatore già assegnato con uno esterno alla partita ---
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
    const outPlayer = matchPlayers.find((mp) => mp.player_id === subOutId)
    const roster = [
      ...matchPlayers
        .filter((mp) => mp.player_id !== subOutId)
        .map((mp) => ({ id: mp.player_id, name: mp.name, nickname: mp.nickname })),
      { id: subInId, name: inPlayer?.name ?? '', nickname: inPlayer?.nickname ?? null },
    ]

    const overalls = await computeOverallsForPlayers(roster)
    const result = generateBalancedTeams(overalls)

    await supabase.from('match_players').delete().eq('match_id', id)
    const rows = [
      ...result.teamA.map((p) => ({ match_id: id, player_id: p.playerId, team: 'A' as Team })),
      ...result.teamB.map((p) => ({ match_id: id, player_id: p.playerId, team: 'B' as Team })),
    ]
    await supabase.from('match_players').insert(rows)

    logActivity('giocatore_sostituito', {
      matchId: id,
      data: match.match_date,
      uscito: outPlayer?.name,
      entrato: inPlayer?.name,
    })

    setSubstituting(false)
    setSubstitutingOpen(false)
    refetch()
  }

  const bookedNotInMatch = bookings.filter(
    b => !matchPlayers.some(mp => mp.player_id === b.player_id)
  )
  const alreadyBookedIds = new Set(bookings.map(b => b.player_id))
  const availableToAdd = allPlayers.filter(p => !alreadyBookedIds.has(p.id))
  const inMatchIds = new Set(matchPlayers.map((mp) => mp.player_id))
  const playersNotInMatch = allPlayers.filter((p) => !inMatchIds.has(p.id))

  const canGenerate = bookings.length >= MAX_PLAYERS && matchPlayers.length === 0

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
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              Sondaggio aperto
            </span>
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
            <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">
              Pubblicata
            </span>
          )}
        </div>
      </div>

      {/* Info partita */}
      <div className="mt-2 space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Data</label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Ora</label>
            <input
              type="time"
              value={matchTime}
              onChange={(e) => setMatchTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Campo</label>
          <input
            value={field}
            onChange={(e) => setField(e.target.value)}
            list="campi-noti"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
          <datalist id="campi-noti">
            {knownFields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        {infoError && <p className="text-sm text-red-600">{infoError}</p>}
        <button
          onClick={handleSaveInfo}
          disabled={savingInfo || !matchDate}
          className="w-full rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
        >
          {savingInfo ? 'Salvataggio...' : 'Salva data/ora/campo'}
        </button>
      </div>

      {/* ===== SEZIONE SONDAGGIO ===== */}
      {(match.booking_open || (bookedNotInMatch.length > 0 && matchPlayers.length === 0)) && !bookingsLoading && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-blue-800">
              Sondaggio prenotazioni
            </h2>
            <span className="text-sm font-bold text-blue-700">
              {bookings.length}/{MAX_PLAYERS}
            </span>
          </div>

          {/* Lista prenotati */}
          <div className="mt-3 space-y-1">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5">
                <span className="text-sm font-medium">{b.nickname ?? b.name}</span>
                <button
                  onClick={() => handleRemoveBooking(b.player_id, b.name)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Rimuovi
                </button>
              </div>
            ))}
            {bookings.length === 0 && (
              <p className="text-sm text-blue-600">Nessuna prenotazione ancora.</p>
            )}
          </div>

          {/* Aggiungi giocatore manualmente */}
          {match.booking_open && bookings.length < MAX_PLAYERS && (
            <div className="mt-3 flex gap-2">
              <select
                value={addBookingPlayer}
                onChange={(e) => setAddBookingPlayer(e.target.value)}
                className="flex-1 rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">+ Aggiungi giocatore</option>
                {availableToAdd.map(p => (
                  <option key={p.id} value={p.id}>{p.nickname ?? p.name}</option>
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

          {/* Chiudi sondaggio */}
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

      {/* ===== GENERAZIONE SQUADRE ===== */}
      {!match.booking_open && matchPlayers.length === 0 && bookings.length > 0 && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <h2 className="font-semibold text-field-green-dark">Genera squadre bilanciate</h2>
          <p className="mt-1 text-sm text-gray-600">
            {bookings.length} giocatori prenotati.
            {bookings.length < MAX_PLAYERS && (
              <span className="text-field-orange">
                {' '}Servono {MAX_PLAYERS - bookings.length} prenotazioni in più per generare le squadre.
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
              {/* Anteprima squadre */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Squadra A */}
                <div className="min-w-0 rounded-xl bg-white p-3 shadow">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-field-green-dark">Squadra A</h3>
                    <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-xs font-bold text-field-green-dark">
                      Overall {avgOverall(draftTeamA)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {draftTeamA.map(p => (
                      <li key={p.playerId} className="flex items-center justify-between gap-1 text-sm">
                        <span className="min-w-0 truncate">{p.nickname ?? p.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="rounded bg-field-green/10 px-1.5 text-xs font-bold text-field-green-dark">
                            {p.overall}
                          </span>
                          <button
                            onClick={() => swapPlayer('A', p.playerId)}
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

                {/* Squadra B */}
                <div className="min-w-0 rounded-xl bg-white p-3 shadow">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-field-green-dark">Squadra B</h3>
                    <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs font-bold text-field-orange">
                      Overall {avgOverall(draftTeamB)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {draftTeamB.map(p => (
                      <li key={p.playerId} className="flex items-center justify-between gap-1 text-sm">
                        <span className="min-w-0 truncate">{p.nickname ?? p.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => swapPlayer('B', p.playerId)}
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
                Differenza overall: {Math.abs(avgOverall(draftTeamA) - avgOverall(draftTeamB))} punto/i
                {draftTeamA.length !== 5 || draftTeamB.length !== 5 ? (
                  <span className="ml-1 text-red-500">
                    (le squadre devono avere 5 giocatori ciascuna)
                  </span>
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
                  disabled={
                    confirming ||
                    draftTeamA.length !== 5 ||
                    draftTeamB.length !== 5
                  }
                  className="flex-1 rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
                >
                  {confirming ? 'Salvataggio...' : 'Conferma squadre'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== SQUADRE (già assegnate) ===== */}
      {matchPlayers.length > 0 && !editingTeams && !substitutingOpen && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
              <ul className="space-y-1 text-sm">
                {teamA.map((p) => (
                  <li key={p.id}>{p.nickname ?? p.name}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra B</h3>
              <ul className="space-y-1 text-sm">
                {teamB.map((p) => (
                  <li key={p.id}>{p.nickname ?? p.name}</li>
                ))}
              </ul>
            </div>
          </div>
          {isDraft && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={startEditingTeams}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                ✏️ Modifica squadre
              </button>
              <button
                onClick={startSubstitute}
                disabled={playersNotInMatch.length === 0}
                className="flex-1 rounded-lg border border-field-orange/50 px-3 py-1.5 text-sm text-field-orange hover:bg-field-orange/5 disabled:opacity-50"
                title={playersNotInMatch.length === 0 ? 'Nessun giocatore disponibile per la sostituzione' : undefined}
              >
                🔄 Sostituisci giocatore
              </button>
            </div>
          )}

          <Link
            to={`/partite/${id}/campetto`}
            className="mt-3 block w-full rounded-lg border border-field-green/40 bg-field-green/5 px-3 py-1.5 text-center text-sm font-medium text-field-green-dark hover:bg-field-green/10"
          >
            ⚽ Visualizzazione campetto
          </Link>
        </div>
      )}

      {/* ===== SOSTITUZIONE GIOCATORE (solo in bozza) ===== */}
      {matchPlayers.length > 0 && substitutingOpen && (
        <div className="mt-4 rounded-xl border border-field-orange/30 bg-field-orange/5 p-4">
          <h2 className="font-semibold text-field-orange">Sostituisci giocatore</h2>
          <p className="mt-1 text-xs text-gray-600">
            Sostituisci un giocatore in campo con uno non selezionato per questa partita. Le
            squadre verranno rigenerate automaticamente in base all'overall di tutti i giocatori,
            incluso il nuovo entrato.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Giocatore da sostituire
              </label>
              <select
                value={subOutId}
                onChange={(e) => setSubOutId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleziona...</option>
                {matchPlayers.map((mp) => (
                  <option key={mp.player_id} value={mp.player_id}>
                    {mp.nickname ?? mp.name} (Squadra {mp.team})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Nuovo giocatore
              </label>
              <select
                value={subInId}
                onChange={(e) => setSubInId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleziona...</option>
                {playersNotInMatch.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname ?? p.name}
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

      {/* ===== SQUADRE (modifica manuale, solo in bozza) ===== */}
      {matchPlayers.length > 0 && editingTeams && (
        <div className="mt-4 rounded-xl border border-field-green/30 bg-field-green/5 p-4">
          <h2 className="font-semibold text-field-green-dark">Modifica squadre</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Squadra A</h3>
              <ul className="space-y-1">
                {localTeamA.map((p) => (
                  <li key={p.player_id} className="flex items-center justify-between gap-1 text-sm">
                    <span className="min-w-0 truncate">{p.nickname ?? p.name}</span>
                    <button
                      onClick={() => swapConfirmedPlayer('A', p.player_id)}
                      className="text-xs text-gray-400 hover:text-field-orange"
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
                  <li key={p.player_id} className="flex items-center justify-between gap-1 text-sm">
                    <button
                      onClick={() => swapConfirmedPlayer('B', p.player_id)}
                      className="shrink-0 text-xs text-gray-400 hover:text-field-green"
                      title="Sposta in A"
                    >
                      A←
                    </button>
                    <span className="min-w-0 truncate">{p.nickname ?? p.name}</span>
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

      {/* ===== RISULTATO ===== */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">Risultato</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center"
          />
          <span className="font-semibold">-</span>
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center"
          />
          <button
            onClick={handleSaveResult}
            disabled={savingResult || !infoComplete}
            title={!infoComplete ? 'Completa data, ora e campo prima di salvare il risultato' : undefined}
            className="w-full rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50 disabled:cursor-not-allowed sm:ml-auto sm:w-auto"
          >
            Salva risultato
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Gol registrati: {goalsByTeam('A').length} - {goalsByTeam('B').length}
          {(Number(scoreA) || 0) !== goalsByTeam('A').length || (Number(scoreB) || 0) !== goalsByTeam('B').length
            ? ' (non coincide con il risultato inserito)'
            : ''}
        </p>
        {!infoComplete && (
          <p className="mt-1 text-xs text-red-500">
            ⚠️ Completa data, ora e campo prima di poter salvare il risultato.
          </p>
        )}
      </div>

      {/* ===== MARCATORI E ASSIST ===== */}
      {/* Gol e assist si censiscono in modo indipendente: nessun legame tra i due.
          Una colonna su mobile, due su schermi larghi; controlli impilati a tutta
          larghezza per evitare sovrapposizioni. */}
      {matchPlayers.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(['A', 'B'] as Team[]).map((team) => (
            <div key={team} className="min-w-0 rounded-xl bg-white p-3 shadow">
              <h3 className="mb-2 font-medium text-field-green-dark">Marcatori Squadra {team}</h3>
              <ul className="space-y-1 text-sm">
                {goalsByTeam(team).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      ⚽ {g.nickname ?? g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                    </span>
                    <button onClick={() => handleRemoveGoal(g.id)} className="shrink-0 text-xs text-red-600">
                      Rimuovi
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 space-y-2">
                <select
                  value={newGoalPlayer[team]}
                  onChange={(e) => setNewGoalPlayer((prev) => ({ ...prev, [team]: e.target.value }))}
                  className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Giocatore...</option>
                  {(ownGoal[team] ? (team === 'A' ? teamB : teamA) : team === 'A' ? teamA : teamB).map((p) => (
                    <option key={p.player_id} value={p.player_id}>
                      {p.nickname ?? p.name}
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

              {/* Assist (indipendenti dai gol) */}
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h4 className="mb-2 text-sm font-medium text-field-green-dark">Assist Squadra {team}</h4>
                <ul className="space-y-1 text-sm">
                  {assistsByTeam(team).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">🅰️ {a.nickname ?? a.name}</span>
                      <button onClick={() => handleRemoveAssist(a.id)} className="shrink-0 text-xs text-red-600">
                        Rimuovi
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-2">
                  <select
                    value={newAssistPlayer[team]}
                    onChange={(e) => setNewAssistPlayer((prev) => ({ ...prev, [team]: e.target.value }))}
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Giocatore...</option>
                    {(team === 'A' ? teamA : teamB).map((p) => (
                      <option key={p.player_id} value={p.player_id}>
                        {p.nickname ?? p.name}
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== VOTAZIONI (admin) ===== */}
      {/* Visibili solo dopo aver salvato il risultato della partita. */}
      {matchPlayers.length > 0 && result && (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-purple-800">🗳️ Votazioni</h2>
            <span className="text-sm font-medium text-purple-600">
              {voterIds.size}/{matchPlayers.length} hanno votato
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!match.voting_open ? (
              <button
                onClick={handleOpenVoting}
                disabled={openingVoting || isPublished}
                title={isPublished ? 'Le pagelle sono già pubblicate' : undefined}
                className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            )}
            {averages.some((a) => a.average !== null) && (
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
                    <p className="text-sm font-medium text-gray-800">{mp.nickname ?? mp.name}</p>
                    {playerVotes.length === 0 ? (
                      <p className="text-xs text-gray-400">Nessun voto ancora.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {playerVotes.map((v) => (
                          <li key={v.voter_id} className="flex items-center justify-between">
                            <span>
                              {voterInfo.get(v.voter_id)?.nickname ??
                                voterInfo.get(v.voter_id)?.name ??
                                'Sconosciuto'}
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

          {averages.some((a) => a.average !== null) && (
            <div className="mt-3 space-y-1.5">
              {[...averages]
                .sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
                .map((avg) => {
                  const p = participants.find((x) => x.player_id === avg.player_id)
                  if (!p) return null
                  const isMvp = avg.player_id === provisionalMvpId
                  return (
                    <div
                      key={avg.player_id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isMvp ? 'bg-yellow-50 border border-yellow-200' : 'bg-white'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-800">
                        {isMvp && <span className="mr-1">🏆</span>}
                        {p.nickname ?? p.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {avg.raw_count} {avg.raw_count === 1 ? 'voto' : 'voti'}
                        </span>
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-sm font-bold text-purple-700">
                          {avg.average !== null ? formatVote(avg.average) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Spoglio voti MVP */}
          {mvpTally.counts.size > 0 && (
            <div className="mt-3 rounded-lg bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">🏆 Voti MVP</p>
              <p className="mt-1 text-sm text-gray-700">
                {[...mvpTally.counts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([pid, count]) => {
                    const p = participants.find((x) => x.player_id === pid)
                    return `${p ? p.nickname ?? p.name : '?'} (${count})`
                  })
                  .join(' · ')}
              </p>
              {mvpTally.top.length > 1 && (
                <p className="mt-1 text-xs text-yellow-600">
                  ⚠️ Parimerito MVP tra{' '}
                  {mvpTally.top
                    .map((pid) => {
                      const p = participants.find((x) => x.player_id === pid)
                      return p ? p.nickname ?? p.name : '?'
                    })
                    .join(', ')}
                  : scegli tu l'MVP nelle pagelle prima di pubblicare.
                </p>
              )}
            </div>
          )}

          {match.voting_open && (
            <p className="mt-2 text-center text-xs text-purple-500 animate-pulse">
              Votazioni in corso...
            </p>
          )}
        </div>
      )}

      {/* ===== PAGELLE ===== */}
      {/* Visibile solo dopo aver salvato il risultato della partita. */}
      {matchPlayers.length > 0 && result && (
        <div className="mt-4">
          <h2 className="font-medium text-field-green-dark">Pagelle</h2>
          <div className="mt-2 space-y-3">
            {matchPlayers.map((mp) => {
              const draft = drafts[mp.player_id]
              if (!draft) return null
              return (
                <div key={mp.id} className="rounded-xl bg-white p-3 shadow">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{mp.nickname ?? mp.name}</p>
                    <label className="flex items-center gap-1 text-xs text-field-orange">
                      <input
                        type="radio"
                        name="mvp"
                        checked={draft.is_mvp}
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
                        onChange={(e) => updateDraft(mp.player_id, { voto: e.target.value })}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      {(() => {
                        const avg = averages.find((a) => a.player_id === mp.player_id)
                        return avg?.average !== null && avg?.average !== undefined ? (
                          <button
                            type="button"
                            onClick={() => updateDraft(mp.player_id, { voto: formatVote(avg.average!) })}
                            className="text-[10px] text-purple-600 hover:underline text-left"
                          >
                            Media: {formatVote(avg.average!)} →
                          </button>
                        ) : null
                      })()}
                    </div>
                    <input
                      placeholder="Titolo"
                      value={draft.titolo}
                      onChange={(e) => updateDraft(mp.player_id, { titolo: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <textarea
                    placeholder="Descrizione"
                    value={draft.descrizione}
                    onChange={(e) => updateDraft(mp.player_id, { descrizione: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    rows={2}
                  />
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex gap-2">
            {!isPublished && (
              <button
                onClick={handleSaveDraft}
                disabled={savingPagelle}
                className="flex-1 rounded-lg border border-field-green px-4 py-2 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
              >
                {savingPagelle ? 'Salvataggio...' : 'Salva bozza'}
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={publishing || match.voting_open}
              title={match.voting_open ? 'Chiudi prima le votazioni prima di pubblicare' : undefined}
              className="flex-1 rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishing ? 'Pubblicazione...' : 'Pubblica pagelle'}
            </button>
          </div>
          {match.voting_open && (
            <p className="mt-2 text-xs text-red-500">
              ⚠️ Chiudi le votazioni prima di pubblicare le pagelle.
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
