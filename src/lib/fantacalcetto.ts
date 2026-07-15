import { supabase } from './supabase'
import { parseVoto } from './statistiche'
import { DEFAULT_FASCE, rangeForOverall, type FasciaRange } from './fasce'

/** Budget di fallback se la configurazione non è raggiungibile
 *  (il valore reale vive su fanta_settings.budget). */
export const FANTA_BUDGET = 15
export const FANTA_TEAM_SIZE = 5

/**
 * Parametri del fantacalcetto. Non sono più hardcodati: vivono nella
 * tabella fanta_settings (riga singola) e sono manutenuti dagli admin
 * dalla sezione CDA → Gestione bonus Fantacalcetto (bonus/malus) e
 * Gestione crediti Fantacalcetto (budget).
 */
export interface FantaSettings {
  bonusMvp: number
  bonusGol: number
  bonusAssist: number
  malusAutogol: number
  malusPeggiore: number
  captainMultiplier: number
  /** Crediti a disposizione del fantallenatore per formare la rosa.
   *  Vale solo per le formazioni da schierare: quelle già salvate e le
   *  giornate già calcolate non risentono dei cambiamenti. */
  budget: number
}

/** Valori di fallback se la riga di configurazione non è raggiungibile. */
export const DEFAULT_FANTA_SETTINGS: FantaSettings = {
  bonusMvp: 3,
  bonusGol: 2,
  bonusAssist: 1,
  malusAutogol: -1,
  malusPeggiore: -2,
  captainMultiplier: 1.2,
  budget: FANTA_BUDGET,
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
    budget: data.budget != null ? Number(data.budget) : FANTA_BUDGET,
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
 * Costo in crediti di un giocatore, in base all'overall e alla griglia
 * delle fasce/carte. Il costo di ogni fascia è configurabile dal
 * CDA -> Gestione crediti Fantacalcetto (colonna credit_cost).
 */
export function creditCost(overall: number | null, fasce: FasciaRange[] = DEFAULT_FASCE): number {
  return rangeForOverall(overall, fasce).creditCost
}

export interface FantaMatchInput {
  /** Pagelle pubblicate della partita (tutti i giocatori in campo). */
  pagelle: { player_id: string; voto: string; is_mvp: boolean }[]
  /** Gol della partita. */
  goals: { player_id: string; is_own_goal: boolean }[]
  /** Assist della partita (censiti indipendentemente dai gol). */
  assists: { player_id: string }[]
}

export interface FantaPlayerScore {
  playerId: string
  voto: number | null
  bonus: number
  malus: number
  isCaptain: boolean
  /** voto + bonus + malus; per il capitano i soli bonus sono moltiplicati. */
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
 * voto in campo (in caso di parità a tutti i peggiori); per il capitano
 * il moltiplicatore si applica solo alla somma dei bonus (non al voto
 * base né ai malus): senza bonus, il moltiplicatore non ha effetto.
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
    }
    for (const a of match.assists) {
      if (a.player_id === playerId) bonus += settings.bonusAssist
    }
    if (worstVote !== null && voto !== null && voto === worstVote) malus += settings.malusPeggiore

    const isCaptain = playerId === captainId
    const effectiveBonus = isCaptain ? bonus * settings.captainMultiplier : bonus
    const total = (voto ?? 0) + effectiveBonus + malus

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
