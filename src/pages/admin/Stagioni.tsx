import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ErrorNotice from '../../components/ErrorNotice'
import { getSeasonStatus, type SeasonStatus } from '../../lib/seasons'
import type { Season } from '../../types/database'

const STATUS_BADGE: Record<SeasonStatus, { label: string; className: string }> = {
  corrente: { label: 'Corrente', className: 'bg-field-green/10 text-field-green-dark' },
  conclusa: { label: 'Conclusa', className: 'bg-gray-100 text-gray-500' },
  programmata: { label: 'Programmata', className: 'bg-field-yellow/20 text-field-orange' },
}

export default function Stagioni() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const list = (data ?? []) as Season[]
      setSeasons(list)

      if (list.length > 0) {
        const { data: counts, error: countsError } = await supabase
          .from('matches')
          .select('season_id')
          .in('season_id', list.map((s) => s.id))

        if (countsError) {
          setError(countsError.message)
          setLoading(false)
          return
        }

        const map: Record<string, number> = {}
        for (const row of (counts ?? [])) {
          map[row.season_id] = (map[row.season_id] ?? 0) + 1
        }
        setMatchCounts(map)
      }

      setLoading(false)
    }
    load()
  }, [reloadToken])

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

      {!loading && error && (
        <div className="mt-4">
          <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />
        </div>
      )}

      {!loading && !error && seasons.length === 0 && (
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
          const badge = STATUS_BADGE[getSeasonStatus(s)]
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
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
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
