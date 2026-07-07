import { supabase } from './supabase'
import type { Player } from '../types/database'

export interface PlayerStats {
  player: Player
  partiteGiocate: number
  vittorie: number
  pareggi: number
  sconfitte: number
  golFatti: number
  autogol: number
  mvp: number
  voteAvg: number | null
  voteCount: number
  overall: number | null
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
    .select('id, result:match_results(score_a, score_b)')
    .eq('season_id', seasonId)

  const matchIds = (matches ?? []).map((m) => m.id)
  if (matchIds.length === 0) return []

  const resultByMatch = new Map<string, { score_a: number; score_b: number }>()
  for (const m of matches ?? []) {
    const result = Array.isArray(m.result) ? m.result[0] : m.result
    if (result) resultByMatch.set(m.id, result)
  }

  const [matchPlayersRes, goalsRes, pagelleRes] = await Promise.all([
    supabase
      .from('match_players')
      .select('match_id, player_id, team, players(*)')
      .in('match_id', matchIds),
    supabase.from('goals').select('match_id, player_id, is_own_goal').in('match_id', matchIds),
    supabase
      .from('pagelle')
      .select('match_id, player_id, voto, is_mvp')
      .in('match_id', matchIds)
      .not('published_at', 'is', null),
  ])

  const statsByPlayer = new Map<string, PlayerStats>()

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
      autogol: 0,
      mvp: 0,
      voteAvg: null,
      voteCount: 0,
      overall: null,
    }
    statsByPlayer.set(player.id, created)
    return created
  }

  type MatchPlayerJoin = { match_id: string; player_id: string; team: 'A' | 'B'; players: Player | null }
  for (const mp of (matchPlayersRes.data ?? []) as unknown as MatchPlayerJoin[]) {
    if (!mp.players) continue
    const stats = ensurePlayer(mp.players)
    const result = resultByMatch.get(mp.match_id)
    if (!result) continue

    stats.partiteGiocate += 1
    const ownScore = mp.team === 'A' ? result.score_a : result.score_b
    const oppScore = mp.team === 'A' ? result.score_b : result.score_a
    if (ownScore > oppScore) stats.vittorie += 1
    else if (ownScore < oppScore) stats.sconfitte += 1
    else stats.pareggi += 1
  }

  for (const g of goalsRes.data ?? []) {
    const stats = [...statsByPlayer.values()].find((s) => s.player.id === g.player_id)
    if (!stats) continue
    if (g.is_own_goal) stats.autogol += 1
    else stats.golFatti += 1
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

  return [...statsByPlayer.values()]
}

export type StatKey = 'overall' | 'marcatori' | 'mvp' | 'winrate' | 'sconfitte' | 'mediavoto' | 'autogol'

interface StatConfig {
  title: string
  description: string
  color: 'green' | 'red'
  sortDir: 'asc' | 'desc'
  unit: string
  getValue: (p: PlayerStats) => number | null
  formatValue: (value: number) => string
  extraColumn?: { label: string; getValue: (p: PlayerStats) => string }
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
  marcatori: {
    title: 'Migliori Marcatori',
    description: 'Numero di gol segnati in stagione (esclusi gli autogol)',
    color: 'green',
    sortDir: 'desc',
    unit: 'gol',
    getValue: (p) => p.golFatti,
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
    description: 'Percentuale di partite vinte sul totale giocate in stagione',
    color: 'green',
    sortDir: 'desc',
    unit: '%',
    getValue: (p) => (p.partiteGiocate > 0 ? (p.vittorie / p.partiteGiocate) * 100 : null),
    formatValue: (v) => `${v.toFixed(0)}%`,
    extraColumn: { label: 'Partite', getValue: (p) => String(p.partiteGiocate) },
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
    description: 'Media dei voti ricevuti in pagella durante la stagione (ordine crescente)',
    color: 'red',
    sortDir: 'asc',
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
}

export interface RankedEntry {
  stats: PlayerStats
  value: number
}

export function getRanking(stats: PlayerStats[], key: StatKey): RankedEntry[] {
  const config = STAT_CONFIG[key]
  const entries = stats
    .map((s) => ({ stats: s, value: config.getValue(s) }))
    .filter((e): e is RankedEntry => e.value !== null)

  entries.sort((a, b) => (config.sortDir === 'desc' ? b.value - a.value : a.value - b.value))
  return entries
}
