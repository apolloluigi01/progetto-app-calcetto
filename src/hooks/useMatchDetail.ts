import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Match, MatchResult, Player, Team } from '../types/database'

export interface MatchPlayerWithName {
  id: string
  player_id: string
  team: Team
  name: string
  surname: string | null
  nickname: string | null
  player: Player | null
}

export interface GoalWithName {
  id: string
  player_id: string
  team: Team
  name: string
  surname: string | null
  nickname: string | null
  is_own_goal: boolean
}

export interface AssistWithName {
  id: string
  player_id: string
  team: Team
  name: string
  surname: string | null
  nickname: string | null
}

export interface PagellaWithName {
  id: string
  player_id: string
  name: string
  surname: string | null
  nickname: string | null
  voto: string
  titolo: string | null
  descrizione: string | null
  is_mvp: boolean
  published_at: string | null
}

export interface MatchDetailData {
  match: Match
  matchPlayers: MatchPlayerWithName[]
  goals: GoalWithName[]
  assists: AssistWithName[]
  result: MatchResult | null
  pagelle: PagellaWithName[]
}

export function useMatchDetail(matchId: string | undefined) {
  const [data, setData] = useState<MatchDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!matchId) return
    setLoading(true)
    setError(null)

    const [matchRes, playersRes, goalsRes, assistsRes, resultRes, pagelleRes] = await Promise.all([
      supabase.from('matches').select('*').eq('id', matchId).maybeSingle(),
      supabase
        .from('match_players')
        .select('id, player_id, team, players(*)')
        .eq('match_id', matchId),
      supabase.from('goals').select('id, player_id, team, is_own_goal, players(name, surname, nickname)').eq('match_id', matchId),
      supabase.from('assists').select('id, player_id, team, players(name, surname, nickname)').eq('match_id', matchId),
      supabase.from('match_results').select('*').eq('match_id', matchId).maybeSingle(),
      supabase
        .from('pagelle')
        .select('id, player_id, voto, titolo, descrizione, is_mvp, published_at, players(name, surname, nickname)')
        .eq('match_id', matchId),
    ])

    if (matchRes.error) {
      setError(matchRes.error.message)
      setLoading(false)
      return
    }
    // La partita non esiste (o è appena stata eliminata): non è un errore di
    // sistema, mostriamo un messaggio pulito invece del raw PostgREST error.
    if (!matchRes.data) {
      setData(null)
      setError('Partita non trovata')
      setLoading(false)
      return
    }

    type PlayerJoin = { players: { name: string; surname?: string | null; nickname?: string | null } | null }
    type FullPlayerJoin = { players: Player | null }

    setData({
      match: matchRes.data as Match,
      matchPlayers: ((playersRes.data ?? []) as unknown as (MatchPlayerWithName & FullPlayerJoin)[]).map((p) => ({
        id: p.id,
        player_id: p.player_id,
        team: p.team,
        name: p.players?.name ?? '',
        surname: p.players?.surname ?? null,
        nickname: p.players?.nickname ?? null,
        player: p.players ?? null,
      })),
      goals: ((goalsRes.data ?? []) as unknown as (GoalWithName & PlayerJoin)[]).map((g) => ({
        id: g.id,
        player_id: g.player_id,
        team: g.team,
        name: g.players?.name ?? '',
        surname: g.players?.surname ?? null,
        nickname: g.players?.nickname ?? null,
        is_own_goal: g.is_own_goal,
      })),
      assists: ((assistsRes.data ?? []) as unknown as (AssistWithName & PlayerJoin)[]).map((a) => ({
        id: a.id,
        player_id: a.player_id,
        team: a.team,
        name: a.players?.name ?? '',
        surname: a.players?.surname ?? null,
        nickname: a.players?.nickname ?? null,
      })),
      result: (resultRes.data as MatchResult | null) ?? null,
      pagelle: ((pagelleRes.data ?? []) as unknown as (PagellaWithName & PlayerJoin)[]).map((p) => ({
        id: p.id,
        player_id: p.player_id,
        name: p.players?.name ?? '',
        surname: p.players?.surname ?? null,
        nickname: p.players?.nickname ?? null,
        voto: p.voto,
        titolo: p.titolo,
        descrizione: p.descrizione,
        is_mvp: p.is_mvp,
        published_at: p.published_at,
      })),
    })
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
