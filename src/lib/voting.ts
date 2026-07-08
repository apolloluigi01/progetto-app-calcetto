import type { PlayerRole } from '../types/database'

export interface VoteWithRole {
  voter_id: string
  voted_id: string
  vote: number
  voter_role: PlayerRole
}

export interface PlayerAverage {
  player_id: string
  average: number | null
  raw_count: number
  weighted_count: number
}

export function voteWeight(role: PlayerRole): number {
  return role === 'admin' || role === 'superadmin' ? 2 : 1
}

/**
 * Media ponderata dei voti post-partita, arrotondata al mezzo voto più
 * vicino: i voti delle votazioni possono finire solo con .0 o .5
 * (es. 6,2 → 6; 6,8 → 7; 6,3 → 6,5). Questa regola vale SOLO per le
 * votazioni: le medie delle statistiche e il fantavoto continuano a
 * usare i voti delle pagelle arrotondati a una cifra decimale.
 */
export function calculateWeightedAverage(votes: VoteWithRole[]): number | null {
  if (votes.length === 0) return null
  let weightedSum = 0
  let totalWeight = 0
  for (const v of votes) {
    const w = voteWeight(v.voter_role)
    weightedSum += v.vote * w
    totalWeight += w
  }
  return Math.round((weightedSum / totalWeight) * 2) / 2
}

export function getPlayerAverages(votes: VoteWithRole[], playerIds: string[]): PlayerAverage[] {
  return playerIds.map((pid) => {
    const pv = votes.filter((v) => v.voted_id === pid)
    return {
      player_id: pid,
      average: calculateWeightedAverage(pv),
      raw_count: pv.length,
      weighted_count: pv.reduce((s, v) => s + voteWeight(v.voter_role), 0),
    }
  })
}

/**
 * MVP calcolato automaticamente dal sistema: il giocatore con la media
 * voto più alta. In caso di parimerito restituisce null e la scelta
 * spetta all'admin alla pubblicazione delle pagelle.
 */
export function getProvisionalMvpId(averages: PlayerAverage[]): string | null {
  const withVotes = averages.filter((a) => a.average !== null)
  if (withVotes.length === 0) return null
  const maxAvg = Math.max(...withVotes.map((a) => a.average!))
  const top = withVotes.filter((a) => a.average === maxAvg)
  return top.length === 1 ? top[0].player_id : null
}

export function formatVote(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}
