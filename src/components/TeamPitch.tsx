import { useEffect, useState } from 'react'
import PlayerCard from './PlayerCard'
import type { PlayerStats } from '../lib/statistiche'
import type { Player } from '../types/database'

export interface PitchEntry {
  player: Player
  overall: number | null
  stats: PlayerStats | null
}

interface TeamPitchProps {
  teamA: PitchEntry[]
  teamB: PitchEntry[]
  /** Versione più grande e distanziata, per la pagina dedicata a tutto schermo. */
  large?: boolean
}

const POSITION_ORDER = ['POR', 'DIF', 'CEN', 'ATT'] as const

// Righe di al massimo 3 giocatori, per non sforare mai la larghezza del campetto.
// Se tutti i giocatori hanno un ruolo assegnato le righe seguono il ruolo
// (portiere -> difesa -> centrocampo -> attacco), altrimenti si limita a uno
// schieramento fisso a due righe, sempre leggibile.
function buildRows(entries: PitchEntry[]): PitchEntry[][] {
  if (entries.length > 0 && entries.every((e) => e.player.position)) {
    return POSITION_ORDER.map((pos) => entries.filter((e) => e.player.position === pos)).filter(
      (row) => row.length > 0
    )
  }
  const mid = Math.ceil(entries.length / 2)
  return [entries.slice(0, mid), entries.slice(mid)].filter((row) => row.length > 0)
}

function TeamRows({
  rows,
  large,
  onSelect,
}: {
  rows: PitchEntry[][]
  large?: boolean
  onSelect: (entry: PitchEntry) => void
}) {
  return (
    <div className={`flex flex-col items-center ${large ? 'gap-6' : 'gap-2'}`}>
      {rows.map((row, i) => (
        <div key={i} className={`flex flex-wrap justify-center ${large ? 'gap-6' : 'gap-2'}`}>
          {row.map((entry) => (
            <button
              key={entry.player.id}
              type="button"
              onClick={() => onSelect(entry)}
              className={`shrink-0 cursor-pointer transition-transform active:scale-95 ${large ? 'w-32' : 'w-20'}`}
            >
              <PlayerCard player={entry.player} overall={entry.overall} stats={entry.stats} compact />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function TeamPitch({ teamA, teamB, large = false }: TeamPitchProps) {
  // Squadra A: dal proprio portiere (in alto) verso il centrocampo.
  const rowsA = buildRows(teamA)
  // Squadra B a specchio: dal centrocampo verso il proprio portiere (in basso).
  const rowsB = [...buildRows(teamB)].reverse()

  const [selected, setSelected] = useState<PitchEntry | null>(null)
  const [visible, setVisible] = useState(false)

  function openCard(entry: PitchEntry) {
    setSelected(entry)
  }

  function closeCard() {
    setVisible(false)
    setTimeout(() => setSelected(null), 200)
  }

  useEffect(() => {
    if (!selected) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [selected])

  return (
    <div
      className="relative overflow-hidden rounded-xl border-2 border-white/70"
      style={{
        background: 'repeating-linear-gradient(180deg, #2e7d32 0, #2e7d32 24px, #276b2a 24px, #276b2a 48px)',
      }}
    >
      {/* Area di porta squadra A (in alto) */}
      <div
        className={`absolute left-1/2 top-0 -translate-x-1/2 border border-t-0 border-white/70 ${large ? 'h-6 w-32' : 'h-4 w-20'}`}
      />
      {/* Area di porta squadra B (in basso) */}
      <div
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 border border-b-0 border-white/70 ${large ? 'h-6 w-32' : 'h-4 w-20'}`}
      />

      <div className={`relative flex flex-col ${large ? 'gap-6 p-6' : 'gap-3 p-3'}`}>
        <p className={`text-center font-bold uppercase tracking-wide text-white/90 ${large ? 'text-base' : 'text-xs'}`}>
          Squadra A
        </p>
        <TeamRows rows={rowsA} large={large} onSelect={openCard} />

        {/* Linea di metà campo, in flusso normale così resta sempre a metà tra le due squadre */}
        <div className={`relative border-t-2 border-white/70 ${large ? 'my-4' : 'my-1'}`}>
          <div
            className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70 ${large ? 'h-20 w-20' : 'h-12 w-12'}`}
          />
        </div>

        <TeamRows rows={rowsB} large={large} onSelect={openCard} />
        <p className={`text-center font-bold uppercase tracking-wide text-white/90 ${large ? 'text-base' : 'text-xs'}`}>
          Squadra B
        </p>
      </div>

      {selected && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 transition-opacity duration-200 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeCard}
        >
          <div
            className={`w-full max-w-[240px] transition-all duration-200 ${
              visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <PlayerCard player={selected.player} overall={selected.overall} stats={selected.stats} />
            <button
              type="button"
              onClick={closeCard}
              className="mt-3 w-full rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-white"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
