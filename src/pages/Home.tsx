import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomeDashboard } from '../hooks/useHomeDashboard'
import { useStatistiche } from '../hooks/useStatistiche'
import { getRanking } from '../lib/statistiche'
import { describeWeatherCode, getMatchWeather, type WeatherForecast } from '../lib/weather'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(time: string | null) {
  return time ? time.slice(0, 5) : null
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="font-medium text-field-green-dark">Ultima partita</h2>
            </div>
            {!lastMatch && <p className="p-4 text-sm text-gray-500">Nessuna partita completata.</p>}
            {lastMatch && (
              <Link to={`/partite/${lastMatch.match.id}`} className="block">
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-gray-500">{formatDate(lastMatch.match.match_date)}</p>
                  {lastMatch.result && (
                    <p className="mt-1 text-4xl font-extrabold text-field-green-dark">
                      {lastMatch.result.score_a} - {lastMatch.result.score_b}
                    </p>
                  )}
                </div>
                {lastMatch.goals.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Marcatore
                        </th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Squadra
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Esito
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastMatch.goals.map((g, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-medium text-gray-700">{g.name}</td>
                          <td className="px-4 py-2 text-gray-500">Squadra {g.team}</td>
                          <td className="px-4 py-2 text-right">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                g.is_own_goal ? 'bg-red-50 text-red-600' : 'bg-field-green/10 text-field-green-dark'
                              }`}
                            >
                              {g.is_own_goal ? 'Autogol' : 'Gol'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  {formatTime(nextMatch.match.match_time) && ` · ${formatTime(nextMatch.match.match_time)}`}
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <Link
              to="/statistiche/marcatori"
              className="flex items-center justify-between border-b border-gray-200 px-4 py-3 hover:bg-gray-50"
            >
              <h2 className="font-medium text-field-green-dark">Migliori marcatori</h2>
              <span className="text-xs text-gray-400">Vedi tutte →</span>
            </Link>
            {statsLoading && <p className="p-4 text-sm text-gray-500">Caricamento...</p>}
            {!statsLoading && marcatori.length === 0 && (
              <p className="p-4 text-sm text-gray-500">Nessun dato disponibile per la stagione corrente.</p>
            )}
            {!statsLoading && marcatori.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="w-10 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      #
                    </th>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Giocatore
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Gol
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {marcatori.map((entry, i) => (
                    <tr key={entry.stats.player.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-2 py-2 font-medium text-gray-700">{entry.stats.player.name}</td>
                      <td className="px-4 py-2 text-right">
                        <span className="inline-flex items-center rounded-full bg-field-green/10 px-2.5 py-1 text-xs font-semibold text-field-green-dark">
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
