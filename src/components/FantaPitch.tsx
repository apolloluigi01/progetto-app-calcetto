import { useEffect, useState } from 'react'
import PlayerCard from './PlayerCard'
import type { PitchEntry } from './TeamPitch'

interface FantaPitchProps {
  entries: PitchEntry[]
  captainId: string
}

const POSITION_ORDER = ['POR', 'DIF', 'CEN', 'ATT'] as const

// Righe di al massimo 3 carte. Se tutti hanno un ruolo, lo schieramento segue
// i reparti con il portiere in basso (vicino alla propria porta); altrimenti
// due righe generiche.
function buildRows(entries: PitchEntry[]): PitchEntry[][] {
  if (entries.length > 0 && entries.every((e) => e.player.position)) {
    return POSITION_ORDER.map((pos) => entries.filter((e) => e.player.position === pos))
      .filter((row) => row.length > 0)
      .reverse() // attacco in alto, portiere in basso
  }
  const mid = Math.ceil(entries.length / 2)
  return [entries.slice(0, mid), entries.slice(mid)].filter((row) => row.length > 0)
}

export default function FantaPitch({ entries, captainId }: FantaPitchProps) {
  const rows = buildRows(entries)

  const [selected, setSelected] = useState<PitchEntry | null>(null)
  const [visible, setVisible] = useState(false)

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
      {/* Cerchio di centrocampo (in alto) e area di porta (in basso) */}
      <div className="absolute left-1/2 top-0 h-8 w-24 -translate-x-1/2 rounded-b-full border border-t-0 border-white/70" />
      <div className="absolute bottom-0 left-1/2 h-5 w-24 -translate-x-1/2 border border-b-0 border-white/70" />

      <div className="relative flex flex-col gap-4 p-4">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap justify-center gap-3">
            {row.map((entry) => (
              <button
                key={entry.player.id}
                type="button"
                onClick={() => setSelected(entry)}
                className="relative w-24 shrink-0 cursor-pointer transition-transform active:scale-95"
              >
                <PlayerCard player={entry.player} overall={entry.overall} stats={entry.stats} compact />
                {entry.player.id === captainId && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-field-yellow text-xs font-black text-stone-900 shadow ring-2 ring-white"
                    title="Capitano (i bonus vengono moltiplicati)"
                  >
                    C
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
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
