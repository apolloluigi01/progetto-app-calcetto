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

// Raggruppa i giocatori per ruolo (dal portiere in su); chi non ha un ruolo
// assegnato finisce in una riga a parte, in modo che lo schieramento resti
// leggibile anche se l'anagrafica non è stata completata per tutti.
function buildRows(entries: PitchEntry[]): PitchEntry[][] {
  const rows: PitchEntry[][] = []
  const used = new Set<string>()
  for (const pos of POSITION_ORDER) {
    const row = entries.filter((e) => e.player.position === pos)
    if (row.length > 0) {
      rows.push(row)
      row.forEach((e) => used.add(e.player.id))
    }
  }
  const rest = entries.filter((e) => !used.has(e.player.id))
  if (rest.length > 0) rows.push(rest)
  return rows
}

function TeamRows({ rows }: { rows: PitchEntry[][] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap justify-center gap-2">
          {row.map((entry) => (
            <div key={entry.player.id} className="w-16 shrink-0">
              <PlayerCard player={entry.player} overall={entry.overall} stats={entry.stats} compact />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function TeamPitch({ teamA, teamB }: TeamPitchProps) {
  const rowsA = buildRows(teamA)
  // Squadra B schierata a specchio: dal portiere (vicino al proprio fondo) verso il centrocampo.
  const rowsB = [...buildRows(teamB)].reverse()

  return (
    <div
      className="relative overflow-hidden rounded-xl border-2 border-white/70"
      style={{
        background:
          'repeating-linear-gradient(180deg, #2e7d32, #2e7d32 11%, #276b2a 11%, #276b2a 22%)',
      }}
    >
      {/* Linea di metà campo e cerchio centrale */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70" />
      {/* Aree di porta */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 border border-t-0 border-white/70" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-6 w-28 -translate-x-1/2 border border-b-0 border-white/70" />

      <div className="relative flex flex-col justify-between gap-6 p-3">
        <TeamRows rows={rowsA} />
        <TeamRows rows={rowsB} />
      </div>
    </div>
  )
}
