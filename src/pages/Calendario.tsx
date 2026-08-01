import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ErrorNotice from '../components/ErrorNotice'
import { getSeasonStatus, todayISO } from '../lib/seasons'
import type { Match, MatchResult, Season } from '../types/database'

type MatchWithResult = Match & { result: MatchResult | null }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatSeasonRange(s: Season) {
  const short = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${short(s.start_date)}${s.end_date ? ` → ${short(s.end_date)}` : ' → In corso'}`
}

function formatTime(t: string | null) {
  return t ? t.slice(0, 5) : null
}

function MatchRow({ match }: { match: MatchWithResult }) {
  const time = formatTime(match.match_time)
  return (
    <Link
      to={`/partite/${match.id}`}
      className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">
          {formatDate(match.match_date)}
          {time && <span className="text-gray-500"> · {time}</span>}
        </p>
        {match.field && <p className="truncate text-xs text-gray-500">{match.field}</p>}
      </div>
      {match.result ? (
        <span className="shrink-0 rounded-lg bg-field-green/10 px-2.5 py-1 text-sm font-bold text-field-green-dark">
          {match.result.score_a} - {match.result.score_b}
        </span>
      ) : (
        <span className="shrink-0 text-lg text-gray-300">›</span>
      )}
    </Link>
  )
}

/**
 * Calendario: tutte le partite raggruppate per stagione, separate fra quelle
 * già giocate e quelle ancora in programma. Una partita è "giocata" se è stata
 * completata oppure se la sua data è ormai passata; tutto il resto (oggi o
 * futuro, non completata) è "in programma".
 */
export default function Calendario() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [matches, setMatches] = useState<MatchWithResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [openSeasons, setOpenSeasons] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      const [seasonsRes, matchesRes] = await Promise.all([
        supabase.from('seasons').select('*').order('start_date', { ascending: false }),
        supabase
          .from('matches')
          .select('*, result:match_results(id, match_id, score_a, score_b)')
          .order('match_date', { ascending: false }),
      ])

      if (cancelled) return

      if (seasonsRes.error || matchesRes.error) {
        setError((seasonsRes.error ?? matchesRes.error)!.message)
        setLoading(false)
        return
      }

      const seasonList = (seasonsRes.data ?? []) as Season[]
      // La stagione corrente esce sempre per prima, poi le altre per data di
      // inizio decrescente (stesso criterio del pannello Partite).
      const ordered = [...seasonList].sort((a, b) => {
        const aCurrent = getSeasonStatus(a) === 'corrente' ? 1 : 0
        const bCurrent = getSeasonStatus(b) === 'corrente' ? 1 : 0
        if (aCurrent !== bCurrent) return bCurrent - aCurrent
        return b.start_date.localeCompare(a.start_date)
      })

      setSeasons(ordered)
      setMatches(
        (matchesRes.data ?? []).map((m) => ({
          ...m,
          result: Array.isArray(m.result) ? m.result[0] ?? null : m.result,
        })) as MatchWithResult[],
      )
      // Di default apriamo solo la stagione corrente: le vecchie restano chiuse
      // per non annegare la pagina in decine di partite.
      setOpenSeasons(
        Object.fromEntries(ordered.map((s) => [s.id, getSeasonStatus(s) === 'corrente'])),
      )
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const today = todayISO()

  const bySeason = useMemo(() => {
    const map: Record<string, { played: MatchWithResult[]; upcoming: MatchWithResult[] }> = {}
    for (const s of seasons) map[s.id] = { played: [], upcoming: [] }
    for (const m of matches) {
      const bucket = map[m.season_id]
      if (!bucket) continue
      if (m.status === 'completed' || m.match_date < today) bucket.played.push(m)
      else bucket.upcoming.push(m)
    }
    // Le partite in programma si leggono meglio dalla più vicina alla più lontana.
    for (const key of Object.keys(map)) {
      map[key].upcoming.sort((a, b) => a.match_date.localeCompare(b.match_date))
    }
    return map
  }, [seasons, matches, today])

  return (
    <div className="p-4 pb-8">
      <h1 className="text-xl font-semibold text-field-green-dark">Calendario</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tutte le partite divise per stagione: quelle giocate e quelle in programma.
      </p>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}

      {!loading && error && (
        <div className="mt-4">
          <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />
        </div>
      )}

      {!loading && !error && seasons.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">Nessuna stagione creata.</p>
      )}

      {!loading && !error && (
        <div className="mt-4 space-y-3">
          {seasons.map((s) => {
            const { played, upcoming } = bySeason[s.id] ?? { played: [], upcoming: [] }
            const total = played.length + upcoming.length
            const isOpen = openSeasons[s.id] ?? false
            const status = getSeasonStatus(s)
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button
                  onClick={() => setOpenSeasons((prev) => ({ ...prev, [s.id]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-800">{s.name}</span>
                      {status === 'corrente' && (
                        <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-[11px] font-semibold text-field-green-dark">
                          Corrente
                        </span>
                      )}
                      {status === 'programmata' && (
                        <span className="rounded-full bg-field-yellow/20 px-2 py-0.5 text-[11px] font-semibold text-field-orange">
                          Programmata
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{formatSeasonRange(s)}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {total} {total === 1 ? 'partita' : 'partite'} · {played.length} giocate ·{' '}
                      {upcoming.length} in programma
                    </p>
                  </div>
                  <span className={`shrink-0 text-lg text-gray-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                    ›
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {total === 0 && <p className="text-sm text-gray-500">Nessuna partita in questa stagione.</p>}

                    {upcoming.length > 0 && (
                      <>
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-field-orange">
                          In programma ({upcoming.length})
                        </h3>
                        <div className="space-y-2">
                          {upcoming.map((m) => (
                            <MatchRow key={m.id} match={m} />
                          ))}
                        </div>
                      </>
                    )}

                    {played.length > 0 && (
                      <>
                        <h3 className={`mb-2 text-[11px] font-semibold uppercase tracking-wide text-field-green-dark ${upcoming.length > 0 ? 'mt-4' : ''}`}>
                          Giocate ({played.length})
                        </h3>
                        <div className="space-y-2">
                          {played.map((m) => (
                            <MatchRow key={m.id} match={m} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
