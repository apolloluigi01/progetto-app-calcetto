import { useState } from 'react'
import { createGuestPlayer } from '../lib/guestPlayers'
import type { Player, PlayingPosition } from '../types/database'

const POSITIONS: { value: PlayingPosition; label: string }[] = [
  { value: 'POR', label: 'Portiere' },
  { value: 'DIF', label: 'Difensore' },
  { value: 'CEN', label: 'Centrocampista' },
  { value: 'ATT', label: 'Attaccante' },
]

interface GuestPlayerFormProps {
  matchId: string | null
  onCreated: (player: Player) => void
  onCancel: () => void
}

/** Mini form per aggiungere un giocatore ospite (non anagrafato) a una partita. */
export default function GuestPlayerForm({ matchId, onCreated, onCancel }: GuestPlayerFormProps) {
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [position, setPosition] = useState<PlayingPosition | ''>('')
  const [overall, setOverall] = useState(50)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Il nome è obbligatorio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const player = await createGuestPlayer({
        name,
        surname: surname || null,
        position: position || null,
        overall,
        matchId,
      })
      onCreated(player)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore imprevisto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-field-orange/30 bg-field-orange/5 p-3">
      <h3 className="text-sm font-semibold text-field-orange">Nuovo ospite</h3>
      <div className="mt-2 space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Cognome (opzionale)</label>
          <input
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            placeholder="Cognome"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Posizione (opzionale)</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as PlayingPosition | '')}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">-</option>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Overall</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={100}
              value={overall}
              onChange={(e) => setOverall(Number(e.target.value))}
              className="w-20 shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-bold"
            />
            <input
              type="range"
              min={1}
              max={100}
              value={Math.min(100, Math.max(1, overall || 1))}
              onChange={(e) => setOverall(Number(e.target.value))}
              className="min-w-0 flex-1 accent-field-orange"
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 rounded-lg bg-field-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-field-orange/90 disabled:opacity-50"
        >
          {saving ? 'Aggiunta...' : 'Aggiungi ospite'}
        </button>
      </div>
    </div>
  )
}
