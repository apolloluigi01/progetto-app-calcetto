import { countryFlag, countryName } from '../lib/countries'
import { playerFullName, type PlayerStats } from '../lib/statistiche'
import type { Player } from '../types/database'

interface PlayerCardProps {
  player: Player
  overall: number | null
  stats: PlayerStats | null
}

const positionLabels: Record<string, string> = {
  POR: 'Portiere',
  DIF: 'Difensore',
  CEN: 'Centrocampista',
  ATT: 'Attaccante',
}

export default function PlayerCard({ player, overall, stats }: PlayerCardProps) {
  const winPercentage =
    stats && stats.partiteGiocate > 0 ? Math.round((stats.vittorie / stats.partiteGiocate) * 100) : null

  const statItems = [
    { label: 'Media voto', value: stats && stats.voteCount > 0 && stats.voteAvg !== null ? stats.voteAvg.toFixed(2) : '-' },
    { label: '% Vittorie', value: winPercentage !== null ? `${winPercentage}%` : '-' },
    { label: 'Gol fatti', value: stats ? String(stats.golFatti) : '-' },
    { label: 'Partite vinte', value: stats ? String(stats.vittorie) : '-' },
    { label: 'MVP', value: stats ? String(stats.mvp) : '-' },
    { label: 'Serie vittorie', value: stats ? String(stats.winStreak) : '-' },
  ]

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-field-yellow/40 bg-gradient-to-b from-field-green-dark via-field-green to-field-green-dark p-3 text-white shadow-lg">
      <div className="flex items-start justify-between">
        <div className="text-center leading-none">
          <p className="text-3xl font-extrabold text-field-yellow">{overall ?? '-'}</p>
          <p
            className="mt-1 text-xs font-bold tracking-wide text-white/90"
            title={player.position ? positionLabels[player.position] : undefined}
          >
            {player.position ?? '-'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-xl leading-none" title={countryName(player.nationality) || undefined}>
            {countryFlag(player.nationality)}
          </span>
          <span className="text-xs font-semibold text-white/80">
            {player.jersey_number ? `#${player.jersey_number}` : ''}
          </span>
        </div>
      </div>

      <div className="mt-1 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white">
          {player.name.charAt(0).toUpperCase()}
          {player.surname ? player.surname.charAt(0).toUpperCase() : ''}
        </div>
      </div>

      <p className="mt-1 truncate text-center text-sm font-bold uppercase tracking-wide">
        {playerFullName(player)}
      </p>
      {player.nickname && (
        <p className="truncate text-center text-[11px] text-white/70">{player.nickname}</p>
      )}

      <div className="mt-2 border-t border-white/20" />

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
        {statItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-1">
            <span className="font-bold text-field-yellow">{item.value}</span>
            <span className="truncate text-white/70">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
