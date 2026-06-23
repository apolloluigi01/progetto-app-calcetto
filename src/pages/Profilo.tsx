import { useAuth } from '../contexts/AuthContext'
import { useStatistiche } from '../hooks/useStatistiche'
import { STAT_CONFIG, type StatKey } from '../lib/statistiche'

const STAT_KEYS: StatKey[] = ['marcatori', 'mvp', 'winrate', 'sconfitte', 'mediavoto', 'autogol']

export default function Profilo() {
  const { player, signOut } = useAuth()
  const { stats, loading } = useStatistiche()

  const own = player ? stats.find((s) => s.player.id === player.id) ?? null : null
  const winPercentage = own && own.partiteGiocate > 0 ? (own.vittorie / own.partiteGiocate) * 100 : null

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Profilo</h1>
      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <p className="font-medium">{player.name}</p>
          {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
          <p className="mt-1 text-xs uppercase text-field-green">{player.role}</p>
        </div>
      )}

      <h2 className="mt-6 text-lg font-semibold text-field-green-dark">La mia stagione</h2>

      {loading && <p className="mt-2 text-sm text-gray-500">Caricamento statistiche...</p>}

      {!loading && !own && (
        <p className="mt-2 text-sm text-gray-500">
          Non hai ancora partecipato a nessuna partita in questa stagione.
        </p>
      )}

      {!loading && own && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
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

          <div className="mt-4 space-y-2">
            {STAT_KEYS.map((key) => {
              const config = STAT_CONFIG[key]
              const value = config.getValue(own)
              const isGreen = config.color === 'green'
              const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
              const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-white p-3 shadow"
                >
                  <span className="text-sm font-medium text-gray-700">{config.title}</span>
                  <span className={`rounded-md px-2 py-1 text-sm font-semibold ${valueColor} ${valueBg}`}>
                    {value !== null ? config.formatValue(value) : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <button
        onClick={signOut}
        className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        Esci
      </button>
    </div>
  )
}
