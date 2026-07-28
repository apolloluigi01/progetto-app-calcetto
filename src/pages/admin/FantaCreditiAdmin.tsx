import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logActivity, type FieldChange } from '../../lib/activityLog'
import { DEFAULT_FASCE, fasciaLabel, getFasce, invalidateFasceCache, type FasciaRange } from '../../lib/fasce'
import { FANTA_TEAM_SIZE } from '../../lib/fantacalcetto'
import EditButton from '../../components/EditButton'

// Anteprima colore della carta, coerente con FasceAdmin e i template di PlayerCard.
const TIER_SWATCH: Record<string, string> = {
  bronzo: 'bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600',
  argento: 'bg-gradient-to-br from-gray-100 via-gray-300 to-gray-400',
  oro: 'bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-500',
  blu: 'bg-gradient-to-br from-blue-950 via-indigo-800 to-blue-950',
  viola: 'bg-gradient-to-br from-purple-950 via-fuchsia-900 to-indigo-950',
}

/**
 * Gestione dei crediti fantacalcetto (solo admin): costo dei giocatori per
 * fascia/carta (fascia_settings.credit_cost). Il budget del fantallenatore
 * non è più manutenuto qui: è dinamico e si ricalcola a ogni giornata sulle
 * squadre in campo (vedi computeFantaBudget). I costi valgono per le
 * formazioni da schierare: le giornate già schierate e calcolate non vengono
 * toccate.
 */
export default function FantaCreditiAdmin() {
  const { player } = useAuth()
  const [rows, setRows] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [initial, setInitial] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // I costi partono in sola lettura: si entra in modifica col tasto dedicato.
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    getFasce(true).then((f) => {
      setRows(f)
      setInitial(f)
      setLoading(false)
    })
  }, [])

  function updateCost(id: number, value: number) {
    setSaved(false)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, creditCost: value } : r)))
  }

  const validationError = (() => {
    for (const r of rows) {
      if (isNaN(r.creditCost)) return 'Inserisci un valore numerico per ogni fascia.'
      if (!Number.isInteger(r.creditCost)) return `Il costo della carta "${r.cardLabel}" deve essere un numero intero.`
      if (r.creditCost < 1) return `Il costo della carta "${r.cardLabel}" deve essere almeno 1 credito.`
    }
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].creditCost < rows[i - 1].creditCost)
        return `La carta "${rows[i].cardLabel}" non può costare meno della carta "${rows[i - 1].cardLabel}".`
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
          credit_cost: r.creditCost,
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
        return before && before.creditCost !== r.creditCost
      })
      .map((r) => {
        const before = initial.find((i) => i.id === r.id)!
        return {
          campo: `Carta ${r.cardLabel} (fascia ${fasciaLabel(r)})`,
          da: `${before.creditCost} cr`,
          a: `${r.creditCost} cr`,
        }
      })
    if (modifiche.length > 0) {
      logActivity('fanta_crediti_modificati', { modifiche })
    }

    invalidateFasceCache()
    setInitial(rows)
    setSaved(true)
    setEditing(false)
  }

  function handleCancel() {
    setRows(initial)
    setError(null)
    setSaved(false)
    setEditing(false)
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">Gestione crediti Fantacalcetto</h1>
      <p className="mt-1 text-sm text-gray-500">
        Costo in crediti dei giocatori per ogni fascia/carta: questi valori determinano come si
        compone la rosa quando si schiera la formazione.
      </p>

      {/* Budget dinamico (informativo) */}
      <div className="mt-4 rounded-xl border border-field-green/20 bg-field-green/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg">💰</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-700">Budget fantallenatore (dinamico)</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Il budget non si imposta più a mano: si ricalcola in automatico a ogni giornata come
              media del costo in crediti dei {FANTA_TEAM_SIZE * 2} giocatori in campo, moltiplicata
              per {FANTA_TEAM_SIZE} (i giocatori da schierare) e diminuita di 1. Cambia da sé ogni
              volta che cambiano le squadre o i costi qui sotto.
            </p>
          </div>
        </div>
      </div>

      {/* Modifica costi */}
      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        {!editing && (
          <div className="flex justify-end">
            <EditButton onClick={() => { setSaved(false); setEditing(true) }}>Modifica crediti</EditButton>
          </div>
        )}

        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className={`h-6 w-6 shrink-0 rounded ${TIER_SWATCH[r.tier] ?? 'bg-gray-200'}`} />
            <div className="min-w-0 flex-1">
              <label className="block text-sm font-medium text-gray-700">Carta {r.cardLabel}</label>
              <p className="text-xs text-gray-400">
                Fascia {fasciaLabel(r)} · overall {r.min}-{r.max}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min={1}
                value={isNaN(r.creditCost) ? '' : r.creditCost}
                disabled={!editing}
                onChange={(e) => updateCost(r.id, Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-semibold disabled:bg-gray-100 disabled:text-gray-500"
              />
              <span className="text-sm text-gray-400">crediti</span>
            </div>
          </div>
        ))}

        {editing && validationError && <p className="text-xs text-red-500">{validationError}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">✓ Crediti salvati.</p>}

        {editing && (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !!validationError}
              className="flex-1 rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : 'Salva crediti'}
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        I costi (e quindi il budget dinamico che ne deriva) valgono per le formazioni non ancora
        schierate; le giornate già schierate e calcolate restano come sono. Ogni modifica viene
        registrata nel registro attività.
      </p>
    </div>
  )
}
