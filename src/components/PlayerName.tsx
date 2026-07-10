/**
 * Visualizzazione standard del giocatore in tutta l'app:
 * NOME COGNOME e, sotto, il nickname in piccolo e in secondo piano.
 */
interface PlayerNameProps {
  name: string
  surname?: string | null
  nickname?: string | null
  /** Classi extra per la riga del nome (es. dimensione/colore contestuali). */
  nameClassName?: string
  /** Classi extra per la riga del nickname. */
  nicknameClassName?: string
}

export function fullName(p: { name: string; surname?: string | null }): string {
  return p.surname ? `${p.name} ${p.surname}` : p.name
}

export default function PlayerName({
  name,
  surname,
  nickname,
  nameClassName = '',
  nicknameClassName = '',
}: PlayerNameProps) {
  return (
    <span className="min-w-0">
      <span className={`block truncate ${nameClassName}`}>{fullName({ name, surname })}</span>
      {nickname && (
        <span className={`block truncate text-[11px] font-normal leading-tight text-gray-400 ${nicknameClassName}`}>
          {nickname}
        </span>
      )}
    </span>
  )
}
