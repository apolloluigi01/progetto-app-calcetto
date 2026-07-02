import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeOverallsForPlayers } from '../lib/teamGeneration'

export function useOveralls() {
  const [overalls, setOveralls] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('players').select('id, name')
      const result = await computeOverallsForPlayers(data ?? [])
      setOveralls(new Map(result.map((p) => [p.playerId, p.overall])))
      setLoading(false)
    }
    load()
  }, [])

  return { overalls, loading }
}
