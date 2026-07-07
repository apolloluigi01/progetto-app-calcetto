import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Overall "congelato" (rating_value) per un set specifico di giocatori, letto
 * direttamente dalla tabella ratings senza ricalcolare le statistiche di
 * stagione. Pensato per contesti leggeri (es. il campetto di una partita)
 * dove non serve l'overall dinamico ricalcolato su tutte le partite.
 */
export function usePlayerRatings(playerIds: string[]) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (playerIds.length === 0) return
    supabase
      .from('ratings')
      .select('player_id, rating_value')
      .in('player_id', playerIds)
      .then(({ data }) => {
        setRatings(new Map((data ?? []).map((r) => [r.player_id, Math.round(Number(r.rating_value))])))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIds.join(',')])

  return ratings
}
