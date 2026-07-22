/**
 * Aggregazione del tabellino marcatori.
 *
 * Gol e assist sono righe autonome nel DB (una per evento). Nelle
 * visualizzazioni dei risultati non li mostriamo più come righe ripetute per
 * lo stesso giocatore, ma raggruppati per giocatore con i simboli affianco al
 * nome:  Salvatore Crispino  ⚽⚽⚽🅰️
 *
 * Gli autogol restano distinti (contano per la squadra avversaria e il
 * giocatore appare nella colonna di quella squadra): li teniamo separati per
 * poterli marcare con "(ag)".
 */

export interface ScorerInput {
  player_id: string
  team: string
  name: string
  surname: string | null
  nickname: string | null
  is_own_goal?: boolean
}

export interface ScorerEntry {
  player_id: string
  name: string
  surname: string | null
  nickname: string | null
  /** Gol regolari accreditati al giocatore nella colonna della sua squadra. */
  goals: number
  /** Autogol: compaiono nella colonna della squadra avversaria. */
  ownGoals: number
  assists: number
}

/**
 * Raggruppa gol e assist di una squadra per giocatore, ordinando per numero di
 * contributi (gol + autogol + assist) decrescente.
 */
export function aggregateScorers(
  goals: ScorerInput[],
  assists: ScorerInput[],
  team: string,
): ScorerEntry[] {
  const map = new Map<string, ScorerEntry>()
  const ensure = (p: ScorerInput): ScorerEntry => {
    let entry = map.get(p.player_id)
    if (!entry) {
      entry = {
        player_id: p.player_id,
        name: p.name,
        surname: p.surname,
        nickname: p.nickname,
        goals: 0,
        ownGoals: 0,
        assists: 0,
      }
      map.set(p.player_id, entry)
    }
    return entry
  }

  for (const g of goals) {
    if (g.team !== team) continue
    const entry = ensure(g)
    if (g.is_own_goal) entry.ownGoals += 1
    else entry.goals += 1
  }
  for (const a of assists) {
    if (a.team !== team) continue
    ensure(a).assists += 1
  }

  return [...map.values()].sort(
    (x, y) =>
      y.goals + y.ownGoals + y.assists - (x.goals + x.ownGoals + x.assists) ||
      y.goals - x.goals,
  )
}

export const GOAL_SYMBOL = '⚽'
export const ASSIST_SYMBOL = '🅰️'
