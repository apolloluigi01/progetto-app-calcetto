import { useEffect, useState } from 'react'
import { getCurrentSeasonId } from '../lib/seasons'
import { ALL_TIME_KEY, computeStatistiche, computeStatisticheAllTime, type PlayerStats } from '../lib/statistiche'
import { computeOverallsForPlayers } from '../lib/teamGeneration'

export function useStatistiche(seasonId?: string, enabled = true) {
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStats([])
      setLoading(false)
      setError(null)
      return
    }
    // Cambiando stagione in fretta (menu nella pagina giocatore) una risposta
    // vecchia può arrivare dopo quella nuova: va scartata.
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        let seasonStats: PlayerStats[]
        if (seasonId === ALL_TIME_KEY) {
          seasonStats = await computeStatisticheAllTime()
        } else {
          const resolvedSeasonId = seasonId ?? (await getCurrentSeasonId())
          seasonStats = resolvedSeasonId ? await computeStatistiche(resolvedSeasonId) : []
        }
        const overalls = await computeOverallsForPlayers(
          seasonStats.map((s) => ({ id: s.player.id, name: s.player.name }))
        )
        const overallMap = new Map(overalls.map((o) => [o.playerId, o.overall]))
        if (cancelled) return
        setStats(seasonStats.map((s) => ({ ...s, overall: overallMap.get(s.player.id) ?? null })))
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Errore nel calcolo delle statistiche')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [seasonId, enabled])

  return { stats, loading, error }
}
