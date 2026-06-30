import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOrCreateCurrentSeason } from '../lib/seasons'
import { getKnownFields } from '../lib/fields'
import { logActivity } from '../lib/activityLog'
import type { Player, Team } from '../types/database'

export default function PartitaForm() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[]>([])
  const [knownFields, setKnownFields] = useState<string[]>([])
  const [matchDate, setMatchDate] = useState('')
  const [matchTime, setMatchTime] = useState('')
  const [field, setField] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data }) => setPlayers((data ?? []) as Player[]))
    getKnownFields().then(setKnownFields)
  }, [])

  function toggleSelected(playerId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
        setTeams((t) => {
          const copy = { ...t }
          delete copy[playerId]
          return copy
        })
      } else {
        next.add(playerId)
        setTeams((t) => ({ ...t, [playerId]: 'A' }))
      }
      return next
    })
  }

  function toggleTeam(playerId: string) {
    setTeams((prev) => ({ ...prev, [playerId]: prev[playerId] === 'A' ? 'B' : 'A' }))
  }

  const selectedIds = Array.from(selected)
  const teamACount = selectedIds.filter((id) => teams[id] === 'A').length
  const teamBCount = selectedIds.filter((id) => teams[id] === 'B').length
  const canSubmit = matchDate && selectedIds.length === 10 && teamACount === 5 && teamBCount === 5

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    try {
      const seasonId = await getOrCreateCurrentSeason()

      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          season_id: seasonId,
          match_date: matchDate,
          match_time: matchTime || null,
          field: field || null,
          status: 'draft',
        })
        .select('id')
        .single()

      if (matchError || !match) throw new Error(matchError?.message ?? 'Errore creazione partita')

      const rows = selectedIds.map((playerId) => ({
        match_id: match.id,
        player_id: playerId,
        team: teams[playerId],
      }))

      const { error: playersError } = await supabase.from('match_players').insert(rows)
      if (playersError) throw new Error(playersError.message)

      logActivity('partita_creata', { matchId: match.id, data: matchDate, campo: field || null })
      navigate(`/partite/${match.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore imprevisto')
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Nuova Partita</h1>

      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Data</label>
          <input
            type="date"
            required
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ora (opzionale)</label>
          <input
            type="time"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Campo (opzionale)</label>
          <input
            value={field}
            onChange={(e) => setField(e.target.value)}
            list="campi-noti"
            placeholder="Es. Centro Sportivo Comunale"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <datalist id="campi-noti">
            {knownFields.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium">
          Giocatori presenti ({selectedIds.length}/10)
        </h2>
        <div className="mt-2 space-y-1">
          {players.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelected(p.id)}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      {selectedIds.length === 10 && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium">
            Squadre (A: {teamACount}/5 — B: {teamBCount}/5)
          </h2>
          <div className="mt-2 space-y-1">
            {selectedIds.map((id) => {
              const player = players.find((p) => p.id === id)
              return (
                <div key={id} className="flex items-center justify-between py-1">
                  <span>{player?.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleTeam(id)}
                    className={`rounded-lg px-3 py-1 text-sm font-medium ${
                      teams[id] === 'A' ? 'bg-field-green text-white' : 'bg-field-orange text-white'
                    }`}
                  >
                    Squadra {teams[id]}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
      >
        {submitting ? 'Creazione...' : 'Crea partita'}
      </button>
    </div>
  )
}
