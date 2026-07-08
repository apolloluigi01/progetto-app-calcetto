import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, MatchResult, Team } from '../types/database'

export interface DashboardGoal {
  player_id: string
  team: Team
  name: string
  nickname: string | null
  is_own_goal: boolean
}

export interface DashboardMatchPlayer {
  player_id: string
  team: Team
  name: string
  nickname: string | null
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
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const today = new Date().toISOString().slice(0, 10)

      try {
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

        if (lastRes.error) throw lastRes.error
        if (nextRes.error) throw nextRes.error

        if (lastRes.data) {
          const m = lastRes.data as Match & { result: MatchResult[] | MatchResult | null }
          const { data: goalsData, error: goalsError } = await supabase
            .from('goals')
            .select('player_id, team, is_own_goal, players(name, nickname)')
            .eq('match_id', m.id)

          if (goalsError) throw goalsError

          type GoalJoin = {
            player_id: string
            team: Team
            is_own_goal: boolean
            players: { name: string; nickname: string | null } | null
          }
          setLastMatch({
            match: m,
            result: Array.isArray(m.result) ? m.result[0] ?? null : m.result,
            goals: ((goalsData ?? []) as unknown as GoalJoin[]).map((g) => ({
              player_id: g.player_id,
              team: g.team,
              is_own_goal: g.is_own_goal,
              name: g.players?.name ?? '',
              nickname: g.players?.nickname ?? null,
            })),
          })
        } else {
          setLastMatch(null)
        }

        if (nextRes.data) {
          const m = nextRes.data as Match
          const { data: playersData, error: playersError } = await supabase
            .from('match_players')
            .select('player_id, team, players(name, nickname)')
            .eq('match_id', m.id)

          if (playersError) throw playersError

          type PlayerJoin = { player_id: string; team: Team; players: { name: string; nickname: string | null } | null }
          setNextMatch({
            match: m,
            players: ((playersData ?? []) as unknown as PlayerJoin[]).map((p) => ({
              player_id: p.player_id,
              team: p.team,
              name: p.players?.name ?? '',
              nickname: p.players?.nickname ?? null,
            })),
          })
        } else {
          setNextMatch(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore nel caricamento della dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reloadToken])

  return { lastMatch, nextMatch, loading, error, reload: () => setReloadToken((t) => t + 1) }
}
