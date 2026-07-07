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

function TeamRows({ rows }: { rows: PitchEntry[][] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-2">
          {row.map((entry) => (
            <div key={entry.player.id} className="w-20 shrink-0">
              <PlayerCard player={entry.player} overall={entry.overall} stats={entry.stats} compact />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function TeamPitch({ teamA, teamB }: TeamPitchProps) {
  // Squadra A: dal proprio portiere (in alto) verso il centrocampo.
  const rowsA = buildRows(teamA)
  // Squadra B a specchio: dal centrocampo verso il proprio portiere (in basso).
  const rowsB = [...buildRows(teamB)].reverse()

  return (
    <div
      className="relative overflow-hidden rounded-xl border-2 border-white/70"
      style={{
        background: 'repeating-linear-gradient(180deg, #2e7d32 0, #2e7d32 24px, #276b2a 24px, #276b2a 48px)',
      }}
    >
      {/* Area di porta squadra A (in alto) */}
      <div className="absolute left-1/2 top-0 h-4 w-20 -translate-x-1/2 border border-t-0 border-white/70" />
      {/* Area di porta squadra B (in basso) */}
      <div className="absolute bottom-0 left-1/2 h-4 w-20 -translate-x-1/2 border border-b-0 border-white/70" />

      <div className="relative flex flex-col gap-3 p-3">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-white/90">Squadra A</p>
        <TeamRows rows={rowsA} />

        {/* Linea di metà campo, in flusso normale così resta sempre a metà tra le due squadre */}
        <div className="relative my-1 border-t-2 border-white/70">
          <div className="absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
        </div>

        <TeamRows rows={rowsB} />
        <p className="text-center text-xs font-bold uppercase tracking-wide text-white/90">Squadra B</p>
      </div>
    </div>
  )
}
