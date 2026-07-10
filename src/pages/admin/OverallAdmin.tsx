import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'
import { useFasce } from '../../hooks/useFasce'
import { fasciaForOverall, fasciaLabel, rangeForOverall } from '../../lib/fasce'

interface Row {
  id: string
  name: string
  surname: string | null
  nickname: string | null
  overall: number
  savedOverall: number
}

/**
 * Gestione manuale dell'overall di tutti i giocatori (solo admin).
 * L'overall non viene più ricalcolato automaticamente dalle statistiche:
 * questo è l'unico punto (insieme alla scheda giocatore) dove cambia,
 * e ogni modifica viene registrata nel registro attività.
 */
export default function OverallAdmin() {
  const { fasce } = useFasce()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [playersRes, ratingsRes] = await Promise.all([
        supabase.from('players').select('id, name, surname, nickname').order('name'),
        supabase.from('ratings').select('player_id, rating_value'),
      ])
      if (playersRes.error) {
        setError(playersRes.error.message)
        setLoading(false)
        return
      }
      const ratingMap = new Map(
        (ratingsRes.data ?? []).map((r) => [r.player_id, Math.round(Number(r.rating_value))]),
      )
      setRows(
        (playersRes.data ?? []).map((p) => {
          const overall = ratingMap.get(p.id) ?? 50
          return { ...p, overall, savedOverall: overall }
        }),
      )
      setLoading(false)
    }
    load()
  }, [])

  function updateOverall(id: string, value: number) {
    setSavedId(null)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, overall: value } : r)))
  }

  async function handleSave(row: Row) {
    const val = Math.min(100, Math.max(1, Math.round(row.overall)))
    setSavingId(row.id)
    setSavedId(null)
    setError(null)

    const { error: upsertError } = await supabase
      .from('ratings')
      .upsert(
        { player_id: row.id, rating_value: val, fascia: fasciaForOverall(val, fasce), updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      )
    setSavingId(null)
    if (upsertError) {
      setError(upsertError.message)
      return
    }

    logActivity('overall_modificato', {
      playerId: row.id,
      giocatore: `${row.name}${row.surname ? ` ${row.surname}` : ''}`,
      modifiche: [{ campo: 'Overall', da: String(row.savedOverall), a: String(val) }],
    })
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, overall: val, savedOverall: val } : r)),
    )
    setSavedId(row.id)
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">Gestione overall</h1>
      <p className="mt-1 text-sm text-gray-500">
        L'overall dei giocatori si modifica solo manualmente da qui (o dalla scheda giocatore).
        Ogni modifica viene registrata nel registro attività.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        {rows.map((row) => {
          const dirty = Math.round(row.overall) !== row.savedOverall
          return (
            <div key={row.id} className="rounded-xl bg-white p-3 shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.name}
                    {row.surname && ` ${row.surname}`}
                  </p>
                  {row.nickname && <p className="truncate text-xs text-gray-500">{row.nickname}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-field-green/10 px-2 py-0.5 text-xs font-bold text-field-green-dark">
                  Fascia {fasciaLabel(rangeForOverall(Math.min(100, Math.max(1, Math.round(row.overall) || 1)), fasce))}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={row.overall}
                  onChange={(e) => updateOverall(row.id, Number(e.target.value))}
                  className="w-20 shrink-0 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-bold"
                />
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={Math.min(100, Math.max(1, row.overall || 1))}
                  onChange={(e) => updateOverall(row.id, Number(e.target.value))}
                  className="min-w-0 flex-1 accent-field-green-dark"
                />
                <button
                  onClick={() => handleSave(row)}
                  disabled={savingId === row.id || !dirty}
                  className="shrink-0 rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-40"
                >
                  {savingId === row.id ? '...' : savedId === row.id && !dirty ? '✓' : 'Salva'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
