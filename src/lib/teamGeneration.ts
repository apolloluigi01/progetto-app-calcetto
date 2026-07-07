import { supabase } from './supabase'
import { computeStatistiche, type PlayerStats } from './statistiche'
import { getCurrentSeasonId } from './seasons'

export interface PlayerOverall {
  playerId: string
  name: string
  nickname: string | null
  overall: number
}

export interface GeneratedTeams {
  teamA: PlayerOverall[]
  teamB: PlayerOverall[]
  avgA: number
  avgB: number
  diff: number
}

/**
 * Calcola l'overall 1-100 di un giocatore.
 * - Se non ha partite giocate usa il fallback impostato dall'admin (rating_value nel DB).
 * - goalsMax è il massimo gol assoluti tra tutti i giocatori del gruppo (normalizzazione).
 */
export function computeOverall(
  stats: PlayerStats,
  goalsMax: number,
  fallback: number,
): number {
  if (stats.partiteGiocate === 0) {
    return Math.min(100, Math.max(1, Math.round(fallback)))
  }

  const winScore = (stats.vittorie / stats.partiteGiocate) * 100

  const goalsScore = goalsMax > 0 ? Math.min((stats.golFatti / goalsMax) * 100, 100) : 0

  const votoScore =
    stats.voteAvg !== null
      ? Math.min(Math.max(((stats.voteAvg - 4) / 6) * 100, 0), 100)
      : 50

  const raw = winScore * 0.4 + goalsScore * 0.35 + votoScore * 0.25
  return Math.min(100, Math.max(1, Math.round(raw)))
}

/**
 * Calcola l'overall di un insieme di giocatori (per playerId), usando le statistiche
 * della stagione corrente e, in assenza di partite giocate, il rating_value salvato
 * dall'admin come fallback.
 *
 * Se il chiamante ha già calcolato le statistiche di stagione (es. `useStatistiche`),
 * può passarle in `precomputedStats` per evitare di ricalcolarle da zero qui dentro.
 */
export async function computeOverallsForPlayers(
  players: { id: string; name: string; nickname?: string | null }[],
  seasonId?: string,
  precomputedStats?: PlayerStats[]
): Promise<PlayerOverall[]> {
  if (players.length === 0) return []

  const resolvedSeasonId = seasonId ?? (await getCurrentSeasonId())
  const allStats = precomputedStats ?? (resolvedSeasonId ? await computeStatistiche(resolvedSeasonId) : [])

  const { data: ratingsData } = await supabase
    .from('ratings')
    .select('player_id, rating_value')
    .in('player_id', players.map((p) => p.id))
  const ratingMap = new Map((ratingsData ?? []).map((r) => [r.player_id, Number(r.rating_value)]))

  const goalsMax = Math.max(1, ...allStats.map((s) => s.golFatti))

  return players.map((p) => {
    const stats = allStats.find((s) => s.player.id === p.id)
    const fallback = ratingMap.get(p.id) ?? 50
    const overall = stats ? computeOverall(stats, goalsMax, fallback) : fallback
    return { playerId: p.id, name: p.name, nickname: p.nickname ?? null, overall }
  })
}

/**
 * Snake draft su 10 giocatori (5v5).
 * Ordine decrescente per overall → posizioni pari A, dispari B (a coppie invertite):
 *   [0]A [1]B [2]B [3]A [4]A [5]B [6]B [7]A [8]A [9]B
 * Garantisce la massima equità tra le due squadre.
 */
export function generateBalancedTeams(players: PlayerOverall[]): GeneratedTeams {
  const sorted = [...players].sort((a, b) => b.overall - a.overall)

  const teamAIndices = [0, 3, 4, 7, 8]
  const teamA: PlayerOverall[] = []
  const teamB: PlayerOverall[] = []

  sorted.forEach((p, i) => {
    if (teamAIndices.includes(i)) teamA.push(p)
    else teamB.push(p)
  })

  const avg = (arr: PlayerOverall[]) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, p) => s + p.overall, 0) / arr.length)

  const avgA = avg(teamA)
  const avgB = avg(teamB)

  return { teamA, teamB, avgA, avgB, diff: Math.abs(avgA - avgB) }
}
