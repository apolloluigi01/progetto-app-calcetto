import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface BookingEntry {
  id: string
  player_id: string
  created_at: string
  name: string
  surname: string | null
  nickname: string | null
}

interface UseMatchBookingsResult {
  bookings: BookingEntry[]
  loading: boolean
  error: string | null
  isBooked: boolean
  refetch: () => void
}

export function useMatchBookings(
  matchId: string | undefined,
  currentPlayerId: string | undefined,
): UseMatchBookingsResult {
  const [bookings, setBookings] = useState<BookingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!matchId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('match_bookings')
      .select('id, player_id, created_at, players(name, surname, nickname)')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      type Row = { id: string; player_id: string; created_at: string; players: { name: string; surname: string | null; nickname: string | null } | null }
      setBookings(
        ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          player_id: r.player_id,
          created_at: r.created_at,
          name: r.players?.name ?? '',
          surname: r.players?.surname ?? null,
          nickname: r.players?.nickname ?? null,
        })),
      )
    }
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const isBooked = !!currentPlayerId && bookings.some((b) => b.player_id === currentPlayerId)

  return { bookings, loading, error, isBooked, refetch }
}
