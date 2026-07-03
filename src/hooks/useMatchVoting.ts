import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPlayerAverages,
  getProvisionalMvpId,
  type PlayerAverage,
  type VoteWithRole,
} from '../lib/voting'
import type { PlayerRole } from '../types/database'

export interface VotingParticipant {
  player_id: string
  name: string
  role: PlayerRole
}

export interface VoterInfo {
  name: string
  role: PlayerRole
}

export function useMatchVoting(matchId: string | undefined) {
  const [votes, setVotes] = useState<VoteWithRole[]>([])
  const [participants, setParticipants] = useState<VotingParticipant[]>([])
  const [voterInfo, setVoterInfo] = useState<Map<string, VoterInfo>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!matchId) { setLoading(false); return }
    setLoading(true)

    const [votesRes, partsRes] = await Promise.all([
      supabase
        .from('player_votes')
        .select('voter_id, voted_id, vote')
        .eq('match_id', matchId),
      supabase
        .from('match_players')
        .select('player_id, players(name, role)')
        .eq('match_id', matchId),
    ])

    type PartRow = { player_id: string; players: { name: string; role: string } | null }
    const parts = ((partsRes.data ?? []) as unknown as PartRow[]).map((p) => ({
      player_id: p.player_id,
      name: p.players?.name ?? '',
      role: (p.players?.role ?? 'player') as PlayerRole,
    }))
    setParticipants(parts)

    const rawVotes = (votesRes.data ?? []) as { voter_id: string; voted_id: string; vote: number }[]

    const nameRoleMap = new Map(parts.map((p) => [p.player_id, { name: p.name, role: p.role }]))
    const missingVoterIds = [...new Set(rawVotes.map((v) => v.voter_id))].filter(
      (id) => !nameRoleMap.has(id)
    )
    if (missingVoterIds.length > 0) {
      const { data: extraPlayers } = await supabase
        .from('players')
        .select('id, name, role')
        .in('id', missingVoterIds)
      for (const p of (extraPlayers ?? []) as { id: string; name: string; role: PlayerRole }[]) {
        nameRoleMap.set(p.id, { name: p.name, role: p.role })
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
  const provisionalMvpId: string | null = getProvisionalMvpId(averages)

  const voterIds = new Set(votes.map((v) => v.voter_id))

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
    voterIds,
    loading,
    getMyVotes,
    hasVotedAll,
    submitVotes,
    refetch: load,
  }
}
