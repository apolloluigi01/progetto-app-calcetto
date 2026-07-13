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
 * Genera le due squadre valutando TUTTE le divisioni possibili (es. 252 per
 * 10 giocatori) e scegliendo quella con il costo minore. Il costo combina:
 *
 * 1. la differenza tra le medie overall delle due squadre;
 * 2. la differenza "scalino per scalino" tra i singoli: ordinate le due
 *    squadre per overall decrescente, si confronta il 1° di A con il 1° di B,
 *    il 2° con il 2°, ecc. Questo forza le squadre ad essere simili anche
 *    nella distribuzione dei valori: i due overall più alti finiscono in
 *    squadre opposte, così come i due più bassi.
 *
 * Il peso maggiore è sullo scalino più alto (top player), così una piccola
 * differenza di media viene accettata pur di non mettere due "big" insieme.
 */
export function generateBalancedTeams(players: PlayerOverall[]): GeneratedTeams {
  const sorted = [...players].sort((a, b) => b.overall - a.overall)
  const n = sorted.length
  const sizeA = Math.ceil(n / 2)

  const avg = (arr: PlayerOverall[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, p) => s + p.overall, 0) / arr.length

  // Costo di una divisione: differenza medie + differenza per scalino,
  // con peso decrescente dallo scalino più alto a quello più basso.
  const cost = (a: PlayerOverall[], b: PlayerOverall[]) => {
    const avgDiff = Math.abs(avg(a) - avg(b))
    const slots = Math.min(a.length, b.length)
    let slotCost = 0
    for (let i = 0; i < slots; i++) {
      // peso 2 per il primo scalino, poi 1.5, 1.2, 1, 1...
      const weight = i === 0 ? 2 : i === 1 ? 1.5 : i === 2 ? 1.2 : 1
      slotCost += weight * Math.abs(a[i].overall - b[i].overall)
    }
    // La media resta il criterio principale, gli scalini affinano la scelta.
    return avgDiff * 3 + slotCost
  }

  let best: { teamA: PlayerOverall[]; teamB: PlayerOverall[]; cost: number } | null = null
  let bestCount = 0

  // Enumera tutte le combinazioni di sizeA elementi su n (il primo giocatore
  // è fissato in A per evitare di valutare due volte le divisioni speculari).
  const indices: number[] = []
  const explore = (start: number) => {
    if (indices.length === sizeA) {
      const inA = new Set(indices)
      const a: PlayerOverall[] = []
      const b: PlayerOverall[] = []
      sorted.forEach((p, i) => (inA.has(i) ? a.push(p) : b.push(p)))
      const c = cost(a, b)
      if (!best || c < best.cost - 1e-9) {
        best = { teamA: a, teamB: b, cost: c }
        bestCount = 1
      } else if (Math.abs(c - best.cost) <= 1e-9) {
        // A parità di costo scegli a caso, per variare le squadre generate.
        bestCount++
        if (Math.random() < 1 / bestCount) best = { teamA: a, teamB: b, cost: c }
      }
      return
    }
    for (let i = start; i <= n - (sizeA - indices.length); i++) {
      indices.push(i)
      explore(i + 1)
      indices.pop()
    }
  }
  if (n > 0) {
    if (n % 2 === 0) {
      // Squadre di pari dimensione: fissare il primo giocatore in A evita di
      // valutare due volte le divisioni speculari.
      indices.push(0)
      explore(1)
    } else {
      explore(0)
    }
  }

  const teamA = best ? (best as { teamA: PlayerOverall[] }).teamA : []
  const teamB = best ? (best as { teamB: PlayerOverall[] }).teamB : []
  const avgA = Math.round(avg(teamA))
  const avgB = Math.round(avg(teamB))

  return { teamA, teamB, avgA, avgB, diff: Math.abs(avgA - avgB) }
}
