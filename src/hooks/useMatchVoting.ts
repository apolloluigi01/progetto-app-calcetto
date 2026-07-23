import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPlayerAverages,
  getProvisionalMvpId,
  type PlayerAverage,
  type VoteWithRole,
} from '../lib/voting'
import type { PlayerRole, Team } from '../types/database'

export interface VotingParticipant {
  player_id: string
  name: string
  surname: string | null
  nickname: string | null
  role: PlayerRole
  team: Team
}

export interface VoterInfo {
  name: string
  surname: string | null
  nickname: string | null
  role: PlayerRole
}

export function useMatchVoting(matchId: string | undefined) {
  const [votes, setVotes] = useState<VoteWithRole[]>([])
  const [participants, setParticipants] = useState<VotingParticipant[]>([])
  const [voterInfo, setVoterInfo] = useState<Map<string, VoterInfo>>(new Map())
  // Bonus (gol + assist) per giocatore: serve come spareggio nel calcolo dell'MVP.
  const [bonusByPlayer, setBonusByPlayer] = useState<Map<string, number>>(new Map())
  // Gol regolari per giocatore: ulteriore spareggio (peso dei bonus) nell'MVP.
  const [goalsByPlayer, setGoalsByPlayer] = useState<Map<string, number>>(new Map())
  // Squadra vincitrice ('A' | 'B'); null se pareggio o risultato assente.
  const [winningTeam, setWinningTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!matchId) { setLoading(false); return }
    setLoading(true)

    const [votesRes, partsRes, goalsRes, assistsRes, resultRes] = await Promise.all([
      supabase
        .from('player_votes')
        .select('voter_id, voted_id, vote')
        .eq('match_id', matchId),
      supabase
        .from('match_players')
        .select('player_id, team, players(name, surname, nickname, role)')
        .eq('match_id', matchId),
      supabase.from('goals').select('player_id, is_own_goal').eq('match_id', matchId),
      supabase.from('assists').select('player_id').eq('match_id', matchId),
      supabase.from('match_results').select('score_a, score_b').eq('match_id', matchId).maybeSingle(),
    ])

    // I bonus contano i gol regolari (non gli autogol) e gli assist; i gol
    // regolari vengono contati anche a parte per lo spareggio "peso dei bonus".
    const bonus = new Map<string, number>()
    const goalsOnly = new Map<string, number>()
    for (const g of (goalsRes.data ?? []) as { player_id: string; is_own_goal: boolean }[]) {
      if (!g.is_own_goal) {
        bonus.set(g.player_id, (bonus.get(g.player_id) ?? 0) + 1)
        goalsOnly.set(g.player_id, (goalsOnly.get(g.player_id) ?? 0) + 1)
      }
    }
    for (const a of (assistsRes.data ?? []) as { player_id: string }[]) {
      bonus.set(a.player_id, (bonus.get(a.player_id) ?? 0) + 1)
    }
    setBonusByPlayer(bonus)
    setGoalsByPlayer(goalsOnly)

    const res = resultRes.data as { score_a: number; score_b: number } | null
    setWinningTeam(res ? (res.score_a > res.score_b ? 'A' : res.score_b > res.score_a ? 'B' : null) : null)

    type PartRow = {
      player_id: string
      team: Team
      players: { name: string; surname: string | null; nickname: string | null; role: string } | null
    }
    const parts = ((partsRes.data ?? []) as unknown as PartRow[]).map((p) => ({
      player_id: p.player_id,
      name: p.players?.name ?? '',
      surname: p.players?.surname ?? null,
      nickname: p.players?.nickname ?? null,
      role: (p.players?.role ?? 'player') as PlayerRole,
      team: p.team,
    }))
    setParticipants(parts)

    const rawVotes = (votesRes.data ?? []) as { voter_id: string; voted_id: string; vote: number }[]

    const nameRoleMap = new Map(
      parts.map((p) => [p.player_id, { name: p.name, surname: p.surname, nickname: p.nickname, role: p.role }])
    )
    const missingVoterIds = [...new Set(rawVotes.map((v) => v.voter_id))].filter(
      (id) => !nameRoleMap.has(id)
    )
    if (missingVoterIds.length > 0) {
      const { data: extraPlayers } = await supabase
        .from('players')
        .select('id, name, surname, nickname, role')
        .in('id', missingVoterIds)
      for (const p of (extraPlayers ?? []) as { id: string; name: string; surname: string | null; nickname: string | null; role: PlayerRole }[]) {
        nameRoleMap.set(p.id, { name: p.name, surname: p.surname, nickname: p.nickname, role: p.role })
      }
    }

    const withRole: VoteWithRole[] = rawVotes.map((v) => ({
      voter_id: v.voter_id,
      voted_id: v.voted_id,
      vote: v.vote,
      voter_role: nameRoleMap.get(v.voter_id)?.role ?? 'player',
    }))
    setVotes(withRole)
    setVoterInfo(nameRoleMap)
    setLoading(false)
  }, [matchId])

  useEffect(() => { load() }, [load])

  const playerIds = participants.map((p) => p.player_id)
  const averages: PlayerAverage[] = getPlayerAverages(votes, playerIds)
  const teamByPlayer = new Map<string, Team>(participants.map((p) => [p.player_id, p.team]))
  // MVP automatico con catena di spareggi: media esatta → squadra vincitrice →
  // numero di bonus (gol+assist) → più gol. Null se resta il parimerito totale
  // (in quel caso decide l'admin alla pubblicazione).
  const provisionalMvpId: string | null = getProvisionalMvpId(averages, {
    bonusByPlayer,
    goalsByPlayer,
    teamByPlayer,
    winningTeam,
  })

  const voterIds = new Set(votes.map((v) => v.voter_id))

  // Votanti attesi: gli admin/superadmin che hanno partecipato alla partita.
  // Caso limite: se nessun admin ha partecipato, vota il superadmin (che però
  // non è tra i participants) — in quel caso non possiamo dedurre l'elenco dai
  // soli participants, quindi consideriamo "completo" appena c'è almeno un voto.
  const adminVoterIds = participants
    .filter((p) => p.role === 'admin' || p.role === 'superadmin')
    .map((p) => p.player_id)
  const allAdminVotersVoted =
    adminVoterIds.length > 0
      ? adminVoterIds.every((aid) => voterIds.has(aid))
      : voterIds.size > 0

  function getMyVotes(myId: string): Record<string, number> {
    return Object.fromEntries(
      votes.filter((v) => v.voter_id === myId).map((v) => [v.voted_id, v.vote])
    )
  }

  function hasVotedAll(myId: string): boolean {
    if (participants.length === 0) return false
    const myVotedIds = new Set(votes.filter((v) => v.voter_id === myId).map((v) => v.voted_id))
    return participants.every((p) => myVotedIds.has(p.player_id))
  }

  async function submitVotes(myId: string, myVotes: Record<string, number>): Promise<void> {
    if (!matchId) return
    const rows = Object.entries(myVotes).map(([voted_id, vote]) => ({
      match_id: matchId,
      voter_id: myId,
      voted_id,
      vote,
    }))
    await supabase
      .from('player_votes')
      .upsert(rows, { onConflict: 'match_id,voter_id,voted_id' })
    await load()
  }

  return {
    votes,
    participants,
    voterInfo,
    averages,
    provisionalMvpId,
    bonusByPlayer,
    goalsByPlayer,
    winningTeam,
    voterIds,
    adminVoterIds,
    allAdminVotersVoted,
    loading,
    getMyVotes,
    hasVotedAll,
    submitVotes,
    refetch: load,
  }
}
