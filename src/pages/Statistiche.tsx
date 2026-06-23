import { Link } from 'react-router-dom'
import { useStatistiche } from '../hooks/useStatistiche'
import { STAT_CONFIG, getRanking, type StatKey } from '../lib/statistiche'

const STAT_KEYS: StatKey[] = ['marcatori', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol']

export default function Statistiche() {
  const { stats, loading, error } = useStatistiche()

  return (
    <div className="p-4 pb-8">
      <h1 className="text-xl font-semibold text-field-green-dark">Statistiche</h1>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!loading && !error && stats.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">
          Nessuna statistica disponibile per la stagione corrente.
        </p>
      )}

      {!loading && stats.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STAT_KEYS.map((key) => {
            const config = STAT_CONFIG[key]
            const ranking = getRanking(stats, key).slice(0, 10)
            const isGreen = config.color === 'green'
            const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
            const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

            return (
              <Link
                key={key}
                to={`/statistiche/${key}`}
                className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-field-green-dark">
                  {config.title}
                </h2>
                <table className="w-full text-sm">
                  <tbody>
                    {ranking.length === 0 && (
                      <tr>
                        <td className="px-4 py-3 text-gray-400">Nessun dato</td>
                      </tr>
                    )}
                    {ranking.map((entry, i) => (
                      <tr key={entry.stats.player.id} className="border-t border-gray-100 first:border-t-0">
                        <td className="py-2 pl-4 pr-1 text-gray-400">{i + 1}</td>
                        <td className="py-2 pr-2 font-medium text-gray-700">
                          {entry.stats.player.name}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${valueColor} ${valueBg}`}>
                            {config.formatValue(entry.value)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Link>
            )
          })}
        </div>
      )}

      <Link
        to="/statistiche/elenco"
        className="mt-4 block w-full rounded-lg bg-field-green px-4 py-2 text-center text-sm font-medium text-white hover:bg-field-green-dark"
      >
        Visualizza tutte le statistiche
      </Link>
    </div>
  )
}
