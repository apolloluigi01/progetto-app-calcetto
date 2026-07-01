import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Season } from '../types/database'

export function useCurrentSeason() {
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSeason(data as Season | null)
        setLoading(false)
      })
  }, [])

  return { season, loading }
}
