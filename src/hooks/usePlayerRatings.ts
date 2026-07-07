import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Overall "congelato" (rating_value) per un set specifico di giocatori, letto
 * direttamente dalla tabella ratings senza ricalcolare le statistiche di
 * stagione. Pensato per contesti leggeri (es. il campetto di una partita)
 * dove non serve l'overall dinamico ricalcolato su tutte le partite.
 *
 * `playerIds` è `undefined` finché il chiamante non conosce ancora l'elenco
 * reale (es. dati della partita non ancora caricati): in quel caso `loading`
 * resta true, evitando che le carte compaiano per un istante con l'overall
 * mancante (e quindi con il template più basso) prima di aggiornarsi.
 */
export function usePlayerRatings(playerIds: string[] | undefined) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (playerIds === undefined) return
    setLoading(true)

    const query =
      playerIds.length === 0
        ? Promise.resolve({ data: [] as { player_id: string; rating_value: number }[] })
        : supabase.from('ratings').select('player_id, rating_value').in('player_id', playerIds)

    query.then(({ data }) => {
      setRatings(new Map((data ?? []).map((r) => [r.player_id, Math.round(Number(r.rating_value))])))
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIds ? playerIds.join(',') : undefined])

  return { ratings, loading }
}
