import { useEffect, useState } from 'react'
import { getCurrentSeasonId } from '../lib/seasons'
import { computeStatistiche, type PlayerStats } from '../lib/statistiche'
import { computeOverallsForPlayers } from '../lib/teamGeneration'

export function useStatistiche(seasonId?: string) {
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const resolvedSeasonId = seasonId ?? (await getCurrentSeasonId())
        const seasonStats = resolvedSeasonId ? await computeStatistiche(resolvedSeasonId) : []
        const overalls = await computeOverallsForPlayers(
          seasonStats.map((s) => ({ id: s.player.id, name: s.player.name })),
          resolvedSeasonId ?? undefined,
          seasonStats
        )
        const overallMap = new Map(overalls.map((o) => [o.playerId, o.overall]))
        setStats(seasonStats.map((s) => ({ ...s, overall: overallMap.get(s.player.id) ?? null })))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore nel calcolo delle statistiche')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [seasonId])

  return { stats, loading, error }
}
