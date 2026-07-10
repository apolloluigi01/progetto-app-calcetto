import { useEffect, useState } from 'react'
import { DEFAULT_FASCE, getFasce, type FasciaRange } from '../lib/fasce'

/** Range fasce/carte letti da fascia_settings (con cache condivisa). */
export function useFasce() {
  const [fasce, setFasce] = useState<FasciaRange[]>(DEFAULT_FASCE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getFasce().then((f) => {
      if (!cancelled) {
        setFasce(f)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { fasce, loading }
}
