import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Season } from '../types/database'

export function useCurrentSeason() {
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setSeason(data as Season | null)
        setLoading(false)
      })
  }, [])

  return { season, loading, error }
}
