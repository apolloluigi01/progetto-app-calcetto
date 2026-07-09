import { useEffect, useState } from 'react'
import { getCurrentSeason } from '../lib/seasons'
import type { Season } from '../types/database'

export function useCurrentSeason() {
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCurrentSeason()
      .then((data) => {
        setSeason(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Errore caricamento stagione')
        setLoading(false)
      })
  }, [])

  return { season, loading, error }
}
