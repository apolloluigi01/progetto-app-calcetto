import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeStatistiche, getRanking, type PlayerStats } from '../lib/statistiche'
import { computeOverallsForPlayers } from '../lib/teamGeneration'
import { getSeasonStatus, todayISO } from '../lib/seasons'
import PlayerCard from '../components/PlayerCard'
import PlayerName from '../components/PlayerName'
import type { HonorEntry, Player, Season } from '../types/database'

interface PodiumEntry {
  player: Player
  overall: number | null
  stats: PlayerStats | null
}

interface Podium {
  key: string
  title: string
  endDate: string | null
  top3: (PodiumEntry | null)[]
}

/**
 * Albo d'oro: per ogni stagione di tipo "format" già conclusa mostra il
 * podio dei primi 3 della Classifica Format, insieme alle voci censite
 * manualmente dagli admin (stagioni pre-app). In fondo la sezione con i
 * podi del fantacalcetto.
 */
export default function AlboOro() {
  const [formatPodiums, setFormatPodiums] = useState<Podium[]>([])
  const [fantaPodiums, setFantaPodiums] = useState<Podium[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const today = todayISO()
        const [{ data: seasons, error: seasonsError }, { data: honors, error: honorsError }] =
          await Promise.all([
            supabase
              .from('seasons')
              .select('*')
              .eq('season_type', 'format')
              .not('end_date', 'is', null)
              .lt('end_date', today)
              .order('end_date', { ascending: false }),
            supabase.from('honor_entries').select('*'),
          ])
        if (seasonsError) throw seasonsError
        if (honorsError) throw honorsError

        const concluded = ((seasons ?? []) as Season[]).filter(
          (s) => getSeasonStatus(s) === 'conclusa'
        )

        // Podi calcolati dalle statistiche delle stagioni concluse nell'app.
        const computed: Podium[] = []
        for (const season of concluded) {
          const stats = await computeStatistiche(season.id)
          if (stats.length === 0) continue
          const top3 = getRanking(stats, 'format').slice(0, 3)
          const overalls = await computeOverallsForPlayers(
            top3.map((e) => ({ id: e.stats.player.id, name: e.stats.player.name }))
          )
          const overallMap = new Map(overalls.map((o) => [o.playerId, o.overall]))
          computed.push({
            key: `season-${season.id}`,
            title: `Stagione ${season.name}`,
            endDate: season.end_date,
            top3: top3.map((e) => ({
              player: e.stats.player,
              overall: overallMap.get(e.stats.player.id) ?? null,
              stats: { ...e.stats, overall: overallMap.get(e.stats.player.id) ?? null },
            })),
          })
        }

        // Voci manuali: risolvo i giocatori del podio e l'overall attuale.
        const manualEntries = (honors ?? []) as HonorEntry[]
        const playerIds = [
          ...new Set(
            manualEntries
              .flatMap((h) => [h.first_player_id, h.second_player_id, h.third_player_id])
              .filter((id): id is string => id !== null)
          ),
        ]
        const playerMap = new Map<string, Player>()
        const overallMap = new Map<string, number>()
        if (playerIds.length > 0) {
          const { data: playersData, error: playersError } = await supabase
            .from('players')
            .select('*')
            .in('id', playerIds)
          if (playersError) throw playersError
          for (const p of (playersData ?? []) as Player[]) playerMap.set(p.id, p)
          const overalls = await computeOverallsForPlayers(
            [...playerMap.values()].map((p) => ({ id: p.id, name: p.name }))
          )
          for (const o of overalls) overallMap.set(o.playerId, o.overall)
        }

        const toPodium = (h: HonorEntry): Podium => ({
          key: `manual-${h.id}`,
          title: h.kind === 'fanta' ? h.season_name : `Stagione ${h.season_name}`,
          endDate: h.end_date,
          top3: [h.first_player_id, h.second_player_id, h.third_player_id].map((id) => {
            const player = id ? playerMap.get(id) : undefined
            if (!player) return null
            return { player, overall: overallMap.get(player.id) ?? null, stats: null }
          }),
        })

        const byDateDesc = (a: Podium, b: Podium) => {
          if (a.endDate && b.endDate) return b.endDate.localeCompare(a.endDate)
          if (a.endDate) return -1
          if (b.endDate) return 1
          return b.title.localeCompare(a.title)
        }

        setFormatPodiums(
          [...computed, ...manualEntries.filter((h) => h.kind === 'format').map(toPodium)].sort(
            byDateDesc
          )
        )
        setFantaPodiums(manualEntries.filter((h) => h.kind === 'fanta').map(toPodium).sort(byDateDesc))
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

  function renderPodium({ key, title, endDate, top3 }: Podium, fanta: boolean) {
    // Podio: 2° a sinistra, 1° al centro (più in alto), 3° a destra.
    const slots: { entry: PodiumEntry | null; place: number; height: string; medal: string }[] = [
      { entry: top3[1] ?? null, place: 2, height: 'h-14', medal: '🥈' },
      { entry: top3[0] ?? null, place: 1, height: 'h-24', medal: '🥇' },
      { entry: top3[2] ?? null, place: 3, height: 'h-9', medal: '🥉' },
    ]
    return (
      <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className={`font-semibold ${fanta ? 'text-purple-800' : 'text-field-green-dark'}`}>
            {title}
          </h2>
          <span className="text-xs text-gray-400">
            {endDate ? `conclusa il ${formatDate(endDate)}` : ''}
          </span>
        </div>

        <div className="px-3 pb-5 pt-4">
          <div className="grid grid-cols-3 items-end gap-2">
            {slots.map(({ entry, place, height, medal }) => (
              <div key={place} className="flex flex-col items-center justify-end">
                {entry ? (
                  <Link
                    to={`/giocatori/${entry.player.id}`}
                    className="flex w-full max-w-[130px] flex-col items-center transition-transform hover:scale-105"
                  >
                    <PlayerCard player={entry.player} overall={entry.overall} stats={entry.stats} compact />
                    <span className="mt-1 w-full text-center text-xs font-semibold text-gray-700">
                      <PlayerName
                        name={entry.player.name}
                        surname={entry.player.surname}
                        nickname={entry.player.nickname}
                        nicknameClassName="text-[10px]"
                      />
                    </span>
                  </Link>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
                <div
                  className={`mt-2 flex w-full items-start justify-center rounded-t-lg bg-gradient-to-b ${
                    fanta ? 'from-purple-500 to-purple-900' : 'from-field-green to-field-green-dark'
                  } ${height}`}
                >
                  <span className="mt-1 text-lg leading-none">{medal}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
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

      {!loading && !error && formatPodiums.length === 0 && (
        <p className="mt-6 rounded-xl bg-white p-4 text-sm text-gray-500 shadow">
          Nessuna stagione format conclusa: l'albo d'oro si riempirà alla fine della prima stagione.
        </p>
      )}

      <div className="mt-4 space-y-6">{formatPodiums.map((p) => renderPodium(p, false))}</div>

      {!loading && !error && fantaPodiums.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-purple-800">🎮 Podio Fantacalcetto</h2>
          <p className="mt-1 text-sm text-gray-500">I vincitori delle edizioni del fantacalcetto.</p>
          <div className="mt-4 space-y-6">{fantaPodiums.map((p) => renderPodium(p, true))}</div>
        </>
      )}
    </div>
  )
}
