import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeLineupScore } from '../lib/fantacalcetto'
import type { Match } from '../types/database'

export interface FantaStanding {
  playerId: string
  name: string
  nickname: string | null
  total: number
  matchesScored: number
}

export interface FantaLineupInfo {
  playerIds: string[]
  captainId: string
}

export interface FantaMatchRow {
  match: Match
  hasTeams: boolean
  hasResult: boolean
  isPublished: boolean
  myLineup: FantaLineupInfo | null
  myScore: number | null
}

export interface FantaLeagueData {
  league: { id: string; name: string; season_id: string; season_name: string }
  isMember: boolean
  standings: FantaStanding[]
  matches: FantaMatchRow[]
}

export function useFantaLeague(leagueId: string | undefined, myPlayerId: string | undefined) {
  const [data, setData] = useState<FantaLeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!leagueId || !myPlayerId) return
    setLoading(true)
    setError(null)

    const leagueRes = await supabase
      .from('fanta_leagues')
      .select('id, name, season_id, seasons(name)')
      .eq('id', leagueId)
      .single()

    if (leagueRes.error || !leagueRes.data) {
      setError(leagueRes.error?.message ?? 'Lega non trovata')
      setLoading(false)
      return
    }

    type LeagueRow = { id: string; name: string; season_id: string; seasons: { name: string } | null }
    const leagueRow = leagueRes.data as unknown as LeagueRow

    const [membersRes, matchesRes, lineupsRes] = await Promise.all([
      supabase
        .from('fanta_league_members')
        .select('player_id, players(name, nickname)')
        .eq('league_id', leagueId),
      supabase
        .from('matches')
        .select('*, result:match_results(id, match_id, score_a, score_b)')
        .eq('season_id', leagueRow.season_id)
        .order('match_date', { ascending: true }),
      supabase
        .from('fanta_lineups')
        .select('id, match_id, member_id, captain_id, fanta_lineup_players(player_id)')
        .eq('league_id', leagueId),
    ])

    const matchIds = (matchesRes.data ?? []).map((m) => m.id)

    const [matchPlayersRes, pagelleRes, goalsRes] = await Promise.all([
      matchIds.length > 0
        ? supabase.from('match_players').select('match_id, player_id').in('match_id', matchIds)
        : Promise.resolve({ data: [] as { match_id: string; player_id: string }[] }),
      matchIds.length > 0
        ? supabase
            .from('pagelle')
            .select('match_id, player_id, voto, is_mvp')
            .in('match_id', matchIds)
            .not('published_at', 'is', null)
        : Promise.resolve({ data: [] as { match_id: string; player_id: string; voto: string; is_mvp: boolean }[] }),
      matchIds.length > 0
        ? supabase
            .from('goals')
            .select('match_id, player_id, is_own_goal, assist_player_id')
            .in('match_id', matchIds)
        : Promise.resolve({
            data: [] as { match_id: string; player_id: string; is_own_goal: boolean; assist_player_id: string | null }[],
          }),
    ])

    type MemberRow = { player_id: string; players: { name: string; nickname: string | null } | null }
    type LineupRow = {
      id: string
      match_id: string
      member_id: string
      captain_id: string
      fanta_lineup_players: { player_id: string }[]
    }

    const members = (membersRes.data ?? []) as unknown as MemberRow[]
    const lineups = (lineupsRes.data ?? []) as unknown as LineupRow[]
    const matchPlayers = matchPlayersRes.data ?? []
    const pagelle = pagelleRes.data ?? []
    const goals = goalsRes.data ?? []

    const teamsCountByMatch = new Map<string, number>()
    for (const mp of matchPlayers) {
      teamsCountByMatch.set(mp.match_id, (teamsCountByMatch.get(mp.match_id) ?? 0) + 1)
    }
    const publishedMatchIds = new Set(pagelle.map((p) => p.match_id))

    // Punteggi: per ogni partita con pagelle pubblicate, calcola il punteggio
    // di ogni formazione schierata e accumula la classifica.
    const totals = new Map<string, { total: number; matchesScored: number }>()
    const scoreByLineup = new Map<string, number>()
    for (const lineup of lineups) {
      if (!publishedMatchIds.has(lineup.match_id)) continue
      const score = computeLineupScore(
        lineup.fanta_lineup_players.map((p) => p.player_id),
        lineup.captain_id,
        {
          pagelle: pagelle.filter((p) => p.match_id === lineup.match_id),
          goals: goals.filter((g) => g.match_id === lineup.match_id),
        },
      )
      scoreByLineup.set(lineup.id, score.total)
      const prev = totals.get(lineup.member_id) ?? { total: 0, matchesScored: 0 }
      totals.set(lineup.member_id, {
        total: Math.round((prev.total + score.total) * 100) / 100,
        matchesScored: prev.matchesScored + 1,
      })
    }

    const standings: FantaStanding[] = members
      .map((m) => ({
        playerId: m.player_id,
        name: m.players?.name ?? '',
        nickname: m.players?.nickname ?? null,
        total: totals.get(m.player_id)?.total ?? 0,
        matchesScored: totals.get(m.player_id)?.matchesScored ?? 0,
      }))
      .sort((a, b) => b.total - a.total)

    type MatchWithResult = Match & { result: { id: string }[] | { id: string } | null }
    const matches: FantaMatchRow[] = ((matchesRes.data ?? []) as unknown as MatchWithResult[]).map((m) => {
      const result = Array.isArray(m.result) ? m.result[0] ?? null : m.result
      const myLineupRow = lineups.find((l) => l.match_id === m.id && l.member_id === myPlayerId) ?? null
      return {
        match: m as unknown as Match,
        hasTeams: (teamsCountByMatch.get(m.id) ?? 0) > 0,
        hasResult: !!result,
        isPublished: publishedMatchIds.has(m.id),
        myLineup: myLineupRow
          ? {
              playerIds: myLineupRow.fanta_lineup_players.map((p) => p.player_id),
              captainId: myLineupRow.captain_id,
            }
          : null,
        myScore: myLineupRow ? scoreByLineup.get(myLineupRow.id) ?? null : null,
      }
    })

    setData({
      league: {
        id: leagueRow.id,
        name: leagueRow.name,
        season_id: leagueRow.season_id,
        season_name: leagueRow.seasons?.name ?? '',
      },
      isMember: members.some((m) => m.player_id === myPlayerId),
      standings,
      matches,
    })
    setLoading(false)
  }, [leagueId, myPlayerId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
