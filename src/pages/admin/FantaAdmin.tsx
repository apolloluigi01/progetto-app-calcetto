import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logActivity, type FieldChange } from '../../lib/activityLog'
import { DEFAULT_FANTA_SETTINGS, type FantaSettings } from '../../lib/fantacalcetto'

interface ParamDef {
  key: keyof FantaSettings
  label: string
  hint: string
  step: string
}

const PARAMS: ParamDef[] = [
  { key: 'bonusMvp', label: 'Bonus MVP', hint: 'Punti aggiunti al giocatore eletto MVP della partita', step: '0.5' },
  { key: 'bonusGol', label: 'Bonus gol', hint: 'Punti per ogni gol segnato', step: '0.5' },
  { key: 'bonusAssist', label: 'Bonus assist', hint: 'Punti per ogni assist', step: '0.5' },
  { key: 'malusAutogol', label: 'Malus autogol', hint: 'Punti (negativi) per ogni autogol', step: '0.5' },
  { key: 'malusPeggiore', label: 'Malus peggior voto', hint: 'Punti (negativi) per il peggior voto in campo', step: '0.5' },
  { key: 'captainMultiplier', label: 'Moltiplicatore capitano', hint: 'I soli bonus del capitano vengono moltiplicati per questo valore (voto base e malus restano invariati)', step: '0.1' },
]

export default function FantaAdmin() {
  const { player } = useAuth()
  const [values, setValues] = useState<Record<keyof FantaSettings, string>>({
    bonusMvp: '', bonusGol: '', bonusAssist: '', malusAutogol: '', malusPeggiore: '', captainMultiplier: '',
  })
  const [initial, setInitial] = useState<FantaSettings>(DEFAULT_FANTA_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('fanta_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        const s: FantaSettings = data
          ? {
              bonusMvp: Number(data.bonus_mvp),
              bonusGol: Number(data.bonus_gol),
              bonusAssist: Number(data.bonus_assist),
              malusAutogol: Number(data.malus_autogol),
              malusPeggiore: Number(data.malus_peggiore),
              captainMultiplier: Number(data.captain_multiplier),
            }
          : DEFAULT_FANTA_SETTINGS
        setInitial(s)
        setValues({
          bonusMvp: String(s.bonusMvp),
          bonusGol: String(s.bonusGol),
          bonusAssist: String(s.bonusAssist),
          malusAutogol: String(s.malusAutogol),
          malusPeggiore: String(s.malusPeggiore),
          captainMultiplier: String(s.captainMultiplier),
        })
        setLoading(false)
      })
  }, [])

  const parsed: Partial<FantaSettings> = {}
  let allValid = true
  for (const p of PARAMS) {
    const n = Number(values[p.key].replace(',', '.'))
    if (values[p.key].trim() === '' || isNaN(n)) {
      allValid = false
    } else {
      parsed[p.key] = n
    }
  }
  if (parsed.captainMultiplier !== undefined && parsed.captainMultiplier <= 0) allValid = false

  async function handleSave() {
    if (!allValid) return
    const next = parsed as FantaSettings
    setSaving(true)
    setSaved(false)
    setError(null)

    const { error: updError } = await supabase
      .from('fanta_settings')
      .update({
        bonus_mvp: next.bonusMvp,
        bonus_gol: next.bonusGol,
        bonus_assist: next.bonusAssist,
        malus_autogol: next.malusAutogol,
        malus_peggiore: next.malusPeggiore,
        captain_multiplier: next.captainMultiplier,
        updated_at: new Date().toISOString(),
        updated_by: player?.id ?? null,
      })
      .eq('id', 1)
    setSaving(false)

    if (updError) {
      setError(updError.message)
      return
    }

    const modifiche: FieldChange[] = PARAMS.filter((p) => initial[p.key] !== next[p.key]).map((p) => ({
      campo: p.label,
      da: String(initial[p.key]),
      a: String(next[p.key]),
    }))
    if (modifiche.length > 0) {
      logActivity('fanta_parametri_modificati', { modifiche })
    }
    setInitial(next)
    setSaved(true)
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">Gestione Fantacalcetto</h1>
      <p className="mt-1 text-sm text-gray-500">
        Parametri bonus/malus usati per il calcolo dei punteggi delle giornate. Le modifiche valgono
        per i prossimi calcoli (e per gli eventuali ricalcoli) delle giornate.
      </p>

      <div className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
        {PARAMS.map((p) => (
          <div key={p.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="sm:flex-1">
              <label className="block text-sm font-medium text-gray-700">{p.label}</label>
              <p className="text-xs text-gray-400">{p.hint}</p>
            </div>
            <input
              type="number"
              step={p.step}
              value={values[p.key]}
              onChange={(e) => {
                setSaved(false)
                setValues((prev) => ({ ...prev, [p.key]: e.target.value }))
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-semibold sm:w-28"
            />
          </div>
        ))}

        {!allValid && (
          <p className="text-xs text-red-500">
            Inserisci un valore numerico per ogni parametro (il moltiplicatore capitano deve essere maggiore di 0).
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-700">✓ Parametri salvati.</p>}

        <button
          onClick={handleSave}
          disabled={saving || !allValid}
          className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva parametri'}
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Ogni modifica ai parametri viene registrata nel registro attività.
      </p>
    </div>
  )
}
