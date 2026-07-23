import { ASSIST_SYMBOL, GOAL_SYMBOL, type ScorerEntry } from '../lib/scorers'

/**
 * Simboli affianco al nome del giocatore nel tabellino marcatori: un unico
 * simbolo per tipo con il conteggio a fianco (⚽2🅰️1), così restano compatti
 * anche su mobile. Gli autogol sono ⚽ marcati (ag).
 *
 * `reverse` allinea i simboli a sinistra del nome (utile nella colonna destra
 * della dashboard, dove il nome è allineato a destra).
 */
function Badge({ symbol, count }: { symbol: string; count: number }) {
  return (
    <span className="whitespace-nowrap">
      {symbol}
      <span className="align-middle text-[11px] font-semibold text-gray-600">{count}</span>
    </span>
  )
}

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
      {goals > 0 && <Badge symbol={GOAL_SYMBOL} count={goals} />}
      {ownGoals > 0 && (
        <span className="text-red-600">
          <Badge symbol={GOAL_SYMBOL} count={ownGoals} />
          <span className="align-middle text-[10px]"> (ag)</span>
        </span>
      )}
      {assists > 0 && <Badge symbol={ASSIST_SYMBOL} count={assists} />}
    </span>
  )
}
