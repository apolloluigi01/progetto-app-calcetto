import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { useMatchVoting } from '../hooks/useMatchVoting'
import { formatVote, formatExact } from '../lib/voting'
import { logActivity } from '../lib/activityLog'
import PlayerName, { fullName } from '../components/PlayerName'
import ScorerBadges from '../components/ScorerBadges'
import { aggregateScorers } from '../lib/scorers'
import type { Team } from '../types/database'

interface PagellaDraft {
  voto: string
  titolo: string
  descrizione: string
  is_mvp: boolean
}

/**
 * Pagina dedicata di Votazioni e Pagelle, raggiungibile dalla schermata partita.
 * - Giocatori: vedono e compilano SOLO i propri voti (non vedono i voti altrui
 *   né la schermata di compilazione delle pagelle).
 * - Admin/superadmin: oltre a votare, gestiscono l'apertura/chiusura delle
 *   votazioni, vedono il dettaglio voti, la media/MVP e compilano le pagelle.
 */
export default function MatchVoting() {
  const { id } = useParams<{ id: string }>()
  const { player, isAdmin, isSuperAdmin } = useAuth()
  const { data, loading, error, refetch } = useMatchDetail(id)
  const {
    votes,
    participants,
    voterInfo,
    averages,
    provisionalMvpId,
    voterIds,
    adminVoterIds,
    allAdminVotersVoted,
    getMyVotes,
    hasVotedAll,
    submitVotes,
    refetch: refetchVoting,
  } = useMatchVoting(id)

  // --- Voto del giocatore (proprio) ---
  const [localVotes, setLocalVotes] = useState<Record<string, number>>({})
  const [votingBusy, setVotingBusy] = useState(false)
  const [votingSuccess, setVotingSuccess] = useState(false)

  // --- Gestione admin ---
  const [openingVoting, setOpeningVoting] = useState(false)
  const [closingVoting, setClosingVoting] = useState(false)
  const [showVoteDetail, setShowVoteDetail] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, PagellaDraft>>({})
  const [savingPagelle, setSavingPagelle] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const isManager = isAdmin || isSuperAdmin

  useEffect(() => {
    if (!player?.id || participants.length === 0) return
    const existing = getMyVotes(player.id)
    const defaults: Record<string, number> = {}
    for (const p of participants) {
      defaults[p.player_id] = existing[p.player_id] ?? 6
    }
    setLocalVotes(defaults)
  }, [player?.id, participants.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return
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

  async function handleSubmitVotes() {
    if (!player?.id) return
    setVotingBusy(true)
    setVotingSuccess(false)
    await submitVotes(player.id, localVotes)
    setVotingBusy(false)
    setVotingSuccess(true)
    setTimeout(() => setVotingSuccess(false), 3000)
  }

  async function handleOpenVoting() {
    if (!id) return
    setOpeningVoting(true)
    await supabase.from('matches').update({ voting_open: true }).eq('id', id)
    logActivity('votazioni_aperte', { matchId: id })
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
    logActivity('votazioni_chiuse', { matchId: id })
    setClosingVoting(false)
    refetch()
    refetchVoting()
  }

  function updateDraft(playerId: string, patch: Partial<PagellaDraft>) {
    setDrafts((prev) => ({ ...prev, [playerId]: { ...prev[playerId], ...patch } }))
  }

  function setMvp(playerId: string) {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const pid of Object.keys(next)) next[pid] = { ...next[pid], is_mvp: pid === playerId }
      return next
    })
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
        for (const pid of Object.keys(next)) next[pid] = { ...next[pid], is_mvp: pid === provisionalMvpId }
      }
      return next
    })
  }

  function buildPagelleRows(publish: boolean) {
    if (!data) return []
    return data.matchPlayers.map((mp) => ({
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
    logActivity('pagelle_bozza', { matchId: id })
    refetch()
  }

  async function handlePublish() {
    if (!data) return
    if (!data.result) {
      alert('Salva prima il risultato della partita (in Modifica partita): le pagelle non possono essere pubblicate senza un risultato.')
      return
    }
    if (!goalsCoherent) {
      alert('I gol registrati non coincidono con il risultato: correggi i marcatori o il risultato in Modifica partita prima di pubblicare.')
      return
    }
    const incomplete = data.matchPlayers.filter((mp) => {
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
    const mvpCount = data.matchPlayers.filter((mp) => drafts[mp.player_id]?.is_mvp).length
    if (mvpCount !== 1) {
      alert('Seleziona un MVP prima di pubblicare le pagelle.')
      return
    }
    if (match.voting_open) {
      alert('Chiudi prima le votazioni: le pagelle non si pubblicano con le votazioni ancora aperte.')
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
    logActivity('pagelle_pubblicate', { matchId: id })
    setPublishing(false)
    refetch()
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !data) return <div className="p-4 text-sm text-red-600">{error ?? 'Partita non trovata'}</div>

  const { match, matchPlayers, goals, assists, result, pagelle } = data
  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)
  const goalsCoherent =
    !!result && goalsByTeam('A').length === result.score_a && goalsByTeam('B').length === result.score_b
  const statsConfirmed = !!match.stats_confirmed_at
  const isPublished = pagelle.length > 0 && pagelle.every((p) => p.published_at)
  const votingReady = !!result && goalsCoherent && statsConfirmed

  const adminVoters = participants.filter((p) => p.role === 'admin' || p.role === 'superadmin')
  const isParticipant = !!player && participants.some((p) => p.player_id === player.id)
  const canVote = isParticipant || (isSuperAdmin && adminVoters.length === 0)
  const isAdminVoter = !!player && adminVoterIds.includes(player.id)
  const alreadyVotedAll = player ? hasVotedAll(player.id) : false

  return (
    <div className="p-4 pb-12">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-field-green-dark">Votazioni e pagelle</h1>
        <Link
          to={`/partite/${id}`}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← Partita
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {new Date(match.match_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
        {result && ` · ${result.score_a} - ${result.score_b}`}
      </p>

      {/* ===== VOTO DEL GIOCATORE ===== */}
      {match.voting_open && canVote && participants.length > 0 ? (
        <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <h3 className="font-semibold text-purple-800">🗳️ Vota i giocatori</h3>
          <p className="mt-1 text-xs text-purple-500">
            Dai un voto da 1 a 10 (con mezzi voti) per ogni giocatore della partita, te compreso.
            {isAdminVoter && ' In quanto admin che ha giocato, il tuo voto è obbligatorio.'}
          </p>

          <div className="mt-3 space-y-3">
            {participants.map((p) => {
              const v = localVotes[p.player_id] ?? 6
              return (
                <div key={p.player_id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-sm font-medium text-gray-800">
                    <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} />
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={v}
                    onChange={(e) =>
                      setLocalVotes((prev) => ({ ...prev, [p.player_id]: Number(e.target.value) }))
                    }
                    className="flex-1 accent-purple-600"
                  />
                  <span className="w-8 text-right text-sm font-bold text-purple-700">{formatVote(v)}</span>
                </div>
              )
            })}
          </div>

          {votingSuccess && (
            <p className="mt-3 text-center text-sm font-medium text-purple-700">✓ Voti inviati correttamente!</p>
          )}

          <button
            onClick={handleSubmitVotes}
            disabled={votingBusy || Object.keys(localVotes).length === 0}
            className="mt-4 w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {votingBusy ? 'Invio...' : alreadyVotedAll ? '✓ Aggiorna i tuoi voti' : 'Invia i tuoi voti'}
          </button>
        </div>
      ) : match.voting_open && !canVote ? (
        <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-3 text-center">
          <p className="text-sm text-purple-600">
            🗳️ Le votazioni sono aperte, ma riservate a chi ha partecipato alla partita.
          </p>
        </div>
      ) : !match.voting_open && canVote && !isPublished ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 text-center">
          <p className="text-sm text-gray-500">🗳️ Le votazioni non sono aperte.</p>
        </div>
      ) : null}

      {/* ===== GESTIONE ADMIN ===== */}
      {isManager && (
        <>
          {!votingReady && !isPublished && (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
              Per aprire le votazioni servono: risultato salvato, gol coerenti col risultato e statistiche
              confermate.{' '}
              <Link to={`/admin/partite/${id}`} className="font-medium text-field-green underline">
                Vai a Modifica partita →
              </Link>
            </div>
          )}

          {votingReady && (
            <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-purple-800">Gestione votazioni</h2>
                <span className="text-sm font-medium text-purple-600">
                  {[...voterIds].filter((v) => adminVoterIds.includes(v)).length}/{adminVoterIds.length} admin hanno
                  votato
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!isPublished &&
                  (!match.voting_open ? (
                    <button
                      onClick={handleOpenVoting}
                      disabled={openingVoting}
                      className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
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
                {!isPublished && allAdminVotersVoted && averages.some((a) => a.exact !== null) && (
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
                        <PlayerName
                          name={mp.name}
                          surname={mp.surname}
                          nickname={mp.nickname}
                          nameClassName="text-sm font-medium text-gray-800"
                        />
                        {playerVotes.length === 0 ? (
                          <p className="text-xs text-gray-400">Nessun voto ancora.</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                            {playerVotes.map((v) => {
                              const info = voterInfo.get(v.voter_id)
                              return (
                                <li key={v.voter_id} className="flex items-center justify-between">
                                  <span>{info ? fullName(info) : 'Sconosciuto'}</span>
                                  <span className="font-semibold text-purple-700">{formatVote(v.vote)}</span>
                                </li>
                              )
                            })}
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
                    Media voto (non arrotondata). MVP automatico: media più alta → squadra vincitrice → più bonus
                    (gol+assist) → più gol.
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
                      ⚠️ MVP in parimerito su tutti i criteri: scegli tu l'MVP nelle pagelle prima di pubblicare.
                    </p>
                  )}
                </div>
              ) : (
                !isPublished && (
                  <p className="mt-3 text-center text-xs text-purple-500">
                    La media voto e l'MVP saranno visibili quando tutti gli admin che hanno partecipato avranno
                    votato.
                  </p>
                )
              )}

              {match.voting_open && (
                <p className="mt-2 animate-pulse text-center text-xs text-purple-500">Votazioni in corso...</p>
              )}
            </div>
          )}

          {/* ===== PAGELLE (compilazione admin) ===== */}
          {votingReady && (
            <div className="mt-4">
              <h2 className="font-medium text-field-green-dark">Pagelle</h2>
              {isPublished && (
                <p className="mt-1 rounded-lg bg-field-green/10 px-3 py-2 text-center text-xs font-medium text-field-green-dark">
                  ✓ Pagelle pubblicate: la partita non è più modificabile.
                </p>
              )}
              <div className="mt-2 space-y-3">
                {matchPlayers.map((mp) => {
                  const draft = drafts[mp.player_id]
                  if (!draft) return null
                  const teamGoals = aggregateScorers(goals, assists, mp.team).find(
                    (e) => e.player_id === mp.player_id
                  )
                  return (
                    <div key={mp.id} className="rounded-xl bg-white p-3 shadow">
                      <div className="flex items-center justify-between">
                        <span className="flex min-w-0 items-start gap-1.5 font-medium">
                          <PlayerName name={mp.name} surname={mp.surname} nickname={mp.nickname} />
                          {teamGoals && <ScorerBadges entry={teamGoals} />}
                        </span>
                        <label className="flex shrink-0 items-center gap-1 text-xs text-field-orange">
                          <input
                            type="radio"
                            name="mvp"
                            checked={draft.is_mvp}
                            disabled={isPublished}
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
                            disabled={isPublished}
                            onChange={(e) => updateDraft(mp.player_id, { voto: e.target.value })}
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                          {!isPublished &&
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
                          disabled={isPublished}
                          onChange={(e) => updateDraft(mp.player_id, { titolo: e.target.value })}
                          className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                        />
                      </div>
                      <textarea
                        placeholder="Descrizione"
                        value={draft.descrizione}
                        disabled={isPublished}
                        onChange={(e) => updateDraft(mp.player_id, { descrizione: e.target.value })}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                        rows={2}
                      />
                    </div>
                  )
                })}
              </div>

              {!isPublished && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={handleSaveDraft}
                    disabled={savingPagelle}
                    className="flex-1 rounded-lg border border-field-green px-4 py-2 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
                  >
                    {savingPagelle ? 'Salvataggio...' : '💾 Salva bozza'}
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing || match.voting_open}
                    title={match.voting_open ? 'Chiudi prima le votazioni' : undefined}
                    className="flex-1 rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishing ? 'Pubblicazione...' : '📢 Pubblica pagelle'}
                  </button>
                </div>
              )}
              {!isPublished && match.voting_open && (
                <p className="mt-2 text-xs text-red-500">⚠️ Chiudi le votazioni prima di pubblicare le pagelle.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
