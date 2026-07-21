import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useStatistiche } from '../hooks/useStatistiche'
import { useCurrentSeason } from '../hooks/useCurrentSeason'
import { STAT_CONFIG, getRanking, playerFullName, type StatKey } from '../lib/statistiche'

const STAT_KEYS: StatKey[] = ['overall', 'marcatori', 'assist', 'presenze', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol', 'schieramenti']
const TOP_STAT_KEYS: StatKey[] = ['overall', 'format', 'marcatori']
const BOTTOM_STAT_KEYS: StatKey[] = ['assist', 'presenze', 'mvp']
const THIRD_STAT_KEYS: StatKey[] = ['winrate', 'sconfitte', 'mediavoto']
const FOURTH_STAT_KEYS: StatKey[] = ['schieramenti']

function StatPreviewCard({ statKey, stats }: { statKey: StatKey; stats: ReturnType<typeof useStatistiche>['stats'] }) {
  const config = STAT_CONFIG[statKey]
  const ranking = getRanking(stats, statKey).slice(0, 3)
  const isGreen = config.color === 'green'
  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

  // Righe flex e non <table>: il truncate sulle celle di tabella non
  // funziona e su mobile il valore finiva spinto fuori dalla card.
  return (
    <Link
      to={`/statistiche/${statKey}`}
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
            <span className="w-3 shrink-0 text-center text-[11px] font-semibold text-gray-300">
              {i + 1}
            </span>
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
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${valueColor} ${valueBg}`}
            >
              {config.formatValue(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  )
}

type Tab = 'generali' | 'personali'

export default function Statistiche() {
  const { player } = useAuth()
  const { stats, loading, error } = useStatistiche()
  const { season } = useCurrentSeason()
  const [tab, setTab] = useState<Tab>('generali')

  // Nelle stagioni amichevoli la Classifica Format non viene conteggiata.
  const showFormat = season?.season_type !== 'amichevole'
  const topKeys = TOP_STAT_KEYS.filter((k) => showFormat || k !== 'format')

  const own = player ? stats.find((s) => s.player.id === player.id) ?? null : null
  const winPercentage = own && own.partiteGiocate > 0 ? (own.vittorie / own.partiteGiocate) * 100 : null

  return (
    <div className="p-4 pb-8">
      <h1 className="text-xl font-semibold text-field-green-dark">Statistiche</h1>

      <div className="mt-3 flex gap-2 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('generali')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
            tab === 'generali' ? 'bg-white text-field-green-dark shadow-sm' : 'text-gray-500'
          }`}
        >
          Generali
        </button>
        <button
          onClick={() => setTab('personali')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
            tab === 'personali' ? 'bg-white text-field-green-dark shadow-sm' : 'text-gray-500'
          }`}
        >
          Personali
        </button>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && !error && tab === 'generali' && (
        <>
          {stats.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">
              Nessuna statistica disponibile per la stagione corrente.
            </p>
          )}

          {stats.length > 0 && (
            /* Mobile-first: 2 colonne su telefono (card larghe e nomi
               leggibili), 3 colonne da tablet in su. */
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[...topKeys, ...BOTTOM_STAT_KEYS, ...THIRD_STAT_KEYS, ...FOURTH_STAT_KEYS].map((key) => (
                <StatPreviewCard key={key} statKey={key} stats={stats} />
              ))}
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Link
              to="/statistiche/elenco"
              className="inline-block rounded-lg bg-field-green px-4 py-2 text-center text-sm font-medium text-white hover:bg-field-green-dark"
            >
              Visualizza tutte le statistiche
            </Link>
          </div>
        </>
      )}

      {!loading && !error && tab === 'personali' && (
        <>
          {!own && (
            <p className="mt-4 text-sm text-gray-500">
              Non hai ancora partecipato a nessuna partita in questa stagione.
            </p>
          )}

          {own && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-white p-3 text-center shadow">
                  <p className="text-2xl font-bold text-field-green-dark">{own.partiteGiocate}</p>
                  <p className="text-xs text-gray-500">Partite giocate</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow">
                  <p className="text-2xl font-bold text-field-green-dark">
                    {winPercentage !== null ? `${winPercentage.toFixed(0)}%` : '-'}
                  </p>
                  <p className="text-xs text-gray-500">% vittorie</p>
                </div>
                <div className="rounded-xl bg-white p-3 text-center shadow">
                  <p className="text-2xl font-bold text-field-green-dark">
                    {own.voteCount > 0 && own.voteAvg !== null ? own.voteAvg.toFixed(2) : '-'}
                  </p>
                  <p className="text-xs text-gray-500">Media voto</p>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-base">
                  <tbody>
                    {STAT_KEYS.map((key, i) => {
                      const config = STAT_CONFIG[key]
                      const value = config.getValue(own)
                      const isGreen = config.color === 'green'
                      const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
                      const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

                      return (
                        <tr key={key} className={`border-t border-gray-100 ${i === 0 ? 'border-t-0' : ''}`}>
                          <td className="px-4 py-3.5 font-medium text-gray-700">{config.title}</td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-base font-semibold ${valueColor} ${valueBg}`}>
                              {value !== null ? config.formatValue(value) : '-'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
