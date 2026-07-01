import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Season } from '../../types/database'

export default function Stagioni() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false })

      const list = (data ?? []) as Season[]
      setSeasons(list)

      if (list.length > 0) {
        const { data: counts } = await supabase
          .from('matches')
          .select('season_id')
          .in('season_id', list.map((s) => s.id))

        const map: Record<string, number> = {}
        for (const row of (counts ?? [])) {
          map[row.season_id] = (map[row.season_id] ?? 0) + 1
        }
        setMatchCounts(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  const currentSeason = seasons[0]

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-field-green-dark">Stagioni</h1>
        <Link
          to="/admin/stagioni/nuova"
          className="rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
        >
          + Nuova
        </Link>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}

      {!loading && seasons.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">Nessuna stagione creata.</p>
          <Link
            to="/admin/stagioni/nuova"
            className="mt-3 inline-block rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Crea la prima stagione
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {seasons.map((s) => {
          const isCurrent = s.id === currentSeason?.id
          const count = matchCounts[s.id] ?? 0
          return (
            <Link
              key={s.id}
              to={`/admin/stagioni/${s.id}`}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm hover:bg-gray-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{s.name}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-[11px] font-semibold text-field-green-dark">
                      Corrente
                    </span>
                  )}
                  {s.end_date && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      Chiusa
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDate(s.start_date)}
                  {s.end_date ? ` → ${formatDate(s.end_date)}` : ' → In corso'}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {count} {count === 1 ? 'partita' : 'partite'}
                </p>
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
