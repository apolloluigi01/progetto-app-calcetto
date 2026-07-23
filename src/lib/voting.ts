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

/** Dati di spareggio per il calcolo automatico dell'MVP. */
export interface MvpTiebreakData {
  /** player_id -> numero di bonus (gol + assist) nella partita. */
  bonusByPlayer?: Map<string, number>
  /** player_id -> numero di gol regolari (esclusi gli autogol). */
  goalsByPlayer?: Map<string, number>
  /** player_id -> squadra ('A' | 'B') del giocatore in questa partita. */
  teamByPlayer?: Map<string, 'A' | 'B'>
  /** Squadra vincitrice ('A' | 'B'); null se pareggio o risultato assente. */
  winningTeam?: 'A' | 'B' | null
}

/**
 * MVP calcolato automaticamente dal sistema, con questa catena di priorità
 * (a parità di un criterio scatta automaticamente il successivo):
 *  1. media voto ESATTA più alta (NON arrotondata a 0,5);
 *  2. squadra vincitrice (a parità di media si premia chi ha vinto la partita);
 *  3. numero di bonus, cioè gol + assist;
 *  4. peso dei bonus: a parità di numero, chi ha fatto più gol.
 * Se resta ancora il parimerito (caso molto raro) si restituisce null e la
 * scelta spetta all'admin alla pubblicazione delle pagelle.
 */
export function getProvisionalMvpId(
  averages: PlayerAverage[],
  data: MvpTiebreakData = {}
): string | null {
  const { bonusByPlayer, goalsByPlayer, teamByPlayer, winningTeam } = data

  let tied = averages.filter((a) => a.exact !== null)
  if (tied.length === 0) return null

  // 1) Media voto esatta più alta.
  const maxAvg = Math.max(...tied.map((a) => a.exact!))
  tied = tied.filter((a) => a.exact === maxAvg)
  if (tied.length === 1) return tied[0].player_id

  // 2) Squadra vincitrice: se qualcuno dei pari-media ha vinto, si resta a loro.
  if (winningTeam && teamByPlayer) {
    const onWinner = tied.filter((a) => teamByPlayer.get(a.player_id) === winningTeam)
    if (onWinner.length > 0) tied = onWinner
    if (tied.length === 1) return tied[0].player_id
  }

  // 3) Numero di bonus (gol + assist).
  if (bonusByPlayer) {
    const maxBonus = Math.max(...tied.map((a) => bonusByPlayer.get(a.player_id) ?? 0))
    tied = tied.filter((a) => (bonusByPlayer.get(a.player_id) ?? 0) === maxBonus)
    if (tied.length === 1) return tied[0].player_id
  }

  // 4) Peso dei bonus: più gol.
  if (goalsByPlayer) {
    const maxGoals = Math.max(...tied.map((a) => goalsByPlayer.get(a.player_id) ?? 0))
    tied = tied.filter((a) => (goalsByPlayer.get(a.player_id) ?? 0) === maxGoals)
    if (tied.length === 1) return tied[0].player_id
  }

  // Parimerito totale: decide l'admin.
  return null
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
