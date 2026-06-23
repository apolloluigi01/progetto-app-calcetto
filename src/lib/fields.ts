import { supabase } from './supabase'

export async function getKnownFields(): Promise<string[]> {
  const { data } = await supabase
    .from('matches')
    .select('field')
    .not('field', 'is', null)
    .order('match_date', { ascending: false })

  const seen = new Set<string>()
  const fields: string[] = []
  for (const row of data ?? []) {
    const value = (row.field as string | null)?.trim()
    if (value && !seen.has(value)) {
      seen.add(value)
      fields.push(value)
    }
  }
  return fields
}
