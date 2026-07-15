import type { PlayerRole } from '../types/database'

export interface VoteWithRole {
  voter_id: string
  voted_id: string
  vote: number
  voter_role: PlayerRole
}

export interface PlayerAverage {
  player_id: string
  /** Media ponderata arrotondata al mezzo voto (usata solo per pre-compilare le pagelle). */
  average: number | null
  /** Media ponderata ESATTA (2 decimali): usata nel box voti e per il calcolo MVP. */
  exact: number | null
  raw_count: number
  weighted_count: number
}

export function voteWeight(role: PlayerRole): number {
  return role === 'admin' || role === 'superadmin' ? 2 : 1
}

/**
 * Media ponderata dei voti post-partita, arrotondata al mezzo voto più
 * vicino: i voti delle votazioni possono finire solo con .0 o .5
 * (es. 6,2 → 6; 6,8 → 7; 6,3 → 6,5). Serve SOLO come suggerimento per
 * pre-compilare le pagelle: la media mostrata nel box voti e il calcolo
 * dell'MVP usano invece la media esatta (vedi calculateExactAverage).
 */
export function calculateWeightedAverage(votes: VoteWithRole[]): number | null {
  const exact = calculateExactAverage(votes)
  return exact === null ? null : Math.round(exact * 2) / 2
}

/**
 * Media ponderata ESATTA dei voti (arrotondata alla seconda cifra decimale
 * solo per eliminare il rumore in virgola mobile). È questa la media mostrata
 * nel box voti e su cui si determina l'MVP: non va arrotondata a 0,5.
 */
export function calculateExactAverage(votes: VoteWithRole[]): number | null {
  if (votes.length === 0) return null
  let weightedSum = 0
  let totalWeight = 0
  for (const v of votes) {
    const w = voteWeight(v.voter_role)
    weightedSum += v.vote * w
    totalWeight += w
  }
  return Math.round((weightedSum / totalWeight) * 100) / 100
}

export function getPlayerAverages(votes: VoteWithRole[], playerIds: string[]): PlayerAverage[] {
  return playerIds.map((pid) => {
    const pv = votes.filter((v) => v.voted_id === pid)
    return {
      player_id: pid,
      average: calculateWeightedAverage(pv),
      exact: calculateExactAverage(pv),
      raw_count: pv.length,
      weighted_count: pv.reduce((s, v) => s + voteWeight(v.voter_role), 0),
    }
  })
}

/**
 * MVP calcolato automaticamente dal sistema, in ordine di priorità:
 *  1. media voto ESATTA più alta (NON arrotondata a 0,5);
 *  2. a parità di media, il giocatore con più bonus in partita (gol + assist).
 * Se anche i bonus sono pari resta il parimerito: si restituisce null e la
 * scelta spetta all'admin alla pubblicazione delle pagelle.
 *
 * @param bonusByPlayer mappa player_id -> numero di bonus (gol + assist) nella partita.
 */
export function getProvisionalMvpId(
  averages: PlayerAverage[],
  bonusByPlayer: Map<string, number> = new Map()
): string | null {
  const withVotes = averages.filter((a) => a.exact !== null)
  if (withVotes.length === 0) return null

  const maxAvg = Math.max(...withVotes.map((a) => a.exact!))
  const topByAvg = withVotes.filter((a) => a.exact === maxAvg)
  if (topByAvg.length === 1) return topByAvg[0].player_id

  // Parità di media: spareggio sul numero di bonus (gol + assist).
  const maxBonus = Math.max(...topByAvg.map((a) => bonusByPlayer.get(a.player_id) ?? 0))
  const topByBonus = topByAvg.filter((a) => (bonusByPlayer.get(a.player_id) ?? 0) === maxBonus)
  return topByBonus.length === 1 ? topByBonus[0].player_id : null
}

export function formatVote(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

/**
 * Formatta la media ESATTA per la visualizzazione: mostra fino a 2 decimali
 * eliminando gli zeri finali (es. 6 → "6", 6,5 → "6.5", 6,33 → "6.33").
 */
export function formatExact(v: number): string {
  return String(Math.round(v * 100) / 100)
}
