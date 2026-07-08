import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getPlayerAverages,
  tallyMvpVotes,
  type MvpVote,
  type PlayerAverage,
  type VoteWithRole,
} from '../lib/voting'
import type { PlayerRole } from '../types/database'

export interface VotingParticipant {
  player_id: string
  name: string
  nickname: string | null
  role: PlayerRole
}

export interface VoterInfo {
  name: string
  nickname: string | null
  role: PlayerRole
}

export function useMatchVoting(matchId: string | undefined) {
  const [votes, setVotes] = useState<VoteWithRole[]>([])
  const [mvpVotes, setMvpVotes] = useState<MvpVote[]>([])
  const [participants, setParticipants] = useState<VotingParticipant[]>([])
  const [voterInfo, setVoterInfo] = useState<Map<string, VoterInfo>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!matchId) { setLoading(false); return }
    setLoading(true)

    const [votesRes, mvpRes, partsRes] = await Promise.all([
      supabase
        .from('player_votes')
        .select('voter_id, voted_id, vote')
        .eq('match_id', matchId),
      supabase
        .from('mvp_votes')
        .select('voter_id, voted_id')
        .eq('match_id', matchId),
      supabase
        .from('match_players')
        .select('player_id, players(name, nickname, role)')
        .eq('match_id', matchId),
    ])

    type PartRow = {
      player_id: string
      players: { name: string; nickname: string | null; role: string } | null
    }
    const parts = ((partsRes.data ?? []) as unknown as PartRow[]).map((p) => ({
      player_id: p.player_id,
      name: p.players?.name ?? '',
      nickname: p.players?.nickname ?? null,
      role: (p.players?.role ?? 'player') as PlayerRole,
    }))
    setParticipants(parts)

    const rawVotes = (votesRes.data ?? []) as { voter_id: string; voted_id: string; vote: number }[]

    const nameRoleMap = new Map(
      parts.map((p) => [p.player_id, { name: p.name, nickname: p.nickname, role: p.role }])
    )
    const missingVoterIds = [...new Set(rawVotes.map((v) => v.voter_id))].filter(
      (id) => !nameRoleMap.has(id)
    )
    if (missingVoterIds.length > 0) {
      const { data: extraPlayers } = await supabase
        .from('players')
        .select('id, name, nickname, role')
        .in('id', missingVoterIds)
      for (const p of (extraPlayers ?? []) as { id: string; name: string; nickname: string | null; role: PlayerRole }[]) {
        nameRoleMap.set(p.id, { name: p.name, nickname: p.nickname, role: p.role })
      }
    }

    const withRole: VoteWithRole[] = rawVotes.map((v) => ({
      voter_id: v.voter_id,
      voted_id: v.voted_id,
      vote: v.vote,
      voter_role: nameRoleMap.get(v.voter_id)?.role ?? 'player',
    }))
    setVotes(withRole)
    setMvpVotes((mvpRes.data ?? []) as MvpVote[])
    setVoterInfo(nameRoleMap)
    setLoading(false)
  }, [matchId])

  useEffect(() => { load() }, [load])

  const playerIds = participants.map((p) => p.player_id)
  const averages: PlayerAverage[] = getPlayerAverages(votes, playerIds)
  // Spoglio dei voti MVP: il provvisorio è il più votato, null se parimerito
  // (in quel caso decide l'admin alla pubblicazione delle pagelle).
  const mvpTally = tallyMvpVotes(mvpVotes)
  const provisionalMvpId: string | null = mvpTally.leaderId

  const voterIds = new Set(votes.map((v) => v.voter_id))

  function getMyVotes(myId: string): Record<string, number> {
    return Object.fromEntries(
      votes.filter((v) => v.voter_id === myId).map((v) => [v.voted_id, v.vote])
    )
  }

  function getMyMvpVote(myId: string): string {
    return mvpVotes.find((v) => v.voter_id === myId)?.voted_id ?? ''
  }

  function hasVotedAll(myId: string): boolean {
    if (participants.length === 0) return false
    const myVotedIds = new Set(votes.filter((v) => v.voter_id === myId).map((v) => v.voted_id))
    return participants.every((p) => myVotedIds.has(p.player_id))
  }

  async function submitVotes(
    myId: string,
    myVotes: Record<string, number>,
    myMvpId?: string,
  ): Promise<void> {
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
    if (myMvpId) {
      await supabase
        .from('mvp_votes')
        .upsert(
          { match_id: matchId, voter_id: myId, voted_id: myMvpId },
          { onConflict: 'match_id,voter_id' },
        )
    }
    await load()
  }

  return {
    votes,
    mvpVotes,
    mvpTally,
    participants,
    voterInfo,
    averages,
    provisionalMvpId,
    voterIds,
    loading,
    getMyVotes,
    getMyMvpVote,
    hasVotedAll,
    submitVotes,
    refetch: load,
  }
}
