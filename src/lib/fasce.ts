import { supabase } from './supabase'
import type { Fascia } from '../types/database'

export type CardTier = 'bronzo' | 'argento' | 'oro' | 'blu' | 'viola'

/**
 * Range di overall -> fascia e carta. Non sono più hardcodati: vivono
 * nella tabella fascia_settings (una riga per carta) e sono manutenuti
 * dagli admin dalla sezione CDA -> Gestione Fasce.
 */
export interface FasciaRange {
  id: number
  tier: CardTier
  cardLabel: string
  fascia: Fascia
  min: number
  max: number
}

/** Valori di fallback se la configurazione non è raggiungibile. */
export const DEFAULT_FASCE: FasciaRange[] = [
  { id: 1, tier: 'bronzo', cardLabel: 'Bronzo', fascia: 'D', min: 0, max: 59 },
  { id: 2, tier: 'argento', cardLabel: 'Argento', fascia: 'C', min: 60, max: 74 },
  { id: 3, tier: 'oro', cardLabel: 'Oro', fascia: 'B', min: 75, max: 84 },
  { id: 4, tier: 'blu', cardLabel: 'Blu', fascia: 'A', min: 85, max: 94 },
  { id: 5, tier: 'viola', cardLabel: 'Viola', fascia: 'A', min: 95, max: 100 },
]

let cached: FasciaRange[] | null = null
let pending: Promise<FasciaRange[]> | null = null

export async function getFasce(force = false): Promise<FasciaRange[]> {
  if (cached && !force) return cached
  if (pending && !force) return pending
  pending = (async () => {
    const { data } = await supabase
      .from('fascia_settings')
      .select('id, tier, card_label, fascia, min_overall, max_overall')
      .order('min_overall', { ascending: true })
    const rows = (data ?? []).map((r) => ({
      id: r.id as number,
      tier: r.tier as CardTier,
      cardLabel: r.card_label as string,
      fascia: r.fascia as Fascia,
      min: Number(r.min_overall),
      max: Number(r.max_overall),
    }))
    cached = rows.length > 0 ? rows : DEFAULT_FASCE
    pending = null
    return cached
  })()
  return pending
}

/** Invalida la cache locale (dopo un salvataggio dalla Gestione Fasce). */
export function invalidateFasceCache() {
  cached = null
  pending = null
}

export function rangeForOverall(overall: number | null, fasce: FasciaRange[] = DEFAULT_FASCE): FasciaRange {
  const v = overall ?? 0
  const found = fasce.find((f) => v >= f.min && v <= f.max)
  // Fuori range (config incompleta): sotto il minimo -> prima fascia, sopra -> ultima.
  return found ?? (v < fasce[0].min ? fasce[0] : fasce[fasce.length - 1])
}

export function tierForOverall(overall: number | null, fasce: FasciaRange[] = DEFAULT_FASCE): CardTier {
  return rangeForOverall(overall, fasce).tier
}

export function fasciaForOverall(overall: number | null, fasce: FasciaRange[] = DEFAULT_FASCE): Fascia {
  return rangeForOverall(overall, fasce).fascia
}

/** Etichetta fascia da mostrare (le due carte più alte sono la fascia "TOP"). */
export function fasciaLabel(range: FasciaRange): string {
  return range.fascia === 'A' ? 'TOP' : range.fascia
}
