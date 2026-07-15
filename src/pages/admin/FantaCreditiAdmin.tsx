import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logActivity, type FieldChange } from '../../lib/activityLog'
import { DEFAULT_FASCE, fasciaLabel, getFasce, invalidateFasceCache, type FasciaRange } from '../../lib/fasce'
import { FANTA_BUDGET } from '../../lib/fantacalcetto'

// Anteprima colore della carta, coerente con FasceAdmin e i template di PlayerCard.
const TIER_SWATCH: Record<string, string> = {
  bronzo: 'bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600',
  argento: 'bg-gradient-to-br from-gray-100 via-gray-300 to-gray-400',
  oro: 'bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-500',
  blu: 'bg-gradient-to-br from-blue-950 via-indigo-800 to-blue-950',
  viola: 'bg-gradient-to-br from-purple-950 via-fuchsia-900 to-indigo-950',
}

/**
 * Gestione dei costi in crediti fantacalcetto per fascia/carta (solo admin).
 * I valori vivono su fascia_settings.credit_cost e determinano quanto costa
 * ogni giocatore quando i partecipanti schierano la formazione.
 */
export default function FantaCreditiAdmin() {
  const { player } = useAuth()
  const [rows, setRows] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [initial, setInitial] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (r.creditCost > FANTA_BUDGET)
        return `Il costo della carta "${r.cardLabel}" supera il budget di ${FANTA_BUDGET} crediti: nessuno potrebbe acquistarla.`
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
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">Gestione crediti Fantacalcetto</h1>
      <p className="mt-1 text-sm text-gray-500">
        Costo in crediti dei giocatori per ogni fascia/carta. I partecipanti al fantacalcetto hanno
        un budget di {FANTA_BUDGET} crediti per schierare la formazione: questi valori determinano
        quanto costa ogni giocatore in base alla sua fascia.
      </p>

      {/* Modifica costi */}
      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
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
                max={FANTA_BUDGET}
                value={isNaN(r.creditCost) ? '' : r.creditCost}
                onChange={(e) => updateCost(r.id, Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-center font-semibold"
              />
              <span className="text-sm text-gray-400">crediti</span>
            </div>
          </div>
        ))}

        {validationError && <p className="text-xs text-red-500">{validationError}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">✓ Crediti salvati.</p>}

        <button
          onClick={handleSave}
          disabled={saving || !!validationError}
          className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva crediti'}
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        I nuovi costi valgono per le formazioni non ancora schierate; le formazioni già salvate non
        vengono toccate. Ogni modifica viene registrata nel registro attività.
      </p>
    </div>
  )
}
