import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { computeStatisticheMensili, playerFullName, type PlayerStats } from '../../lib/statistiche'

const MONTH_NAMES = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

type SortColumn = 'presenze' | 'vittorie' | 'gol' | 'assist' | 'mvp' | 'media'

const SORT_VALUE: Record<SortColumn, (p: PlayerStats) => number> = {
  presenze: (p) => p.partiteGiocate,
  vittorie: (p) => (p.partiteGiocate > 0 ? p.vittorie / p.partiteGiocate : -1),
  gol: (p) => p.golFatti,
  assist: (p) => p.assist,
  mvp: (p) => p.mvp,
  media: (p) => p.voteAvg ?? -1,
}

export default function StatisticheMensili() {
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  // Statistiche caricate insieme al mese a cui si riferiscono: il "caricamento"
  // è derivato dal confronto col mese selezionato (niente setState sincroni).
  const [loaded, setLoaded] = useState<{ month: string; stats: PlayerStats[] } | null>(null)
  const [loadingMonths, setLoadingMonths] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortColumn>('media')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Mesi disponibili: quelli con almeno una partita completata.
  useEffect(() => {
    supabase
      .from('matches')
      .select('match_date')
      .eq('status', 'completed')
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message)
          setLoadingMonths(false)
          return
        }
        const keys = [...new Set((data ?? []).map((m) => m.match_date.slice(0, 7)))].sort().reverse()
        setMonths(keys)
        setSelectedMonth((prev) => prev || keys[0] || '')
        setLoadingMonths(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedMonth) return
    let cancelled = false
    computeStatisticheMensili(selectedMonth)
      .then((res) => {
        if (cancelled) return
        setError(null)
        setLoaded({ month: selectedMonth, stats: res })
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Errore imprevisto')
      })
    return () => {
      cancelled = true
    }
  }, [selectedMonth])

  const stats = useMemo(
    () => (loaded?.month === selectedMonth ? loaded.stats : []),
    [loaded, selectedMonth]
  )
  const loadingStats = !!selectedMonth && loaded?.month !== selectedMonth && !error

  const sorted = useMemo(() => {
    const getValue = SORT_VALUE[sortCol]
    const copy = [...stats]
    copy.sort((a, b) => {
      const cmp = getValue(a) - getValue(b)
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      return playerFullName(a.player).localeCompare(playerFullName(b.player))
    })
    return copy
  }, [stats, sortCol, sortDir])

  const totalMatches = stats.length > 0 ? stats[0].totalSeasonMatches : 0

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function arrow(col: SortColumn) {
    if (sortCol !== col) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const headerCell =
    'cursor-pointer select-none whitespace-nowrap px-2 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500'

  return (
    <div className="p-4 pb-12">
      <Link to="/admin" className="text-sm text-field-green underline">
        ← Torna al CDA
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-field-green-dark">Statistiche mensili</h1>
      <p className="text-sm text-gray-500">
        Statistiche di tutti i giocatori raggruppate per mese (tutte le partite completate,
        indipendentemente dalla stagione): utili per scegliere i candidati MVP del mese da mettere
        in votazione sui social.
      </p>

      {loadingMonths && <p className="mt-4 text-sm text-gray-500">Caricamento...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {!loadingMonths && months.length === 0 && !error && (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gray-500 shadow">
          Non ci sono ancora partite completate: le statistiche mensili appariranno dopo la prima
          partita con risultato.
        </p>
      )}

      {months.length > 0 && (
        <>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Mese</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-field-green focus:outline-none"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>

          {loadingStats ? (
            <p className="mt-4 text-sm text-gray-500">Caricamento statistiche...</p>
          ) : (
            <>
              <p className="mt-4 text-sm text-gray-600">
                <strong>{monthLabel(selectedMonth)}</strong>: {totalMatches}{' '}
                {totalMatches === 1 ? 'partita giocata' : 'partite giocate'} · {stats.length}{' '}
                {stats.length === 1 ? 'giocatore coinvolto' : 'giocatori coinvolti'}
              </p>

              <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Giocatore
                      </th>
                      <th className={headerCell} onClick={() => handleSort('presenze')}>
                        Pres.{arrow('presenze')}
                      </th>
                      <th className={headerCell} onClick={() => handleSort('vittorie')}>
                        V-P-S{arrow('vittorie')}
                      </th>
                      <th className={headerCell} onClick={() => handleSort('gol')}>
                        Gol{arrow('gol')}
                      </th>
                      <th className={headerCell} onClick={() => handleSort('assist')}>
                        Assist{arrow('assist')}
                      </th>
                      <th className={headerCell} onClick={() => handleSort('mvp')}>
                        MVP{arrow('mvp')}
                      </th>
                      <th className={headerCell} onClick={() => handleSort('media')}>
                        Media voto{arrow('media')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-3 text-gray-400">
                          Nessuna partita completata in questo mese.
                        </td>
                      </tr>
                    )}
                    {sorted.map((s) => (
                      <tr key={s.player.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-700">
                          <Link to={`/giocatori/${s.player.id}`} className="hover:underline">
                            <p className="whitespace-nowrap">{playerFullName(s.player)}</p>
                            {s.player.nickname && (
                              <p className="text-xs font-normal text-gray-400">{s.player.nickname}</p>
                            )}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-600">{s.partiteGiocate}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-gray-600">
                          {s.vittorie}-{s.pareggi}-{s.sconfitte}
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-600">{s.golFatti}</td>
                        <td className="px-2 py-2.5 text-right text-gray-600">{s.assist}</td>
                        <td className="px-2 py-2.5 text-right">
                          {s.mvp > 0 ? (
                            <span className="font-semibold text-field-orange">🏆 {s.mvp}</span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {s.voteAvg !== null ? (
                            <span className="inline-flex items-center rounded-full bg-field-green/10 px-2.5 py-0.5 font-semibold text-field-green-dark">
                              {s.voteAvg.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-xs text-gray-400">
                La media voto considera solo le pagelle pubblicate. Tocca le intestazioni per
                ordinare la tabella.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
