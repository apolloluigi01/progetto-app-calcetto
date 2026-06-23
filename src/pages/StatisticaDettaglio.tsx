import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStatistiche } from '../hooks/useStatistiche'
import { STAT_CONFIG, getRanking, type RankedEntry, type StatKey } from '../lib/statistiche'

type SortColumn = 'name' | 'extra' | 'value'

export default function StatisticaDettaglio() {
  const { key } = useParams<{ key: string }>()
  const { stats, loading, error } = useStatistiche()
  const [sortCol, setSortCol] = useState<SortColumn>('value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const config = key && key in STAT_CONFIG ? STAT_CONFIG[key as StatKey] : null

  const sorted = useMemo<RankedEntry[]>(() => {
    if (!config || !key) return []
    const ranking = getRanking(stats, key as StatKey)
    const copy = [...ranking]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') cmp = a.stats.player.name.localeCompare(b.stats.player.name)
      else if (sortCol === 'extra' && config.extraColumn) {
        cmp = parseFloat(config.extraColumn.getValue(a.stats)) - parseFloat(config.extraColumn.getValue(b.stats))
      } else cmp = a.value - b.value
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, key, sortCol, sortDir])

  if (!config) return <div className="p-4 text-sm text-red-600">Statistica non trovata</div>
  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>

  const isGreen = config.color === 'green'
  const headerBg = isGreen ? 'bg-field-green' : 'bg-red-600'
  const valueColor = isGreen ? 'text-field-green-dark' : 'text-red-600'
  const valueBg = isGreen ? 'bg-field-green/10' : 'bg-red-50'

  function handleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir(col === 'name' ? 'asc' : 'desc')
    }
  }

  function arrow(col: SortColumn) {
    if (sortCol !== col) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <div className="p-4">
      <Link to="/statistiche" className="text-sm text-field-green underline">
        ← Torna alle statistiche
      </Link>
      <h1 className={`mt-2 text-xl font-semibold ${valueColor}`}>{config.title}</h1>
      <p className="text-sm text-gray-500">{config.description}</p>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow">
        <table className="w-full text-base">
          <thead>
            <tr className={`text-left text-sm font-semibold text-white ${headerBg}`}>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2 cursor-pointer select-none" onClick={() => handleSort('name')}>
                Giocatore{arrow('name')}
              </th>
              {config.extraColumn && (
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => handleSort('extra')}
                >
                  {config.extraColumn.label}
                  {arrow('extra')}
                </th>
              )}
              <th className="px-3 py-2 text-right cursor-pointer select-none" onClick={() => handleSort('value')}>
                Valore{arrow('value')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={config.extraColumn ? 4 : 3} className="px-3 py-3 text-gray-400">
                  Nessun dato disponibile.
                </td>
              </tr>
            )}
            {sorted.map((entry, i) => (
              <tr key={entry.stats.player.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-gray-700">{entry.stats.player.name}</td>
                {config.extraColumn && (
                  <td className="px-3 py-2 text-right text-gray-500">
                    {config.extraColumn.getValue(entry.stats)}
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  <span className={`rounded-md px-2 py-1 font-semibold ${valueColor} ${valueBg}`}>
                    {config.formatValue(entry.value)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
