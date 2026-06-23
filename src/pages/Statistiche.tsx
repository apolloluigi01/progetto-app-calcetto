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
            const headerBg = isGreen ? 'bg-field-green' : 'bg-red-600'
            const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
            const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

            return (
              <Link
                key={key}
                to={`/statistiche/${key}`}
                className="block overflow-hidden rounded-xl bg-white shadow transition hover:shadow-md"
              >
                <h2 className={`px-3 py-2 text-sm font-semibold text-white ${headerBg}`}>
                  {config.title}
                </h2>
                <table className="w-full text-sm">
                  <tbody>
                    {ranking.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-gray-400">Nessun dato</td>
                      </tr>
                    )}
                    {ranking.map((entry, i) => (
                      <tr
                        key={entry.stats.player.id}
                        className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      >
                        <td className="py-1.5 pl-3 pr-1 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-2 font-medium text-gray-700">
                          {entry.stats.player.name}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <span className={`rounded-md px-2 py-0.5 font-semibold ${valueColor} ${valueBg}`}>
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
