import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ErrorNotice from '../../components/ErrorNotice'
import { useStatistiche } from '../../hooks/useStatistiche'
import { STAT_CONFIG, getRanking, playerFullName, type StatKey } from '../../lib/statistiche'
import type { Match, MatchResult, Season } from '../../types/database'

const TOP_STAT_KEYS: StatKey[] = ['overall', 'format', 'marcatori']
const BOTTOM_STAT_KEYS: StatKey[] = ['assist', 'presenze', 'mvp']
const THIRD_STAT_KEYS: StatKey[] = ['winrate', 'sconfitte', 'mediavoto']

type MatchWithResult = Match & { result: MatchResult | null }

function StatPreviewCard({ statKey, stats, seasonId }: { statKey: StatKey; stats: ReturnType<typeof useStatistiche>['stats']; seasonId: string }) {
  const config = STAT_CONFIG[statKey]
  const ranking = getRanking(stats, statKey).slice(0, 3)
  const isGreen = config.color === 'green'
  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

  return (
    <Link
      to={`/admin/stagioni/${seasonId}/statistiche/${statKey}`}
      className="block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <h2 className="truncate border-b border-gray-200 px-2 py-2 text-xs font-semibold text-field-green-dark">
        {config.title}
      </h2>
      <table className="w-full text-xs">
        <tbody>
          {ranking.length === 0 && (
            <tr>
              <td className="px-2 py-2 text-gray-400">-</td>
            </tr>
          )}
          {ranking.map((entry, i) => (
            <tr key={entry.stats.player.id} className="border-t border-gray-100 first:border-t-0">
              <td className="py-2 pl-2 pr-0.5 text-gray-400">{i + 1}</td>
              <td className="truncate py-2 pr-1 font-medium text-gray-700">
                {playerFullName(entry.stats.player)}
                {entry.stats.player.nickname && (
                  <span className="block truncate text-[10px] font-normal leading-tight text-gray-400">
                    {entry.stats.player.nickname}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-right">
                <span className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${valueColor} ${valueBg}`}>
                  {config.formatValue(entry.value)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Link>
  )
}

export default function StagioneDettaglio() {
  const { id } = useParams<{ id: string }>()
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
          .select('*, result:match_results(score_a, score_b, id, match_id)')
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
  if (error) return <div className="p-4"><ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} /></div>
  if (!season || !id) return <div className="p-4 text-sm text-red-600">Stagione non trovata</div>

  return (
    <div className="p-4 pb-8">
      <Link to="/admin/stagioni" className="text-sm text-field-green underline">
        ← Torna alle stagioni
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-field-green-dark">{season.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                season.season_type === 'amichevole'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
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
        <Link
          to={`/admin/stagioni/${id}/modifica`}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Modifica
        </Link>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Statistiche generali</h2>

      {statsLoading && <p className="mt-2 text-sm text-gray-500">Caricamento statistiche...</p>}
      {statsError && <p className="mt-2 text-sm text-red-600">{statsError}</p>}

      {!statsLoading && !statsError && stats.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Nessuna partita giocata in questa stagione.</p>
      )}

      {!statsLoading && !statsError && stats.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TOP_STAT_KEYS.filter((key) => season.season_type !== 'amichevole' || key !== 'format').map((key) => (
              <StatPreviewCard key={key} statKey={key} stats={stats} seasonId={id} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BOTTOM_STAT_KEYS.map((key) => (
              <StatPreviewCard key={key} statKey={key} stats={stats} seasonId={id} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {THIRD_STAT_KEYS.map((key) => (
              <StatPreviewCard key={key} statKey={key} stats={stats} seasonId={id} />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Partite ({matches.length})
      </h2>

      <div className="mt-3 space-y-2">
        {matches.length === 0 && <p className="text-sm text-gray-500">Nessuna partita registrata.</p>}
        {matches.map((m) => (
          <Link
            key={m.id}
            to={`/partite/${m.id}`}
            className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{formatDate(m.match_date)}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  m.status === 'completed'
                    ? 'bg-field-green/10 text-field-green-dark'
                    : 'bg-field-yellow/20 text-field-orange'
                }`}
              >
                {m.status === 'completed' ? 'Completata' : 'In preparazione'}
              </span>
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
