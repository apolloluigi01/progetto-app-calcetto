import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMatchDetail } from '../hooks/useMatchDetail'
import { getKnownFields } from '../lib/fields'
import type { Team } from '../types/database'

interface PagellaDraft {
  voto: string
  titolo: string
  descrizione: string
  is_mvp: boolean
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const { data, loading, error, refetch } = useMatchDetail(id)

  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [savingResult, setSavingResult] = useState(false)

  const [editingInfo, setEditingInfo] = useState(false)
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [field, setField] = useState('')
  const [knownFields, setKnownFields] = useState<string[]>([])
  const [savingInfo, setSavingInfo] = useState(false)

  const [newGoalPlayer, setNewGoalPlayer] = useState<Record<Team, string>>({ A: '', B: '' })
  const [ownGoal, setOwnGoal] = useState<Record<Team, boolean>>({ A: false, B: false })

  const [drafts, setDrafts] = useState<Record<string, PagellaDraft>>({})
  const [savingPagelle, setSavingPagelle] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    getKnownFields().then(setKnownFields)
  }, [isAdmin])

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

  const { match, matchPlayers, goals, result, pagelle } = data
  const teamA = matchPlayers.filter((p) => p.team === 'A')
  const teamB = matchPlayers.filter((p) => p.team === 'B')
  const goalsByTeam = (team: Team) => goals.filter((g) => g.team === team)

  async function handleSaveResult() {
    if (!id) return
    setSavingResult(true)
    await supabase
      .from('match_results')
      .upsert({ match_id: id, score_a: Number(scoreA) || 0, score_b: Number(scoreB) || 0 }, { onConflict: 'match_id' })
    await supabase.from('matches').update({ status: 'completed' }).eq('id', id)
    setSavingResult(false)
    refetch()
  }

  async function handleSaveInfo() {
    if (!id) return
    setSavingInfo(true)
    await supabase
      .from('matches')
      .update({ match_date: matchDate, match_time: matchTime || null, field: field || null })
      .eq('id', id)
    setSavingInfo(false)
    setEditingInfo(false)
    refetch()
  }

  async function handleAddGoal(team: Team) {
    if (!id || !newGoalPlayer[team]) return
    await supabase
      .from('goals')
      .insert({ match_id: id, player_id: newGoalPlayer[team], team, is_own_goal: ownGoal[team] })
    setNewGoalPlayer((prev) => ({ ...prev, [team]: '' }))
    setOwnGoal((prev) => ({ ...prev, [team]: false }))
    refetch()
  }

  async function handleRemoveGoal(goalId: string) {
    await supabase.from('goals').delete().eq('id', goalId)
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
    refetch()
  }

  async function handlePublish() {
    if (
      !confirm(
        'Pubblicare le pagelle? Diventeranno visibili a tutti i giocatori e verrà inviata una mail a tutti i partecipanti con risultato, marcatori e pagelle.'
      )
    )
      return
    setPublishing(true)
    await supabase.from('pagelle').upsert(buildPagelleRows(true), { onConflict: 'match_id,player_id' })
    await supabase.functions.invoke('notify-match-published', { body: { matchId: id } })
    setPublishing(false)
    refetch()
  }

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

      {!editingInfo && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {match.match_time && `${match.match_time.slice(0, 5)} · `}
            {match.field || 'Campo non specificato'}
          </p>
          {isAdmin && (
            <button
              onClick={() => setEditingInfo(true)}
              className="text-xs text-field-green underline"
            >
              Modifica
            </button>
          )}
        </div>
      )}

      {isAdmin && editingInfo && (
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
          <div className="flex gap-2">
            <button
              onClick={() => setEditingInfo(false)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
            >
              Annulla
            </button>
            <button
              onClick={handleSaveInfo}
              disabled={savingInfo || !matchDate}
              className="flex-1 rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {savingInfo ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}

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

      {!isAdmin && (
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
      )}

      {isAdmin && (
        <>
          <div className="mt-4 rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium">Risultato</h2>
            <div className="mt-2 flex items-center gap-3">
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
                disabled={savingResult}
                className="ml-auto rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
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
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {(['A', 'B'] as Team[]).map((team) => (
              <div key={team} className="rounded-xl bg-white p-3 shadow">
                <h3 className="mb-2 font-medium text-field-green-dark">Marcatori Squadra {team}</h3>
                <ul className="space-y-1 text-sm">
                  {goalsByTeam(team).map((g) => (
                    <li key={g.id} className="flex items-center justify-between">
                      <span>
                        ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                      </span>
                      <button onClick={() => handleRemoveGoal(g.id)} className="text-xs text-red-600">
                        Rimuovi
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <select
                    value={newGoalPlayer[team]}
                    onChange={(e) => setNewGoalPlayer((prev) => ({ ...prev, [team]: e.target.value }))}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="">Giocatore...</option>
                    {(ownGoal[team] ? (team === 'A' ? teamB : teamA) : team === 'A' ? teamA : teamB).map((p) => (
                      <option key={p.player_id} value={p.player_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAddGoal(team)}
                    disabled={!newGoalPlayer[team]}
                    className="rounded-lg bg-field-green px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    + Gol
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-1 text-xs text-red-600">
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
              </div>
            ))}
          </div>

          <div className="mt-4">
            <h2 className="font-medium text-field-green-dark">Pagelle</h2>
            <div className="mt-2 space-y-3">
              {matchPlayers.map((mp) => {
                const draft = drafts[mp.player_id]
                if (!draft) return null
                return (
                  <div key={mp.id} className="rounded-xl bg-white p-3 shadow">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{mp.name}</p>
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
                      <input
                        placeholder="Voto (es. 7+)"
                        value={draft.voto}
                        onChange={(e) => updateDraft(mp.player_id, { voto: e.target.value })}
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
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
              <button
                onClick={handleSaveDraft}
                disabled={savingPagelle}
                className="flex-1 rounded-lg border border-field-green px-4 py-2 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50"
              >
                {savingPagelle ? 'Salvataggio...' : 'Salva bozza'}
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex-1 rounded-lg bg-field-orange px-4 py-2 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-50"
              >
                {publishing ? 'Pubblicazione...' : 'Pubblica pagelle'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
