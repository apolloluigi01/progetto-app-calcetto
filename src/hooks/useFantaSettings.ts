import { useEffect, useState } from 'react'
import { DEFAULT_FANTA_SETTINGS, getFantaSettings, type FantaSettings } from '../lib/fantacalcetto'

/** Parametri bonus/malus del fantacalcetto letti da fanta_settings. */
export function useFantaSettings() {
  const [settings, setSettings] = useState<FantaSettings>(DEFAULT_FANTA_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getFantaSettings().then((s) => {
      if (!cancelled) {
        setSettings(s)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading }
}
