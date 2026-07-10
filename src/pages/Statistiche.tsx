import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useStatistiche } from '../hooks/useStatistiche'
import { useCurrentSeason } from '../hooks/useCurrentSeason'
import { STAT_CONFIG, getRanking, playerFullName, type StatKey } from '../lib/statistiche'

const STAT_KEYS: StatKey[] = ['overall', 'marcatori', 'assist', 'presenze', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol']
const TOP_STAT_KEYS: StatKey[] = ['overall', 'format', 'marcatori']
const BOTTOM_STAT_KEYS: StatKey[] = ['assist', 'presenze', 'mvp']
const THIRD_STAT_KEYS: StatKey[] = ['winrate', 'sconfitte', 'mediavoto']

function StatPreviewCard({ statKey, stats }: { statKey: StatKey; stats: ReturnType<typeof useStatistiche>['stats'] }) {
  const config = STAT_CONFIG[statKey]
  const ranking = getRanking(stats, statKey).slice(0, 3)
  const isGreen = config.color === 'green'
  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

  return (
    <Link
      to={`/statistiche/${statKey}`}
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
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {topKeys.map((key) => (
                  <StatPreviewCard key={key} statKey={key} stats={stats} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {BOTTOM_STAT_KEYS.map((key) => (
                  <StatPreviewCard key={key} statKey={key} stats={stats} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {THIRD_STAT_KEYS.map((key) => (
                  <StatPreviewCard key={key} statKey={key} stats={stats} />
                ))}
              </div>
            </>
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
