import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { playerFullName } from '../../lib/statistiche'
import type { HonorEntry, HonorKind, Player } from '../../types/database'

interface FormState {
  kind: HonorKind
  season_name: string
  end_date: string
  first_player_id: string
  second_player_id: string
  third_player_id: string
}

const emptyForm: FormState = {
  kind: 'format',
  season_name: '',
  end_date: '',
  first_player_id: '',
  second_player_id: '',
  third_player_id: '',
}

/**
 * Gestione manuale dell'albo d'oro: censimento di stagioni disputate prima
 * dell'esistenza dell'app e dei podi del fantacalcetto.
 */
export default function AlboOroAdmin() {
  const [entries, setEntries] = useState<HonorEntry[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: honors, error: honorsError }, { data: playersData, error: playersError }] =
        await Promise.all([
          supabase.from('honor_entries').select('*').order('end_date', { ascending: false }),
          supabase.from('players').select('*').order('name'),
        ])
      if (honorsError) throw honorsError
      if (playersError) throw playersError
      setEntries((honors ?? []) as HonorEntry[])
      setPlayers((playersData ?? []) as Player[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function playerName(id: string | null) {
    if (!id) return '—'
    const p = players.find((pl) => pl.id === id)
    return p ? playerFullName(p) : '—'
  }

  function startEdit(entry: HonorEntry) {
    setEditingId(entry.id)
    setForm({
      kind: entry.kind,
      season_name: entry.season_name,
      end_date: entry.end_date ?? '',
      first_player_id: entry.first_player_id ?? '',
      second_player_id: entry.second_player_id ?? '',
      third_player_id: entry.third_player_id ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        kind: form.kind,
        season_name: form.season_name.trim(),
        end_date: form.end_date || null,
        first_player_id: form.first_player_id || null,
        second_player_id: form.second_player_id || null,
        third_player_id: form.third_player_id || null,
      }
      if (editingId) {
        const { error } = await supabase.from('honor_entries').update(payload).eq('id', editingId)
        if (error) throw error
        await logActivity('albo_voce_modificata', { stagione: payload.season_name, tipo: payload.kind })
      } else {
        const { error } = await supabase.from('honor_entries').insert(payload)
        if (error) throw error
        await logActivity('albo_voce_creata', { stagione: payload.season_name, tipo: payload.kind })
      }
      cancelEdit()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry: HonorEntry) {
    if (!confirm(`Eliminare la voce "${entry.season_name}" dall'albo d'oro?`)) return
    setError(null)
    try {
      const { error } = await supabase.from('honor_entries').delete().eq('id', entry.id)
      if (error) throw error
      await logActivity('albo_voce_eliminata', { stagione: entry.season_name, tipo: entry.kind })
      if (editingId === entry.id) cancelEdit()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore nell'eliminazione")
    }
  }

  const playerSelect = (
    label: string,
    medal: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {medal} {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
      >
        <option value="">— nessuno —</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {playerFullName(p)}
            {p.nickname ? ` (${p.nickname})` : ''}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">🥇 Gestione Albo d'oro</h1>
      <p className="mt-1 text-sm text-gray-500">
        Censisci manualmente i podi delle stagioni disputate prima dell'app e i podi del
        fantacalcetto. Le stagioni format concluse nell'app compaiono nell'albo automaticamente.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-field-green-dark">
          {editingId ? 'Modifica voce' : 'Nuova voce'}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as HonorKind })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
            >
              <option value="format">🏆 Classifica Format</option>
              <option value="fanta">🎮 Fantacalcetto</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome stagione/edizione
            </label>
            <input
              type="text"
              required
              placeholder="es. 2024/2025"
              value={form.season_name}
              onChange={(e) => setForm({ ...form, season_name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Data conclusione (opzionale)
          </label>
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-field-green focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {playerSelect('1° posto', '🥇', form.first_player_id, (v) =>
            setForm({ ...form, first_player_id: v })
          )}
          {playerSelect('2° posto', '🥈', form.second_player_id, (v) =>
            setForm({ ...form, second_player_id: v })
          )}
          {playerSelect('3° posto', '🥉', form.third_player_id, (v) =>
            setForm({ ...form, third_player_id: v })
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white transition hover:bg-field-green-dark disabled:opacity-60"
          >
            {saving ? 'Salvataggio...' : editingId ? 'Salva modifiche' : 'Aggiungi voce'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Annulla
            </button>
          )}
        </div>
      </form>

      <h2 className="mt-6 font-medium text-field-green-dark">Voci censite a mano</h2>
      {loading && <p className="mt-2 text-sm text-gray-500">Caricamento...</p>}
      {!loading && entries.length === 0 && (
        <p className="mt-2 rounded-xl bg-white p-4 text-sm text-gray-500 shadow">
          Nessuna voce manuale. Le stagioni concluse nell'app compaiono comunque nell'albo d'oro.
        </p>
      )}
      <div className="mt-2 space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl bg-white p-4 shadow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-gray-800">
                  {entry.kind === 'fanta' ? '🎮' : '🏆'} {entry.season_name}
                  <span className="ml-2 text-xs font-normal uppercase text-gray-400">
                    {entry.kind === 'fanta' ? 'Fantacalcetto' : 'Format'}
                  </span>
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  🥇 {playerName(entry.first_player_id)} · 🥈 {playerName(entry.second_player_id)} ·
                  🥉 {playerName(entry.third_player_id)}
                </p>
                {entry.end_date && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    conclusa il {new Date(entry.end_date).toLocaleDateString('it-IT')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(entry)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Modifica
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Elimina
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
