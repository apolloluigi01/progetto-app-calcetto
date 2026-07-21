import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { STAT_CONFIG, type StatKey } from '../lib/statistiche'
import type { Season } from '../types/database'

const STAT_KEYS: StatKey[] = ['overall', 'format', 'marcatori', 'assist', 'presenze', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol', 'schieramenti']

/** Elenco completo delle statistiche di una stagione, con drill-down alla
 *  tabella di ogni singola statistica (sempre relativa a quella stagione). */
export default function StatisticheElenco() {
  const { id } = useParams<{ id: string }>()
  const [season, setSeason] = useState<Season | null>(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('seasons')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSeason(data as Season)
      })
  }, [id])

  // Nelle stagioni amichevoli la Classifica Format non viene conteggiata.
  const keys = STAT_KEYS.filter((k) => season?.season_type !== 'amichevole' || k !== 'format')

  if (!id) return <div className="p-4 text-sm text-red-600">Stagione non trovata</div>

  return (
    <div className="p-4">
      <Link to={`/statistiche/stagione/${id}`} className="text-sm text-field-green underline">
        ← Torna alle statistiche
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-field-green-dark">
        Tutte le statistiche{season ? ` — ${season.name}` : ''}
      </h1>

      <div className="mt-4 space-y-2">
        {keys.map((key) => {
          const config = STAT_CONFIG[key]
          const colorClass = config.color === 'green' ? 'text-field-green-dark' : 'text-red-600'
          return (
            <Link
              key={key}
              to={`/statistiche/stagione/${id}/${key}`}
              className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
            >
              <p className={`font-medium ${colorClass}`}>{config.title}</p>
              <p className="text-sm text-gray-500">{config.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
