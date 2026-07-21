import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ErrorNotice from '../components/ErrorNotice'
import { getSeasonStatus, type SeasonStatus } from '../lib/seasons'
import { ALL_TIME_KEY, ALL_TIME_LABEL } from '../lib/statistiche'
import type { Season } from '../types/database'

const STATUS_BADGE: Record<SeasonStatus, { label: string; className: string }> = {
  corrente: { label: 'Corrente', className: 'bg-field-green/10 text-field-green-dark' },
  conclusa: { label: 'Conclusa', className: 'bg-gray-100 text-gray-500' },
  programmata: { label: 'Programmata', className: 'bg-field-yellow/20 text-field-orange' },
}

/**
 * Sezione Statistiche: si seleziona prima la stagione (come nel pannello
 * Partite). La stagione corrente ha sempre la priorità (esce per prima), poi
 * tutte le altre in ordine decrescente per data di inizio. Selezionata una
 * stagione si vedono le statistiche relative a quella sola stagione. Qui NON
 * si creano stagioni: si fa solo dal pannello Partite.
 */
export default function Statistiche() {
  const [seasons, setSeasons] = useState<Season[]>([])
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

      // La stagione corrente esce sempre per prima; le altre restano in ordine
      // decrescente per data di inizio.
      const list = (data ?? []) as Season[]
      const ordered = [...list].sort((a, b) => {
        const aCurrent = getSeasonStatus(a) === 'corrente' ? 1 : 0
        const bCurrent = getSeasonStatus(b) === 'corrente' ? 1 : 0
        if (aCurrent !== bCurrent) return bCurrent - aCurrent
        return b.start_date.localeCompare(a.start_date)
      })
      setSeasons(ordered)
      setLoading(false)
    }
    load()
  }, [reloadToken])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Statistiche</h1>
      <p className="mt-1 text-sm text-gray-500">
        Seleziona una stagione per vederne le statistiche.
      </p>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}

      {!loading && error && (
        <div className="mt-4">
          <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />
        </div>
      )}

      {!loading && !error && seasons.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Nessuna stagione disponibile.</p>
      )}

      {!loading && !error && (
        <div className="mt-4">
          {/* Voce speciale: statistiche di tutti i giocatori su tutte le stagioni. */}
          <Link
            to={`/statistiche/stagione/${ALL_TIME_KEY}`}
            className="flex items-center justify-between rounded-xl border border-field-orange/40 bg-field-orange/5 p-4 shadow-sm hover:bg-field-orange/10"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🏅</span>
                <span className="font-semibold text-gray-800">{ALL_TIME_LABEL}</span>
                <span className="rounded-full bg-field-orange/15 px-2 py-0.5 text-[11px] font-semibold text-field-orange">
                  All time
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">Tutte le stagioni · tutti i giocatori</p>
            </div>
            <span className="text-lg text-gray-300">›</span>
          </Link>
        </div>
      )}

      <div className="mt-2 space-y-2">
        {seasons.map((s) => {
          const badge = STATUS_BADGE[getSeasonStatus(s)]
          return (
            <Link
              key={s.id}
              to={`/statistiche/stagione/${s.id}`}
              className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm hover:bg-gray-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{s.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.season_type === 'amichevole'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {s.season_type === 'amichevole' ? 'Amichevole' : 'Format'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDate(s.start_date)}
                  {s.end_date ? ` → ${formatDate(s.end_date)}` : ' → In corso'}
                </p>
              </div>
              <span className="text-lg text-gray-300">›</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
