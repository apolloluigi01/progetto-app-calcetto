import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStatistiche } from '../hooks/useStatistiche'
import { useOveralls } from '../hooks/useOveralls'
import { ALL_TIME_KEY, STAT_CONFIG, type PlayerStats, type StatKey } from '../lib/statistiche'
import { getSeasonStatus } from '../lib/seasons'
import PlayerCard from '../components/PlayerCard'
import type { Player, Season } from '../types/database'

// Vista personale del giocatore: prima tutte le statistiche "positive" (verdi),
// in fondo le due negative (rosse). Qui la media voto è mostrata in verde come
// le altre statistiche personali (nella classifica generale resta rossa).
const STAT_KEYS: StatKey[] = ['overall', 'marcatori', 'assist', 'presenze', 'mvp', 'winrate', 'mediavoto', 'schieramenti', 'sconfitte', 'autogol']

/** In questa vista sono rosse soltanto Sconfitte e Autogol. */
const RED_STAT_KEYS: StatKey[] = ['sconfitte', 'autogol']

export default function GiocatoreDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  // Stagione scelta dal menu a tendina (o arrivata dall'albo d'oro): sta
  // nell'indirizzo, così il link resta condivisibile e il "indietro" funziona.
  // "storica" = stagione pre-app censita a mano dagli admin: nessuna statistica disponibile.
  const seasonParam = searchParams.get('season')
  const seasonName = searchParams.get('seasonName')
  const isStorica = seasonParam === 'storica'

  // Stagioni del menu: solo quelle già iniziate (le programmate non hanno statistiche).
  const [seasons, setSeasons] = useState<Season[] | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setSeasons(((data ?? []) as Season[]).filter((s) => getSeasonStatus(s) !== 'programmata'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Senza scelta esplicita: la stagione in corso, altrimenti l'ultima conclusa,
  // altrimenti tutte. null finché l'elenco delle stagioni non è arrivato.
  const defaultSeasonId = seasons
    ? ((seasons.find((s) => getSeasonStatus(s) === 'corrente') ?? seasons[0])?.id ?? ALL_TIME_KEY)
    : null
  const selectedSeason = seasonParam ?? defaultSeasonId
  const { stats: seasonStats, loading: seasonStatsLoading } = useStatistiche(
    selectedSeason ?? undefined,
    !isStorica && selectedSeason !== null
  )
  const statsLoading = seasonStatsLoading || (!isStorica && selectedSeason === null)

  function selectSeason(value: string) {
    // Il nome passato dall'albo d'oro vale solo per quella stagione: si toglie.
    setSearchParams({ season: value }, { replace: true })
  }
  const { overalls, loading: overallsLoading } = useOveralls()

  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data) setError('Giocatore non trovato')
        setPlayer((data as Player) ?? null)
        setLoading(false)
      })
  }, [id])

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error || !player) return <div className="p-4 text-sm text-red-600">{error ?? 'Giocatore non trovato'}</div>

  const zeroStats: PlayerStats = {
    player,
    partiteGiocate: 0,
    vittorie: 0,
    pareggi: 0,
    sconfitte: 0,
    golFatti: 0,
    assist: 0,
    autogol: 0,
    mvp: 0,
    voteAvg: null,
    voteCount: 0,
    overall: null,
    winStreak: 0,
    fantaSchieramenti: 0,
    fantaCapitano: 0,
    totalSeasonMatches: 0,
  }
  const playerStats = isStorica ? zeroStats : seasonStats.find((s) => s.player.id === id) ?? null
  const winPercentage =
    playerStats && playerStats.partiteGiocate > 0 ? (playerStats.vittorie / playerStats.partiteGiocate) * 100 : null

  return (
    <div className="p-4">
      <div className="mx-auto max-w-[200px]">
        {overallsLoading ? (
          <div className="animate-pulse rounded-xl bg-gray-200" style={{ aspectRatio: '5 / 7' }} />
        ) : (
          <PlayerCard player={player} overall={overalls.get(player.id) ?? null} stats={playerStats} />
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-field-green-dark">Statistiche</h2>
        <select
          value={selectedSeason ?? ''}
          onChange={(e) => selectSeason(e.target.value)}
          disabled={seasons === null}
          aria-label="Stagione delle statistiche"
          className="max-w-[60%] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-field-green focus:outline-none"
        >
          {seasons === null && <option value="">Caricamento...</option>}
          {seasons !== null && <option value={ALL_TIME_KEY}>All (tutte le stagioni)</option>}
          {seasons?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {isStorica && <option value="storica">{seasonName ?? 'Stagione storica'} (prima dell'app)</option>}
        </select>
      </div>
      {isStorica && (
        <p className="mt-1 text-xs text-gray-400">
          Stagione precedente all'app: statistiche non disponibili.
        </p>
      )}

      {statsLoading && <p className="mt-2 text-sm text-gray-500">Caricamento statistiche...</p>}

      {!statsLoading && !playerStats && (
        <p className="mt-2 text-sm text-gray-500">
          {selectedSeason === ALL_TIME_KEY ? 'Nessuna partita giocata.' : 'Nessuna partita giocata in questa stagione.'}
        </p>
      )}

      {!statsLoading && playerStats && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3 text-center shadow">
              <p className="text-2xl font-bold text-field-green-dark">{playerStats.partiteGiocate}</p>
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
                {playerStats.voteCount > 0 && playerStats.voteAvg !== null ? playerStats.voteAvg.toFixed(2) : '-'}
              </p>
              <p className="text-xs text-gray-500">Media voto</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {STAT_KEYS.map((key, i) => {
                  const config = STAT_CONFIG[key]
                  const value = config.getValue(playerStats)
                  const isGreen = !RED_STAT_KEYS.includes(key)
                  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
                  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

                  return (
                    <tr key={key} className={`border-t border-gray-100 ${i === 0 ? 'border-t-0' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {config.title}
                        {config.extraColumn && (
                          <span className="block text-xs font-normal text-gray-400">
                            {config.extraColumn.label}: {config.extraColumn.getValue(playerStats)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${valueColor} ${valueBg}`}>
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
    </div>
  )
}
