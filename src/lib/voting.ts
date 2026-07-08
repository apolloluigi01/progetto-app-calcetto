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

export function calculateWeightedAverage(votes: VoteWithRole[]): number | null {
  if (votes.length === 0) return null
  let weightedSum = 0
  let totalWeight = 0
  for (const v of votes) {
    const w = voteWeight(v.voter_role)
    weightedSum += v.vote * w
    totalWeight += w
  }
  return Math.round((weightedSum / totalWeight) * 10) / 10
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

export interface MvpVote {
  voter_id: string
  voted_id: string
}

export interface MvpTally {
  /** Conteggio voti MVP per giocatore. */
  counts: Map<string, number>
  /** Giocatori a pari merito col numero massimo di voti (vuoto se nessun voto). */
  top: string[]
  /** MVP provvisorio: valorizzato solo se il più votato è unico. */
  leaderId: string | null
}

/**
 * Spoglio dei voti MVP. In caso di parimerito leaderId resta null:
 * la scelta finale spetta all'admin alla pubblicazione delle pagelle.
 */
export function tallyMvpVotes(votes: MvpVote[]): MvpTally {
  const counts = new Map<string, number>()
  for (const v of votes) {
    counts.set(v.voted_id, (counts.get(v.voted_id) ?? 0) + 1)
  }
  if (counts.size === 0) return { counts, top: [], leaderId: null }
  const max = Math.max(...counts.values())
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id)
  return { counts, top, leaderId: top.length === 1 ? top[0] : null }
}

export function formatVote(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}
