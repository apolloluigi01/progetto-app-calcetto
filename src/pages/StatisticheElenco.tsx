import { Link } from 'react-router-dom'
import { STAT_CONFIG, type StatKey } from '../lib/statistiche'

const STAT_KEYS: StatKey[] = ['overall', 'marcatori', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol']

export default function StatisticheElenco() {
  return (
    <div className="p-4">
      <Link to="/statistiche" className="text-sm text-field-green underline">
        ← Torna alle statistiche
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-field-green-dark">Tutte le statistiche</h1>

      <div className="mt-4 space-y-2">
        {STAT_KEYS.map((key) => {
          const config = STAT_CONFIG[key]
          const colorClass = config.color === 'green' ? 'text-field-green-dark' : 'text-red-600'
          return (
            <Link
              key={key}
              to={`/statistiche/${key}`}
              className="block rounded-xl bg-white p-4 shadow hover:bg-gray-50"
            >
              <p className={`font-medium ${colorClass}`}>{config.title}</p>
              <p className="text-sm text-gray-500">{config.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
