import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomeDashboard } from '../hooks/useHomeDashboard'
import { useStatistiche } from '../hooks/useStatistiche'
import { getRanking } from '../lib/statistiche'
import { describeWeatherCode, getMatchWeather, type WeatherForecast } from '../lib/weather'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function WeatherCard({ field, matchDate }: { field: string | null; matchDate: string }) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(field ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!field) return
    let cancelled = false
    setStatus('loading')
    getMatchWeather(field, matchDate)
      .then((w) => {
        if (cancelled) return
        setWeather(w)
        setStatus(w ? 'ready' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [field, matchDate])

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h2 className="font-medium text-field-green-dark">Meteo prossima partita</h2>
      {status === 'loading' && <p className="mt-2 text-sm text-gray-500">Caricamento previsioni...</p>}
      {status === 'unavailable' && (
        <p className="mt-2 text-sm text-gray-500">
          Previsioni non disponibili{!field ? ' (campo non specificato)' : ''}.
        </p>
      )}
      {status === 'ready' && weather && (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl">{describeWeatherCode(weather.weatherCode).icon}</span>
          <div>
            <p className="font-medium text-gray-700">{describeWeatherCode(weather.weatherCode).label}</p>
            <p className="text-sm text-gray-500">
              {Math.round(weather.tempMin)}° / {Math.round(weather.tempMax)}°
              {weather.precipitationProbability !== null && ` · pioggia ${weather.precipitationProbability}%`}
            </p>
            <p className="text-xs text-gray-400">{weather.locationName}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { lastMatch, nextMatch, loading } = useHomeDashboard()
  const { stats, loading: statsLoading } = useStatistiche()
  const marcatori = getRanking(stats, 'marcatori').slice(0, 5)

  return (
    <div className="p-4 pb-8">
      <h1 className="text-xl font-semibold text-field-green-dark">Dashboard</h1>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}

      {!loading && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium text-field-green-dark">Ultima partita</h2>
            {!lastMatch && <p className="mt-2 text-sm text-gray-500">Nessuna partita completata.</p>}
            {lastMatch && (
              <Link to={`/partite/${lastMatch.match.id}`} className="mt-2 block">
                <p className="text-sm text-gray-500">{formatDate(lastMatch.match.match_date)}</p>
                {lastMatch.result && (
                  <p className="mt-1 text-center text-2xl font-bold text-field-green-dark">
                    {lastMatch.result.score_a} - {lastMatch.result.score_b}
                  </p>
                )}
                {lastMatch.goals.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <ul className="space-y-1">
                      {lastMatch.goals
                        .filter((g) => g.team === 'A')
                        .map((g, i) => (
                          <li key={i}>
                            ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                          </li>
                        ))}
                    </ul>
                    <ul className="space-y-1">
                      {lastMatch.goals
                        .filter((g) => g.team === 'B')
                        .map((g, i) => (
                          <li key={i}>
                            ⚽ {g.name} {g.is_own_goal && <span className="text-red-600">(autogol)</span>}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </Link>
            )}
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="font-medium text-field-green-dark">Prossima partita</h2>
            {!nextMatch && <p className="mt-2 text-sm text-gray-500">Nessuna partita in programma.</p>}
            {nextMatch && (
              <Link to={`/partite/${nextMatch.match.id}`} className="mt-2 block">
                <p className="font-medium text-gray-700">
                  {formatDate(nextMatch.match.match_date)}
                  {nextMatch.match.match_time && ` · ${nextMatch.match.match_time}`}
                </p>
                {nextMatch.match.field && <p className="text-sm text-gray-500">{nextMatch.match.field}</p>}
                {nextMatch.players.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1 text-sm">
                    {nextMatch.players.map((p) => (
                      <li
                        key={p.player_id}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          p.team === 'A' ? 'bg-field-green/10 text-field-green-dark' : 'bg-field-orange/10 text-field-orange'
                        }`}
                      >
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            )}
          </div>

          {nextMatch && <WeatherCard field={nextMatch.match.field} matchDate={nextMatch.match.match_date} />}

          <div className="overflow-hidden rounded-xl bg-white shadow">
            <Link to="/statistiche/marcatori" className="block">
              <h2 className="px-4 py-2 font-medium text-white bg-field-green">Migliori marcatori</h2>
            </Link>
            {statsLoading && <p className="p-4 text-sm text-gray-500">Caricamento...</p>}
            {!statsLoading && marcatori.length === 0 && (
              <p className="p-4 text-sm text-gray-500">Nessun dato disponibile per la stagione corrente.</p>
            )}
            {!statsLoading && marcatori.length > 0 && (
              <table className="w-full text-sm">
                <tbody>
                  {marcatori.map((entry, i) => (
                    <tr key={entry.stats.player.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-1.5 pl-4 pr-1 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-medium text-gray-700">{entry.stats.player.name}</td>
                      <td className="py-1.5 pr-4 text-right">
                        <span className="rounded-md bg-field-green/10 px-2 py-0.5 font-semibold text-field-green-dark">
                          {entry.value} gol
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
