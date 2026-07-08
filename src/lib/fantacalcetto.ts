import { supabase } from './supabase'
import { parseVoto } from './statistiche'

export const FANTA_BUDGET = 15
export const FANTA_TEAM_SIZE = 5

/**
 * Parametri bonus/malus del fantacalcetto. Non sono più hardcodati:
 * vivono nella tabella fanta_settings (riga singola) e sono manutenuti
 * dagli admin dalla sezione CDA → Gestione Fantacalcetto.
 */
export interface FantaSettings {
  bonusMvp: number
  bonusGol: number
  bonusAssist: number
  malusAutogol: number
  malusPeggiore: number
  captainMultiplier: number
}

/** Valori di fallback se la riga di configurazione non è raggiungibile. */
export const DEFAULT_FANTA_SETTINGS: FantaSettings = {
  bonusMvp: 3,
  bonusGol: 2,
  bonusAssist: 1,
  malusAutogol: -1,
  malusPeggiore: -2,
  captainMultiplier: 1.2,
}

export async function getFantaSettings(): Promise<FantaSettings> {
  const { data } = await supabase.from('fanta_settings').select('*').eq('id', 1).maybeSingle()
  if (!data) return DEFAULT_FANTA_SETTINGS
  return {
    bonusMvp: Number(data.bonus_mvp),
    bonusGol: Number(data.bonus_gol),
    bonusAssist: Number(data.bonus_assist),
    malusAutogol: Number(data.malus_autogol),
    malusPeggiore: Number(data.malus_peggiore),
    captainMultiplier: Number(data.captain_multiplier),
  }
}

/** Minuti prima del calcio d'inizio oltre i quali le formazioni sono bloccate. */
export const LINEUP_LOCK_MINUTES = 15

/**
 * Termine ultimo per inserire/modificare la formazione: 15 minuti prima
 * del calcio d'inizio. Se la partita non ha un orario, nessun termine.
 */
export function lineupDeadline(matchDate: string, matchTime: string | null): Date | null {
  if (!matchTime) return null
  const kickoff = new Date(`${matchDate}T${matchTime}`)
  if (isNaN(kickoff.getTime())) return null
  return new Date(kickoff.getTime() - LINEUP_LOCK_MINUTES * 60 * 1000)
}

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
 * (richiede pagelle pubblicate), usando i parametri bonus/malus
 * configurati dagli admin. Il malus "peggiore" si applica al peggior
 * voto in campo (in caso di parità a tutti i peggiori); il capitano
 * moltiplica il proprio punteggio finale per il moltiplicatore.
 */
export function computeLineupScore(
  lineupPlayerIds: string[],
  captainId: string,
  match: FantaMatchInput,
  settings: FantaSettings = DEFAULT_FANTA_SETTINGS,
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

    if (match.pagelle.find((p) => p.player_id === playerId)?.is_mvp) bonus += settings.bonusMvp
    for (const g of match.goals) {
      if (g.player_id === playerId) {
        if (g.is_own_goal) malus += settings.malusAutogol
        else bonus += settings.bonusGol
      }
      if (g.assist_player_id === playerId && !g.is_own_goal) bonus += settings.bonusAssist
    }
    if (worstVote !== null && voto !== null && voto === worstVote) malus += settings.malusPeggiore

    const isCaptain = playerId === captainId
    const raw = (voto ?? 0) + bonus + malus
    const total = isCaptain ? raw * settings.captainMultiplier : raw

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
