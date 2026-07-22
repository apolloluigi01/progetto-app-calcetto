import { ASSIST_SYMBOL, GOAL_SYMBOL, type ScorerEntry } from '../lib/scorers'

/**
 * Simboli affianco al nome del giocatore nel tabellino marcatori:
 * un ⚽ per ogni gol, un 🅰️ per ogni assist. Gli autogol sono ⚽ marcati (ag).
 *
 * `reverse` allinea i simboli a sinistra del nome (utile nella colonna destra
 * della dashboard, dove il nome è allineato a destra).
 */
export default function ScorerBadges({
  entry,
  reverse = false,
}: {
  entry: ScorerEntry
  reverse?: boolean
}) {
  const { goals, ownGoals, assists } = entry
  if (goals === 0 && ownGoals === 0 && assists === 0) return null

  return (
    <span className={`shrink-0 whitespace-nowrap ${reverse ? 'order-first' : ''}`}>
      {goals > 0 && GOAL_SYMBOL.repeat(goals)}
      {ownGoals > 0 && (
        <span className="text-red-600">
          {GOAL_SYMBOL.repeat(ownGoals)}
          <span className="align-middle text-[10px]"> (ag)</span>
        </span>
      )}
      {assists > 0 && ASSIST_SYMBOL.repeat(assists)}
    </span>
  )
}
