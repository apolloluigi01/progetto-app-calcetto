import { useEffect, useRef } from 'react'
import { formatFantaPoints } from '../lib/fantacalcetto'
import type { PlayerStats } from '../lib/statistiche'

interface PlayerInfoPopoverProps {
  name: string
  /** Statistiche di stagione; null se il giocatore non ne ha (o è un ospite). */
  stats: PlayerStats | null
  fantavoto: number | null
  isGuest: boolean
  loading: boolean
  onClose: () => void
}

/** Icona "i" cerchiata che apre l'anteprima: va messa dentro un contenitore `relative`. */
export function InfoButton({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-info-trigger
      aria-label={`Statistiche di ${label}`}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold italic leading-none transition ${
        open
          ? 'border-field-green bg-field-green text-white'
          : 'border-gray-400 bg-white text-gray-500 hover:border-field-green hover:text-field-green'
      }`}
    >
      i
    </button>
  )
}

/**
 * Anteprima delle statistiche di stagione di un giocatore, in un riquadro
 * sotto la sua riga: non porta fuori dalla pagina dello schieramento. Si
 * chiude con la ×, con Esc o toccando fuori.
 */
export default function PlayerInfoPopover({ name, stats, fantavoto, isGuest, loading, onClose }: PlayerInfoPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      // Il tocco sull'icona la gestisce l'icona stessa (apre/chiude/cambia giocatore).
      if (target?.closest('[data-info-trigger]')) return
      if (ref.current && !ref.current.contains(target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const items = [
    { label: 'Media voto', value: stats && stats.voteCount > 0 && stats.voteAvg !== null ? stats.voteAvg.toFixed(2) : '-' },
    { label: 'Media fantavoto', value: fantavoto !== null ? formatFantaPoints(fantavoto) : '-' },
    { label: 'Gol', value: stats ? String(stats.golFatti) : '-' },
    { label: 'Assist', value: stats ? String(stats.assist) : '-' },
  ]

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Statistiche di ${name}`}
      className="absolute left-0 top-full z-20 mt-1 w-60 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-field-green-dark">{name}</p>
          <p className="text-[11px] text-gray-400">
            {isGuest
              ? 'Ospite: niente statistiche di stagione'
              : stats
                ? `Stagione in corso · ${stats.partiteGiocate} ${stats.partiteGiocate === 1 ? 'presenza' : 'presenze'}`
                : 'Stagione in corso'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="-mr-1 -mt-1 shrink-0 rounded px-1.5 text-lg leading-none text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-gray-400">Caricamento...</p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-1.5">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg bg-gray-50 px-2 py-1.5">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{item.label}</dt>
              <dd className="text-base font-bold text-gray-800">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-2 text-[10px] leading-snug text-gray-400">
        Fantavoto: voto in pagella con bonus e malus del fantacalcetto, senza capitano.
      </p>
    </div>
  )
}
