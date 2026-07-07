import { parseVoto } from './statistiche'

export const FANTA_BUDGET = 10
export const FANTA_TEAM_SIZE = 5
export const CAPTAIN_MULTIPLIER = 1.2

export const BONUS_MVP = 3
export const BONUS_GOL = 2
export const BONUS_ASSIST = 1
export const MALUS_AUTOGOL = -1
export const MALUS_PEGGIORE = -2

/**
 * Costo in crediti di un giocatore, in base all'overall (stessa griglia
 * delle fasce/carte):
 *   0-34   -> 1 credito (fascia D / bronzo)
 *   35-55  -> 2 crediti (fascia C / argento)
 *   56-74  -> 3 crediti (fascia B / oro)
 *   75-89  -> 4 crediti (fascia A / speciale)
 *   90-100 -> 5 crediti (fascia A / competizione)
 */
export function creditCost(overall: number | null): number {
  const v = overall ?? 0
  if (v >= 90) return 5
  if (v >= 75) return 4
  if (v >= 56) return 3
  if (v >= 35) return 2
  return 1
}

export interface FantaMatchInput {
  /** Pagelle pubblicate della partita (tutti i giocatori in campo). */
  pagelle: { player_id: string; voto: string; is_mvp: boolean }[]
  /** Gol della partita, con eventuale assist. */
  goals: { player_id: string; is_own_goal: boolean; assist_player_id: string | null }[]
}

export interface FantaPlayerScore {
  playerId: string
  voto: number | null
  bonus: number
  malus: number
  isCaptain: boolean
  /** voto + bonus + malus, con moltiplicatore capitano già applicato. */
  total: number
}

export interface FantaLineupScore {
  players: FantaPlayerScore[]
  total: number
}

/**
 * Calcola il punteggio di una formazione per una partita conclusa
 * (richiede pagelle pubblicate). Bonus: MVP +3, gol +2, assist +1.
 * Malus: autogol -1, peggior voto in campo -2 (in caso di parità si
 * applica a tutti i peggiori). Il capitano moltiplica il proprio
 * punteggio finale per 1.2.
 */
export function computeLineupScore(
  lineupPlayerIds: string[],
  captainId: string,
  match: FantaMatchInput,
): FantaLineupScore {
  const votes = new Map<string, number>()
  for (const p of match.pagelle) {
    const parsed = parseVoto(p.voto)
    if (parsed !== null) votes.set(p.player_id, parsed)
  }

  const worstVote = votes.size > 0 ? Math.min(...votes.values()) : null

  const players: FantaPlayerScore[] = lineupPlayerIds.map((playerId) => {
    const voto = votes.get(playerId) ?? null

    let bonus = 0
    let malus = 0

    if (match.pagelle.find((p) => p.player_id === playerId)?.is_mvp) bonus += BONUS_MVP
    for (const g of match.goals) {
      if (g.player_id === playerId) {
        if (g.is_own_goal) malus += MALUS_AUTOGOL
        else bonus += BONUS_GOL
      }
      if (g.assist_player_id === playerId && !g.is_own_goal) bonus += BONUS_ASSIST
    }
    if (worstVote !== null && voto !== null && voto === worstVote) malus += MALUS_PEGGIORE

    const isCaptain = playerId === captainId
    const raw = (voto ?? 0) + bonus + malus
    const total = isCaptain ? raw * CAPTAIN_MULTIPLIER : raw

    return { playerId, voto, bonus, malus, isCaptain, total: Math.round(total * 100) / 100 }
  })

  const total = Math.round(players.reduce((s, p) => s + p.total, 0) * 100) / 100
  return { players, total }
}

export function formatFantaPoints(v: number): string {
  return (Math.round(v * 100) / 100).toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
