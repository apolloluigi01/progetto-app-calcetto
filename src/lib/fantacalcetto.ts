import { supabase } from './supabase'
import { parseVoto } from './statistiche'
import { DEFAULT_FASCE, rangeForOverall, type FasciaRange } from './fasce'

/** Numero di giocatori che compongono la rosa da schierare al fantacalcetto. */
export const FANTA_TEAM_SIZE = 5

/**
 * Parametri del fantacalcetto. Non sono più hardcodati: vivono nella
 * tabella fanta_settings (riga singola) e sono manutenuti dagli admin
 * dalla sezione Fantacalcetto → Gestione parametri Fantacalcetto.
 * Il budget non fa più parte di questi parametri: è dinamico e si
 * ricalcola a ogni giornata (vedi computeFantaBudget).
 */
export interface FantaSettings {
  bonusMvp: number
  bonusGol: number
  bonusAssist: number
  malusAutogol: number
  malusPeggiore: number
  captainMultiplier: number
  /** Minuti prima del calcio d'inizio oltre i quali le formazioni sono bloccate. */
  lineupLockMinutes: number
}

/** Valori di fallback se la riga di configurazione non è raggiungibile. */
export const DEFAULT_FANTA_SETTINGS: FantaSettings = {
  bonusMvp: 3,
  bonusGol: 2,
  bonusAssist: 1,
  malusAutogol: -1,
  malusPeggiore: -2,
  captainMultiplier: 1.2,
  lineupLockMinutes: 15,
}

/** Riga di fanta_settings convertita nei parametri usati dall'app. */
export function fantaSettingsFromRow(data: Record<string, unknown>): FantaSettings {
  return {
    bonusMvp: Number(data.bonus_mvp),
    bonusGol: Number(data.bonus_gol),
    bonusAssist: Number(data.bonus_assist),
    malusAutogol: Number(data.malus_autogol),
    malusPeggiore: Number(data.malus_peggiore),
    captainMultiplier: Number(data.captain_multiplier),
    lineupLockMinutes: Number(data.lineup_lock_minutes ?? DEFAULT_FANTA_SETTINGS.lineupLockMinutes),
  }
}

export async function getFantaSettings(): Promise<FantaSettings> {
  const { data } = await supabase.from('fanta_settings').select('*').eq('id', 1).maybeSingle()
  return data ? fantaSettingsFromRow(data) : DEFAULT_FANTA_SETTINGS
}

/**
 * Budget dinamico del fantallenatore per una giornata. Non è più un valore
 * fisso manutenuto dagli admin: si ricava dai costi in crediti dei giocatori
 * che scendono in campo, così si ricalcola da sé ogni volta che cambiano le
 * squadre o i parametri (fasce e relativi costi in crediti).
 *
 * Formula: media del costo in crediti dei giocatori in campo (somma dei
 * costi / numero dei giocatori in campo), moltiplicata per la dimensione
 * della rosa da schierare (FANTA_TEAM_SIZE) e diminuita di 1.
 */
export function computeFantaBudget(fieldCosts: number[]): number {
  if (fieldCosts.length === 0) return 0
  const avgCost = fieldCosts.reduce((s, c) => s + c, 0) / fieldCosts.length
  const base = Math.round(avgCost * FANTA_TEAM_SIZE)
  // Il -1 rende il budget "stretto". Unica eccezione: se tutti i giocatori
  // in campo costano uguale, sottrarre 1 renderebbe impossibile comporre
  // qualsiasi rosa (ogni rosa costerebbe esattamente base), quindi in quel
  // solo caso non lo applichiamo.
  const allEqual = fieldCosts.every((c) => c === fieldCosts[0])
  return allEqual ? base : base - 1
}

/**
 * Termine ultimo per inserire/modificare la formazione: tanti minuti prima
 * del calcio d'inizio quanti ne impostano gli admin (lineupLockMinutes, il
 * database applica lo stesso valore). Se la partita non ha un orario, nessun termine.
 */
export function lineupDeadline(matchDate: string, matchTime: string | null, lockMinutes: number): Date | null {
  if (!matchTime) return null
  const kickoff = new Date(`${matchDate}T${matchTime}`)
  if (isNaN(kickoff.getTime())) return null
  return new Date(kickoff.getTime() - lockMinutes * 60 * 1000)
}

/** "15 minuti", "1 ora", "1 ora e 30 minuti": per i testi sul blocco formazioni. */
export function formatLockMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h === 0 ? '' : h === 1 ? '1 ora' : `${h} ore`
  const mins = m === 0 ? '' : m === 1 ? '1 minuto' : `${m} minuti`
  if (hours && mins) return `${hours} e ${mins}`
  return hours || mins || '0 minuti'
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

/**
 * Dati fanta di tutte le partite di una stagione con pagelle pubblicate,
 * raggruppati per partita: servono a calcolare la media fantavoto.
 */
export async function fetchSeasonFantaInputs(seasonId: string): Promise<Map<string, FantaMatchInput>> {
  const [pagelleRes, goalsRes, assistsRes] = await Promise.all([
    supabase
      .from('pagelle')
      .select('match_id, player_id, voto, is_mvp, matches!inner(season_id)')
      .eq('matches.season_id', seasonId)
      .not('published_at', 'is', null),
    supabase
      .from('goals')
      .select('match_id, player_id, is_own_goal, matches!inner(season_id)')
      .eq('matches.season_id', seasonId),
    supabase
      .from('assists')
      .select('match_id, player_id, matches!inner(season_id)')
      .eq('matches.season_id', seasonId),
  ])
  if (pagelleRes.error) throw pagelleRes.error

  // Contano solo le partite con pagelle pubblicate: senza voti non c'è fantavoto.
  const byMatch = new Map<string, FantaMatchInput>()
  for (const p of pagelleRes.data ?? []) {
    const input = byMatch.get(p.match_id) ?? { pagelle: [], goals: [], assists: [] }
    input.pagelle.push({ player_id: p.player_id, voto: p.voto, is_mvp: p.is_mvp })
    byMatch.set(p.match_id, input)
  }
  for (const g of goalsRes.data ?? []) {
    byMatch.get(g.match_id)?.goals.push({ player_id: g.player_id, is_own_goal: g.is_own_goal })
  }
  for (const a of assistsRes.data ?? []) {
    byMatch.get(a.match_id)?.assists.push({ player_id: a.player_id })
  }
  return byMatch
}

/**
 * Media fantavoto di stagione per giocatore: per ogni partita, voto in pagella
 * più bonus e malus del fantacalcetto (senza moltiplicatore del capitano, che
 * dipende da chi schiera), mediato sulle partite in cui il giocatore ha un voto.
 */
export function fantavotoAverages(
  inputs: Map<string, FantaMatchInput>,
  settings: FantaSettings,
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>()
  for (const input of inputs.values()) {
    const { players } = computeLineupScore(
      input.pagelle.map((p) => p.player_id),
      '',
      input,
      settings,
    )
    for (const p of players) {
      if (p.voto === null) continue
      const acc = sums.get(p.playerId) ?? { total: 0, count: 0 }
      acc.total += p.total
      acc.count += 1
      sums.set(p.playerId, acc)
    }
  }
  return new Map([...sums].map(([id, { total, count }]) => [id, Math.round((total / count) * 100) / 100]))
}

/**
 * Punteggio d'ufficio per chi non ha schierato la formazione in una giornata
 * calcolata: il più basso tra i punteggi di chi invece l'ha schierata.
 * Restituisce null se nessuno ha schierato (non c'è nulla da assegnare).
 *
 * Non viene persistito: si ricava dai punteggi salvati dal "Calcola giornata",
 * così resta sempre allineato anche se la giornata viene ricalcolata.
 */
export function defaultScoreForMissingLineup(lineupScores: (number | null)[]): number | null {
  const scores = lineupScores.filter((s): s is number => s !== null)
  if (scores.length === 0) return null
  return Math.min(...scores)
}

/**
 * Punti d'ingresso di chi si iscrive alla lega a giornate già giocate: il
 * punteggio più basso della classifica generale in quel momento, cioè il minimo
 * dei totali dei partecipanti già iscritti calcolati sulle sole giornate
 * concluse prima dell'iscrizione (compresi i loro eventuali punti d'ingresso).
 * Chi si iscrive prima di qualsiasi giornata calcolata entra con 0.
 *
 * Come il punteggio d'ufficio non viene persistito: si ricava ogni volta dai
 * punteggi salvati, così segue anche i ricalcoli delle giornate.
 *
 * @param members partecipanti con la data d'iscrizione
 * @param matches giornate calcolate con la loro data
 * @param scoreFor punteggio (reale o d'ufficio) di un partecipante in una giornata,
 *   null se non gli spetta (iscritto dopo quella giornata)
 */
export function computeEntryPoints(
  members: { playerId: string; joinedAt: string }[],
  matches: { matchId: string; matchDate: string }[],
  scoreFor: (matchId: string, playerId: string) => number | null,
): Map<string, number> {
  const entry = new Map<string, number>()
  const sorted = [...members].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
  )
  sorted.forEach((m, i) => {
    const joined = new Date(m.joinedAt)
    // Stesso criterio di "iscritto dopo la giornata": confronto a fine giornata.
    const playedBefore = matches.filter((x) => joined > new Date(`${x.matchDate}T23:59:59`))
    const earlier = sorted.slice(0, i).filter((e) => new Date(e.joinedAt) < joined)
    if (playedBefore.length === 0 || earlier.length === 0) {
      entry.set(m.playerId, 0)
      return
    }
    const totals = earlier.map((e) =>
      playedBefore.reduce((sum, x) => sum + (scoreFor(x.matchId, e.playerId) ?? 0), entry.get(e.playerId) ?? 0),
    )
    entry.set(m.playerId, Math.round(Math.min(...totals) * 100) / 100)
  })
  return entry
}

/**
 * Scadenza iscrizioni proposta alla creazione di una lega: l'ultimo giorno del
 * primo mese di stagione (inizio 1 settembre → 30 settembre). Se il mese
 * successivo è più corto, si ferma all'ultimo giorno, come fa Postgres.
 * L'admin può poi scegliere qualsiasi altra data.
 */
export function suggestedJoinDeadline(seasonStartDate: string): string {
  const [y, m, d] = seasonStartDate.split('-').map(Number)
  const target = new Date(Date.UTC(y, m, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay) - 1)
  return target.toISOString().slice(0, 10)
}

/**
 * True se oggi (ora italiana) ci si può ancora iscrivere alla lega:
 * joinDeadline (YYYY-MM-DD) è l'ultimo giorno utile, compreso. Il database
 * applica la stessa regola (fanta_league_join_open).
 */
export function isJoinOpen(joinDeadline: string): boolean {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  return today <= joinDeadline
}

/** Ultimo giorno utile per iscriversi, formattato per l'interfaccia. */
export function formatJoinDeadline(joinDeadline: string): string {
  return new Date(`${joinDeadline}T12:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatFantaPoints(v: number): string {
  return (Math.round(v * 100) / 100).toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
