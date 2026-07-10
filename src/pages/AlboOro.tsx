import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeStatistiche, getRanking, type PlayerStats } from '../lib/statistiche'
import { computeOverallsForPlayers } from '../lib/teamGeneration'
import { getSeasonStatus, todayISO } from '../lib/seasons'
import PlayerCard from '../components/PlayerCard'
import PlayerName from '../components/PlayerName'
import type { Season } from '../types/database'

interface PodiumEntry {
  stats: PlayerStats
  overall: number | null
}

interface SeasonPodium {
  season: Season
  top3: PodiumEntry[]
}

/**
 * Albo d'oro: per ogni stagione di tipo "format" già conclusa mostra il
 * podio dei primi 3 della Classifica Format, ognuno rappresentato dalla
 * propria carta di gioco e navigabile verso la scheda giocatore.
 */
export default function AlboOro() {
  const [podiums, setPodiums] = useState<SeasonPodium[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const today = todayISO()
        const { data: seasons, error: seasonsError } = await supabase
          .from('seasons')
          .select('*')
          .eq('season_type', 'format')
          .not('end_date', 'is', null)
          .lt('end_date', today)
          .order('end_date', { ascending: false })
        if (seasonsError) throw seasonsError

        const concluded = ((seasons ?? []) as Season[]).filter(
          (s) => getSeasonStatus(s) === 'conclusa'
        )

        const result: SeasonPodium[] = []
        for (const season of concluded) {
          const stats = await computeStatistiche(season.id)
          if (stats.length === 0) continue
          const top3 = getRanking(stats, 'format').slice(0, 3)
          const overalls = await computeOverallsForPlayers(
            top3.map((e) => ({ id: e.stats.player.id, name: e.stats.player.name }))
          )
          const overallMap = new Map(overalls.map((o) => [o.playerId, o.overall]))
          result.push({
            season,
            top3: top3.map((e) => ({
              stats: { ...e.stats, overall: overallMap.get(e.stats.player.id) ?? null },
              overall: overallMap.get(e.stats.player.id) ?? null,
            })),
          })
        }
        setPodiums(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Errore nel caricamento dell'albo d'oro")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">🏆 Albo d'oro</h1>
      <p className="mt-1 text-sm text-gray-500">
        Il podio della Classifica Format di ogni stagione conclusa. Tocca una carta per aprire la
        scheda del giocatore.
      </p>

      {loading && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loading && !error && podiums.length === 0 && (
        <p className="mt-6 rounded-xl bg-white p-4 text-sm text-gray-500 shadow">
          Nessuna stagione format conclusa: l'albo d'oro si riempirà alla fine della prima stagione.
        </p>
      )}

      <div className="mt-4 space-y-6">
        {podiums.map(({ season, top3 }) => {
          // Podio: 2° a sinistra, 1° al centro (più in alto), 3° a destra.
          const first = top3[0] ?? null
          const second = top3[1] ?? null
          const third = top3[2] ?? null
          const slots: { entry: PodiumEntry | null; place: number; height: string; medal: string }[] = [
            { entry: second, place: 2, height: 'h-14', medal: '🥈' },
            { entry: first, place: 1, height: 'h-24', medal: '🥇' },
            { entry: third, place: 3, height: 'h-9', medal: '🥉' },
          ]
          return (
            <div key={season.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 className="font-semibold text-field-green-dark">Stagione {season.name}</h2>
                <span className="text-xs text-gray-400">
                  conclusa il {season.end_date ? formatDate(season.end_date) : '-'}
                </span>
              </div>

              <div className="px-3 pb-5 pt-4">
                <div className="grid grid-cols-3 items-end gap-2">
                  {slots.map(({ entry, place, height, medal }) => (
                    <div key={place} className="flex flex-col items-center justify-end">
                      {entry ? (
                        <Link
                          to={`/giocatori/${entry.stats.player.id}`}
                          className="flex w-full max-w-[130px] flex-col items-center transition-transform hover:scale-105"
                        >
                          <PlayerCard
                            player={entry.stats.player}
                            overall={entry.overall}
                            stats={entry.stats}
                            compact
                          />
                          <span className="mt-1 w-full text-center text-xs font-semibold text-gray-700">
                            <PlayerName
                              name={entry.stats.player.name}
                              surname={entry.stats.player.surname}
                              nickname={entry.stats.player.nickname}
                              nicknameClassName="text-[10px]"
                            />
                          </span>
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                      <div
                        className={`mt-2 flex w-full items-start justify-center rounded-t-lg bg-gradient-to-b from-field-green to-field-green-dark ${height}`}
                      >
                        <span className="mt-1 text-lg leading-none">{medal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
