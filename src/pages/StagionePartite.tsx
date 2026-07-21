import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ErrorNotice from '../components/ErrorNotice'
import { useStatistiche } from '../hooks/useStatistiche'
import { getSeasonStatus } from '../lib/seasons'
import { STAT_CONFIG, getRanking, playerFullName, type StatKey } from '../lib/statistiche'
import type { Match, MatchResult, Season } from '../types/database'

const MAX_PLAYERS = 10

// Griglia statistiche di stagione: prima le "positive" (verdi), poi Sconfitte e
// Autogol in fondo (rosse). La media voto è verde come nelle altre viste.
const PREVIEW_STAT_KEYS: StatKey[] = ['overall', 'format', 'marcatori', 'assist', 'presenze', 'mvp', 'winrate', 'mediavoto', 'schieramenti', 'sconfitte', 'autogol']
const RED_STAT_KEYS: StatKey[] = ['sconfitte', 'autogol']

type MatchWithResult = Match & {
  result: MatchResult | null
  pagelle: { published_at: string | null }[]
  match_bookings: { id: string }[]
}

function StatPreviewCard({
  statKey,
  stats,
  seasonId,
}: {
  statKey: StatKey
  stats: ReturnType<typeof useStatistiche>['stats']
  seasonId: string
}) {
  const config = STAT_CONFIG[statKey]
  const ranking = getRanking(stats, statKey).slice(0, 3)
  const isGreen = !RED_STAT_KEYS.includes(statKey)
  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

  return (
    <Link
      to={`/partite/stagione/${seasonId}/statistiche/${statKey}`}
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <h2 className="truncate border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-field-green-dark">
        {config.title}
      </h2>
      <ul>
        {ranking.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">-</li>}
        {ranking.map((entry, i) => (
          <li
            key={entry.stats.player.id}
            className="flex items-center gap-2 border-t border-gray-100 px-3 py-2 first:border-t-0"
          >
            <span className="w-3 shrink-0 text-center text-[11px] font-semibold text-gray-300">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium leading-snug text-gray-700">
                {playerFullName(entry.stats.player)}
              </span>
              {entry.stats.player.nickname && (
                <span className="block truncate text-[10px] font-normal leading-tight text-gray-400">
                  {entry.stats.player.nickname}
                </span>
              )}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${valueColor} ${valueBg}`}>
              {config.formatValue(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  )
}

/**
 * Dettaglio di una stagione dentro il pannello Partite: partite della stagione
 * e statistiche relative a quella sola stagione. Gli admin possono creare una
 * nuova partita (con la data vincolata al periodo della stagione) e modificare
 * la stagione.
 */
export default function StagionePartite() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [matches, setMatches] = useState<MatchWithResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const { stats, loading: statsLoading, error: statsError } = useStatistiche(id)

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      setError(null)

      const [seasonRes, matchesRes] = await Promise.all([
        supabase.from('seasons').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('matches')
          .select('*, result:match_results(score_a, score_b, id, match_id), pagelle(published_at), match_bookings(id)')
          .eq('season_id', id)
          .order('match_date', { ascending: false }),
      ])

      if (seasonRes.error) {
        setError(seasonRes.error.message)
        setLoading(false)
        return
      }
      if (matchesRes.error) {
        setError(matchesRes.error.message)
        setLoading(false)
        return
      }
      if (!seasonRes.data) {
        setError('Stagione non trovata')
        setLoading(false)
        return
      }

      setSeason(seasonRes.data as Season)
      setMatches(
        (matchesRes.data ?? []).map((m) => ({
          ...m,
          result: Array.isArray(m.result) ? m.result[0] ?? null : m.result,
        })) as MatchWithResult[]
      )
      setLoading(false)
    }
    load()
  }, [id, reloadToken])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error)
    return (
      <div className="p-4">
        <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />
      </div>
    )
  if (!season || !id) return <div className="p-4 text-sm text-red-600">Stagione non trovata</div>

  const isCurrent = getSeasonStatus(season) === 'corrente'
  const previewKeys = PREVIEW_STAT_KEYS.filter((k) => season.season_type !== 'amichevole' || k !== 'format')

  return (
    <div className="p-4 pb-8">
      <Link to="/partite" className="text-sm text-field-green underline">
        ← Torna alle stagioni
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-field-green-dark">{season.name}</h1>
            {isCurrent && (
              <span className="rounded-full bg-field-green/10 px-2 py-0.5 text-[11px] font-semibold text-field-green-dark">
                Corrente
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                season.season_type === 'amichevole' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}
            >
              {season.season_type === 'amichevole' ? 'Amichevole' : 'Format'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {formatDate(season.start_date)}
            {season.end_date ? ` → ${formatDate(season.end_date)}` : ' → In corso'}
          </p>
        </div>
        {isAdmin && (
          <Link
            to={`/partite/stagione/${id}/modifica`}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Modifica
          </Link>
        )}
      </div>

      {/* Statistiche della stagione */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Statistiche della stagione</h2>

      {statsLoading && <p className="mt-2 text-sm text-gray-500">Caricamento statistiche...</p>}
      {statsError && <p className="mt-2 text-sm text-red-600">{statsError}</p>}

      {!statsLoading && !statsError && stats.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Nessuna partita giocata in questa stagione.</p>
      )}

      {!statsLoading && !statsError && stats.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previewKeys.map((key) => (
            <StatPreviewCard key={key} statKey={key} stats={stats} seasonId={id} />
          ))}
        </div>
      )}

      {/* Partite della stagione */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Partite ({matches.length})</h2>
        {isAdmin && (
          <Link
            to={`/partite/stagione/${id}/nuova-partita`}
            className="rounded-lg bg-field-green px-3 py-2 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            Nuova partita
          </Link>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {matches.length === 0 && <p className="text-sm text-gray-500">Nessuna partita registrata.</p>}
        {matches.map((m) => (
          <Link key={m.id} to={`/partite/${m.id}`} className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <p className="font-medium">{formatDate(m.match_date)}</p>
              <div className="flex flex-wrap justify-end gap-2">
                {m.booking_open && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    Sondaggio {m.match_bookings.length}/{MAX_PLAYERS}
                  </span>
                )}
                {isAdmin && m.voting_open && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    Votazioni in corso
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    m.status === 'completed'
                      ? 'bg-field-green/10 text-field-green-dark'
                      : 'bg-field-yellow/20 text-field-orange'
                  }`}
                >
                  {m.status === 'completed' ? 'Completata' : 'In preparazione'}
                </span>
                {m.pagelle.length > 0 && m.pagelle.every((p) => p.published_at) && (
                  <span className="rounded-full bg-field-orange/10 px-2 py-0.5 text-xs text-field-orange">Pubblicata</span>
                )}
              </div>
            </div>
            {m.field && <p className="text-sm text-gray-500">{m.field}</p>}
            {m.result && (
              <p className="mt-1 text-lg font-semibold text-field-green-dark">
                {m.result.score_a} - {m.result.score_b}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
