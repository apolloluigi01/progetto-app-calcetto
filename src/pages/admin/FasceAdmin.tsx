import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logActivity, type FieldChange } from '../../lib/activityLog'
import EditButton from '../../components/EditButton'
import { DEFAULT_FASCE, fasciaLabel, getFasce, invalidateFasceCache, type FasciaRange } from '../../lib/fasce'

// Anteprima colore della carta nella leggenda, coerente con i template di PlayerCard.
const TIER_SWATCH: Record<string, string> = {
  bronzo: 'bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600',
  argento: 'bg-gradient-to-br from-gray-100 via-gray-300 to-gray-400',
  oro: 'bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-500',
  blu: 'bg-gradient-to-br from-blue-950 via-indigo-800 to-blue-950',
  viola: 'bg-gradient-to-br from-purple-950 via-fuchsia-900 to-indigo-950',
}

/**
 * Gestione dei range overall -> fascia/carta (solo admin), come per i
 * parametri del fantacalcetto: i valori vivono su fascia_settings e ogni
 * modifica viene registrata nel registro attività.
 */
export default function FasceAdmin() {
  const { player } = useAuth()
  const [rows, setRows] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [initial, setInitial] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    getFasce(true).then((f) => {
      setRows(f)
      setInitial(f)
      setLoading(false)
    })
  }, [])

  function updateRow(id: number, patch: Partial<Pick<FasciaRange, 'min' | 'max'>>) {
    setSaved(false)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  // I range devono coprire 0-100 senza buchi né sovrapposizioni.
  const validationError = (() => {
    for (const r of rows) {
      if (isNaN(r.min) || isNaN(r.max)) return 'Inserisci un valore numerico per ogni range.'
      if (r.min > r.max) return `Nel range "${r.cardLabel}" il minimo supera il massimo.`
      if (r.min < 0 || r.max > 100) return 'I valori devono essere compresi tra 0 e 100.'
    }
    if (rows[0].min !== 0) return 'Il primo range deve partire da 0.'
    if (rows[rows.length - 1].max !== 100) return "L'ultimo range deve arrivare a 100."
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].min !== rows[i - 1].max + 1)
        return `Il range "${rows[i].cardLabel}" deve iniziare da ${rows[i - 1].max + 1} (subito dopo "${rows[i - 1].cardLabel}").`
    }
    return null
  })()

  async function handleSave() {
    if (validationError) return
    setSaving(true)
    setSaved(false)
    setError(null)

    for (const r of rows) {
      const { error: updError } = await supabase
        .from('fascia_settings')
        .update({
          min_overall: r.min,
          max_overall: r.max,
          updated_at: new Date().toISOString(),
          updated_by: player?.id ?? null,
        })
        .eq('id', r.id)
      if (updError) {
        setSaving(false)
        setError(updError.message)
        return
      }
    }
    setSaving(false)

    const modifiche: FieldChange[] = rows
      .filter((r) => {
        const before = initial.find((i) => i.id === r.id)
        return before && (before.min !== r.min || before.max !== r.max)
      })
      .map((r) => {
        const before = initial.find((i) => i.id === r.id)!
        return {
          campo: `Carta ${r.cardLabel} (fascia ${fasciaLabel(r)})`,
          da: `${before.min}-${before.max}`,
          a: `${r.min}-${r.max}`,
        }
      })
    if (modifiche.length > 0) {
      logActivity('fasce_modificate', { modifiche })
    }

    invalidateFasceCache()
    setInitial(rows)
    setSaved(true)
    setEditing(false)
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">Gestione Fasce</h1>
      <p className="mt-1 text-sm text-gray-500">
        Range di overall che determinano fascia e carta di ogni giocatore. Le modifiche valgono per
        carte, generazione squadre e costi in crediti del fantacalcetto. Se cambi i range, ricordati
        di ricalcolare le squadre delle partite non ancora giocate.
      </p>

      {/* Range: sola lettura finché non si clicca Modifica */}
      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-field-green-dark">Range overall → carta</h2>
          {!editing && <EditButton onClick={() => { setSaved(false); setEditing(true) }} />}
        </div>

        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:flex-1">
              <span className={`h-6 w-6 shrink-0 rounded ${TIER_SWATCH[r.tier] ?? 'bg-gray-200'}`} />
              <div>
                <label className="block text-sm font-medium text-gray-700">Carta {r.cardLabel}</label>
                <p className="text-xs text-gray-400">Fascia {fasciaLabel(r)}</p>
              </div>
            </div>
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={isNaN(r.min) ? '' : r.min}
                  onChange={(e) => updateRow(r.id, { min: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-semibold"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={isNaN(r.max) ? '' : r.max}
                  onChange={(e) => updateRow(r.id, { max: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-semibold"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 font-semibold text-gray-700">
                <span className="w-20 text-center">{r.min}</span>
                <span className="text-gray-400">→</span>
                <span className="w-20 text-center">{r.max}</span>
              </div>
            )}
          </div>
        ))}

        {editing && validationError && <p className="text-xs text-red-500">{validationError}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !editing && <p className="text-sm text-green-700">✓ Fasce salvate.</p>}

        {editing && (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !!validationError}
              className="flex-1 rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva fasce'}
            </button>
            <button
              onClick={() => {
                setRows(initial)
                setError(null)
                setEditing(false)
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Annulla
            </button>
          </div>
        )}
      </div>

      {/* Leggenda */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Leggenda</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Range overall</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fascia</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Carta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-semibold text-gray-700">
                  {r.min} - {r.max}
                </td>
                <td className="px-4 py-2.5 text-gray-700">Fascia {fasciaLabel(r)}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-4 w-4 rounded ${TIER_SWATCH[r.tier] ?? 'bg-gray-200'}`} />
                    <span className="text-gray-700">Carta {r.cardLabel}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Ogni modifica ai range viene registrata nel registro attività.
      </p>
    </div>
  )
}
