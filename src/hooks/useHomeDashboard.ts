import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, MatchResult, Team } from '../types/database'

export interface DashboardGoal {
  player_id: string
  team: Team
  name: string
  is_own_goal: boolean
}

export interface DashboardMatchPlayer {
  player_id: string
  team: Team
  name: string
}

export interface LastMatch {
  match: Match
  result: MatchResult | null
  goals: DashboardGoal[]
}

export interface NextMatch {
  match: Match
  players: DashboardMatchPlayer[]
}

export function useHomeDashboard() {
  const [lastMatch, setLastMatch] = useState<LastMatch | null>(null)
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)

      const [lastRes, nextRes] = await Promise.all([
        supabase
          .from('matches')
          .select('*, result:match_results(score_a, score_b, id, match_id)')
          .eq('status', 'completed')
          .order('match_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('matches')
          .select('*')
          .gte('match_date', today)
          .order('match_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      if (lastRes.data) {
        const m = lastRes.data as Match & { result: MatchResult[] | MatchResult | null }
        const { data: goalsData } = await supabase
          .from('goals')
          .select('player_id, team, is_own_goal, players(name)')
          .eq('match_id', m.id)

        type GoalJoin = { player_id: string; team: Team; is_own_goal: boolean; players: { name: string } | null }
        setLastMatch({
          match: m,
          result: Array.isArray(m.result) ? m.result[0] ?? null : m.result,
          goals: ((goalsData ?? []) as unknown as GoalJoin[]).map((g) => ({
            player_id: g.player_id,
            team: g.team,
            is_own_goal: g.is_own_goal,
            name: g.players?.name ?? '',
          })),
        })
      } else {
        setLastMatch(null)
      }

      if (nextRes.data) {
        const m = nextRes.data as Match
        const { data: playersData } = await supabase
          .from('match_players')
          .select('player_id, team, players(name)')
          .eq('match_id', m.id)

        type PlayerJoin = { player_id: string; team: Team; players: { name: string } | null }
        setNextMatch({
          match: m,
          players: ((playersData ?? []) as unknown as PlayerJoin[]).map((p) => ({
            player_id: p.player_id,
            team: p.team,
            name: p.players?.name ?? '',
          })),
        })
      } else {
        setNextMatch(null)
      }

      setLoading(false)
    }
    load()
  }, [])

  return { lastMatch, nextMatch, loading }
}
