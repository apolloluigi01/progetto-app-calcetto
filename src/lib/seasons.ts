import { supabase } from './supabase'
import type { Season } from '../types/database'

export type SeasonStatus = 'corrente' | 'conclusa' | 'programmata'

/** Data odierna in formato ISO (YYYY-MM-DD) nel fuso orario locale. */
export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Stato di una stagione in base al range di date:
 * - programmata: la data di inizio è nel futuro
 * - conclusa: la data di fine è nel passato
 * - corrente: la data odierna rientra nel range (end_date nullo = ancora aperta)
 */
export function getSeasonStatus(
  season: Pick<Season, 'start_date' | 'end_date'>,
  today: string = todayISO()
): SeasonStatus {
  if (season.start_date > today) return 'programmata'
  if (season.end_date && season.end_date < today) return 'conclusa'
  return 'corrente'
}

/**
 * Trova la stagione il cui range [start_date, end_date] contiene la data indicata
 * (end_date nullo = stagione ancora aperta). Restituisce anche lo stato, così il
 * chiamante può rifiutare l'inserimento di partite in stagioni già concluse.
 * Restituisce null se nessuna stagione copre quella data.
 */
export async function findSeasonForDate(
  date: string
): Promise<{ id: string; status: SeasonStatus } | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, start_date, end_date')
    .lte('start_date', date)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  if (data.end_date && date > data.end_date) return null
  return { id: data.id, status: getSeasonStatus(data) }
}

/** Stagione corrente = quella il cui range contiene la data odierna. */
export async function getCurrentSeason(): Promise<Season | null> {
  const today = todayISO()
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .lte('start_date', today)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const season = data as Season
  if (season.end_date && season.end_date < today) return null
  return season
}

export async function getCurrentSeasonId(): Promise<string | null> {
  const season = await getCurrentSeason()
  return season?.id ?? null
}
