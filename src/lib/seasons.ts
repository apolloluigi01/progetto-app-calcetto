import { supabase } from './supabase'

/**
 * Trova la stagione il cui range [start_date, end_date] contiene la data indicata
 * (end_date nullo = stagione ancora aperta). Restituisce null se nessuna stagione
 * copre quella data, cosi' il chiamante puo' chiedere all'admin di crearne una
 * invece di assegnare la partita a una stagione sbagliata.
 */
export async function getSeasonIdForDate(date: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id, end_date')
    .lte('start_date', date)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  if (data.end_date && date > data.end_date) return null
  return data.id
}

export async function getCurrentSeasonId(): Promise<string | null> {
  const { data } = await supabase
    .from('seasons')
    .select('id')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}
