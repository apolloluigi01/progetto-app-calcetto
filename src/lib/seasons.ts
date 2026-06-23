import { supabase } from './supabase'

export async function getCurrentSeasonId(): Promise<string | null> {
  const { data } = await supabase
    .from('seasons')
    .select('id')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export async function getOrCreateCurrentSeason(): Promise<string> {
  const { data: existing } = await supabase
    .from('seasons')
    .select('id')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  const year = new Date().getFullYear()
  const { data: created, error } = await supabase
    .from('seasons')
    .insert({ name: String(year), start_date: `${year}-01-01` })
    .select('id')
    .single()

  if (error || !created) throw new Error(error?.message ?? 'Errore creazione stagione')
  return created.id
}
