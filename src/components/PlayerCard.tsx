import { countryFlag, countryName } from '../lib/countries'
import { playerFullName, type PlayerStats } from '../lib/statistiche'
import type { Player } from '../types/database'

type CardTier = 'bronze' | 'silver' | 'gold' | 'special' | 'blue'

// Il template della carta è determinato dall'overall, non da una scelta manuale:
//   1-34  -> Bronzo
//   35-55 -> Argento
//   56-74 -> Oro
//   75-89 -> Speciale (scura/oro)
//   90-100 -> Competizione (blu)
function cardTierForOverall(overall: number | null): CardTier {
  const v = overall ?? 0
  if (v >= 90) return 'blue'
  if (v >= 75) return 'special'
  if (v >= 56) return 'gold'
  if (v >= 35) return 'silver'
  return 'bronze'
}

interface PlayerCardProps {
  player: Player
  overall: number | null
  stats: PlayerStats | null
  /** Versione ridotta senza statistiche, per l'uso su schieramenti/campetto. */
  compact?: boolean
}

const positionLabels: Record<string, string> = {
  POR: 'Portiere',
  DIF: 'Difensore',
  CEN: 'Centrocampista',
  ATT: 'Attaccante',
}

interface CardStyle {
  label: string
  border: string
  bg: string
  text: string
  sub: string
  accent: string
  divider: string
  avatarBg: string
}

const CARD_STYLES: Record<CardTier, CardStyle> = {
  bronze: {
    label: 'Bronzo',
    border: 'bg-gradient-to-b from-orange-200 via-orange-400 to-orange-800',
    bg: 'bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600',
    text: 'text-orange-950',
    sub: 'text-orange-900/70',
    accent: 'text-orange-950',
    divider: 'border-orange-950/20',
    avatarBg: 'bg-orange-950/10',
  },
  silver: {
    label: 'Argento',
    border: 'bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500',
    bg: 'bg-gradient-to-br from-gray-100 via-gray-300 to-gray-400',
    text: 'text-gray-900',
    sub: 'text-gray-700',
    accent: 'text-gray-900',
    divider: 'border-gray-900/20',
    avatarBg: 'bg-gray-900/10',
  },
  gold: {
    label: 'Oro',
    border: 'bg-gradient-to-b from-amber-200 via-yellow-500 to-amber-700',
    bg: 'bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-500',
    text: 'text-stone-900',
    sub: 'text-stone-700',
    accent: 'text-stone-900',
    divider: 'border-stone-900/20',
    avatarBg: 'bg-stone-900/10',
  },
  special: {
    label: 'Speciale',
    border: 'bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-700',
    bg: 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900',
    text: 'text-yellow-300',
    sub: 'text-yellow-100/70',
    accent: 'text-yellow-300',
    divider: 'border-yellow-300/25',
    avatarBg: 'bg-yellow-300/10',
  },
  blue: {
    label: 'Competizione',
    border: 'bg-gradient-to-b from-sky-300 via-blue-500 to-blue-800',
    bg: 'bg-gradient-to-br from-blue-950 via-indigo-800 to-blue-950',
    text: 'text-white',
    sub: 'text-sky-100/70',
    accent: 'text-sky-300',
    divider: 'border-sky-300/25',
    avatarBg: 'bg-white/10',
  },
}

export default function PlayerCard({ player, overall, stats, compact = false }: PlayerCardProps) {
  const style = CARD_STYLES[cardTierForOverall(overall)]

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

  const initials = `${player.name.charAt(0).toUpperCase()}${player.surname ? player.surname.charAt(0).toUpperCase() : ''}`

  return (
    <div className="box-border w-full overflow-hidden rounded-xl shadow-md" style={{ aspectRatio: '5 / 7' }}>
      <div className={`box-border h-full overflow-hidden rounded-xl p-[2px] ${style.border}`}>
        <div className={`relative box-border flex h-full flex-col overflow-hidden rounded-[10px] p-1.5 ${style.bg} ${style.text}`}>
          {/* Riflessi diagonali */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              background:
                'repeating-linear-gradient(115deg, transparent, transparent 10px, white 10px, white 12px)',
            }}
          />

          <div className="relative flex items-start justify-between">
            <div className="text-center leading-none">
              <p className="text-xl font-extrabold">{overall ?? '-'}</p>
              <p
                className="mt-0.5 text-[10px] font-bold tracking-wide"
                title={player.position ? positionLabels[player.position] : undefined}
              >
                {player.position ?? '-'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-0.5 text-right">
              <span className="text-sm leading-none" title={countryName(player.nationality) || undefined}>
                {countryFlag(player.nationality)}
              </span>
              <span className={`text-[10px] font-semibold ${style.sub}`}>
                {player.jersey_number ? `#${player.jersey_number}` : ''}
              </span>
            </div>
          </div>

          {/* Foto: occupa una porzione ampia della carta senza sovrapporsi al resto */}
          <div
            className={`relative mt-1 w-full overflow-hidden rounded-lg ${compact ? 'flex-1' : ''}`}
            style={compact ? undefined : { aspectRatio: '4 / 3' }}
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center font-bold ${compact ? 'text-base' : 'text-3xl'} ${style.avatarBg}`}
              >
                {initials}
              </div>
            )}
          </div>

          <p className="relative mt-1 truncate text-center text-[11px] font-bold uppercase tracking-wide">
            {playerFullName(player)}
          </p>

          {!compact && (
            <>
              {player.nickname && (
                <p className={`relative truncate text-center text-[9px] ${style.sub}`}>{player.nickname}</p>
              )}

              <div className={`relative mt-1 border-t ${style.divider}`} />

              <div className="relative mt-1 grid flex-1 grid-cols-2 content-center gap-x-1.5 gap-y-1 text-[9px]">
                {statItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-1">
                    <span className={`font-bold ${style.accent}`}>{item.value}</span>
                    <span className={`truncate ${style.sub}`}>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
