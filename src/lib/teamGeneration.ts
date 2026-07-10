import { supabase } from './supabase'

export interface PlayerOverall {
  playerId: string
  name: string
  surname: string | null
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
 * Restituisce l'overall (1-100) di un insieme di giocatori.
 *
 * NOTA: il ricalcolo dinamico dell'overall in base alle statistiche di
 * stagione è stato disattivato. L'overall è ora un valore gestito
 * manualmente dagli admin (tabella ratings, sezione CDA → Gestione
 * overall); in assenza di un rating salvato si usa 50.
 */
export async function computeOverallsForPlayers(
  players: { id: string; name: string; surname?: string | null; nickname?: string | null }[],
): Promise<PlayerOverall[]> {
  if (players.length === 0) return []

  const { data: ratingsData } = await supabase
    .from('ratings')
    .select('player_id, rating_value')
    .in('player_id', players.map((p) => p.id))
  const ratingMap = new Map((ratingsData ?? []).map((r) => [r.player_id, Number(r.rating_value)]))

  return players.map((p) => {
    const raw = ratingMap.get(p.id) ?? 50
    const overall = Math.min(100, Math.max(1, Math.round(raw)))
    return { playerId: p.id, name: p.name, surname: p.surname ?? null, nickname: p.nickname ?? null, overall }
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
