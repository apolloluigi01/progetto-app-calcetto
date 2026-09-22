import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeEntryPoints, defaultScoreForMissingLineup } from '../lib/fantacalcetto'
import type { Match } from '../types/database'

export interface FantaStanding {
  playerId: string
  name: string
  surname: string | null
  nickname: string | null
  total: number
  matchesScored: number
  /** Giornate calcolate in cui non ha schierato e ha preso il punteggio d'ufficio. */
  matchesNotPlayed: number
  /** Punti d'ingresso (già inclusi in total) per chi si è iscritto a giornate già giocate. */
  entryPoints: number
}

export interface FantaLineupInfo {
  playerIds: string[]
  captainId: string
}

export interface FantaMatchRow {
  match: Match
  hasTeams: boolean
  /** True se l'admin ha ufficializzato le squadre: solo allora si schiera. */
  teamsOfficial: boolean
  hasResult: boolean
  isPublished: boolean
  /** True solo per la prossima partita da giocare: l'unica schierabile. */
  isNext: boolean
  /** True se l'admin ha eseguito il "Calcola giornata" per questa partita. */
  isCalculated: boolean
  myLineup: FantaLineupInfo | null
  myScore: number | null
  /** True se myScore è il punteggio d'ufficio (formazione non schierata). */
  myScoreIsDefault: boolean
}

export interface FantaLeagueData {
  league: {
    id: string
    name: string
    season_id: string
    season_name: string
    season_start_date: string
    /** Ultimo giorno utile per iscriversi (YYYY-MM-DD), scelto dall'admin. */
    join_deadline: string
  }
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
      .select('id, name, season_id, join_deadline, seasons(name, start_date)')
      .eq('id', leagueId)
      .maybeSingle()

    if (leagueRes.error || !leagueRes.data) {
      setError(leagueRes.error?.message ?? 'Lega non trovata')
      setLoading(false)
      return
    }

    type LeagueRow = {
      id: string
      name: string
      season_id: string
      join_deadline: string
      seasons: { name: string; start_date: string } | null
    }
    const leagueRow = leagueRes.data as unknown as LeagueRow

    const [membersRes, matchesRes, lineupsRes, calcsRes] = await Promise.all([
      supabase
        .from('fanta_league_members')
        .select('player_id, joined_at, players(name, surname, nickname)')
        .eq('league_id', leagueId),
      supabase
        .from('matches')
        .select('*, result:match_results(id, match_id, score_a, score_b)')
        .eq('season_id', leagueRow.season_id)
        .order('match_date', { ascending: true }),
      supabase
        .from('fanta_lineups')
        .select('id, match_id, member_id, captain_id, score, fanta_lineup_players(player_id)')
        .eq('league_id', leagueId),
      supabase.from('fanta_calculations').select('match_id').eq('league_id', leagueId),
    ])

    const matchIds = (matchesRes.data ?? []).map((m) => m.id)

    const [matchPlayersRes, pagelleRes] = await Promise.all([
      matchIds.length > 0
        ? supabase.from('match_players').select('match_id, player_id').in('match_id', matchIds)
        : Promise.resolve({ data: [] as { match_id: string; player_id: string }[] }),
      matchIds.length > 0
        ? supabase
            .from('pagelle')
            .select('match_id, player_id')
            .in('match_id', matchIds)
            .not('published_at', 'is', null)
        : Promise.resolve({ data: [] as { match_id: string; player_id: string }[] }),
    ])

    type MemberRow = {
      player_id: string
      joined_at: string
      players: { name: string; surname: string | null; nickname: string | null } | null
    }
    type LineupRow = {
      id: string
      match_id: string
      member_id: string
      captain_id: string
      score: number | null
      fanta_lineup_players: { player_id: string }[]
    }

    const members = (membersRes.data ?? []) as unknown as MemberRow[]
    const lineups = (lineupsRes.data ?? []) as unknown as LineupRow[]
    const matchPlayers = matchPlayersRes.data ?? []
    const pagelle = pagelleRes.data ?? []
    const calculatedMatchIds = new Set((calcsRes.data ?? []).map((c) => c.match_id))

    const teamsCountByMatch = new Map<string, number>()
    for (const mp of matchPlayers) {
      teamsCountByMatch.set(mp.match_id, (teamsCountByMatch.get(mp.match_id) ?? 0) + 1)
    }
    const publishedMatchIds = new Set(pagelle.map((p) => p.match_id))

    const matchDateById = new Map((matchesRes.data ?? []).map((m) => [m.id, m.match_date as string]))

    // Punteggio d'ufficio per giornata calcolata: il più basso tra chi ha
    // schierato. Va a chi non ha schierato affatto (vedi sotto).
    const defaultScoreByMatch = new Map<string, number | null>()
    for (const matchId of calculatedMatchIds) {
      defaultScoreByMatch.set(
        matchId,
        defaultScoreForMissingLineup(
          lineups.filter((l) => l.match_id === matchId).map((l) => l.score),
        ),
      )
    }

    /**
     * Punteggio di un partecipante in una giornata calcolata: quello della sua
     * formazione, oppure — se non ha schierato — il punteggio d'ufficio (il più
     * basso della giornata). Chi si è iscritto alla lega dopo quella giornata
     * non viene conteggiato: non poteva schierare.
     */
    function scoreForMember(
      matchId: string,
      memberId: string,
      joinedAt: string,
    ): { score: number; isDefault: boolean } | null {
      if (!calculatedMatchIds.has(matchId)) return null
      const lineup = lineups.find((l) => l.match_id === matchId && l.member_id === memberId)
      if (lineup && lineup.score !== null) return { score: Number(lineup.score), isDefault: false }
      const matchDate = matchDateById.get(matchId)
      // joined_at è un timestamp, match_date una data: confronto a fine giornata.
      if (matchDate && new Date(joinedAt) > new Date(`${matchDate}T23:59:59`)) return null
      const fallback = defaultScoreByMatch.get(matchId) ?? null
      return fallback === null ? null : { score: fallback, isDefault: true }
    }

    // Chi si iscrive a giornate già giocate entra con il punteggio più basso
    // della classifica generale di quel momento.
    const joinedAtById = new Map(members.map((m) => [m.player_id, m.joined_at]))
    const entryPoints = computeEntryPoints(
      members.map((m) => ({ playerId: m.player_id, joinedAt: m.joined_at })),
      [...calculatedMatchIds].flatMap((id) => {
        const matchDate = matchDateById.get(id)
        return matchDate ? [{ matchId: id, matchDate }] : []
      }),
      (matchId, playerId) => scoreForMember(matchId, playerId, joinedAtById.get(playerId) ?? '')?.score ?? null,
    )

    // Classifica: punti d'ingresso, più la somma dei punteggi persistiti dal
    // "Calcola giornata" dell'admin e dei punteggi d'ufficio delle giornate non schierate.
    const standings: FantaStanding[] = members
      .map((m) => {
        const entry = entryPoints.get(m.player_id) ?? 0
        let total = entry
        let matchesScored = 0
        let matchesNotPlayed = 0
        for (const matchId of calculatedMatchIds) {
          const res = scoreForMember(matchId, m.player_id, m.joined_at)
          if (!res) continue
          total = Math.round((total + res.score) * 100) / 100
          matchesScored += 1
          if (res.isDefault) matchesNotPlayed += 1
        }
        return {
          playerId: m.player_id,
          name: m.players?.name ?? '',
          surname: m.players?.surname ?? null,
          nickname: m.players?.nickname ?? null,
          total,
          matchesScored,
          matchesNotPlayed,
          entryPoints: entry,
        }
      })
      .sort((a, b) => b.total - a.total)

    type MatchWithResult = Match & { result: { id: string }[] | { id: string } | null }
    const matchRows = (matchesRes.data ?? []) as unknown as MatchWithResult[]
    // La prossima partita da giocare (in ordine di data, senza risultato):
    // è l'unica per cui si può schierare la formazione.
    const nextMatchId =
      matchRows.find((m) => !(Array.isArray(m.result) ? m.result[0] ?? null : m.result))?.id ?? null

    const myMember = members.find((mem) => mem.player_id === myPlayerId) ?? null

    const matches: FantaMatchRow[] = matchRows.map((m) => {
      const result = Array.isArray(m.result) ? m.result[0] ?? null : m.result
      const myLineupRow = lineups.find((l) => l.match_id === m.id && l.member_id === myPlayerId) ?? null
      const myScoreRes =
        myMember && myPlayerId ? scoreForMember(m.id, myPlayerId, myMember.joined_at) : null
      return {
        match: m as unknown as Match,
        hasTeams: (teamsCountByMatch.get(m.id) ?? 0) > 0,
        teamsOfficial: !!m.teams_official_at,
        hasResult: !!result,
        isPublished: publishedMatchIds.has(m.id),
        isNext: m.id === nextMatchId,
        isCalculated: calculatedMatchIds.has(m.id),
        myLineup: myLineupRow
          ? {
              playerIds: myLineupRow.fanta_lineup_players.map((p) => p.player_id),
              captainId: myLineupRow.captain_id,
            }
          : null,
        myScore: myScoreRes?.score ?? null,
        myScoreIsDefault: myScoreRes?.isDefault ?? false,
      }
    })

    setData({
      league: {
        id: leagueRow.id,
        name: leagueRow.name,
        season_id: leagueRow.season_id,
        season_name: leagueRow.seasons?.name ?? '',
        season_start_date: leagueRow.seasons?.start_date ?? '',
        join_deadline: leagueRow.join_deadline,
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
