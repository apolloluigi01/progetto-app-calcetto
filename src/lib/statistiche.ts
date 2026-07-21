import { supabase } from './supabase'
import type { Player } from '../types/database'

export interface PlayerStats {
  player: Player
  partiteGiocate: number
  vittorie: number
  pareggi: number
  sconfitte: number
  golFatti: number
  assist: number
  autogol: number
  mvp: number
  voteAvg: number | null
  voteCount: number
  overall: number | null
  winStreak: number
  /** Quante volte il giocatore è stato schierato nelle formazioni fantacalcetto. */
  fantaSchieramenti: number
  /** Di questi schieramenti, quante volte è stato scelto come capitano. */
  fantaCapitano: number
  /** Totale partite giocate (con risultato) nella stagione: base per la soglia % presenze del format. */
  totalSeasonMatches: number
}

export function playerFullName(player: Pick<Player, 'name' | 'surname'>): string {
  return player.surname ? `${player.name} ${player.surname}` : player.name
}

export function parseVoto(voto: string): number | null {
  const match = voto.trim().match(/^(\d+(?:\.\d+)?)\s*([+-])?$/)
  if (!match) return null
  const base = parseFloat(match[1])
  const modifier = match[2] === '+' ? 0.25 : match[2] === '-' ? -0.25 : 0
  return base + modifier
}

export async function computeStatistiche(seasonId: string): Promise<PlayerStats[]> {
  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_date, result:match_results(score_a, score_b)')
    .eq('season_id', seasonId)
    .order('match_date', { ascending: true })
  return aggregateStatistiche((matches ?? []) as MatchStatsRow[])
}

/**
 * Statistiche aggregate su un mese solare (monthKey 'YYYY-MM'), indipendenti
 * dalla stagione: servono agli admin per scegliere i candidati MVP del mese.
 */
export async function computeStatisticheMensili(monthKey: string): Promise<PlayerStats[]> {
  const [year, month] = monthKey.split('-').map(Number)
  const start = `${monthKey}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_date, result:match_results(score_a, score_b)')
    .gte('match_date', start)
    .lt('match_date', end)
    .order('match_date', { ascending: true })
  return aggregateStatistiche((matches ?? []) as MatchStatsRow[])
}

interface MatchStatsRow {
  id: string
  match_date: string
  result: { score_a: number; score_b: number } | { score_a: number; score_b: number }[] | null
}

async function aggregateStatistiche(matches: MatchStatsRow[]): Promise<PlayerStats[]> {
  const matchIds = matches.map((m) => m.id)
  if (matchIds.length === 0) return []

  const resultByMatch = new Map<string, { score_a: number; score_b: number }>()
  const dateByMatch = new Map<string, string>()
  for (const m of matches) {
    const result = Array.isArray(m.result) ? m.result[0] : m.result
    if (result) resultByMatch.set(m.id, result)
    dateByMatch.set(m.id, m.match_date)
  }

  const [matchPlayersRes, goalsRes, assistsRes, pagelleRes, fantaLineupsRes, fantaCalcRes] = await Promise.all([
    supabase
      .from('match_players')
      .select('match_id, player_id, team, players(*)')
      .in('match_id', matchIds),
    supabase.from('goals').select('match_id, player_id, is_own_goal').in('match_id', matchIds),
    supabase.from('assists').select('match_id, player_id').in('match_id', matchIds),
    supabase
      .from('pagelle')
      .select('match_id, player_id, voto, is_mvp')
      .in('match_id', matchIds)
      .not('published_at', 'is', null),
    supabase
      .from('fanta_lineups')
      .select('league_id, match_id, captain_id, fanta_lineup_players(player_id)')
      .in('match_id', matchIds),
    supabase.from('fanta_calculations').select('league_id, match_id').in('match_id', matchIds),
  ])

  const statsByPlayer = new Map<string, PlayerStats>()
  const totalSeasonMatches = resultByMatch.size

  function ensurePlayer(player: Player): PlayerStats {
    const existing = statsByPlayer.get(player.id)
    if (existing) return existing
    const created: PlayerStats = {
      player,
      partiteGiocate: 0,
      vittorie: 0,
      pareggi: 0,
      sconfitte: 0,
      golFatti: 0,
      assist: 0,
      autogol: 0,
      mvp: 0,
      voteAvg: null,
      voteCount: 0,
      overall: null,
      winStreak: 0,
      fantaSchieramenti: 0,
      fantaCapitano: 0,
      totalSeasonMatches,
    }
    statsByPlayer.set(player.id, created)
    return created
  }

  const outcomesByPlayer = new Map<string, { date: string; won: boolean }[]>()

  type MatchPlayerJoin = { match_id: string; player_id: string; team: 'A' | 'B'; players: Player | null }
  for (const mp of (matchPlayersRes.data ?? []) as unknown as MatchPlayerJoin[]) {
    // Gli ospiti non hanno anagrafica permanente: esclusi dalle classifiche/statistiche di stagione.
    if (!mp.players || mp.players.is_guest) continue
    const stats = ensurePlayer(mp.players)
    const result = resultByMatch.get(mp.match_id)
    if (!result) continue

    stats.partiteGiocate += 1
    const ownScore = mp.team === 'A' ? result.score_a : result.score_b
    const oppScore = mp.team === 'A' ? result.score_b : result.score_a
    const won = ownScore > oppScore
    if (won) stats.vittorie += 1
    else if (ownScore < oppScore) stats.sconfitte += 1
    else stats.pareggi += 1

    const outcomes = outcomesByPlayer.get(mp.player_id) ?? []
    outcomes.push({ date: dateByMatch.get(mp.match_id) ?? '', won })
    outcomesByPlayer.set(mp.player_id, outcomes)
  }

  for (const stats of statsByPlayer.values()) {
    const outcomes = [...(outcomesByPlayer.get(stats.player.id) ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    )
    let current = 0
    let longest = 0
    for (const o of outcomes) {
      current = o.won ? current + 1 : 0
      if (current > longest) longest = current
    }
    stats.winStreak = longest
  }

  for (const g of goalsRes.data ?? []) {
    const stats = [...statsByPlayer.values()].find((s) => s.player.id === g.player_id)
    if (!stats) continue
    if (g.is_own_goal) stats.autogol += 1
    else stats.golFatti += 1
  }

  for (const a of assistsRes.data ?? []) {
    const stats = statsByPlayer.get(a.player_id)
    if (stats) stats.assist += 1
  }

  const voteSums = new Map<string, number>()
  for (const p of pagelleRes.data ?? []) {
    const stats = statsByPlayer.get(p.player_id)
    if (!stats) continue
    if (p.is_mvp) stats.mvp += 1
    const parsed = parseVoto(p.voto)
    if (parsed !== null) {
      stats.voteCount += 1
      voteSums.set(p.player_id, (voteSums.get(p.player_id) ?? 0) + parsed)
    }
  }

  for (const stats of statsByPlayer.values()) {
    if (stats.voteCount > 0) {
      stats.voteAvg = (voteSums.get(stats.player.id) ?? 0) / stats.voteCount
    }
  }

  // Schieramenti al fantacalcetto: quante volte ogni giocatore è stato incluso
  // nelle formazioni (e di queste, quante da capitano). Si conteggiano solo le
  // formazioni di giornate concluse e calcolate dall'admin (presenti in
  // fanta_calculations, per lega+partita): finché la giornata non è calcolata
  // gli schieramenti non fanno statistica. E solo i giocatori con anagrafica
  // permanente già presenti nelle statistiche.
  const calculatedKeys = new Set(
    ((fantaCalcRes.data ?? []) as { league_id: string; match_id: string }[]).map(
      (c) => `${c.league_id}|${c.match_id}`,
    ),
  )
  type FantaLineupJoin = {
    league_id: string
    match_id: string
    captain_id: string
    fanta_lineup_players: { player_id: string }[]
  }
  for (const lineup of (fantaLineupsRes.data ?? []) as unknown as FantaLineupJoin[]) {
    if (!calculatedKeys.has(`${lineup.league_id}|${lineup.match_id}`)) continue
    for (const lp of lineup.fanta_lineup_players) {
      const stats = statsByPlayer.get(lp.player_id)
      if (!stats) continue
      stats.fantaSchieramenti += 1
      if (lp.player_id === lineup.captain_id) stats.fantaCapitano += 1
    }
  }

  return [...statsByPlayer.values()]
}

export type StatKey =
  | 'overall'
  | 'format'
  | 'marcatori'
  | 'assist'
  | 'presenze'
  | 'mvp'
  | 'winrate'
  | 'sconfitte'
  | 'mediavoto'
  | 'autogol'
  | 'schieramenti'

interface StatConfig {
  title: string
  description: string
  color: 'green' | 'red'
  sortDir: 'asc' | 'desc'
  unit: string
  getValue: (p: PlayerStats) => number | null
  formatValue: (value: number) => string
  extraColumn?: { label: string; getValue: (p: PlayerStats) => string }
  /** Ordinamento personalizzato (es. classifica a criteri multipli): se presente, prevale su sortDir. */
  compare?: (a: PlayerStats, b: PlayerStats) => number
}

/** Soglia presenze del format: servono PIÙ del 40% delle partite stagionali giocate. */
export const FORMAT_MIN_PRESENZE_RATIO = 0.4

/** Il giocatore rientra nella classifica format? Presenze > 40% del totale
 *  partite stagionali (es. su 10 partite: 5 presenze sì, 4 no). */
export function meetsFormatPresenze(p: PlayerStats): boolean {
  return p.totalSeasonMatches > 0 && p.partiteGiocate / p.totalSeasonMatches > FORMAT_MIN_PRESENZE_RATIO
}

/**
 * Classifica Format: criteri in ordine di importanza.
 * 1. Presenze superiori al 40% delle partite stagionali (chi supera la soglia sta sopra)
 * 2. Media voto (NON fantavoto)  3. Gol fatti  4. % vittorie
 * 5. Numero vittorie  6. Numero MVP  7. Assist fatti
 */
export function compareFormat(a: PlayerStats, b: PlayerStats): number {
  const criteria: ((p: PlayerStats) => number)[] = [
    (p) => (meetsFormatPresenze(p) ? 1 : 0),
    (p) => p.voteAvg ?? 0,
    (p) => p.golFatti,
    (p) => (p.partiteGiocate > 0 ? p.vittorie / p.partiteGiocate : 0),
    (p) => p.vittorie,
    (p) => p.mvp,
    (p) => p.assist,
  ]
  for (const get of criteria) {
    const diff = get(b) - get(a)
    if (diff !== 0) return diff
  }
  return 0
}

export const STAT_CONFIG: Record<StatKey, StatConfig> = {
  overall: {
    title: 'Overall',
    description: 'Valutazione complessiva 1-100 (stile FIFA), calcolata da % vittorie, gol fatti e media voto',
    color: 'green',
    sortDir: 'desc',
    unit: '',
    getValue: (p) => p.overall,
    formatValue: (v) => String(v),
  },
  format: {
    title: 'Classifica Format',
    description:
      'Classifica complessiva del format: presenze superiori al 40% delle partite stagionali, poi media voto, gol fatti, % vittorie, vittorie, MVP e assist',
    color: 'green',
    sortDir: 'desc',
    unit: '',
    getValue: (p) => (p.voteCount > 0 ? p.voteAvg : p.partiteGiocate > 0 ? 0 : null),
    formatValue: (v) => v.toFixed(2),
    extraColumn: { label: 'Presenze', getValue: (p) => String(p.partiteGiocate) },
    compare: compareFormat,
  },
  marcatori: {
    title: 'Gol',
    description: 'Numero di gol segnati in stagione (esclusi gli autogol)',
    color: 'green',
    sortDir: 'desc',
    unit: 'gol',
    getValue: (p) => p.golFatti,
    formatValue: (v) => String(v),
  },
  assist: {
    title: 'Assist',
    description: 'Numero di assist serviti in stagione',
    color: 'green',
    sortDir: 'desc',
    unit: 'assist',
    getValue: (p) => p.assist,
    formatValue: (v) => String(v),
  },
  presenze: {
    title: 'Presenze',
    description: 'Numero di partite giocate in stagione',
    color: 'green',
    sortDir: 'desc',
    unit: 'presenze',
    getValue: (p) => p.partiteGiocate,
    formatValue: (v) => String(v),
  },
  mvp: {
    title: 'MVP',
    description: 'Numero di premi MVP ricevuti in stagione',
    color: 'green',
    sortDir: 'desc',
    unit: 'MVP',
    getValue: (p) => p.mvp,
    formatValue: (v) => String(v),
  },
  winrate: {
    title: 'Percentuale vittorie',
    description:
      'Percentuale di partite vinte sul totale giocate in stagione, ordinata per numero di partite giocate e poi per percentuale di vittorie',
    color: 'green',
    sortDir: 'desc',
    unit: '%',
    getValue: (p) => (p.partiteGiocate > 0 ? (p.vittorie / p.partiteGiocate) * 100 : null),
    formatValue: (v) => `${v.toFixed(0)}%`,
    extraColumn: { label: 'Partite', getValue: (p) => String(p.partiteGiocate) },
    // Prima chi ha giocato più partite (decrescente), a parità chi ha la
    // percentuale di vittorie più alta (decrescente).
    compare: (a, b) => {
      if (b.partiteGiocate !== a.partiteGiocate) return b.partiteGiocate - a.partiteGiocate
      const wa = a.partiteGiocate > 0 ? a.vittorie / a.partiteGiocate : 0
      const wb = b.partiteGiocate > 0 ? b.vittorie / b.partiteGiocate : 0
      return wb - wa
    },
  },
  sconfitte: {
    title: 'Sconfitte',
    description: 'Numero di sconfitte stagionali',
    color: 'red',
    sortDir: 'desc',
    unit: 'sconfitte',
    getValue: (p) => p.sconfitte,
    formatValue: (v) => String(v),
  },
  mediavoto: {
    title: 'Media voto',
    description: 'Media dei voti ricevuti in pagella durante la stagione (ordine decrescente)',
    color: 'green',
    sortDir: 'desc',
    unit: '',
    getValue: (p) => (p.voteCount > 0 ? p.voteAvg : null),
    formatValue: (v) => v.toFixed(2),
  },
  autogol: {
    title: 'Autogol',
    description: 'Numero di autogol realizzati in stagione',
    color: 'red',
    sortDir: 'desc',
    unit: 'autogol',
    getValue: (p) => p.autogol,
    formatValue: (v) => String(v),
  },
  schieramenti: {
    title: 'Schieramenti Fanta',
    description:
      'Numero di volte in cui il giocatore è stato schierato nelle formazioni del fantacalcetto, con il dettaglio di quante da capitano',
    color: 'green',
    sortDir: 'desc',
    unit: 'schieramenti',
    getValue: (p) => p.fantaSchieramenti,
    formatValue: (v) => String(v),
    extraColumn: { label: 'Da capitano', getValue: (p) => String(p.fantaCapitano) },
  },
}

export interface RankedEntry {
  stats: PlayerStats
  value: number
}

/**
 * Prepara i dati di una classifica per l'export CSV (intestazioni + righe già
 * formattate come stringhe, coerenti con la tabella a schermo).
 */
export function rankingCsv(key: StatKey, sorted: RankedEntry[]): { headers: string[]; rows: string[][] } {
  const config = STAT_CONFIG[key]
  const headers = ['#', 'Giocatore', 'Soprannome']
  if (config.extraColumn) headers.push(config.extraColumn.label)
  headers.push(config.title)

  const rows = sorted.map((entry, i) => {
    const row = [String(i + 1), playerFullName(entry.stats.player), entry.stats.player.nickname ?? '']
    if (config.extraColumn) row.push(config.extraColumn.getValue(entry.stats))
    row.push(config.formatValue(entry.value))
    return row
  })
  return { headers, rows }
}

export function getRanking(stats: PlayerStats[], key: StatKey): RankedEntry[] {
  const config = STAT_CONFIG[key]
  const entries = stats
    .map((s) => ({ stats: s, value: config.getValue(s) }))
    .filter((e): e is RankedEntry => e.value !== null)

  if (config.compare) {
    entries.sort((a, b) => config.compare!(a.stats, b.stats))
  } else {
    entries.sort((a, b) => (config.sortDir === 'desc' ? b.value - a.value : a.value - b.value))
  }
  return entries
}
