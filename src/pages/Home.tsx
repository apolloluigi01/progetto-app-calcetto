import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHomeDashboard } from '../hooks/useHomeDashboard'
import { useCurrentSeason } from '../hooks/useCurrentSeason'
import { useStatistiche } from '../hooks/useStatistiche'
import { getRanking, playerFullName } from '../lib/statistiche'
import { describeWeatherCode, getMatchWeather, type WeatherForecast } from '../lib/weather'
import ErrorNotice from '../components/ErrorNotice'
import PlayerName from '../components/PlayerName'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(time: string | null) {
  return time ? time.slice(0, 5) : null
}

function WeatherCard({
  field,
  matchDate,
  matchTime,
}: {
  field: string | null
  matchDate: string
  matchTime: string | null
}) {
  const [weather, setWeather] = useState<WeatherForecast | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(field ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!field) return
    let cancelled = false
    setStatus('loading')
    getMatchWeather(field, matchDate, matchTime)
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
  }, [field, matchDate, matchTime])

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
  const { lastMatch, nextMatch, loading, error, reload } = useHomeDashboard()
  const { season } = useCurrentSeason()
  const { stats, loading: statsLoading, error: statsError } = useStatistiche()
  const marcatori = getRanking(stats, 'marcatori').slice(0, 5)

  return (
    <div className="p-4 pb-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-field-green-dark">Dashboard</h1>
        {season && (
          <span className="rounded-full bg-field-green/10 px-2.5 py-0.5 text-xs font-semibold text-field-green-dark">
            🏆 {season.name}
          </span>
        )}
      </div>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}

      {!loading && error && (
        <div className="mt-4">
          <ErrorNotice message={error} onRetry={reload} />
        </div>
      )}

      {!loading && !error && (
        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="font-medium text-field-green-dark">Ultima partita</h2>
            </div>
            {!lastMatch && <p className="p-4 text-sm text-gray-500">Nessuna partita completata.</p>}
            {lastMatch && (
              <Link to={`/partite/${lastMatch.match.id}`} className="block px-4 py-4">
                <p className="text-center text-xs text-gray-500">{formatDate(lastMatch.match.match_date)}</p>
                {lastMatch.goals.length > 0 ? (
                  (() => {
                    const goalsA = lastMatch.goals.filter((g) => g.team === 'A')
                    const goalsB = lastMatch.goals.filter((g) => g.team === 'B')
                    return (
                      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                        {/* min-w-0: senza, i nomi con "truncate" impediscono alle
                            colonne di restringersi e la pagina sfora lo schermo. */}
                        <div className="min-w-0">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-field-green-dark">
                            Squadra A
                          </p>
                          {goalsA.length === 0 ? (
                            <p className="text-sm text-gray-400">—</p>
                          ) : (
                            goalsA.map((g, i) => (
                              <div key={i} className="mb-1 flex items-start gap-1 text-sm text-gray-700">
                                <span>⚽</span>
                                <PlayerName name={g.name} surname={g.surname} nickname={g.nickname} />
                                {g.is_own_goal && <span className="shrink-0 text-xs text-red-500">(ag)</span>}
                              </div>
                            ))
                          )}
                        </div>
                        {lastMatch.result && (
                          <p className="self-center whitespace-nowrap text-4xl font-extrabold text-field-green-dark">
                            {lastMatch.result.score_a} - {lastMatch.result.score_b}
                          </p>
                        )}
                        <div className="min-w-0 text-right">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-field-orange">
                            Squadra B
                          </p>
                          {goalsB.length === 0 ? (
                            <p className="text-sm text-gray-400">—</p>
                          ) : (
                            goalsB.map((g, i) => (
                              <div key={i} className="mb-1 flex items-start justify-end gap-1 text-sm text-gray-700">
                                {g.is_own_goal && <span className="shrink-0 text-xs text-red-500">(ag)</span>}
                                <PlayerName name={g.name} surname={g.surname} nickname={g.nickname} />
                                <span>⚽</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  lastMatch.result && (
                    <p className="mt-1 text-center text-5xl font-extrabold text-field-green-dark">
                      {lastMatch.result.score_a} - {lastMatch.result.score_b}
                    </p>
                  )
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
                        className={`rounded-full px-2 py-0.5 text-center text-xs ${
                          p.team === 'A' ? 'bg-field-green/10 text-field-green-dark' : 'bg-field-orange/10 text-field-orange'
                        }`}
                      >
                        <PlayerName name={p.name} surname={p.surname} nickname={p.nickname} nicknameClassName="text-[10px]" />
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            )}
          </div>

          {nextMatch && (
        <WeatherCard
          field={nextMatch.match.field}
          matchDate={nextMatch.match.match_date}
          matchTime={nextMatch.match.match_time}
        />
      )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <Link
              to="/statistiche/marcatori"
              className="flex items-center justify-between border-b border-gray-200 px-4 py-3 hover:bg-gray-50"
            >
              <h2 className="font-medium text-field-green-dark">Gol</h2>
              <span className="text-xs text-gray-400">Vedi tutte →</span>
            </Link>
            {statsLoading && <p className="p-4 text-sm text-gray-500">Caricamento...</p>}
            {!statsLoading && statsError && (
              <div className="p-4">
                <ErrorNotice message={statsError} />
              </div>
            )}
            {!statsLoading && !statsError && marcatori.length === 0 && (
              <p className="p-4 text-sm text-gray-500">Nessun dato disponibile per la stagione corrente.</p>
            )}
            {!statsLoading && !statsError && marcatori.length > 0 && (
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
                      <td className="px-2 py-2 font-medium text-gray-700">
                        <Link to={`/giocatori/${entry.stats.player.id}`} className="hover:underline">
                          <p>{playerFullName(entry.stats.player)}</p>
                          {entry.stats.player.nickname && (
                            <p className="text-[11px] font-normal text-gray-400">{entry.stats.player.nickname}</p>
                          )}
                        </Link>
                      </td>
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
