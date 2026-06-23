import { useEffect, useState } from 'react'
import { getCurrentSeasonId } from '../lib/seasons'
import { computeStatistiche, type PlayerStats } from '../lib/statistiche'

export function useStatistiche() {
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const seasonId = await getCurrentSeasonId()
        setStats(seasonId ? await computeStatistiche(seasonId) : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore nel calcolo delle statistiche')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { stats, loading, error }
}
